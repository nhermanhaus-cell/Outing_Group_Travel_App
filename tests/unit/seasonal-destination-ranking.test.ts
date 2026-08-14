import { describe, expect, it } from 'vitest';
import { rankDestinationRows, type PersonalizationContext } from '../../supabase/functions/_shared/assistant-intelligence';
import { climateEligibility, inferSeasonalIntent } from '../../supabase/functions/_shared/seasonal-intent';

const context: PersonalizationContext = {
  version: 'v1',
  explicit: {
    interests: [], tripGoals: [], vacationStyles: [], preferredMonths: [], departureAirports: [],
    homeCountryCodes: [], preferredTravelRanges: [], transportModes: [], mealPreferences: [],
    avoidances: [], accessibilityNeeds: [], lgbtqSafetyPriority: 0,
  },
  inferred: [], savedDestinationSlugs: [], explanationSignals: [], contextFingerprint: 'climate-test',
};

function row(slug: string, name: string, temperatures: number[]) {
  return {
    slug, name, country: 'United States', editorial_summary: `${name} overview`,
    payload: { scoring: {
      slug, name, countryCode: 'US', legalStatus: 'marriage_equality', safetyScore: 80,
      communityScore: 70, nightlifeScore: 60, interests: [], bestMonths: [1, 2, 12],
      avgTempCByMonth: Object.fromEntries(temperatures.map((value, index) => [String(index + 1), value])),
      accessibility: {}, costPerDay: { mid: 150 }, typicalStayDays: { min: 3, max: 7 },
      lastUpdated: new Date().toISOString(), nearestAirportCodes: [],
    } },
  };
}

describe('season-aware destination discovery', () => {
  it('understands a generic winter request as December through February', () => {
    expect(inferSeasonalIntent('Somewhere warm to go in winter')).toEqual({
      climate: 'warm', months: [12, 1, 2], label: 'December–February',
    });
  });

  it('treats warm winter weather as deterministic eligibility, not a soft model preference', () => {
    const nyc = row('new-york-city', 'New York City', [5, 6, 11, 17, 22, 27, 29, 28, 25, 18, 13, 8]);
    const miami = row('miami', 'Miami', [25, 26, 27, 29, 31, 32, 33, 33, 32, 30, 28, 26]);
    const ranked = rankDestinationRows([nyc, miami], context, { months: [12, 1, 2], climate: 'warm' });
    expect(ranked.map((item) => item.destinationSlug)).toEqual(['miami']);
    expect(ranked[0]?.fitReasons.join(' ')).toMatch(/daytime highs/i);
  });

  it('excludes destinations with missing climate evidence from explicit warm-weather results', () => {
    expect(climateEligibility({}, [12, 1, 2], 'warm').eligible).toBe(false);
  });
});
