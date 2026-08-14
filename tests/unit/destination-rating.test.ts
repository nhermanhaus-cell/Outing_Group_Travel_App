import { describe, expect, it } from 'vitest';
import { getDestinationContextRating, getDestinationRating } from '../../apps/mobile/src/lib/destinationRating';

describe('destination rating labels', () => {
  it('uses the assigned destination dimensions', () => {
    expect(getDestinationRating({ reviewScore: 4.4, communityScore: 93, nightlifeScore: 91, legalEqualityScore: 90, publicOpinionScore: 88 })).toEqual({ score: 90, label: 'Unmissable', variant: 'accent' });
    expect(getDestinationRating({ reviewScore: 4.4, communityScore: 80, nightlifeScore: 86, legalEqualityScore: 92, publicOpinionScore: 86 })).toEqual({ score: 86, label: 'Stunning', variant: 'success' });
    expect(getDestinationRating({ reviewScore: 4.4, communityScore: 21, nightlifeScore: 68, legalEqualityScore: 90, publicOpinionScore: 88 })).toEqual({ score: 70, label: 'Full of character', variant: 'default' });
  });

  it('does not manufacture a rating from too little data', () => {
    expect(getDestinationRating({ legalEqualityScore: 90, publicOpinionScore: 88 })).toBeNull();
  });

  it('does not accept the legacy safety score as an input', () => {
    expect(getDestinationRating({ reviewScore: 3, communityScore: 50, nightlifeScore: 50 })).toMatchObject({ score: 54 });
  });

  it('uses neutral and cautionary labels for lower friendliness context', () => {
    expect(getDestinationContextRating({ legalEqualityScore: 55, publicOpinionScore: 60 })).toEqual({
      score: 58,
      label: 'Mixed signals',
      level: 'mixed',
      variant: 'default',
    });
    expect(getDestinationContextRating({ legalEqualityScore: 40, publicOpinionScore: 45 })).toMatchObject({
      score: 43,
      label: 'Limited local support',
      level: 'limited',
    });
    expect(getDestinationContextRating({ legalEqualityScore: 20, publicOpinionScore: 25 })).toMatchObject({
      score: 23,
      label: 'Plan with care',
      level: 'caution',
    });
  });
});
