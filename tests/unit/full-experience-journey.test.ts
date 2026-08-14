import { describe, expect, it } from 'vitest';
import { buildActivityPreferenceSignals, deriveHomeJourney, isActivityPreferenceSessionComplete } from '@gayi/domain';
import { assistantFocusSchema, type ActivityPreferenceVote } from '@gayi/shared';

const now = new Date('2026-08-12T08:30:00Z');

function trip(overrides: Partial<Parameters<typeof deriveHomeJourney>[0][number]> = {}) {
  return {
    tripId: 'trip-1', destinationName: 'Tokyo', destinationTimezone: 'Asia/Tokyo',
    startDate: '2026-08-12', endDate: '2026-08-16', hasLodging: true,
    hasBlockingPlanIssue: false, pendingVoteCount: 0, tasteDeckComplete: true,
    ...overrides,
  };
}

describe('full-experience Home journey', () => {
  it('supports a private inspiration-library focus for Ask Outing', () => {
    expect(assistantFocusSchema.parse({ kind: 'inspiration_library' })).toEqual({ kind: 'inspiration_library' });
  });

  it('uses the destination timezone at an in-trip boundary', () => {
    const result = deriveHomeJourney([trip()], { now });
    expect(result.state).toBe('in_trip');
    expect(result.nextAction.kind).toBe('open_today');
  });

  it('prioritizes a blocking issue, vote, deck, and missing details in order', () => {
    const base = { startDate: '2026-09-12', endDate: '2026-09-15' };
    expect(deriveHomeJourney([trip({ ...base, hasBlockingPlanIssue: true, pendingVoteCount: 2, tasteDeckComplete: false })], { now }).nextAction.kind).toBe('resolve_plan_issue');
    expect(deriveHomeJourney([trip({ ...base, pendingVoteCount: 2, tasteDeckComplete: false })], { now }).nextAction.kind).toBe('vote');
    expect(deriveHomeJourney([trip({ ...base, tasteDeckComplete: false })], { now }).nextAction.kind).toBe('finish_taste_deck');
    expect(deriveHomeJourney([trip({ ...base, hasLodging: false })], { now }).nextAction.kind).toBe('add_trip_details');
  });

  it('selects an overlapping in-trip plan ahead of future planning and supports post-trip feedback', () => {
    const active = trip({ tripId: 'active' });
    const future = trip({ tripId: 'future', startDate: '2026-10-01', endDate: '2026-10-04' });
    expect(deriveHomeJourney([future, active], { now }).trip?.tripId).toBe('active');
    const past = trip({ tripId: 'past', startDate: '2026-08-01', endDate: '2026-08-05' });
    expect(deriveHomeJourney([past], { now }).nextAction.kind).toBe('share_feedback');
  });

  it('handles incomplete dates and exact pre/post-trip boundaries', () => {
    expect(deriveHomeJourney([trip({ startDate: undefined, endDate: undefined })], { now }).state).toBe('planning');
    expect(deriveHomeJourney([trip({ startDate: '2026-08-26', endDate: '2026-08-29' })], { now }).state).toBe('pre_trip');
    expect(deriveHomeJourney([trip({ startDate: '2026-08-27', endDate: '2026-08-30' })], { now }).state).toBe('planning');
    expect(deriveHomeJourney([trip({ startDate: '2026-07-25', endDate: '2026-07-29' })], { now }).state).toBe('post_trip');
    expect(deriveHomeJourney([trip({ startDate: '2026-07-24', endDate: '2026-07-28' })], { now }).state).toBe('discovering');
  });
});

describe('Taste Deck v2 aggregation', () => {
  const vote = (memberId: string, placeId: string, choice: ActivityPreferenceVote['choice'], category = 'culture'): ActivityPreferenceVote => ({
    memberId, placeId, choice, category, createdAt: '2026-08-12T12:00:00.000Z',
  });

  it('uses a symmetric five-point scale, creates anchors, ties, and minority favorites', () => {
    const signals = buildActivityPreferenceSignals([
      vote('a', 'anchor', 'very_interested'), vote('b', 'anchor', 'interested'),
      vote('a', 'tie', 'interested'), vote('b', 'tie', 'uninterested'),
      vote('a', 'minority', 'very_interested'), vote('b', 'minority', 'neutral'), vote('c', 'minority', 'neutral'),
    ], 3);
    expect(signals.tallies.anchor?.weightedScore).toBe(4);
    expect(signals.anchorCandidatePlaceIds).toContain('anchor');
    expect(signals.pollPlaceIds).toContain('tie');
    expect(signals.minorityFavoritePlaceIds).toContain('minority');
    expect(signals.minorityFavoriteMemberIdsByPlace.minority).toEqual(['a']);
  });

  it('completes after ten reactions across four categories or all candidates', () => {
    const votes = Array.from({ length: 10 }, (_, index) => vote('a', `p${index}`, 'neutral', `c${index % 4}`));
    expect(isActivityPreferenceSessionComplete(votes, 30)).toBe(true);
    expect(isActivityPreferenceSessionComplete(votes.slice(0, 9), 9)).toBe(true);
  });

  it('normalizes the legacy negative choice', () => {
    const result = buildActivityPreferenceSignals([vote('a', 'p', 'not_interested')], 1);
    expect(result.excludedPlaceIds).toEqual(['p']);
    expect(result.tallies.p?.uninterested).toBe(1);
  });

  it('distinguishes strong negative and strong positive signals', () => {
    const result = buildActivityPreferenceSignals([
      vote('a', 'strong-positive', 'very_interested'),
      vote('a', 'strong-negative', 'very_uninterested'),
    ], 1);
    expect(result.tallies['strong-positive']?.weightedScore).toBe(3);
    expect(result.tallies['strong-negative']?.weightedScore).toBe(-3);
    expect(result.excludedPlaceIds).toContain('strong-negative');
  });
});
