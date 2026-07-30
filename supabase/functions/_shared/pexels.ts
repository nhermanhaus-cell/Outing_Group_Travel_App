export type LocationImageKind = 'activity' | 'place' | 'destination';

export interface LocationImageSearchInput {
  subject: string;
  destination: string;
  category?: string;
  kind: LocationImageKind;
  variant?: number;
}

export interface PexelsCandidate {
  alt?: string;
}

const STOP_WORDS = new Set([
  'activity',
  'area',
  'attraction',
  'best',
  'city',
  'experience',
  'local',
  'near',
  'place',
  'see',
  'the',
  'things',
  'tour',
  'visit',
]);

const GENERIC_PLACE_WORDS = new Set([
  'bar',
  'beach',
  'cafe',
  'center',
  'centre',
  'club',
  'gallery',
  'garden',
  'market',
  'museum',
  'park',
  'restaurant',
  'square',
  'theater',
  'theatre',
]);

const VISUAL_GROUPS = [
  ['architecture', 'building', 'historic', 'landmark', 'palace', 'temple'],
  ['art', 'gallery', 'museum', 'painting', 'sculpture'],
  ['bar', 'cocktail', 'club', 'nightlife', 'party'],
  ['beach', 'coast', 'ocean', 'sand', 'sea'],
  ['bike', 'bicycle', 'cycling'],
  ['boat', 'cruise', 'sail', 'sailing', 'sailboat', 'yacht'],
  ['cafe', 'coffee', 'food', 'market', 'restaurant'],
  ['garden', 'hike', 'nature', 'park', 'trail'],
  ['performance', 'show', 'theater', 'theatre'],
  ['spa', 'massage', 'wellness'],
  ['street', 'neighborhood', 'neighbourhood', 'district'],
];

const FALLBACK_THEMES = [
  'iconic landmark',
  'street life',
  'architecture',
  'neighborhood',
  'scenic view',
  'local culture',
  'waterfront',
  'night skyline',
];

function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function tokenMatches(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 4) return false;
  return left.startsWith(right) || right.startsWith(left) || left.slice(0, 4) === right.slice(0, 4);
}

function hasMatch(needles: string[], haystack: string[]): boolean {
  return needles.some((needle) => haystack.some((value) => tokenMatches(needle, value)));
}

function visualTerms(input: LocationImageSearchInput): string[] {
  const inputTokens = tokens(`${input.subject} ${input.category ?? ''}`);
  const groups = VISUAL_GROUPS.filter((group) => hasMatch(group, inputTokens));
  return [...new Set(groups.flat())];
}

export function buildSpecificPexelsQuery(input: LocationImageSearchInput): string {
  return [input.subject, input.destination, input.category]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
}

export function buildDestinationFallbackQuery(
  destination: string,
  variant = 0,
): { query: string; page: number; theme: string } {
  const normalizedVariant = Math.max(0, Math.floor(variant));
  const theme = FALLBACK_THEMES[normalizedVariant % FALLBACK_THEMES.length] ?? FALLBACK_THEMES[0]!;
  return {
    query: `${destination} ${theme}`,
    page: 1 + Math.floor(normalizedVariant / FALLBACK_THEMES.length) % 3,
    theme,
  };
}

export function scorePexelsCandidate(
  candidate: PexelsCandidate,
  input: LocationImageSearchInput,
): { accepted: boolean; score: number } {
  const altTokens = tokens(candidate.alt ?? '');
  if (altTokens.length === 0) return { accepted: false, score: 0 };

  const destinationTokens = tokens(input.destination);
  const subjectTokens = tokens(input.subject).filter(
    (token) => !destinationTokens.some((destinationToken) => tokenMatches(token, destinationToken)),
  );
  const distinctiveSubjectTokens = subjectTokens.filter((token) => !GENERIC_PLACE_WORDS.has(token));
  const subjectPool = distinctiveSubjectTokens.length > 0 ? distinctiveSubjectTokens : subjectTokens;
  const subjectHits = subjectPool.filter((token) => hasMatch([token], altTokens)).length;
  const subjectCoverage = subjectPool.length > 0 ? subjectHits / subjectPool.length : 0;
  const destinationHit = hasMatch(destinationTokens, altTokens);
  const visualHit = hasMatch(visualTerms(input), altTokens);

  if (input.kind === 'destination') {
    return { accepted: destinationHit, score: destinationHit ? 1 : 0 };
  }

  if (input.kind === 'place') {
    const accepted = subjectHits > 0 && (subjectCoverage >= 0.34 || destinationHit);
    return {
      accepted,
      score: Math.min(1, subjectCoverage * 0.8 + (destinationHit ? 0.2 : 0)),
    };
  }

  const accepted = subjectHits > 0 || visualHit;
  return {
    accepted,
    score: Math.min(1, subjectCoverage * 0.65 + (visualHit ? 0.3 : 0) + (destinationHit ? 0.05 : 0)),
  };
}
