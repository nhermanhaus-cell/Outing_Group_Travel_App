import { describe, it, expect } from 'vitest';
import { scoreDestinations, DEFAULT_WEIGHTS } from '@gayi/domain';
import type { Destination, TravelPreferences } from '@gayi/shared';
import goldenFixture from '../../fixtures/golden/recommendation-basic.json';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const amsterdam: Destination = {
  slug: 'amsterdam-nl',
  name: 'Amsterdam',
  country: 'Netherlands',
  continentCode: 'EU',
  nearestAirportCodes: ['AMS'],
  legalStatus: 'marriage_equality',
  safetyScore: 95,
  communityScore: 90,
  nightlifeScore: 85,
  bestMonths: [4, 5, 6, 7, 8, 9],
  avgTempCByMonth: {
    1: 4, 2: 5, 3: 8, 4: 12, 5: 16,
    6: 19, 7: 22, 8: 21, 9: 18, 10: 13, 11: 8, 12: 5,
  },
  interests: ['nightlife', 'culture', 'lgbtq_venues', 'art', 'history'],
  upcomingEvents: [
    { name: 'Amsterdam Pride', month: 7, type: 'pride' },
  ],
  accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: '' },
  costPerDay: { budget: 80, mid: 140, luxury: 350 },
  lastUpdated: '2026-05-01',
  reviewScore: 4.7,
  reviewCount: 312,
  typicalStayDays: { min: 3, max: 8 },
};

const bangkok: Destination = {
  slug: 'bangkok-th',
  name: 'Bangkok',
  country: 'Thailand',
  continentCode: 'AS',
  nearestAirportCodes: ['BKK', 'DMK'],
  legalStatus: 'limited_protections',
  safetyScore: 68,
  communityScore: 72,
  nightlifeScore: 88,
  bestMonths: [11, 12, 1, 2, 3],
  avgTempCByMonth: {
    1: 28, 2: 30, 3: 33, 4: 35, 5: 34,
    6: 32, 7: 31, 8: 31, 9: 31, 10: 30, 11: 29, 12: 28,
  },
  interests: ['nightlife', 'food', 'culture', 'shopping', 'wellness'],
  upcomingEvents: [{ name: 'Bangkok Pride', month: 6, type: 'pride' }],
  accessibility: { wheelchairFriendly: false, brailleAvailable: false, notes: '' },
  costPerDay: { budget: 40, mid: 80, luxury: 220 },
  lastUpdated: '2026-04-15',
  reviewScore: 4.3,
  reviewCount: 198,
  typicalStayDays: { min: 4, max: 10 },
};

const nightlifeFocusedPrefs: TravelPreferences = {
  budgetLevel: 'comfortably_fabulous',
  departureAirports: ['JFK', 'LGA'],
  travelMonths: [6, 7],
  tripDurationDays: 7,
  groupSize: 2,
  interests: ['nightlife', 'culture', 'lgbtq_venues'],
  accessibilityNeeds: [],
  nightlifeImportance: 0.8,
  weatherPreference: 'warm',
  lgbtqSafetyPriority: 0.9,
  soloTravel: false,
  lookingFor: ['dancing', 'community'],
};

// ─── Core engine tests ────────────────────────────────────────────────────────

describe('scoreDestinations', () => {
  it('returns one result per destination', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    expect(results).toHaveLength(2);
  });

  it('returns results sorted by overallMatch descending', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.overallMatch).toBeGreaterThanOrEqual(results[i]!.overallMatch);
    }
  });

  it('is deterministic: same input produces identical output', () => {
    const a = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    const b = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is order-independent: shuffled destination input does not change ranking', () => {
    const forward = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    const reversed = scoreDestinations(nightlifeFocusedPrefs, [bangkok, amsterdam]);
    expect(forward.map((r) => r.slug)).toEqual(reversed.map((r) => r.slug));
    expect(forward[0]!.overallMatch).toBe(reversed[0]!.overallMatch);
  });

  it('tie-breaks by slug alphabetically', () => {
    const clone: Destination = { ...amsterdam, slug: 'zzz-clone' };
    const results = scoreDestinations(
      { ...nightlifeFocusedPrefs, travelMonths: amsterdam.bestMonths },
      [clone, amsterdam],
    );
    // Both have identical scores; amsterdam-nl < zzz-clone alphabetically
    if (results[0]!.overallMatch === results[1]!.overallMatch) {
      expect(results[0]!.slug).toBe('amsterdam-nl');
    }
  });

  it('all component scores are in range 0–100', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    for (const r of results) {
      for (const [key, val] of Object.entries(r.componentScores)) {
        expect(val, `${r.slug}.componentScores.${key}`).toBeGreaterThanOrEqual(0);
        expect(val, `${r.slug}.componentScores.${key}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('overallMatch is in range 0–100', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    for (const r of results) {
      expect(r.overallMatch).toBeGreaterThanOrEqual(0);
      expect(r.overallMatch).toBeLessThanOrEqual(100);
    }
  });

  it('provides exactly 3 top reasons and 2 tradeoffs', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam]);
    const result = results[0]!;
    expect(result.topThreeReasons).toHaveLength(3);
    expect(result.twoTradeoffs).toHaveLength(2);
  });

  it('dataConfidence is between 0 and 1', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam]);
    expect(results[0]!.dataConfidence).toBeGreaterThanOrEqual(0);
    expect(results[0]!.dataConfidence).toBeLessThanOrEqual(1);
  });

  it('recommendedTravelWindow falls within user travelMonths when overlap exists', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam]);
    const window = results[0]!.recommendedTravelWindow;
    expect(nightlifeFocusedPrefs.travelMonths).toContain(window.startMonth);
  });

  it('estimatedCostRange has low <= high', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    for (const r of results) {
      expect(r.estimatedCostRange.low).toBeLessThanOrEqual(r.estimatedCostRange.high);
    }
  });

  it('handles a destination with no temp data gracefully (neutral score)', () => {
    const sparse: Destination = { ...amsterdam, avgTempCByMonth: {} };
    const results = scoreDestinations(nightlifeFocusedPrefs, [sparse]);
    expect(results[0]!.componentScores.weatherMatch).toBe(50);
  });

  it('handles a destination with no typicalStayDays gracefully', () => {
    const noStay: Destination = { ...amsterdam };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (noStay as any).typicalStayDays;
    const results = scoreDestinations(nightlifeFocusedPrefs, [noStay]);
    expect(results[0]!.componentScores.tripDurationFit).toBe(50);
  });

  it('respects custom weight overrides', () => {
    const extremeWeights = {
      ...DEFAULT_WEIGHTS,
      lgbtqLegal: 0.90,
      budgetFit: 0.01,
      seasonalFit: 0.01,
      flightConvenience: 0.01,
      publicAttitude: 0.01,
      communityActivity: 0.01,
      nightlifeMatch: 0.01,
      interestMatch: 0.01,
      weatherMatch: 0.01,
      tripDurationFit: 0,
      eventAlignment: 0,
      accessibilityMatch: 0,
      socialFit: 0,
      accommodationFit: 0,
      userReviewFit: 0,
      dataConfidence: 0.01,
    };
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok], extremeWeights);
    // With 90% weight on lgbtqLegal, marriage_equality amsterdam must rank first
    expect(results[0]!.slug).toBe('amsterdam-nl');
  });

  it('scores marriage_equality higher than limited_protections for safety-priority user', () => {
    const results = scoreDestinations(nightlifeFocusedPrefs, [amsterdam, bangkok]);
    const ams = results.find((r) => r.slug === 'amsterdam-nl')!;
    const bkk = results.find((r) => r.slug === 'bangkok-th')!;
    expect(ams.componentScores.lgbtqLegal).toBeGreaterThan(bkk.componentScores.lgbtqLegal);
  });
});

// ─── Golden fixture test ──────────────────────────────────────────────────────

describe('golden fixture: recommendation-basic', () => {
  const { input, expectedOutput } = goldenFixture;

  it('top result matches expected slug', () => {
    const prefs = input.preferences as TravelPreferences;
    const destinations = input.destinations as Destination[];
    const results = scoreDestinations(prefs, destinations);
    expect(results[0]!.slug).toBe(expectedOutput.topResult);
  });

  it('top result meets minimum overall match', () => {
    const prefs = input.preferences as TravelPreferences;
    const destinations = input.destinations as Destination[];
    const results = scoreDestinations(prefs, destinations);
    expect(results[0]!.overallMatch).toBeGreaterThanOrEqual(
      expectedOutput.minOverallMatchForTop,
    );
  });

  it('top result component scores satisfy minimum thresholds', () => {
    const prefs = input.preferences as TravelPreferences;
    const destinations = input.destinations as Destination[];
    const results = scoreDestinations(prefs, destinations);
    const topScores = results[0]!.componentScores;

    for (const [component, constraint] of Object.entries(
      expectedOutput.topResultMustScore as Record<string, { min: number }>,
    )) {
      expect(
        topScores[component as keyof typeof topScores],
        `componentScores.${component}`,
      ).toBeGreaterThanOrEqual(constraint.min);
    }
  });

  it('destination ordering matches expected array', () => {
    const prefs = input.preferences as TravelPreferences;
    const destinations = input.destinations as Destination[];
    const results = scoreDestinations(prefs, destinations);
    expect(results.map((r) => r.slug)).toEqual(expectedOutput.ordering);
  });
});
