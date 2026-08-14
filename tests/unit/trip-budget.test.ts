import { describe, expect, it } from 'vitest';
import type { Destination } from '@gayi/shared';
import type { ApiRoundTripFlightEstimate } from '../../apps/mobile/src/lib/travel-api';
import {
  buildTripBudget,
  googleFlightsRoundTripUrl,
  normalizeGlamourLevel,
} from '../../apps/mobile/src/lib/trip-budget';

const destination: Destination = {
  slug: 'new-york-city-us',
  name: 'New York City',
  country: 'United States',
  continentCode: 'NA',
  nearestAirportCodes: ['JFK'],
  legalStatus: 'marriage_equality',
  safetyScore: 85,
  communityScore: 95,
  nightlifeScore: 95,
  bestMonths: [4, 5, 9, 10],
  avgTempCByMonth: {},
  interests: ['food', 'culture'],
  upcomingEvents: [],
  accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: '' },
  costPerDay: { budget: 120, mid: 250, luxury: 600 },
  lastUpdated: '2026-08-01',
  reviewScore: 4.8,
  reviewCount: 300,
};

function flightEstimate(overrides: Partial<ApiRoundTripFlightEstimate> = {}): ApiRoundTripFlightEstimate {
  return {
    originIata: 'SFO',
    destinationIata: 'JFK',
    departureDate: '2026-10-01',
    returnDate: '2026-10-05',
    adults: 2,
    currency: 'USD',
    lowPrice: 275,
    typicalPrice: 325,
    highPrice: 410,
    optionCount: 8,
    nonstopOptionCount: 3,
    observedAt: '2026-08-13T12:00:00.000Z',
    source: 'scrappa_google_flights',
    pricingScope: 'round_trip_search',
    returnSelectionRequired: true,
    priceIsPerTraveler: true,
    googleFlightsUrl: 'https://www.google.com/travel/flights?q=SFO-JFK',
    message: 'Round-trip estimate',
    options: [],
    ...overrides,
  };
}

describe('trip budget presentation model', () => {
  it('includes the Google Flights round-trip range in per-person and group totals', () => {
    const result = buildTripBudget({
      destination,
      glamourLevel: 'comfortably_fabulous',
      groupSize: 3,
      tripDurationDays: 5,
      flightEstimate: flightEstimate(),
    });

    expect(result.liveFlightApplied).toBe(true);
    expect(result.budget?.perPerson.categories.flights).toMatchObject({ low: 275, high: 410 });
    expect(result.budget?.groupTotal.categories.flights).toMatchObject({ low: 825, high: 1230 });
  });

  it('converts a supported non-USD estimate into the canonical USD budget', () => {
    const result = buildTripBudget({
      destination,
      groupSize: 1,
      tripDurationDays: 4,
      flightEstimate: flightEstimate({ currency: 'EUR', lowPrice: 230, typicalPrice: 276, highPrice: 368 }),
    });

    expect(result.liveFlightApplied).toBe(true);
    expect(result.budget?.perPerson.categories.flights.low).toBe(250);
    expect(result.budget?.perPerson.categories.flights.high).toBe(400);
  });

  it('keeps a safe planning flight range when provider data is missing or malformed', () => {
    const result = buildTripBudget({
      destination,
      glamourLevel: 'midrange',
      groupSize: 2,
      tripDurationDays: 4,
      flightEstimate: flightEstimate({ lowPrice: Number.NaN }),
    });

    expect(result.glamourLevel).toBe('comfortably_fabulous');
    expect(result.liveFlightApplied).toBe(false);
    expect(result.budget?.perPerson.categories.flights).toMatchObject({ low: 400, high: 1200 });
  });

  it('returns a non-crashing unavailable state for invalid destination cost data', () => {
    const result = buildTripBudget({
      destination: { ...destination, costPerDay: { ...destination.costPerDay, mid: Number.NaN } },
      tripDurationDays: 5,
      groupSize: 2,
    });

    expect(result.budget).toBeNull();
  });
});

describe('Google Flights handoff', () => {
  it('builds a dated round-trip search when live pricing is unavailable', () => {
    const url = googleFlightsRoundTripUrl({
      originIata: 'sfo',
      destinationIata: 'jfk',
      departureDate: '2026-10-01',
      returnDate: '2026-10-05',
    });

    expect(url).toContain('google.com/travel/flights');
    expect(decodeURIComponent(url ?? '')).toContain('Flights from SFO to JFK on 2026-10-01 returning 2026-10-05');
  });

  it('does not create a misleading link without a valid route and date range', () => {
    expect(googleFlightsRoundTripUrl({
      originIata: 'San Francisco',
      destinationIata: 'JFK',
      departureDate: '2026-10-05',
      returnDate: '2026-10-01',
    })).toBeUndefined();
  });
});

describe('legacy travel styles', () => {
  it('normalizes old and unknown values before calling the budget engine', () => {
    expect(normalizeGlamourLevel('midrange')).toBe('comfortably_fabulous');
    expect(normalizeGlamourLevel('luxury')).toBe('luxury_gaycation');
    expect(normalizeGlamourLevel('something-old')).toBe('comfortably_fabulous');
  });
});
