import { estimateBudget } from '@gayi/domain';
import type { BudgetLineItem, BudgetResult } from '@gayi/domain';
import type { Destination, GlamourLevel } from '@gayi/shared';
import { googleFlightsSearchUrl } from './dateRecommendations';
import { convertCurrency } from './display-format';
import type { ApiRoundTripFlightEstimate } from './travel-api';

const GLAMOUR_LEVELS = new Set<GlamourLevel>([
  'shoestring_slay',
  'cute_but_controlled',
  'comfortably_fabulous',
  'luxury_gaycation',
  'no_budget_just_vibes',
]);

const LEGACY_GLAMOUR_LEVELS: Record<string, GlamourLevel> = {
  budget: 'shoestring_slay',
  shoestring: 'shoestring_slay',
  moderate: 'cute_but_controlled',
  midrange: 'comfortably_fabulous',
  comfort: 'comfortably_fabulous',
  luxury: 'luxury_gaycation',
  unlimited: 'no_budget_just_vibes',
};

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validBudgetLine(value: unknown): value is BudgetLineItem {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<BudgetLineItem>;
  return typeof line.assumption === 'string'
    && typeof line.low === 'number'
    && Number.isFinite(line.low)
    && line.low >= 0
    && typeof line.high === 'number'
    && Number.isFinite(line.high)
    && line.high >= line.low;
}

function validBudgetResult(value: BudgetResult): boolean {
  if (!validBudgetLine(value.perPerson?.categories?.flights)) return false;
  if (!positiveFinite(value.perPerson?.total?.high) || !positiveFinite(value.groupTotal?.total?.high)) return false;
  return Object.values(value.perPerson.categories).every(validBudgetLine);
}

export function normalizeGlamourLevel(value: string | null | undefined): GlamourLevel {
  if (value && GLAMOUR_LEVELS.has(value as GlamourLevel)) return value as GlamourLevel;
  return value ? LEGACY_GLAMOUR_LEVELS[value.toLowerCase()] ?? 'comfortably_fabulous' : 'comfortably_fabulous';
}

export function validGoogleFlightsEstimate(
  estimate: ApiRoundTripFlightEstimate | null | undefined,
): estimate is ApiRoundTripFlightEstimate {
  return Boolean(
    estimate
    && positiveFinite(estimate.lowPrice)
    && positiveFinite(estimate.typicalPrice)
    && positiveFinite(estimate.highPrice)
    && estimate.lowPrice <= estimate.typicalPrice
    && estimate.typicalPrice <= estimate.highPrice
    && estimate.priceIsPerTraveler === true,
  );
}

export function googleFlightsRoundTripUrl(input: {
  originIata?: string | null;
  destinationIata?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
}): string | undefined {
  const origin = input.originIata?.trim().toUpperCase();
  const destination = input.destinationIata?.trim().toUpperCase();
  if (!origin?.match(/^[A-Z]{3}$/) || !destination?.match(/^[A-Z]{3}$/)) return undefined;
  if (!input.departureDate || !input.returnDate || input.departureDate >= input.returnDate) return undefined;
  return googleFlightsSearchUrl(origin, destination, input.departureDate, input.returnDate);
}

export function buildTripBudget(input: {
  destination: Destination | null | undefined;
  glamourLevel?: string | null;
  groupSize?: number | null;
  tripDurationDays?: number | null;
  flightEstimate?: ApiRoundTripFlightEstimate | null;
}): {
  budget: BudgetResult | null;
  glamourLevel: GlamourLevel;
  liveFlightApplied: boolean;
} {
  const glamourLevel = normalizeGlamourLevel(input.glamourLevel);
  if (!input.destination || !positiveFinite(input.destination.costPerDay?.mid)) {
    return { budget: null, glamourLevel, liveFlightApplied: false };
  }

  const groupSize = positiveFinite(input.groupSize) ? Math.max(1, Math.round(input.groupSize)) : 1;
  const tripDurationDays = positiveFinite(input.tripDurationDays)
    ? Math.max(1, Math.round(input.tripDurationDays))
    : 1;

  let flightOverride: BudgetLineItem | undefined;
  if (validGoogleFlightsEstimate(input.flightEstimate)) {
    const low = convertCurrency(input.flightEstimate.lowPrice, input.flightEstimate.currency, 'USD');
    const high = convertCurrency(input.flightEstimate.highPrice, input.flightEstimate.currency, 'USD');
    if (low.currency === 'USD' && high.currency === 'USD'
      && positiveFinite(low.amount) && positiveFinite(high.amount) && high.amount >= low.amount) {
      flightOverride = {
        low: Math.round(low.amount * 100) / 100,
        high: Math.round(high.amount * 100) / 100,
        assumption: `Observed per-traveler round-trip prices for ${input.flightEstimate.originIata}–${input.flightEstimate.destinationIata} on Google Flights. Final pricing depends on the flights selected.`,
      };
    }
  }

  try {
    const budget = estimateBudget({
      destination: input.destination,
      glamourLevel,
      groupSize,
      tripDurationDays,
      ...(flightOverride ? { categoryOverrides: { flights: flightOverride } } : {}),
    });
    return validBudgetResult(budget)
      ? { budget, glamourLevel, liveFlightApplied: Boolean(flightOverride) }
      : { budget: null, glamourLevel, liveFlightApplied: false };
  } catch {
    return { budget: null, glamourLevel, liveFlightApplied: false };
  }
}
