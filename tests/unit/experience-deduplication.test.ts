import { describe, expect, it } from 'vitest';
import {
  areExperiencesSubstantiallySimilar,
  dedupeSimilarExperiences,
  type SimilarExperience,
} from '../../apps/mobile/src/lib/experience-deduplication';
import {
  areViatorProductsSubstantiallySimilar,
  dedupeSimilarViatorProducts,
} from '../../supabase/functions/_shared/viator-deduplication';

const sharedDescription = 'Enter the museums with a local guide, explore the gallery collection, continue through the Sistine Chapel, and finish near St Peter’s Basilica with historical context and reserved admission.';

function experience(overrides: Partial<SimilarExperience> = {}): SimilarExperience {
  return {
    id: 'VATICAN-1',
    productCode: 'VATICAN-1',
    title: 'Small Group Vatican Museums, Sistine Chapel & St Peter’s Tour',
    summary: sharedDescription,
    description: sharedDescription,
    rating: 4.7,
    reviewCount: 420,
    imageUrls: ['https://example.com/vatican.jpg'],
    productUrl: 'https://www.viator.com/tours/Rome/example/d511-VATICAN1',
    bookingMode: 'external',
    priceFrom: 89,
    ...overrides,
  };
}

describe('Viator experience deduplication', () => {
  it('collapses punctuation variants and near-identical titles', () => {
    const first = experience();
    const duplicate = experience({
      id: 'VATICAN-2',
      productCode: 'VATICAN-2',
      title: 'Vatican Museums, Sistine Chapel and St. Peter’s Basilica Small-Group Tour',
    });

    expect(areExperiencesSubstantiallySimilar(first, duplicate)).toBe(true);
    expect(dedupeSimilarExperiences([first, duplicate])).toHaveLength(1);
  });

  it('collapses substantially duplicated descriptions even when titles were marketed differently', () => {
    const first = experience();
    const duplicate = experience({
      id: 'VATICAN-3',
      productCode: 'VATICAN-3',
      title: 'Rome Art and Papal History Access',
    });

    expect(areExperiencesSubstantiallySimilar(first, duplicate)).toBe(true);
  });

  it('keeps genuinely different experiences in the same destination', () => {
    const museum = experience();
    const foodWalk = experience({
      id: 'FOOD-1',
      productCode: 'FOOD-1',
      title: 'Trastevere Evening Food Walk and Wine Tasting',
      summary: 'Taste pasta, cheese, wine, and gelato across family-run restaurants in Trastevere with a neighborhood food guide.',
      description: 'Taste pasta, cheese, wine, and gelato across family-run restaurants in Trastevere with a neighborhood food guide.',
    });

    expect(areExperiencesSubstantiallySimilar(museum, foodWalk)).toBe(false);
    expect(dedupeSimilarExperiences([museum, foodWalk])).toHaveLength(2);
  });

  it('keeps the better-supported listing without changing the cluster position', () => {
    const weaker = experience({ imageUrls: [], rating: 4.1, reviewCount: 12, bookingMode: 'none', productUrl: undefined });
    const stronger = experience({ id: 'VATICAN-4', productCode: 'VATICAN-4', rating: 4.9, reviewCount: 2400 });

    expect(dedupeSimilarExperiences([weaker, stronger])).toEqual([stronger]);
  });

  it('applies the same visible-result behavior at the Edge Function boundary', () => {
    const first = experience() as unknown as Record<string, unknown>;
    const duplicate = experience({
      id: 'VATICAN-5',
      productCode: 'VATICAN-5',
      title: 'Vatican Museums, Sistine Chapel and St. Peter’s Basilica Small-Group Tour',
    }) as unknown as Record<string, unknown>;
    const distinct = experience({
      id: 'FOOD-2',
      productCode: 'FOOD-2',
      title: 'Trastevere Evening Food Walk and Wine Tasting',
      description: 'Taste pasta, wine, cheese and gelato at local restaurants in Trastevere.',
      summary: 'Taste pasta, wine, cheese and gelato at local restaurants in Trastevere.',
    }) as unknown as Record<string, unknown>;

    expect(areViatorProductsSubstantiallySimilar(first, duplicate)).toBe(true);
    expect(dedupeSimilarViatorProducts([first, duplicate, distinct])).toHaveLength(2);
  });
});
