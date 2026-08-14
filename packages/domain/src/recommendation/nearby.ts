export interface Coords {
  lat: number;
  lng: number;
}

export interface RankablePlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  lgbtqRelevance?: string;
  estimatedCostUsd?: number;
}

export interface RankedPlace extends RankablePlace {
  distanceKm: number;
}

export interface SuggestableNeighborhood {
  id: string;
  name: string;
  summary?: string;
  vibeTags?: string[];
  lat?: number;
  lng?: number;
  placeCount?: number;
}

export interface SuggestedNeighborhood extends SuggestableNeighborhood {
  score: number;
  reasons: string[];
}

/** Haversine distance in kilometers. */
export function distanceKm(a: Coords, b: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rank places by proximity to lodging coordinates. */
export function rankPlacesNearLodging(
  lodging: Coords,
  places: RankablePlace[],
  limit = 8,
): RankedPlace[] {
  return places
    .map((p) => ({
      ...p,
      distanceKm: Math.round(distanceKm(lodging, { lat: p.lat, lng: p.lng }) * 100) / 100,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const QUEER_VIBE_TAGS = new Set([
  'queer',
  'gay',
  'lgbtq',
  'nightlife',
  'pride',
  'bars',
  'community',
  'drag',
  'village',
  'castro',
  'weho',
  'chueca',
  'schöneberg',
  'schoneberg',
]);

/**
 * Suggest neighborhoods with queer venue concentration signals.
 * Language for UI must stay non-absolute (never "universally safe").
 */
export function suggestQueerNeighborhoods(
  neighborhoods: SuggestableNeighborhood[],
  limit = 5,
): SuggestedNeighborhood[] {
  return neighborhoods
    .map((n) => {
      const tags = (n.vibeTags ?? []).map((t) => t.toLowerCase());
      const tagHits = tags.filter((t) =>
        [...QUEER_VIBE_TAGS].some((q) => t.includes(q)),
      ).length;
      const placeBonus = Math.min(3, n.placeCount ?? 0);
      const score = tagHits * 25 + placeBonus * 8 + (n.summary ? 5 : 0);
      const reasons: string[] = [];
      if (tagHits > 0) reasons.push('Queer nightlife / community vibe tags');
      if ((n.placeCount ?? 0) > 0) reasons.push('Nearby curated places in seed map');
      if (reasons.length === 0) reasons.push('Local neighborhood option');
      return { ...n, score, reasons };
    })
    .filter((n) => n.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
