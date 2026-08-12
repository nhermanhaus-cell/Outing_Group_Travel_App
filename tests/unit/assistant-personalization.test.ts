import { describe, expect, it } from 'vitest';
import {
  dynamicStarterPrompts,
  filterFreshPreferenceSignals,
  groupPreferenceSummary,
  rankDestinationRows,
  redactAssistantModelValue,
  sortFitFirst,
  type PersonalizationContext,
} from '../../supabase/functions/_shared/assistant-intelligence';
import scoring from '../../fixtures/seed/destinations.scoring.json';
import catalog from '../../fixtures/seed/destinations.json';
import { scoreDestinations } from '@gayi/domain';
import type { Destination, TravelPreferences } from '@gayi/shared';

function context(overrides: Partial<PersonalizationContext['explicit']> = {}): PersonalizationContext {
  return {
    version: 'v1',
    explicit: {
      interests: ['food'],
      tripGoals: ['explore'],
      vacationStyles: ['local_neighborhoods'],
      preferredMonths: [9],
      departureAirports: ['LAX'],
      homeCountryCodes: ['US'],
      preferredTravelRanges: ['international'],
      transportModes: ['plane'],
      travelScope: 'either',
      budgetLevel: 'comfortably_fabulous',
      tripLengthDays: 5,
      groupSize: 2,
      mealPreferences: [],
      avoidances: [],
      accessibilityNeeds: [],
      lgbtqSafetyPriority: 0.8,
      nightlifeImportance: 0.4,
      ...overrides,
    },
    inferred: [],
    savedDestinationSlugs: [],
    explanationSignals: [],
    contextFingerprint: 'test-context-v1',
  };
}

const catalogBySlug = new Map(catalog.map((destination) => [destination.slug, destination]));
const rows = scoring.map((destination) => {
  const detail = catalogBySlug.get(destination.slug)!;
  return {
    slug: destination.slug,
    name: destination.name,
    country: destination.country,
    editorial_summary: detail.editorialSummary,
    payload: { ...detail, scoring: destination },
  };
});

describe('assistant personalization intelligence', () => {
  it('changes deterministic results for different explicit interests', () => {
    const food = rankDestinationRows(rows, context({ interests: ['food'] }), { limit: 5 });
    const nightlife = rankDestinationRows(rows, context({ interests: ['nightlife', 'pride'] }), { limit: 5 });
    expect(food.map((item) => item.destinationSlug)).not.toEqual(nightlife.map((item) => item.destinationSlug));
    expect(food[0]?.fitReasons.join(' ')).toMatch(/food/i);
  });

  it('keeps the server shortlist aligned with the mobile deterministic engine', () => {
    const traveler = context();
    const preferences: TravelPreferences = {
      budgetLevel: 'comfortably_fabulous',
      departureAirports: ['LAX'],
      travelMonths: [9],
      tripDurationDays: 5,
      groupSize: 2,
      interests: ['food'],
      accessibilityNeeds: [],
      nightlifeImportance: 0.4,
      weatherPreference: 'any',
      lgbtqSafetyPriority: 0.8,
      soloTravel: false,
      lookingFor: [],
      travelRanges: ['international'],
      longDistanceTransportModes: ['plane'],
      travelScope: 'either',
    };
    const server = rankDestinationRows(rows, traveler, { limit: 5 }).map((item) => item.destinationSlug);
    const mobile = scoreDestinations(preferences, scoring as unknown as Destination[]).slice(0, 5).map((item) => item.slug);
    expect(server).toEqual(mobile);
  });

  it('caps inferred preference influence at ten points per signal family', () => {
    const baseline = rankDestinationRows(rows.slice(0, 1), context(), { limit: 1 })[0]!;
    const boostedContext = context();
    boostedContext.inferred = [{
      subjectType: 'destination',
      subjectKey: baseline.destinationSlug,
      score: 1,
      confidence: 1,
    }, {
      subjectType: 'activity_category',
      subjectKey: 'food',
      score: 1,
      confidence: 1,
    }];
    const boosted = rankDestinationRows(rows.slice(0, 1), boostedContext, { limit: 1 })[0]!;
    expect(boosted.fitScore - baseline.fitScore).toBeLessThanOrEqual(10);
  });

  it('keeps explicit avoidance constraints above inferred behavioral boosts', () => {
    const constrained = context({ avoidances: ['nightlife'] });
    constrained.inferred = [{
      subjectType: 'destination',
      subjectKey: 'san-francisco',
      score: 1,
      confidence: 1,
    }];
    const result = rankDestinationRows(rows.filter((row) => row.slug === 'san-francisco'), constrained, { limit: 1 })[0]!;
    expect(result.fitScore).toBeLessThanOrEqual(25);
    expect(result.tradeoffs.join(' ')).toMatch(/avoid nightlife/i);
  });

  it('aggregates group preferences without retaining member names', () => {
    const summary = groupPreferenceSummary([
      { displayName: 'A', interests: ['food', 'art'], activityPace: 'balanced', nightlifeImportance: 0.2 },
      { displayName: 'B', interests: ['food', 'nightlife'], activityPace: 'packed', nightlifeImportance: 0.8 },
    ]);
    expect(summary?.sharedInterests).toEqual(['food']);
    expect(JSON.stringify(summary)).not.toContain('displayName');
    expect(JSON.stringify(summary)).not.toContain('A');
  });

  it('creates scoped dynamic prompts without duplicate keys', () => {
    const prompts = dynamicStarterPrompts(context({ interests: ['food', 'culture'] }), 'general');
    expect(prompts[0]).toMatch(/food and culture/i);
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(dynamicStarterPrompts(context(), 'trip').join(' ')).toMatch(/anchor|free window/i);
  });

  it('uses bookability only to break a fit tie within two points', () => {
    const ranked = sortFitFirst([
      { id: 'best-fit', fitScore: 90, bookable: false },
      { id: 'bookable-close', fitScore: 89, bookable: true },
      { id: 'bookable-weak', fitScore: 80, bookable: true },
    ]);
    expect(ranked.map((item) => item.id)).toEqual(['bookable-close', 'best-fit', 'bookable-weak']);
  });

  it('removes contact, comment, lodging-address, and coordinate data before model use', () => {
    const redacted = redactAssistantModelValue({
      title: '<b>Useful place</b>',
      lat: 37.7,
      coordinates: [-122.4, 37.7],
      lodgingAddress: 'Private hotel address',
      comments: ['Private member note'],
      contact: { email: 'private@example.com' },
      nested: { phone: '555-0100', safe: 'provider fact' },
    });
    expect(redacted).toEqual({ title: 'Useful place', nested: { safe: 'provider fact' } });
  });

  it('expires learned ranking signals after 180 days', () => {
    const now = new Date('2026-07-31T12:00:00.000Z').getTime();
    const fresh = { id: 'fresh', lastObservedAt: '2026-07-01T12:00:00.000Z' };
    const stale = { id: 'stale', lastObservedAt: '2025-12-01T12:00:00.000Z' };
    expect(filterFreshPreferenceSignals([fresh, stale], now)).toEqual([fresh]);
  });
});
