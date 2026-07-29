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

  it('rejects malformed provider payloads', () => {
    expect(() => validateTravelApiContract('placeSearch', { places: [{ id: 'missing-fields' }] })).toThrow(/malformed/i);
    expect(() => validateTravelApiContract('route', { routes: 'not-an-array' })).toThrow(/malformed/i);
  });

  it('requires Viator product codes and provider attribution', () => {
    expect(() => validateTravelApiContract('viatorSearch', { products: [{ title: 'No product code' }] })).toThrow(/malformed/i);
    expect(validateTravelApiContract<{ products: unknown[] }>('viatorSearch', { products: [{ productCode: '123P1', title: 'Tour', images: [], provider: 'viator', bookingMode: 'none' }] }).products).toHaveLength(1);
  });

  it('accepts attributed public images and rejects unattributed files', () => {
    expect(validateTravelApiContract<{ images: unknown[] }>('commonsImageSearch', {
      images: [{ url: 'https://upload.wikimedia.org/example.jpg', sourcePage: 'https://commons.wikimedia.org/wiki/File:Example.jpg', author: 'Example', license: 'CC BY-SA 4.0' }],
    }).images).toHaveLength(1);
    expect(() => validateTravelApiContract('commonsImageSearch', { images: [{ url: 'https://upload.wikimedia.org/example.jpg' }] })).toThrow(/malformed/i);
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
});
