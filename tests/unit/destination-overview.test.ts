import { describe, expect, it } from 'vitest';
import { buildDestinationOverview } from '../../apps/mobile/src/lib/destinationOverview';
import destinations from '../../apps/mobile/assets/seed/destinations.json';

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
  it('keeps editorial context skimmable and explains preference overlap', () => {
    const result = buildDestinationOverview(destination, ['food', 'culture']);
    expect(result.overview.length).toBeGreaterThan(140);
    expect(result.overview.length).toBeLessThanOrEqual(360);
    expect(result.personalizedReason).toContain('food-led days and culture');
    expect(result.personalizedReason).toContain('Old Quarter');
    expect(result.personalizedReason.length).toBeLessThanOrEqual(190);
  });

  it('uses brief destination-specific copy when no profile interests are available', () => {
    const result = buildDestinationOverview(destination);
    expect(result.personalizedReason).not.toContain('strongest reasons');
    expect(result.personalizedReason).toContain('food-led days');
    expect(result.personalizedReason).toContain('Old Quarter');
  });

  it('varies the opening structure between destinations', () => {
    const first = buildDestinationOverview(destination).personalizedReason;
    const second = buildDestinationOverview({ ...destination, name: 'Another Place' }).personalizedReason;
    expect(first.split(' ').slice(0, 3).join(' ')).not.toBe(second.split(' ').slice(0, 3).join(' '));
  });

  it('keeps all catalog destination teasers unique, brief, and free of the repeated lead', () => {
    const teasers = destinations.map((entry) => buildDestinationOverview(entry).personalizedReason);
    expect(new Set(teasers).size).toBe(destinations.length);
    expect(teasers.every((value) => value.length <= 190)).toBe(true);
    expect(teasers.every((value) => !value.toLowerCase().includes('strongest reasons to consider'))).toBe(true);
  });
});
