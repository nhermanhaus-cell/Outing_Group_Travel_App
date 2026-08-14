type ViatorListing = Record<string, unknown>;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with',
  'activity', 'adventure', 'city', 'day', 'experience', 'excursion', 'trip', 'tour', 'travel',
]);

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalize(value: unknown): string {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: unknown): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function overlap(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return { common: 0, jaccard: 0, containment: 0 };
  let common = 0;
  left.forEach((token) => { if (right.has(token)) common += 1; });
  return {
    common,
    jaccard: common / (left.size + right.size - common),
    containment: common / Math.min(left.size, right.size),
  };
}

export function areViatorProductsSubstantiallySimilar(left: ViatorListing, right: ViatorListing): boolean {
  const leftCode = text(left.productCode);
  const rightCode = text(right.productCode);
  if (leftCode && rightCode && leftCode === rightCode) return true;
  const leftTitle = normalize(left.title);
  const rightTitle = normalize(right.title);
  if (leftTitle.length >= 8 && leftTitle === rightTitle) return true;
  const title = overlap(tokens(left.title), tokens(right.title));
  if (title.common >= 4 && (title.jaccard >= 0.8 || title.containment >= 0.92)) return true;
  const leftDescription = `${text(left.summary)} ${text(left.description)}`.slice(0, 1_600);
  const rightDescription = `${text(right.summary)} ${text(right.description)}`.slice(0, 1_600);
  const normalizedLeftDescription = normalize(leftDescription);
  const normalizedRightDescription = normalize(rightDescription);
  if (normalizedLeftDescription.length >= 80 && normalizedLeftDescription === normalizedRightDescription) return true;
  const description = overlap(tokens(leftDescription), tokens(rightDescription));
  if (description.common >= 18 && (description.jaccard >= 0.86 || description.containment >= 0.94)) return true;
  return title.common >= 3 && title.containment >= 0.6 && description.common >= 12
    && (description.jaccard >= 0.72 || description.containment >= 0.84);
}

function quality(product: ViatorListing): number {
  const images = Array.isArray(product.images) ? product.images.length : 0;
  return numeric(product.rating) * 10
    + Math.min(16, Math.log10(Math.max(1, numeric(product.reviewCount))) * 4)
    + (product.bookingMode === 'external' && text(product.productUrl) ? 5 : 0)
    + (images > 0 ? 4 : 0)
    + Math.min(4, normalize(product.description ?? product.summary).length / 250)
    + (product.freeCancellation === true ? 2 : 0)
    + (numeric(product.priceFrom) > 0 ? 1 : 0)
    + (numeric(product.lat) !== 0 && numeric(product.lng) !== 0 ? 2 : 0);
}

export function dedupeSimilarViatorProducts<T extends ViatorListing>(products: T[]): T[] {
  const unique: T[] = [];
  products.forEach((candidate) => {
    const duplicateIndex = unique.findIndex((current) => areViatorProductsSubstantiallySimilar(current, candidate));
    if (duplicateIndex < 0) unique.push(candidate);
    else if (quality(candidate) > quality(unique[duplicateIndex]!)) unique[duplicateIndex] = candidate;
  });
  return unique;
}
