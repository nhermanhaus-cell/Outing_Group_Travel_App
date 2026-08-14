import { describe, it, expect } from 'vitest';
import { estimateBudget } from '@gayi/domain';
import type { BudgetEngineInput } from '@gayi/domain';
import type { Destination } from '@gayi/shared';

// ─── Shared test fixture ──────────────────────────────────────────────────────

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
  avgTempCByMonth: {},
  interests: ['nightlife', 'culture', 'lgbtq_venues'],
  upcomingEvents: [],
  accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: '' },
  costPerDay: { budget: 80, mid: 140, luxury: 350 },
  lastUpdated: '2026-05-01',
  reviewScore: 4.7,
  reviewCount: 312,
};

function makeInput(
  overrides: Partial<BudgetEngineInput> = {},
): BudgetEngineInput {
  return {
    glamourLevel: 'comfortably_fabulous',
    destination: amsterdam,
    tripDurationDays: 7,
    groupSize: 2,
    ...overrides,
  };
}

// ─── Structural tests ─────────────────────────────────────────────────────────

describe('estimateBudget - structure', () => {
  it('returns the correct glamour level', () => {
    const result = estimateBudget(makeInput({ glamourLevel: 'luxury_gaycation' }));
    expect(result.level).toBe('luxury_gaycation');
  });

  it('all category low values are >= 0', () => {
    const result = estimateBudget(makeInput());
    for (const [key, item] of Object.entries(result.perPerson.categories)) {
      expect(item.low, `perPerson.categories.${key}.low`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all category high values are >= low', () => {
    const result = estimateBudget(makeInput());
    for (const [key, item] of Object.entries(result.perPerson.categories)) {
      expect(item.high, `perPerson.categories.${key}.high`).toBeGreaterThanOrEqual(item.low);
    }
  });

  it('perPerson total.low <= perPerson total.high', () => {
    const result = estimateBudget(makeInput());
    expect(result.perPerson.total.low).toBeLessThanOrEqual(result.perPerson.total.high);
  });

  it('groupTotal.total.low <= groupTotal.total.high', () => {
    const result = estimateBudget(makeInput());
    expect(result.groupTotal.total.low).toBeLessThanOrEqual(result.groupTotal.total.high);
  });

  it('provides at least one assumption', () => {
    const result = estimateBudget(makeInput());
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it('provides at least one exclusion', () => {
    const result = estimateBudget(makeInput());
    expect(result.exclusions.length).toBeGreaterThan(0);
  });

  it('confidence is between 0 and 1', () => {
    const result = estimateBudget(makeInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('all 12 budget categories are present', () => {
    const result = estimateBudget(makeInput());
    const expectedKeys = [
      'flights', 'lodging', 'taxesFees', 'localTransport', 'meals',
      'drinksNightlife', 'activities', 'events', 'wellness', 'shopping',
      'insurance', 'contingency',
    ];
    for (const key of expectedKeys) {
      expect(result.perPerson.categories).toHaveProperty(key);
    }
  });
});

// ─── Glamour level ordering ────────────────────────────────────────────────────

describe('estimateBudget - glamour level ordering', () => {
  const levels = [
    'shoestring_slay',
    'cute_but_controlled',
    'comfortably_fabulous',
    'luxury_gaycation',
    'no_budget_just_vibes',
  ] as const;

  it('higher glamour levels produce higher per-person totals', () => {
    const totals = levels.map((level) => {
      const result = estimateBudget(makeInput({ glamourLevel: level }));
      return result.perPerson.total.high;
    });
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i], `${levels[i]} > ${levels[i - 1]}`).toBeGreaterThan(totals[i - 1]!);
    }
  });
});

// ─── Group scaling ────────────────────────────────────────────────────────────

describe('estimateBudget - group scaling', () => {
  it('groupTotal is perPerson × groupSize for all categories', () => {
    const input = makeInput({ groupSize: 4 });
    const result = estimateBudget(input);
    for (const key of Object.keys(result.perPerson.categories) as (keyof typeof result.perPerson.categories)[]) {
      expect(result.groupTotal.categories[key].low).toBeCloseTo(
        result.perPerson.categories[key].low * 4,
        1,
      );
      expect(result.groupTotal.categories[key].high).toBeCloseTo(
        result.perPerson.categories[key].high * 4,
        1,
      );
    }
  });

  it('solo (groupSize 1) groupTotal equals perPerson', () => {
    const result = estimateBudget(makeInput({ groupSize: 1 }));
    expect(result.groupTotal.total.low).toBeCloseTo(result.perPerson.total.low, 1);
    expect(result.groupTotal.total.high).toBeCloseTo(result.perPerson.total.high, 1);
  });
});

// ─── Category overrides ───────────────────────────────────────────────────────

describe('estimateBudget - category overrides', () => {
  it('overrides replace the specified category', () => {
    const result = estimateBudget(
      makeInput({
        categoryOverrides: {
          flights: { low: 999, high: 1500, assumption: 'Pre-booked business class' },
        },
      }),
    );
    expect(result.perPerson.categories.flights.low).toBe(999);
    expect(result.perPerson.categories.flights.high).toBe(1500);
    expect(result.perPerson.categories.flights.assumption).toBe('Pre-booked business class');
  });

  it('overrides are mentioned in assumptions', () => {
    const result = estimateBudget(
      makeInput({
        categoryOverrides: {
          lodging: { low: 50, high: 80, assumption: 'Staying with friends' },
        },
      }),
    );
    const overrideAssumption = result.assumptions.find((a) =>
      a.toLowerCase().includes('lodging'),
    );
    expect(overrideAssumption).toBeDefined();
  });

  it('non-overridden categories are unaffected', () => {
    const base = estimateBudget(makeInput());
    const withOverride = estimateBudget(
      makeInput({
        categoryOverrides: {
          flights: { low: 0, high: 0, assumption: 'Flights already paid' },
        },
      }),
    );
    expect(withOverride.perPerson.categories.lodging.low).toBe(
      base.perPerson.categories.lodging.low,
    );
  });
});

// ─── Shorter/longer trips ─────────────────────────────────────────────────────

describe('estimateBudget - trip duration', () => {
  it('longer trip produces proportionally higher on-ground costs', () => {
    const short = estimateBudget(makeInput({ tripDurationDays: 3 }));
    const long = estimateBudget(makeInput({ tripDurationDays: 14 }));
    // Lodging should scale linearly; total should be higher for the long trip
    expect(long.perPerson.categories.lodging.high)
      .toBeGreaterThan(short.perPerson.categories.lodging.high);
  });
});
