import { describe, it, expect } from 'vitest';
import { mergePlaces } from '../../packages/providers/src/plugins/places/google-places.shell';
import type { Place } from '@gayi/shared';

function place(partial: Partial<Place> & Pick<Place, 'placeId' | 'name' | 'coords'>): Place {
  return {
    category: 'bar',
    durationMinutes: 90,
    estimatedCostPerPerson: 20,
    bookingRequired: false,
    interests: [],
    source: 'editorial',
    ...partial,
  };
}

describe('mergePlaces', () => {
  it('keeps editorial and appends unique live places', () => {
    const editorial = [
      place({ placeId: 'e1', name: 'Twin Peaks', coords: { lat: 37.76, lng: -122.43 } }),
    ];
    const live = [
      place({
        placeId: 'g1',
        name: 'Twin Peaks',
        coords: { lat: 37.7601, lng: -122.4301 },
        source: 'google_places',
      }),
      place({
        placeId: 'g2',
        name: 'The Lookout',
        coords: { lat: 37.77, lng: -122.42 },
        source: 'google_places',
      }),
    ];
    const merged = mergePlaces(editorial, live);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.name)).toContain('The Lookout');
  });
});
