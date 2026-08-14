import { describe, expect, it } from 'vitest';
import {
  assistantDisplayText,
  assistantHeroCopy,
  recommendationCardFit,
  recommendationCardSummary,
  recommendationRequestedForItinerary,
  starterCategory,
} from '../../apps/mobile/src/lib/assistant-presentation';

describe('Ask Outing presentation', () => {
  it('uses action-oriented copy for general discovery', () => {
    const copy = assistantHeroCopy({ kind: 'general' });
    expect(copy.title).toBe('Where should we go next?');
    expect(copy.summary).toContain('feeling');
  });

  it('makes trip-scoped help explicitly reviewable', () => {
    const copy = assistantHeroCopy({ kind: 'trip', tripId: '00000000-0000-4000-8000-000000000000' });
    expect(copy.eyebrow).toContain('YOUR TRIP');
    expect(copy.summary).toContain('review');
  });

  it('labels starter actions by intent', () => {
    expect(starterCategory('Compare Lisbon and Madrid')).toBe('COMPARE');
    expect(starterCategory('Where should I go in October?')).toBe('TIMING');
    expect(starterCategory('Make Tuesday lighter')).toBe('TRIP');
    expect(starterCategory('Find a food tour')).toBe('DO');
  });

  it('turns model markdown and links into clean compact mobile copy', () => {
    const result = assistantDisplayText(
      '**Momoya SoHo** — [see the restaurant](https://example.com). Great sushi and outdoor seating. A third sentence should not appear when the structured cards already carry the details.',
      true,
    );
    expect(result).toBe('Momoya SoHo — see the restaurant. Great sushi and outdoor seating.');
    expect(result).not.toContain('**');
    expect(result).not.toContain('https://');
  });

  it('keeps recommendation cards to one short hook and one fit line', () => {
    const summary = recommendationCardSummary('A long destination description that begins with the useful idea. A second sentence adds far more information than the compact result card should need, followed by even more detail.');
    const fit = recommendationCardFit(['Your timing overlaps a stronger season and the destination matches several activities you have saved recently.']);
    expect(summary.length).toBeLessThanOrEqual(135);
    expect(fit?.length).toBeLessThanOrEqual(92);
  });

  it('resolves typed add commands to the visible recommendation', () => {
    const recommendations = ['Momoya SoHo', 'Sozai Ramen'].map((title, index) => ({
      id: `place-${index}`,
      kind: 'place' as const,
      title,
      summary: 'Japanese restaurant in New York City.',
      facts: [],
      fitReasons: [],
      tradeoffs: [],
      sourceIds: [],
      confidence: 0.8,
      provisional: false,
      bookable: false,
    }));
    expect(recommendationRequestedForItinerary('Add the second one to my itinerary', recommendations)?.title).toBe('Sozai Ramen');
    expect(recommendationRequestedForItinerary('Please use Momoya SoHo', recommendations)?.title).toBe('Momoya SoHo');
  });
});
