import { describe, expect, it } from 'vitest';
import { buildDestinationOverview } from '../../apps/mobile/src/lib/destinationOverview';

const destination = {
  name: 'Example City',
  editorialSummary: 'Example City pairs independent restaurants and late-night music with architecture that rewards slow neighborhood wandering. Its waterfront and compact center make it easy to change the pace without losing a full day to transit.',
  interests: ['food', 'music', 'architecture'],
  neighborhoods: [
    { name: 'Old Quarter', summary: 'Historic streets and cafes.' },
    { name: 'Harbor', summary: 'Food and waterfront walks.' },
  ],
};

describe('destination overview', () => {
  it('preserves useful editorial depth and explains preference overlap', () => {
    const result = buildDestinationOverview(destination, ['food', 'culture']);
    expect(result.overview.length).toBeGreaterThan(140);
    expect(result.personalizedReason).toContain('food and culture');
    expect(result.personalizedReason).toContain('Old Quarter and Harbor');
  });

  it('still explains the destination when no profile interests are available', () => {
    const result = buildDestinationOverview(destination);
    expect(result.personalizedReason).toContain('strongest reasons');
    expect(result.personalizedReason).toContain('food');
  });
});
