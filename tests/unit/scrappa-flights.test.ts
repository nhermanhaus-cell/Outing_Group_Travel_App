import { describe, expect, it } from 'vitest';
import {
  googleFlightsRoundTripUrl,
  normalizeScrappaRoundTrip,
} from '../../supabase/functions/_shared/scrappa-flights';

const request = {
  originIata: 'SFO',
  destinationIata: 'LAX',
  departureDate: '2026-09-15',
  returnDate: '2026-09-22',
  adults: 1,
};

describe('Scrappa round-trip normalization', () => {
  it('builds a useful range without forwarding booking tokens', () => {
    const normalized = normalizeScrappaRoundTrip({
      flights: [
        { price: 56, currency: 'USD', airline_name: 'Frontier', total_duration_minutes: 97, stops: 0, trip_type: 'one_way', booking_token: 'secret-a', outbound_legs: [{}], return_legs: [] },
        { price: 147, currency: 'USD', airline_name: 'Alaska', total_duration_minutes: 94, stops: 0, trip_type: 'one_way', booking_token: 'secret-b', outbound_legs: [{}], return_legs: [] },
        { price: 147, currency: 'USD', airline_name: 'Delta', total_duration_minutes: 88, stops: 0, trip_type: 'one_way', booking_token: 'secret-c', outbound_legs: [{}], return_legs: [] },
        { price: 522, currency: 'USD', airline_name: 'United', total_duration_minutes: 110, stops: 0, trip_type: 'one_way', booking_token: 'secret-d', outbound_legs: [{}], return_legs: [] },
      ],
      search_metadata: { origin: 'SFO', destination: 'LAX', departure_date: '2026-09-15', return_date: '2026-09-22', currency: 'USD' },
    }, request, '2026-08-12T12:00:00.000Z');
    const estimate = normalized?.estimate as Record<string, unknown>;
    expect(estimate.lowPrice).toBe(56);
    expect(estimate.typicalPrice).toBe(147);
    expect(estimate.highPrice).toBe(147);
    expect(estimate.returnSelectionRequired).toBe(true);
    expect(estimate.googleFlightsUrl).toContain('SFO');
    expect(JSON.stringify(normalized)).not.toContain('secret-');
    expect(JSON.stringify(normalized)).not.toContain('booking_token');
  });

  it('omits invalid and mismatched-currency rows', () => {
    const normalized = normalizeScrappaRoundTrip({
      flights: [
        { price: -4, currency: 'USD' },
        { price: 200, currency: 'EUR', airline_name: 'Example' },
        { price: 180, currency: 'USD', airline_name: 'Main' },
        { price: 190, currency: 'USD', airline_name: 'Main 2' },
      ],
      search_metadata: { currency: 'USD' },
    }, request);
    const estimate = normalized?.estimate as Record<string, unknown>;
    expect(estimate.currency).toBe('USD');
    expect(estimate.optionCount).toBe(2);
  });

  it('creates an exact-date Google Flights handoff', () => {
    expect(decodeURIComponent(googleFlightsRoundTripUrl(request))).toContain(
      'Flights from SFO to LAX on 2026-09-15 returning 2026-09-22',
    );
  });
});
