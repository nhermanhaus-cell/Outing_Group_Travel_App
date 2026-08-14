import { describe, expect, it } from 'vitest';
import { validateTravelApiContract } from '@gayi/shared';

describe('travel API contracts', () => {
  it('accepts normalized partial Google places', () => {
    const value = validateTravelApiContract<{ places: unknown[] }>('placeSearch', { places: [{ providerPlaceId: 'abc', name: 'Museum', lat: 1, lng: 2, types: ['museum'], photos: [], verifiedAt: '2026-07-17T00:00:00Z' }] });
    expect(value.places).toHaveLength(1);
  });

  it('accepts place-specific text search results used for city photos', () => {
    const value = validateTravelApiContract<{ places: unknown[] }>('placeTextSearch', { places: [{ providerPlaceId: 'castro', name: 'Castro Theatre', lat: 37.76, lng: -122.43, types: ['movie_theater'], photos: [{ url: 'https://example.com/photo.jpg', attribution: 'Example' }], googleMapsUri: 'https://maps.google.com/?cid=1', verifiedAt: '2026-07-17T00:00:00Z' }] });
    expect(value.places).toHaveLength(1);
  });

  it('accepts resolved and user-authored itinerary essentials', () => {
    const value = validateTravelApiContract<{ essentials: Array<{ source: string }> }>('resolveTripEssentials', {
      essentials: [
        { id: 'google-1', label: 'The Louvre', kind: 'place', source: 'google_places', providerPlaceId: '1', lat: 48.86, lng: 2.33, category: 'museum' },
        { id: 'custom-1', label: 'A pastry class', kind: 'activity', source: 'user', category: 'tour' },
      ],
    });
    expect(value.essentials.map((item) => item.source)).toEqual(['google_places', 'user']);
  });

  it('rejects malformed provider payloads', () => {
    expect(() => validateTravelApiContract('placeSearch', { places: [{ id: 'missing-fields' }] })).toThrow(/malformed/i);
    expect(() => validateTravelApiContract('route', { routes: 'not-an-array' })).toThrow(/malformed/i);
  });

  it('requires Viator product codes and provider attribution', () => {
    expect(() => validateTravelApiContract('viatorSearch', { products: [{ title: 'No product code' }] })).toThrow(/malformed/i);
    const value = validateTravelApiContract<{ products: unknown[]; resolvedDestination?: { destinationId: string } }>('viatorSearch', {
      products: [{ productCode: '123P1', title: 'Tour', images: [], provider: 'viator', bookingMode: 'none' }],
      resolvedDestination: { destinationId: '684', name: 'San Francisco', type: 'CITY', distanceKm: 0.8, matchScore: 248 },
      source: 'viator_live',
    });
    expect(value.products).toHaveLength(1);
    expect(value.resolvedDestination?.destinationId).toBe('684');
  });

  it('accepts planning-ready Viator enrichment without weakening provider attribution', () => {
    const value = validateTravelApiContract<{ products: Array<Record<string, unknown>> }>('viatorSearch', {
      products: [{
        productCode: '479P1',
        title: 'Architecture and food walk',
        description: 'A guided city experience.',
        productUrl: 'https://www.viator.com/tours/example',
        images: [{ url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/example.jpg' }],
        provider: 'viator',
        bookingMode: 'external',
        category: 'landmark',
        interestTags: ['history', 'food'],
        lat: 48.861,
        lng: 2.335,
        address: 'Paris, France',
        confirmationType: 'INSTANT',
        freeCancellation: true,
        flags: ['FREE_CANCELLATION'],
      }],
      source: 'viator_live',
    });
    expect(value.products[0]).toMatchObject({
      provider: 'viator',
      category: 'landmark',
      lat: 48.861,
      freeCancellation: true,
    });
  });

  it('accepts attributed public images and rejects unattributed files', () => {
    expect(validateTravelApiContract<{ images: unknown[] }>('commonsImageSearch', {
      images: [{ url: 'https://upload.wikimedia.org/example.jpg', sourcePage: 'https://commons.wikimedia.org/wiki/File:Example.jpg', author: 'Example', license: 'CC BY-SA 4.0' }],
    }).images).toHaveLength(1);
    expect(() => validateTravelApiContract('commonsImageSearch', { images: [{ url: 'https://upload.wikimedia.org/example.jpg' }] })).toThrow(/malformed/i);
  });

  it('keeps Pexels match quality and photographer links in location image results', () => {
    const value = validateTravelApiContract<{ images: unknown[]; match: string }>('locationImageSearch', {
      images: [{
        url: 'https://images.pexels.com/photos/123/example.jpeg',
        thumbnailUrl: 'https://images.pexels.com/photos/123/example-small.jpeg',
        sourcePage: 'https://www.pexels.com/photo/example-123/',
        author: 'Example Photographer',
        authorUrl: 'https://www.pexels.com/@example/',
        license: 'Pexels',
        provider: 'pexels',
        alt: 'Shibuya Crossing at night',
        matchType: 'specific',
      }],
      match: 'specific',
      query: 'Shibuya Crossing Tokyo',
      source: 'pexels',
    });
    expect(value.images).toHaveLength(1);
    expect(value.match).toBe('specific');
    expect(() => validateTravelApiContract('locationImageSearch', {
      images: [],
      match: 'generic',
      query: 'Tokyo',
      source: 'pexels',
    })).toThrow(/malformed/i);
  });

  it('requires exact provider URLs for Booking.com stays', () => {
    expect(validateTravelApiContract<{ stays: unknown[] }>('bookingStays', {
      stays: [{ id: '42', name: 'Hotel', url: 'https://www.booking.com/hotel/example.html', imageUrls: [], source: 'booking_com' }],
    }).stays).toHaveLength(1);
    expect(() => validateTravelApiContract('bookingStays', { stays: [{ id: '42', name: 'Hotel', imageUrls: [], source: 'booking_com' }] })).toThrow(/malformed/i);
  });

  it('keeps indicative flight pricing explicitly attributed', () => {
    expect(validateTravelApiContract<{ deals: unknown[] }>('skyscannerIndicative', {
      deals: [{ id: 'q1', destinationName: 'Lisbon', price: 199, currency: 'USD', direct: true, observedAt: '2026-07-17T00:00:00Z', source: 'skyscanner_indicative' }],
      observedAt: '2026-07-17T00:00:00Z',
      indicative: true,
    }).deals).toHaveLength(1);
    expect(() => validateTravelApiContract('skyscannerIndicative', { deals: [], observedAt: 'now', indicative: false })).toThrow(/malformed/i);
  });

  it('validates normalized Scrappa round-trip estimates without provider tokens', () => {
    const value = validateTravelApiContract<{ estimate: { lowPrice: number } }>('scrappaRoundTrip', {
      estimate: {
        originIata: 'SFO', destinationIata: 'LAX', departureDate: '2026-09-15', returnDate: '2026-09-22', adults: 1,
        currency: 'USD', lowPrice: 56, typicalPrice: 147, highPrice: 147, optionCount: 30, nonstopOptionCount: 30,
        observedAt: '2026-08-12T12:00:00.000Z', source: 'scrappa_google_flights', pricingScope: 'round_trip_search',
        returnSelectionRequired: true, priceIsPerTraveler: true,
        googleFlightsUrl: 'https://www.google.com/travel/flights?q=SFO%20LAX',
        message: 'Select a return flight to confirm the final fare.',
        options: [{ price: 56, currency: 'USD', airlineName: 'Frontier', stops: 0 }],
      },
    });
    expect(value.estimate.lowPrice).toBe(56);
  });
});
