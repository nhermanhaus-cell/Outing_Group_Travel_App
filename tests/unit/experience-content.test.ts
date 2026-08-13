import { describe, expect, it } from 'vitest';
import {
  cleanExperienceText,
  compactExperienceSummary,
  experienceDetailLines,
} from '../../apps/mobile/src/lib/experience-content';

describe('Viator experience content', () => {
  it('keeps provider prose while removing HTML markup and decoding entities', () => {
    expect(cleanExperienceText('<p>Explore the old town &amp; riverfront.</p><br>Finish with lunch.'))
      .toBe('Explore the old town & riverfront.\nFinish with lunch.');
  });

  it('creates a short listing summary without inventing new copy', () => {
    const description = 'See the city with a local guide. This longer second sentence contains the remaining details that belong on the activity page instead of every listing card.';
    expect(compactExperienceSummary(description, 'Fallback', 80)).toBe('See the city with a local guide.');
  });

  it('extracts customer-facing detail and omits provider implementation fields', () => {
    const lines = experienceDetailLines({
      itineraryType: 'STANDARD',
      itineraryItems: [{
        pointOfInterestLocation: {
          location: { ref: 'LOC-123', name: 'Historic center', latitude: 12.4 },
          attractionId: 938,
        },
        duration: { fixedDurationInMinutes: 90 },
        description: '<p>Walk through the oldest streets with your guide.</p>',
        admissionIncluded: 'YES',
      }],
    });

    expect(lines).toEqual(['Historic center', 'Walk through the oldest streets with your guide.']);
    expect(lines.join(' ')).not.toMatch(/STANDARD|LOC-123|fixedDuration|admissionIncluded/);
  });

  it('formats inclusion and pickup descriptions without enum codes', () => {
    expect(experienceDetailLines({
      travelerPickup: {
        pickupOptionType: 'PICKUP_AND_MEET_AT_START_POINT',
        additionalInfo: 'Hotel pickup is available in the city center.',
      },
      typeDescription: 'Professional local guide',
      category: 'GUIDE',
    })).toEqual([
      'Hotel pickup is available in the city center.',
      'Professional local guide',
    ]);
  });

});
