import { describe, expect, it } from 'vitest';
import {
  getDestinationHallmarks,
  getDestinationInterestOptions,
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
      places: [{ id: 'castro', name: 'Castro Theatre', category: 'landmark' }],
      events: [{ id: 'pride', title: 'San Francisco Pride', category: 'pride' }],
    })).toEqual([
      { id: 'castro', label: 'Castro Theatre', kind: 'place', category: 'landmark' },
      { id: 'pride', label: 'San Francisco Pride', kind: 'event', category: 'pride' },
    ]);
  });
});
