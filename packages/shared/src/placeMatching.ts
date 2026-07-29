export interface PlaceMatchPoint {
  lat: number;
  lng: number;
}

export interface PlaceMatchCandidate extends PlaceMatchPoint {
  name: string;
  address?: string;
}

export interface PlaceMatchQuery extends PlaceMatchPoint {
  name: string;
  destinationName: string;
  address?: string;
}

export interface PlaceMatchScore {
  accepted: boolean;
  score: number;
  nameScore: number;
  distanceMeters: number;
}

const NAME_STOP_WORDS = new Set([
  'and',
  'at',
  'bar',
  'cafe',
  'club',
  'hotel',
  'museum',
  'of',
  'restaurant',
  'the',
]);

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 1 && !NAME_STOP_WORDS.has(token));
}

function nameSimilarity(expected: string, candidate: string): number {
  const normalizedExpected = normalize(expected);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedExpected || !normalizedCandidate) return 0;
  if (normalizedExpected === normalizedCandidate) return 1;
  if (
    normalizedExpected.length >= 5 &&
    (normalizedCandidate.includes(normalizedExpected) || normalizedExpected.includes(normalizedCandidate))
  ) {
    return 0.94;
  }

  const expectedTokens = meaningfulTokens(expected);
  const candidateTokens = new Set(meaningfulTokens(candidate));
  if (!expectedTokens.length || !candidateTokens.size) return 0;
  const intersection = expectedTokens.filter((token) => candidateTokens.has(token)).length;
  return intersection / Math.max(1, Math.min(expectedTokens.length, candidateTokens.size));
}

export function distanceBetweenMeters(a: PlaceMatchPoint, b: PlaceMatchPoint): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const aLat = toRadians(a.lat);
  const bLat = toRadians(b.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

/**
 * Reject weak text-search results before their photos are attached to editorial places.
 * Proximity is intentionally strict when the editorial seed already has coordinates.
 */
export function scorePlaceMatch(
  query: PlaceMatchQuery,
  candidate: PlaceMatchCandidate,
): PlaceMatchScore {
  const nameScore = nameSimilarity(query.name, candidate.name);
  const distanceMeters = distanceBetweenMeters(query, candidate);
  const destinationTokens = meaningfulTokens(query.destinationName);
  const addressHaystack = normalize(`${candidate.address ?? ''} ${query.address ?? ''}`);
  const destinationAgreement = destinationTokens.some((token) => addressHaystack.includes(token));
  const distanceScore = distanceMeters <= 300
    ? 1
    : distanceMeters <= 2_500
      ? 1 - ((distanceMeters - 300) / 2_200) * 0.55
      : distanceMeters <= 8_000
        ? 0.35
        : 0;
  const score = nameScore * 0.72 + distanceScore * 0.23 + (destinationAgreement ? 0.05 : 0);
  const accepted =
    distanceMeters <= 8_000 &&
    ((nameScore >= 0.9 && score >= 0.72) ||
      (nameScore >= 0.66 && distanceMeters <= 2_500 && score >= 0.68));

  return { accepted, score, nameScore, distanceMeters };
}
