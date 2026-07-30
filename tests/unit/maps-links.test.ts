import { describe, expect, it } from 'vitest';
import {
  googleMapsMultiStopUrl,
  googleMapsPlaceUrl,
} from '../../apps/mobile/src/lib/mapsLinks';

describe('Google Maps links', () => {
  it('opens exact coordinates without letting a label override the pin', () => {
    const url = new URL(googleMapsPlaceUrl(37.7609, -122.435, 'Castro Theatre · Day 1'));
    expect(url.pathname).toBe('/maps/search/');
    expect(url.searchParams.get('query')).toBe('37.7609,-122.435');
    expect(url.toString()).not.toContain('Castro');
  });

  it('keeps multi-stop directions coordinate-only', () => {
    const url = new URL(googleMapsMultiStopUrl([
      { lat: 37.7609, lng: -122.435, label: 'Start' },
      { lat: 37.7694, lng: -122.4862, label: 'Second stop' },
    ]));
    expect(url.searchParams.get('destination')).toBe('37.7609,-122.435');
    expect(url.searchParams.get('waypoints')).toBe('37.7694,-122.4862');
    expect(url.toString()).not.toContain('Second');
  });
});
