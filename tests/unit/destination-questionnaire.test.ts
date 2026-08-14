import { describe, expect, it } from 'vitest';
import {
  getDestinationHallmarks,
  getDestinationInterestOptions,
  mergeDestinationHallmarkMedia,
} from '../../apps/mobile/src/lib/destinationQuestionnaire';

describe('destination-aware questionnaire', () => {
  it('does not offer beach when the destination has no beach signal', () => {
    const options = getDestinationInterestOptions({
      slug: 'berlin',
      name: 'Berlin',
      interests: ['nightlife', 'art_culture', 'history', 'architecture'],
      places: [
        { id: 'club', name: 'A club', category: 'club' },
        { id: 'museum', name: 'A museum', category: 'museum' },
      ],
    });
    expect(options.map((option) => option.key)).not.toContain('beach');
  });

  it('offers beach and outdoors when supported by real destination places', () => {
    const options = getDestinationInterestOptions({
      slug: 'guerneville',
      name: 'Guerneville',
      interests: ['outdoors', 'food'],
      places: [
        { id: 'beach', name: "Johnson's Beach", category: 'beach' },
        { id: 'redwoods', name: 'Armstrong Redwoods', category: 'park' },
      ],
    });
    expect(options.map((option) => option.key)).toEqual(
      expect.arrayContaining(['beach', 'hiking', 'adventure']),
    );
  });

  it('turns real places and events into selectable hallmarks', () => {
    expect(getDestinationHallmarks({
      slug: 'san-francisco',
      name: 'San Francisco',
      heroImageUrl: 'https://example.com/san-francisco.jpg',
      galleryImageUrls: ['https://example.com/gallery.jpg'],
      places: [{
        id: 'castro',
        name: 'Castro Theatre',
        category: 'landmark',
        summary: 'A grand movie palace and enduring Castro landmark.',
        lgbtqRelevance: 'It remains closely tied to the neighborhood’s queer history.',
        imageUrl: 'https://example.com/castro.jpg',
      }],
      events: [{
        id: 'pride',
        title: 'San Francisco Pride',
        category: 'pride',
        summary: 'A citywide celebration and one of the largest Pride gatherings in the country.',
      }],
    })).toEqual([
      {
        id: 'castro',
        label: 'Castro Theatre',
        kind: 'place',
        category: 'landmark',
        description: 'A grand movie palace and enduring Castro landmark. It remains closely tied to the neighborhood’s queer history.',
        imageUrl: 'https://example.com/castro.jpg',
      },
      {
        id: 'pride',
        label: 'San Francisco Pride',
        kind: 'event',
        category: 'pride',
        description: 'A citywide celebration and one of the largest Pride gatherings in the country.',
        imageUrl: 'https://example.com/san-francisco.jpg',
      },
    ]);
  });

  it('keeps hallmark descriptions concise and falls back to destination imagery', () => {
    const [hallmark] = getDestinationHallmarks({
      slug: 'lisbon',
      name: 'Lisbon',
      heroImageUrl: 'https://example.com/lisbon.jpg',
      places: [{
        id: 'alfama',
        name: 'Alfama',
        category: 'landmark',
        summary: 'The oldest neighborhood rewards wandering. Its lanes reveal tiled homes and small viewpoints. This third sentence should not appear.',
      }],
    });
    expect(hallmark?.description).toBe('The oldest neighborhood rewards wandering. Its lanes reveal tiled homes and small viewpoints.');
    expect(hallmark?.imageUrl).toBe('https://example.com/lisbon.jpg');
  });

  it('replaces a generic place image with its cached canonical Google photo', () => {
    const hallmarks = getDestinationHallmarks({
      slug: 'paris',
      name: 'Paris',
      heroImageUrl: 'https://example.com/generic-paris.jpg',
      places: [{ id: 'louvre', name: 'The Louvre', category: 'museum' }],
    });
    const [louvre] = mergeDestinationHallmarkMedia(hallmarks, [{
      hallmarkId: 'louvre',
      providerPlaceId: 'ChIJD3uTd9hx5kcR1IQvGfr8dbk',
      imageUrl: 'https://places.googleapis.com/louvre-photo',
      imageAttribution: 'Example photographer',
    }]);
    expect(louvre).toMatchObject({
      imageUrl: 'https://places.googleapis.com/louvre-photo',
      imageProvider: 'google_places',
      providerPlaceId: 'ChIJD3uTd9hx5kcR1IQvGfr8dbk',
      imageAttribution: 'Example photographer',
    });
  });
});
