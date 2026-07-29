import { describe, expect, it } from 'vitest';
import { scorePlaceMatch } from '@gayi/shared';

const castro = {
  name: 'Castro Theatre',
  destinationName: 'San Francisco',
  address: '429 Castro St, San Francisco, CA',
  lat: 37.762,
  lng: -122.435,
};

describe('Google place match confidence', () => {
  it('accepts the same nearby venue', () => {
    const result = scorePlaceMatch(castro, {
      name: 'The Castro Theatre',
      address: '429 Castro Street, San Francisco, CA',
      lat: 37.7621,
      lng: -122.435,
    });
    expect(result.accepted).toBe(true);
  });

  it('rejects an unrelated nearby result', () => {
    const result = scorePlaceMatch(castro, {
      name: 'Castro Coffee Company',
      address: 'Castro Street, San Francisco, CA',
      lat: 37.7619,
      lng: -122.4351,
    });
    expect(result.accepted).toBe(false);
  });

  it('rejects a same-name result in the wrong city', () => {
    const result = scorePlaceMatch(castro, {
      name: 'Castro Theatre',
      address: 'Los Angeles, CA',
      lat: 34.0522,
      lng: -118.2437,
    });
    expect(result.accepted).toBe(false);
  });

  it('allows a nearby shortened provider name', () => {
    const result = scorePlaceMatch(
      { name: 'Berghain / Panorama Bar', destinationName: 'Berlin', lat: 52.511, lng: 13.443 },
      { name: 'Berghain', address: 'Am Wriezener Bahnhof, Berlin', lat: 52.5111, lng: 13.4432 },
    );
    expect(result.accepted).toBe(true);
  });
});
