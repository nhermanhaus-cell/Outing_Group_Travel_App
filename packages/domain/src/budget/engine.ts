import type { Destination, GlamourLevel } from '@gayi/shared';
import type {
  BudgetCategories,
  BudgetCategoryKey,
  BudgetLineItem,
  BudgetResult,
  CategoryOverrides,
  PersonBudget,
} from '../types';

// ─── Glamour-level cost multipliers ──────────────────────────────────────────

/** How many × the destination's `mid` daily rate each level targets. */
const GLAMOUR_MULTIPLIERS: Record<GlamourLevel, { lo: number; hi: number }> = {
  shoestring_slay: { lo: 0.40, hi: 0.65 },
  cute_but_controlled: { lo: 0.65, hi: 0.90 },
  comfortably_fabulous: { lo: 0.90, hi: 1.20 },
  luxury_gaycation: { lo: 1.80, hi: 2.80 },
  no_budget_just_vibes: { lo: 3.00, hi: 5.00 },
};

/**
 * Category allocation as a fraction of the total daily on-ground spend
 * (i.e. excluding flights).
 */
const CATEGORY_FRACTIONS: Record<BudgetCategoryKey, number> = {
  lodging: 0.35,
  meals: 0.20,
  drinksNightlife: 0.10,
  activities: 0.10,
  localTransport: 0.08,
  taxesFees: 0.05,
  wellness: 0.04,
  shopping: 0.04,
  events: 0.03,
  insurance: 0.02,
  contingency: 0.07,
  // flights handled separately
  flights: 0,
};

/** Per-person round-trip flight estimate range (USD) by glamour level. */
const FLIGHT_ESTIMATES: Record<GlamourLevel, { lo: number; hi: number }> = {
  shoestring_slay: { lo: 200, hi: 600 },
  cute_but_controlled: { lo: 300, hi: 800 },
  comfortably_fabulous: { lo: 400, hi: 1200 },
  luxury_gaycation: { lo: 800, hi: 3000 },
  no_budget_just_vibes: { lo: 2000, hi: 10000 },
};

const CATEGORY_ASSUMPTIONS: Record<BudgetCategoryKey, string> = {
  flights: 'Economy round-trip estimate; actual price varies by route and booking time.',
  lodging: 'Nightly rate based on destination cost index and glamour level.',
  taxesFees: 'Includes city tax, VAT, and booking fees where applicable.',
  localTransport: 'Metro, bus, taxi, and ride-share estimates.',
  meals: 'Breakfast, lunch, and dinner at venues appropriate to the glamour level.',
  drinksNightlife: 'Bars, clubs, and late-night snacks.',
  activities: 'Museum entry, tours, guided experiences.',
  events: 'Pride events, parties, ticketed festivals.',
  wellness: 'Spa treatments, gym day passes, wellness classes.',
  shopping: 'Souvenirs and discretionary retail.',
  insurance: 'Basic travel insurance per person.',
  contingency: 'Buffer for unexpected expenses and upgrades.',
};

const EXCLUSIONS = [
  'Visa fees and passport costs',
  'Pre-departure COVID or health screenings',
  'Long-haul business or first-class upgrades (use luxury_gaycation or no_budget_just_vibes for these)',
  'Prescription medications and medical expenses',
  'Pet care or home security during travel',
  'Currency conversion fees beyond standard bank rates',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildLineItem(low: number, high: number, key: BudgetCategoryKey): BudgetLineItem {
  return {
    low: round2(Math.max(0, low)),
    high: round2(Math.max(0, high)),
    assumption: CATEGORY_ASSUMPTIONS[key],
  };
}

function sumCategories(cats: BudgetCategories): { low: number; high: number } {
  let low = 0;
  let high = 0;
  for (const item of Object.values(cats) as BudgetLineItem[]) {
    low += item.low;
    high += item.high;
  }
  return { low: round2(low), high: round2(high) };
}

function scaleCategories(
  cats: BudgetCategories,
  factor: number,
): BudgetCategories {
  const result = {} as BudgetCategories;
  for (const k of Object.keys(cats) as BudgetCategoryKey[]) {
    result[k] = {
      ...cats[k],
      low: round2(cats[k].low * factor),
      high: round2(cats[k].high * factor),
    };
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BudgetEngineInput {
  glamourLevel: GlamourLevel;
  destination: Destination;
  tripDurationDays: number;
  groupSize: number;
  categoryOverrides?: CategoryOverrides;
}

/**
 * Estimate a per-person and group total budget breakdown for a trip.
 *
 * Override individual categories via `categoryOverrides` to lock specific
 * line items (e.g. if the user has already booked flights).
 */
export function estimateBudget(input: BudgetEngineInput): BudgetResult {
  const { glamourLevel, destination, tripDurationDays, groupSize, categoryOverrides } =
    input;

  const mult = GLAMOUR_MULTIPLIERS[glamourLevel];
  const midDailyRate = destination.costPerDay.mid;

  // Total on-ground daily spend per person (excludes flights)
  const dailyLoRate = midDailyRate * mult.lo;
  const dailyHiRate = midDailyRate * mult.hi;

  const totalOnGroundLo = dailyLoRate * tripDurationDays;
  const totalOnGroundHi = dailyHiRate * tripDurationDays;

  const flightEst = FLIGHT_ESTIMATES[glamourLevel];

  // Build per-person categories
  const categories = {} as BudgetCategories;
  for (const k of Object.keys(CATEGORY_FRACTIONS) as BudgetCategoryKey[]) {
    const frac = CATEGORY_FRACTIONS[k];
    if (k === 'flights') {
      categories.flights = buildLineItem(flightEst.lo, flightEst.hi, 'flights');
    } else {
      categories[k] = buildLineItem(
        totalOnGroundLo * frac,
        totalOnGroundHi * frac,
        k,
      );
    }
  }

  // Apply overrides
  if (categoryOverrides) {
    for (const k of Object.keys(categoryOverrides) as BudgetCategoryKey[]) {
      const override = categoryOverrides[k];
      if (override) categories[k] = override;
    }
  }

  const perPersonTotal = sumCategories(categories);

  const perPerson: PersonBudget = {
    categories,
    total: perPersonTotal,
  };

  const groupCategories = scaleCategories(categories, groupSize);
  const groupTotal: PersonBudget = {
    categories: groupCategories,
    total: sumCategories(groupCategories),
  };

  // Confidence: lower for no_budget_just_vibes and for sparse destination data
  let confidence = 0.80;
  if (glamourLevel === 'no_budget_just_vibes') confidence -= 0.15;
  if (glamourLevel === 'shoestring_slay') confidence -= 0.05;
  if (!destination.reviewCount || destination.reviewCount < 20) confidence -= 0.10;
  confidence = Math.max(0.30, confidence);

  const assumptions = [
    `Based on ${destination.name} mid-range daily cost of $${midDailyRate} USD/person.`,
    `Glamour level "${glamourLevel}" applies a ${Math.round(mult.lo * 100)}–${Math.round(mult.hi * 100)}% multiplier to on-ground costs.`,
    `Flight estimate is per person round-trip and does not account for specific routes or booking class.`,
    `Group size of ${groupSize} applied only to group total; shared accommodation savings are not modelled.`,
    categoryOverrides && Object.keys(categoryOverrides).length > 0
      ? `Category overrides applied for: ${Object.keys(categoryOverrides).join(', ')}.`
      : null,
  ].filter((a): a is string => a !== null);

  return {
    level: glamourLevel,
    perPerson,
    groupTotal,
    assumptions,
    confidence: round2(confidence),
    exclusions: EXCLUSIONS,
  };
}
