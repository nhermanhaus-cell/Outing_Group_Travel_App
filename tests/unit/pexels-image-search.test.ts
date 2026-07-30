import { describe, expect, it } from 'vitest';
import {
  buildDestinationFallbackQuery,
  buildSpecificPexelsQuery,
  scorePexelsCandidate,
} from '../../supabase/functions/_shared/pexels';

describe('Pexels location image matching', () => {
  it('builds a subject-first query with destination context', () => {
    expect(buildSpecificPexelsQuery({
      subject: 'Shibuya Crossing',
      destination: 'Tokyo',
      category: 'neighborhood',
      kind: 'place',
    })).toBe('Shibuya Crossing Tokyo neighborhood');
  });

  it('accepts a named place only when the image describes that place', () => {
    const input = {
      subject: 'Shibuya Crossing',
      destination: 'Tokyo',
      category: 'neighborhood',
      kind: 'place' as const,
    };
    expect(scorePexelsCandidate({ alt: 'Crowds crossing at Shibuya Crossing in Tokyo' }, input).accepted).toBe(true);
    expect(scorePexelsCandidate({ alt: 'A quiet generic street in Japan' }, input).accepted).toBe(false);
  });

  it('uses visual semantics for activities', () => {
    expect(scorePexelsCandidate(
      { alt: 'A sailboat on the ocean during a golden sunset' },
      {
        subject: 'Sunset sailing cruise',
        destination: 'Barcelona',
        category: 'boat tour',
        kind: 'activity',
      },
    ).accepted).toBe(true);
  });

  it('rotates destination fallback themes and pages deterministically', () => {
    expect(buildDestinationFallbackQuery('Lisbon', 0)).toEqual({
      query: 'Lisbon iconic landmark',
      page: 1,
      theme: 'iconic landmark',
    });
    expect(buildDestinationFallbackQuery('Lisbon', 8)).toEqual({
      query: 'Lisbon iconic landmark',
      page: 2,
      theme: 'iconic landmark',
    });
    expect(buildDestinationFallbackQuery('Lisbon', 3).query).not.toBe(
      buildDestinationFallbackQuery('Lisbon', 4).query,
    );
  });
});
