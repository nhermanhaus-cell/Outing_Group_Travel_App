import { describe, expect, it } from 'vitest';
import { scoreDestinations } from '@gayi/domain';
import type { Destination, TravelPreferences } from '@gayi/shared';
import catalog from '../../fixtures/seed/destinations.json';
import scoring from '../../fixtures/seed/destinations.scoring.json';

const EXPECTED_ADDITIONS = [
  'toronto', 'vancouver', 'chicago', 'washington-dc', 'seattle', 'fort-lauderdale',
  'buenos-aires', 'rio-de-janeiro', 'sao-paulo', 'guadalajara', 'san-juan', 'paris',
  'mykonos', 'sitges', 'valencia', 'seville', 'copenhagen', 'reykjavik', 'valletta',
  'sydney', 'melbourne', 'bangkok', 'taipei', 'cape-town', 'rome', 'milan', 'florence',
  'venice', 'edinburgh', 'vienna', 'seoul', 'singapore', 'hong-kong', 'kyoto', 'osaka',
  'bali', 'queenstown', 'dubai', 'istanbul', 'marrakech', 'cartagena', 'honolulu',
];

const preferences: TravelPreferences = {
  budgetLevel: 'comfortably_fabulous', departureAirports: ['LAX'], travelMonths: [5],
  tripDurationDays: 6, groupSize: 2, interests: ['food'], accessibilityNeeds: [],
  nightlifeImportance: 0.5, weatherPreference: 'any', lgbtqSafetyPriority: 0.8,
  soloTravel: false, lookingFor: [],
};

describe('60-destination catalog expansion', () => {
  it('contains the original catalog and all 42 named additions exactly once', () => {
    expect(catalog).toHaveLength(60);
    expect(new Set(catalog.map((destination) => destination.slug)).size).toBe(60);
    expect(EXPECTED_ADDITIONS).toHaveLength(42);
    expect(EXPECTED_ADDITIONS.every((slug) => catalog.some((destination) => destination.slug === slug))).toBe(true);
    expect(catalog.filter((destination) => destination.publicationStatus === 'published')).toHaveLength(18);
    expect(catalog.filter((destination) => destination.publicationStatus === 'draft')).toHaveLength(42);
  });

  it('meets the common enrichment and source minimums', () => {
    for (const destination of catalog) {
      expect(destination.weatherProfile.avgHighByMonth).toHaveLength(12);
      expect(destination.weatherProfile.avgLowByMonth).toHaveLength(12);
      expect(destination.neighborhoods.length).toBeGreaterThanOrEqual(2);
      expect(destination.places.length).toBeGreaterThanOrEqual(6);
      expect(destination.events.length).toBeGreaterThanOrEqual(2);
      expect(destination.sources.length).toBeGreaterThanOrEqual(5);
      expect(destination.lgbtqContext.sources.length).toBeGreaterThanOrEqual(2);
      expect(new Set(destination.interests).size).toBe(destination.interests.length);
    }
  });

  it('keeps scoring lightweight and in slug parity with catalog detail', () => {
    expect(scoring).toHaveLength(60);
    expect(scoring.map((destination) => destination.slug).sort()).toEqual(catalog.map((destination) => destination.slug).sort());
    expect(scoring.every((destination) => !('catalog' in destination))).toBe(true);
  });

  it('excludes criminalized destinations when LGBTQ+ safety is an explicit hard priority', () => {
    const highSafety = scoreDestinations(preferences, scoring as unknown as Destination[]);
    expect(highSafety.some((result) => ['dubai', 'marrakech'].includes(result.slug))).toBe(false);
    const lowSafety = scoreDestinations({ ...preferences, lgbtqSafetyPriority: 0.2 }, scoring as unknown as Destination[]);
    expect(lowSafety.some((result) => result.slug === 'dubai')).toBe(true);
    expect(lowSafety.some((result) => result.slug === 'marrakech')).toBe(true);
  });

  it('marks criminalization and serious expression restrictions with severe advisories', () => {
    for (const slug of ['dubai', 'marrakech']) {
      const destination = catalog.find((entry) => entry.slug === slug)!;
      expect(destination.travelerAdvisoryLevel).toBe('severe');
      expect(destination.lgbtqContext.expressionRestrictions).toBeTruthy();
    }
  });
});
