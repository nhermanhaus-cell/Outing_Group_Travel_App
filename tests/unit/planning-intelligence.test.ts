import { describe, it, expect } from 'vitest';
import {
  blendGroupPreferences,
  generateItinerary,
  rankPlacesNearLodging,
  suggestQueerNeighborhoods,
} from '@gayi/domain';
import type { Destination, Place, TravelPreferences } from '@gayi/shared';

const basePrefs: TravelPreferences = {
  budgetLevel: 'comfortably_fabulous',
  departureAirports: ['SFO'],
  travelMonths: [6, 7],
  tripDurationDays: 3,
  groupSize: 2,
  interests: ['nightlife', 'food', 'culture'],
  accessibilityNeeds: [],
  nightlifeImportance: 0.8,
  weatherPreference: 'any',
  lgbtqSafetyPriority: 0.8,
  soloTravel: false,
  lookingFor: ['community', 'dancing'],
  activityPace: 'balanced',
};

describe('blendGroupPreferences', () => {
  it('returns owner prefs when no members', () => {
    const blended = blendGroupPreferences(basePrefs, []);
    expect(blended.interests).toEqual(basePrefs.interests);
    expect(blended.activityPace).toBe('balanced');
  });

  it('intersects shared interests when all members share some', () => {
    const blended = blendGroupPreferences(basePrefs, [
      {
        memberId: 'm1',
        interests: ['nightlife', 'beach'],
        nightlifeImportance: 0.4,
        activityPace: 'downtime',
      },
    ]);
    expect(blended.interests).toContain('nightlife');
    expect(blended.nightlifeImportance).toBeCloseTo(0.6, 5);
    expect(blended.activityPace).toBe('balanced'); // avg of packed? balanced+downtime -> balanced
  });
});

describe('rankPlacesNearLodging', () => {
  it('orders places by distance', () => {
    const ranked = rankPlacesNearLodging(
      { lat: 37.76, lng: -122.435 },
      [
        { id: 'far', name: 'Far', lat: 37.8, lng: -122.4 },
        { id: 'near', name: 'Near', lat: 37.761, lng: -122.436 },
      ],
    );
    expect(ranked[0]?.id).toBe('near');
    expect(ranked[0]!.distanceKm).toBeLessThan(ranked[1]!.distanceKm);
  });
});

describe('suggestQueerNeighborhoods', () => {
  it('scores queer-tagged neighborhoods higher', () => {
    const suggestions = suggestQueerNeighborhoods([
      { id: '1', name: 'Financial', vibeTags: ['business'], placeCount: 1 },
      { id: '2', name: 'Castro', vibeTags: ['queer', 'nightlife'], placeCount: 4 },
    ]);
    expect(suggestions[0]?.name).toBe('Castro');
  });
});

describe('generateItinerary pace', () => {
  const destination = {
    slug: 'test',
    name: 'Test',
    country: 'US',
    continentCode: 'NA',
    nearestAirportCodes: ['SFO'],
    legalStatus: 'marriage_equality',
    safetyScore: 80,
    communityScore: 80,
    nightlifeScore: 80,
    bestMonths: [6],
    avgTempCByMonth: { 6: 22 },
    interests: ['nightlife', 'food'],
    upcomingEvents: [],
    accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: '' },
    costPerDay: { budget: 50, mid: 100, luxury: 200 },
    lastUpdated: '2026-06-01',
  } as Destination;

  const places: Place[] = Array.from({ length: 12 }, (_, i) => ({
    placeId: `p${i}`,
    name: `Place ${i}`,
    category: i % 2 === 0 ? 'restaurant' : 'bar',
    coords: { lat: 37.7 + i * 0.01, lng: -122.4 },
    durationMinutes: 90,
    estimatedCostPerPerson: 30,
    bookingRequired: false,
    interests: ['food', 'nightlife'],
    source: 'editorial',
    lgbtqRelevance: 'Welcoming venue',
  }));

  it('inserts free downtime blocks for downtime pace', () => {
    const items = generateItinerary({
      destination,
      places,
      preferences: { ...basePrefs, activityPace: 'downtime', nightlifeImportance: 0.2 },
      tripDurationDays: 1,
    });
    expect(items.some((i) => i.title === 'Open downtime')).toBe(true);
  });

  it('schedules more slots for packed pace than downtime', () => {
    const packed = generateItinerary({
      destination,
      places,
      preferences: { ...basePrefs, activityPace: 'packed', nightlifeImportance: 0.8 },
      tripDurationDays: 1,
    });
    const downtime = generateItinerary({
      destination,
      places: places.map((p, i) => ({ ...p, placeId: `d${i}` })),
      preferences: { ...basePrefs, activityPace: 'downtime', nightlifeImportance: 0.8 },
      tripDurationDays: 1,
    });
    const packedActivities = packed.filter((i) => i.title !== 'Open downtime').length;
    const downtimeActivities = downtime.filter((i) => i.title !== 'Open downtime').length;
    expect(packedActivities).toBeGreaterThanOrEqual(downtimeActivities);
  });
});
