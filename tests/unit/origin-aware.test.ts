import { describe, it, expect } from 'vitest';
import {
  excludeHomeDestinations,
  partitionRecommendations,
  resolveOriginHub,
  type OriginHub,
  type RecommendationResult,
} from '@gayi/domain';

const hubs: OriginHub[] = [
  {
    id: 'sf-bay',
    label: 'San Francisco Bay Area',
    airports: ['SFO', 'OAK', 'SJC'],
    homeDestinationSlugs: ['san-francisco'],
    weekendNearbySlugs: ['guerneville', 'palm-springs'],
    quickFlightSlugs: ['los-angeles', 'las-vegas', 'palm-springs', 'puerto-vallarta'],
  },
  {
    id: 'nyc',
    label: 'New York City',
    airports: ['JFK', 'LGA', 'EWR'],
    homeDestinationSlugs: ['new-york-city'],
    weekendNearbySlugs: ['provincetown', 'montreal'],
    quickFlightSlugs: ['miami', 'montreal', 'provincetown'],
  },
];

function result(slug: string, name: string, score = 80): RecommendationResult {
  return {
    slug,
    destinationName: name,
    overallMatch: score,
    componentScores: {} as RecommendationResult['componentScores'],
    topThreeReasons: [],
    twoTradeoffs: [],
    dataConfidence: 0.8,
    dataFreshness: 'editorial_demo',
    recommendedTravelWindow: { startMonth: 6, endMonth: 8 },
    estimatedCostRange: { low: 100, high: 300, currency: 'USD', perPerson: true },
  };
}

const scored: RecommendationResult[] = [
  result('san-francisco', 'San Francisco', 99),
  result('guerneville', 'Guerneville', 92),
  result('palm-springs', 'Palm Springs', 88),
  result('los-angeles', 'Los Angeles', 85),
  result('berlin', 'Berlin', 84),
  result('las-vegas', 'Las Vegas', 70),
  result('new-york-city', 'New York City', 95),
  result('miami', 'Miami', 82),
];

describe('resolveOriginHub', () => {
  it('matches SFO to sf-bay hub', () => {
    expect(resolveOriginHub(['SFO'], hubs)?.id).toBe('sf-bay');
  });

  it('is case-insensitive', () => {
    expect(resolveOriginHub(['sfo'], hubs)?.id).toBe('sf-bay');
  });

  it('matches JFK to nyc hub', () => {
    expect(resolveOriginHub(['JFK'], hubs)?.id).toBe('nyc');
  });

  it('returns null for unknown airport', () => {
    expect(resolveOriginHub(['HEL'], hubs)).toBeNull();
  });
});

describe('excludeHomeDestinations', () => {
  it('hard-excludes San Francisco for SF Bay travelers', () => {
    const hub = resolveOriginHub(['SFO'], hubs);
    const filtered = excludeHomeDestinations(scored, hub);
    expect(filtered.map((r) => r.slug)).not.toContain('san-francisco');
    expect(filtered.map((r) => r.slug)).toContain('guerneville');
  });

  it('hard-excludes New York for NYC travelers', () => {
    const hub = resolveOriginHub(['JFK'], hubs);
    const filtered = excludeHomeDestinations(scored, hub);
    expect(filtered.map((r) => r.slug)).not.toContain('new-york-city');
  });

  it('passes through when no hub', () => {
    expect(excludeHomeDestinations(scored, null)).toHaveLength(scored.length);
  });
});

describe('partitionRecommendations', () => {
  it('buckets weekend + quick flights for SF and excludes home', () => {
    const hub = resolveOriginHub(['SFO'], hubs);
    const parts = partitionRecommendations(scored, hub);

    expect(parts.excludedHomeSlugs).toEqual(['san-francisco']);
    expect(parts.weekendNearby.map((r) => r.slug)).toEqual([
      'guerneville',
      'palm-springs',
    ]);
    expect(parts.quickFlights.map((r) => r.slug)).toContain('los-angeles');
    expect(parts.quickFlights.map((r) => r.slug)).toContain('las-vegas');
    expect(parts.weekendNearby.map((r) => r.slug)).not.toContain('san-francisco');
    expect(parts.bestMatches.map((r) => r.slug)).not.toContain('san-francisco');
    expect(parts.bestMatches.map((r) => r.slug)).toContain('berlin');
  });

  it('does not put section picks into bestMatches', () => {
    const hub = resolveOriginHub(['SFO'], hubs);
    const parts = partitionRecommendations(scored, hub);
    const section = new Set([
      ...parts.weekendNearby.map((r) => r.slug),
      ...parts.quickFlights.map((r) => r.slug),
    ]);
    for (const r of parts.bestMatches) {
      expect(section.has(r.slug)).toBe(false);
    }
  });
});
