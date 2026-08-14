export interface SimilarExperience {
  id: string;
  productCode?: string;
  title: string;
  summary?: string;
  description?: string;
  rating?: number;
  reviewCount?: number;
  imageUrls?: string[];
  productUrl?: string;
  bookingMode?: 'none' | 'external';
  freeCancellation?: boolean;
  priceFrom?: number;
  lat?: number;
  lng?: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with',
  'activity', 'adventure', 'city', 'day', 'experience', 'excursion', 'trip', 'tour', 'travel',
]);

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenSet(value: string | undefined): Set<string> {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function overlap(left: Set<string>, right: Set<string>): { common: number; jaccard: number; containment: number } {
  if (left.size === 0 || right.size === 0) return { common: 0, jaccard: 0, containment: 0 };
  let common = 0;
  left.forEach((token) => { if (right.has(token)) common += 1; });
  return {
    common,
    jaccard: common / (left.size + right.size - common),
    containment: common / Math.min(left.size, right.size),
  };
}

export function areExperiencesSubstantiallySimilar(
  left: SimilarExperience,
  right: SimilarExperience,
): boolean {
  const leftCode = left.productCode ?? left.id;
  const rightCode = right.productCode ?? right.id;
  if (leftCode && rightCode && leftCode === rightCode) return true;

  const leftTitle = normalizeText(left.title);
  const rightTitle = normalizeText(right.title);
  if (leftTitle.length >= 8 && leftTitle === rightTitle) return true;

  const title = overlap(tokenSet(left.title), tokenSet(right.title));
  if (title.common >= 4 && (title.jaccard >= 0.8 || title.containment >= 0.92)) return true;

  const leftDescription = `${left.summary ?? ''} ${left.description ?? ''}`.slice(0, 1_600);
  const rightDescription = `${right.summary ?? ''} ${right.description ?? ''}`.slice(0, 1_600);
  const normalizedLeftDescription = normalizeText(leftDescription);
  const normalizedRightDescription = normalizeText(rightDescription);
  if (normalizedLeftDescription.length >= 80 && normalizedLeftDescription === normalizedRightDescription) return true;
  const description = overlap(tokenSet(leftDescription), tokenSet(rightDescription));
  if (description.common >= 18 && (description.jaccard >= 0.86 || description.containment >= 0.94)) return true;

  return title.common >= 3
    && title.containment >= 0.6
    && description.common >= 12
    && (description.jaccard >= 0.72 || description.containment >= 0.84);
}

function listingQuality(experience: SimilarExperience): number {
  const rating = Number.isFinite(experience.rating) ? experience.rating ?? 0 : 0;
  const reviews = Number.isFinite(experience.reviewCount) ? experience.reviewCount ?? 0 : 0;
  const descriptionLength = normalizeText(experience.description ?? experience.summary).length;
  return rating * 10
    + Math.min(16, Math.log10(Math.max(1, reviews)) * 4)
    + (experience.bookingMode === 'external' && experience.productUrl ? 5 : 0)
    + (experience.imageUrls?.length ? 4 : 0)
    + Math.min(4, descriptionLength / 250)
    + (experience.freeCancellation ? 2 : 0)
    + (experience.priceFrom !== undefined ? 1 : 0)
    + (experience.lat !== undefined && experience.lng !== undefined ? 2 : 0);
}

/**
 * Keeps the original ranked order, but replaces a duplicate with a materially
 * better-supported listing when one exists later in the provider response.
 */
export function dedupeSimilarExperiences<T extends SimilarExperience>(experiences: T[]): T[] {
  const unique: T[] = [];
  experiences.forEach((candidate) => {
    const duplicateIndex = unique.findIndex((current) => areExperiencesSubstantiallySimilar(current, candidate));
    if (duplicateIndex < 0) {
      unique.push(candidate);
      return;
    }
    if (listingQuality(candidate) > listingQuality(unique[duplicateIndex]!)) {
      unique[duplicateIndex] = candidate;
    }
  });
  return unique;
}
