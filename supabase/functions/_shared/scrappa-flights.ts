type JsonRecord = Record<string, unknown>;

export type ScrappaRoundTripRequest = {
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  adults: number;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function percentile(values: number[], quantile: number): number {
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * quantile)));
  return values[index] ?? values[0] ?? 0;
}

export function googleFlightsRoundTripUrl(request: ScrappaRoundTripRequest): string {
  const query = `Flights from ${request.originIata} to ${request.destinationIata} on ${request.departureDate} returning ${request.returnDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

export function normalizeScrappaRoundTrip(
  payload: unknown,
  request: ScrappaRoundTripRequest,
  observedAt = new Date().toISOString(),
): JsonRecord | null {
  const root = record(payload);
  const rawFlights = Array.isArray(root?.flights) ? root.flights : [];
  const metadata = record(root?.search_metadata);
  const rows = rawFlights.flatMap((value) => {
    const flight = record(value);
    const price = finiteNumber(flight?.price);
    const currency = nonEmptyString(flight?.currency)?.toUpperCase();
    if (!flight || price === undefined || price <= 0 || !currency) return [];
    const outbound = Array.isArray(flight.outbound_legs) ? flight.outbound_legs : [];
    const returns = Array.isArray(flight.return_legs) ? flight.return_legs : [];
    return [{
      price,
      currency,
      airlineName: nonEmptyString(flight.airline_name),
      durationMinutes: finiteNumber(flight.total_duration_minutes),
      stops: finiteNumber(flight.stops),
      emissionsDifferencePercent: finiteNumber(record(flight.emissions)?.difference_percent),
      tripType: nonEmptyString(flight.trip_type),
      hasOutbound: outbound.length > 0,
      hasReturn: returns.length > 0,
    }];
  });
  if (rows.length === 0) return null;

  const currencyCounts = new Map<string, number>();
  rows.forEach((row) => currencyCounts.set(row.currency, (currencyCounts.get(row.currency) ?? 0) + 1));
  const currency = [...currencyCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'USD';
  const matching = rows.filter((row) => row.currency === currency).sort((left, right) => left.price - right.price);
  const prices = matching.map((row) => row.price);
  const returnSelectionRequired = matching.some((row) => !row.hasReturn || row.tripType === 'one_way');
  const uniqueOptions = matching.filter((row, index, all) =>
    all.findIndex((candidate) =>
      candidate.price === row.price
      && candidate.airlineName === row.airlineName
      && candidate.durationMinutes === row.durationMinutes
    ) === index,
  ).slice(0, 5).map(({ tripType: _tripType, hasOutbound: _hasOutbound, hasReturn: _hasReturn, ...row }) => row);
  const metadataCurrency = nonEmptyString(metadata?.currency)?.toUpperCase();

  return {
    estimate: {
      originIata: request.originIata,
      destinationIata: request.destinationIata,
      departureDate: request.departureDate,
      returnDate: request.returnDate,
      adults: request.adults,
      currency: metadataCurrency === currency ? metadataCurrency : currency,
      lowPrice: prices[0],
      typicalPrice: percentile(prices, 0.5),
      highPrice: percentile(prices, 0.75),
      optionCount: matching.length,
      nonstopOptionCount: matching.filter((row) => row.stops === 0).length,
      observedAt,
      source: 'scrappa_google_flights',
      pricingScope: 'round_trip_search',
      returnSelectionRequired,
      priceIsPerTraveler: true,
      googleFlightsUrl: googleFlightsRoundTripUrl(request),
      message: returnSelectionRequired
        ? 'Starting prices from a round-trip Google Flights search. Select the return flight on Google Flights to confirm the final fare.'
        : 'Observed round-trip Google Flights options. Fare and availability can change before booking.',
      options: uniqueOptions,
    },
  };
}
