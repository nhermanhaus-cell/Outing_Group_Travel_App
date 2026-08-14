import { describe, expect, it } from 'vitest';
import {
  assistantRequestSchema,
  assistantInsightRequestSchema,
  assistantStreamEventSchema,
  canAccessAssistantConversation,
  decideProposalVote,
  type AssistantProposal,
} from '@gayi/shared';
import {
  ONBOARDING_STORAGE_KEY,
  shouldOfferOnboarding,
} from '../../apps/mobile/src/lib/onboardingState';
import { parseQuizResultsAnswers } from '../../apps/mobile/src/lib/quizResultsState';
import {
  mergeSavedDestinationSlugs,
  normalizeSavedDestinationSlugs,
} from '../../apps/mobile/src/lib/savedDestinationsState';
import { applyAssistantProposalToTrip } from '../../apps/mobile/src/lib/assistantProposals';
import type { TripPlan } from '@gayi/domain';

const proposal: AssistantProposal = {
  id: '10000000-0000-4000-8000-000000000001',
  conversationId: '10000000-0000-4000-8000-000000000002',
  tripId: '10000000-0000-4000-8000-000000000003',
  kind: 'add_itinerary_item',
  title: 'Add the museum',
  summary: 'Fits the open afternoon.',
  payload: {
    title: 'Design Museum',
    startAt: '2026-10-10T14:00:00.000Z',
    endAt: '2026-10-10T16:00:00.000Z',
  },
  status: 'proposed',
  sources: [],
  createdAt: '2026-07-30T12:00:00.000Z',
};

describe('first-open onboarding state', () => {
  it('uses a versioned storage key and only interrupts ordinary entry routes', () => {
    expect(ONBOARDING_STORAGE_KEY).toContain('v1');
    expect(shouldOfferOnboarding({ enabled: true, completed: false, pathname: '/' })).toBe(true);
    expect(shouldOfferOnboarding({ enabled: true, completed: false, pathname: '/invite' })).toBe(false);
    expect(shouldOfferOnboarding({ enabled: true, completed: false, pathname: '/share/trip' })).toBe(false);
    expect(shouldOfferOnboarding({ enabled: true, completed: true, pathname: '/' })).toBe(false);
  });
});

describe('saved destinations', () => {
  it('deduplicates valid slugs and merges guest saves with account saves', () => {
    expect(normalizeSavedDestinationSlugs(['barcelona', 'barcelona', 'Not Valid'])).toEqual(['barcelona']);
    expect(mergeSavedDestinationSlugs(['barcelona'], ['lisbon', 'barcelona'])).toEqual(['barcelona', 'lisbon']);
  });
});

describe('deep-link recovery', () => {
  it('rejects missing and malformed quiz result payloads without throwing', () => {
    expect(parseQuizResultsAnswers(undefined)).toBeNull();
    expect(parseQuizResultsAnswers('{}')).toBeNull();
    expect(parseQuizResultsAnswers('{broken')).toBeNull();
  });

  it('accepts complete result state', () => {
    expect(parseQuizResultsAnswers(JSON.stringify({
      months: [6],
      duration: 5,
      groupSize: 2,
      interests: ['food'],
      socialPrefs: ['community'],
    }))).toMatchObject({ duration: 5, interests: ['food'] });
  });
});

describe('Ask Outing contracts and privacy', () => {
  it('requires a trip scope for shared conversations', () => {
    expect(assistantRequestSchema.safeParse({
      scope: { kind: 'general' },
      visibility: 'trip_shared',
      message: 'Help us plan',
    }).success).toBe(false);
  });

  it('accepts typed stream events and rejects unknown event shapes', () => {
    expect(assistantStreamEventSchema.safeParse({
      type: 'delta',
      text: 'Try Lisbon.',
    }).success).toBe(true);
    expect(assistantStreamEventSchema.safeParse({
      type: 'delta',
      prompt: 'private content',
    }).success).toBe(false);
    expect(assistantStreamEventSchema.safeParse({
      type: 'recommendations',
      recommendations: [{
        id: 'lisbon',
        kind: 'destination',
        title: 'Lisbon',
        summary: 'A strong food and neighborhood match.',
        fitReasons: ['Food', 'Neighborhoods'],
        tradeoffs: ['Hills'],
        sourceIds: ['outing'],
        confidence: 0.8,
        destinationSlug: 'lisbon',
        provisional: false,
        bookable: false,
      }],
    }).success).toBe(true);
  });

  it('accepts only validated contextual focus identifiers', () => {
    expect(assistantRequestSchema.safeParse({
      scope: { kind: 'trip', tripId: '10000000-0000-4000-8000-000000000003' },
      visibility: 'private',
      message: 'Make Tuesday lighter',
      focus: { kind: 'itinerary_day', tripId: '10000000-0000-4000-8000-000000000003', day: 2, action: 'rework' },
    }).success).toBe(true);
    expect(assistantRequestSchema.safeParse({
      scope: { kind: 'trip', tripId: '10000000-0000-4000-8000-000000000003' },
      visibility: 'private',
      message: 'Use my context',
      focus: { kind: 'today', tripId: 'not-a-trip', rawCoordinates: [1, 2], comments: ['private'] },
    }).success).toBe(false);
  });

  it('requires scoped insight identifiers', () => {
    expect(assistantInsightRequestSchema.safeParse({ surface: 'home' }).success).toBe(true);
    expect(assistantInsightRequestSchema.safeParse({ surface: 'trip' }).success).toBe(false);
    expect(assistantInsightRequestSchema.safeParse({ surface: 'destination' }).success).toBe(false);
  });

  it('limits private access to the owner and shared access to trip members', () => {
    expect(canAccessAssistantConversation({
      userId: 'owner',
      ownerId: 'owner',
      visibility: 'private',
      isTripMember: false,
    })).toBe(true);
    expect(canAccessAssistantConversation({
      userId: 'member',
      ownerId: 'owner',
      visibility: 'private',
      isTripMember: true,
    })).toBe(false);
    expect(canAccessAssistantConversation({
      userId: 'member',
      ownerId: 'owner',
      visibility: 'trip_shared',
      isTripMember: true,
    })).toBe(true);
  });
});

describe('assistant proposal review', () => {
  it('applies a reviewed itinerary addition deterministically', () => {
    const update = applyAssistantProposalToTrip({ itineraryItems: [] }, proposal);
    expect(update.itineraryItems).toHaveLength(1);
    expect(update.itineraryItems?.[0]).toMatchObject({
      title: 'Design Museum',
      proposalId: proposal.id,
      source: 'assistant_proposal',
    });
  });

  it('does not mutate a trip for saved-destination proposals', () => {
    expect(applyAssistantProposalToTrip(
      { itineraryItems: [] },
      { ...proposal, kind: 'save_destination', payload: { destinationSlug: 'lisbon' } },
    )).toEqual({});
  });

  it('replaces the focused open slot in the trip-plan source of truth', () => {
    const plan: TripPlan = {
      planId: 'plan', revision: 1, schemaVersion: 2, algorithmVersion: 'test', generatedAt: 'before',
      inputHash: 'hash', destinationName: 'New York City', durationDays: 1, summary: '',
      items: [{
        itemId: 'dinner-slot', day: 1, time: '18:00', title: 'Open meal time', category: 'restaurant',
        placeId: 'meal-1-18:00', duration: 90, estimatedCost: 0, bookingRequired: false,
        source: 'schedule', confidence: 1, coords: { lat: 40.73, lng: -73.99 },
        whySelected: 'Held open', kind: 'meal', slotRole: 'meal',
      }],
      days: [{ day: 1, title: 'Day 1', summary: '', itemIds: ['dinner-slot'], sharedAnchorItemIds: [], freeWindowSuggestions: [] }],
      bookingTimeline: [], feedback: [], sources: [],
    };
    const update = applyAssistantProposalToTrip(
      { tripPlan: plan, itineraryItems: plan.items as unknown as Array<Record<string, unknown>> },
      {
        ...proposal,
        kind: 'replace_itinerary_item',
        payload: { itemId: 'dinner-slot', title: 'Momoya SoHo', placeId: 'google-momoya' },
      },
      {
        placeId: 'google-momoya', title: 'Momoya SoHo', category: 'restaurant',
        coords: { lat: 40.724, lng: -74.001 }, estimatedCost: 40, rating: 4.6,
      },
    );
    expect(update.tripPlan?.revision).toBe(2);
    expect(update.tripPlan?.items[0]).toMatchObject({
      itemId: 'dinner-slot', title: 'Momoya SoHo', placeId: 'google-momoya', kind: 'place', slotRole: 'meal',
    });
    expect(update.itineraryItems?.[0]).toMatchObject({ title: 'Momoya SoHo' });
  });
});

describe('group proposal decisions', () => {
  const memberIds = ['a', 'b', 'c', 'd'];

  it('accepts and dismisses by majority', () => {
    expect(decideProposalVote({
      memberIds,
      votes: [
        { userId: 'a', choice: 'accept' },
        { userId: 'b', choice: 'accept' },
        { userId: 'c', choice: 'accept' },
      ],
    }).result).toBe('accepted');
    expect(decideProposalVote({
      memberIds,
      votes: [
        { userId: 'a', choice: 'dismiss' },
        { userId: 'b', choice: 'dismiss' },
        { userId: 'c', choice: 'dismiss' },
      ],
    }).result).toBe('dismissed');
  });

  it('requires an organizer to resolve a complete tie', () => {
    const votes = [
      { userId: 'a', choice: 'accept' as const },
      { userId: 'b', choice: 'accept' as const },
      { userId: 'c', choice: 'dismiss' as const },
      { userId: 'd', choice: 'dismiss' as const },
    ];
    expect(decideProposalVote({ memberIds, votes }).result).toBe('tie');
    expect(decideProposalVote({ memberIds, votes, organizerChoice: 'accept' }).result).toBe('accepted');
  });
});
