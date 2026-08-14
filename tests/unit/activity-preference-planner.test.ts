import { describe, expect, it } from 'vitest';
import { buildActivityPreferenceSignals, generateItinerary } from '@gayi/domain';
import type { ActivityPreferenceVote, Destination, Place, TravelPreferences } from '@gayi/shared';

const preferences: TravelPreferences = {
  budgetLevel: 'comfortably_fabulous',
  departureAirports: ['LAX'],
  travelMonths: [6],
  tripDurationDays: 4,
  groupSize: 2,
  interests: ['food', 'culture', 'art'],
  accessibilityNeeds: [],
  nightlifeImportance: 0.5,
  weatherPreference: 'any',
  lgbtqSafetyPriority: 0.8,
  soloTravel: false,
  lookingFor: ['exploration'],
  activityPace: 'balanced',
};

const destination = {
  slug: 'test-city', name: 'Test City', country: 'Testland', continentCode: 'NA',
  nearestAirportCodes: ['TST'], legalStatus: 'marriage_equality', safetyScore: 90,
  communityScore: 80, nightlifeScore: 70, bestMonths: [6], avgTempCByMonth: { '6': 24 },
  interests: ['food', 'culture'], upcomingEvents: [], accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: '' },
  costPerDay: { budget: 80, mid: 160, luxury: 320 }, lastUpdated: '2026-08-01', typicalStayDays: { min: 3, max: 6 },
} satisfies Destination;

function place(index: number, category: Place['category']): Place {
  return {
    placeId: `${category}-${index}`,
    name: `${category} ${index}`,
    summary: `A specific ${category} option with enough context to make an informed choice.`,
    category,
    coords: { lat: 40 + index / 10_000, lng: -73 - index / 10_000 },
    durationMinutes: category === 'restaurant' ? 75 : 90,
    estimatedCostPerPerson: 20,
    bookingRequired: false,
    interests: category === 'restaurant' ? ['food'] : ['culture', 'art'],
    source: 'test',
  };
}

describe('activity preference itinerary planning', () => {
  it('uses a sufficiently deep candidate pool across every trip day', () => {
    const places = [
      ...Array.from({ length: 12 }, (_, index) => place(index, 'restaurant')),
      ...Array.from({ length: 10 }, (_, index) => place(index + 20, 'museum')),
      ...Array.from({ length: 8 }, (_, index) => place(index + 40, 'landmark')),
      ...Array.from({ length: 5 }, (_, index) => place(index + 60, 'bar')),
    ];
    const itinerary = generateItinerary({ destination, places, preferences, tripDurationDays: 4 });
    for (const day of [1, 2, 3, 4]) {
      const substantive = itinerary.filter((item) => item.day === day && item.kind !== 'downtime' && !item.placeId.startsWith('meal-'));
      expect(substantive.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('spreads a shallow offline catalog across later days instead of exhausting day one', () => {
    const places = [
      place(1, 'museum'), place(2, 'restaurant'), place(3, 'landmark'),
      place(4, 'restaurant'), place(5, 'museum'), place(6, 'bar'),
    ];
    const itinerary = generateItinerary({ destination, places, preferences, tripDurationDays: 4 });
    for (const day of [1, 2, 3, 4]) {
      expect(itinerary.some((item) => item.day === day && item.kind !== 'downtime' && !item.placeId.startsWith('meal-'))).toBe(true);
    }
  });

  it('boosts group interest and only excludes a group option after a majority rejection', () => {
    const votes: ActivityPreferenceVote[] = [
      { placeId: 'museum-1', memberId: 'a', choice: 'interested', category: 'museum', createdAt: '2026-08-01T10:00:00Z' },
      { placeId: 'museum-1', memberId: 'b', choice: 'interested', category: 'museum', createdAt: '2026-08-01T10:01:00Z' },
      { placeId: 'bar-1', memberId: 'a', choice: 'not_interested', category: 'bar', createdAt: '2026-08-01T10:02:00Z' },
      { placeId: 'bar-1', memberId: 'b', choice: 'not_interested', category: 'bar', createdAt: '2026-08-01T10:03:00Z' },
    ];
    const signals = buildActivityPreferenceSignals(votes, 3);
    expect(signals.scoreAdjustments['museum-1']).toBe(48);
    expect(signals.excludedPlaceIds).toContain('bar-1');

    const splitDecision = buildActivityPreferenceSignals(votes.slice(0, 3), 3);
    expect(splitDecision.excludedPlaceIds).not.toContain('bar-1');
  });

  it('treats a solo not-interested choice as a hard exclusion', () => {
    const signals = buildActivityPreferenceSignals([
      { placeId: 'tour-1', memberId: 'solo', choice: 'not_interested', category: 'tour', createdAt: '2026-08-01T10:00:00Z' },
    ], 1);
    expect(signals.excludedPlaceIds).toEqual(['tour-1']);
  });
});
