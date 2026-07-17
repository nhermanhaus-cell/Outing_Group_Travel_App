import type { RecommendationResult } from '../types';

/** Editorial origin hub used to bucket quiz recommendations. */
export interface OriginHub {
  id: string;
  label: string;
  airports: string[];
  homeDestinationSlugs: string[];
  weekendNearbySlugs: string[];
  quickFlightSlugs: string[];
  notes?: string;
}

export interface PartitionedRecommendations {
  weekendNearby: RecommendationResult[];
  /** Editorial short-hop suggestions — not live flight inventory. */
  quickFlights: RecommendationResult[];
  bestMatches: RecommendationResult[];
  excludedHomeSlugs: string[];
  hub: OriginHub | null;
}

function normalizeAirport(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Resolve the editorial origin hub for a traveler's departure airport(s).
 * Returns null when no hub matches (still apply no home exclusion).
 */
export function resolveOriginHub(
  departureAirports: string[],
  hubs: OriginHub[],
): OriginHub | null {
  const airports = new Set(
    departureAirports.map(normalizeAirport).filter(Boolean),
  );
  if (airports.size === 0) return null;
  return (
    hubs.find((hub) =>
      hub.airports.some((a) => airports.has(normalizeAirport(a))),
    ) ?? null
  );
}

/** Hard-exclude the traveler's home metro destination(s). */
export function excludeHomeDestinations(
  results: RecommendationResult[],
  hub: OriginHub | null,
): RecommendationResult[] {
  if (!hub || hub.homeDestinationSlugs.length === 0) return results;
  const exclude = new Set(hub.homeDestinationSlugs);
  return results.filter((r) => !exclude.has(r.slug));
}

function pickBySlugs(
  bySlug: Map<string, RecommendationResult>,
  slugs: string[],
): RecommendationResult[] {
  const out: RecommendationResult[] = [];
  for (const slug of slugs) {
    const hit = bySlug.get(slug);
    if (hit) out.push(hit);
  }
  // Prefer score order within the curated list
  return out.sort((a, b) => b.overallMatch - a.overallMatch);
}

/**
 * Partition scored destinations into Weekend nearby, Quick flights, and Best matches.
 * Home metro slugs are always excluded from every bucket.
 * Quick flights are editorial labels only — not live inventory.
 */
export function partitionRecommendations(
  results: RecommendationResult[],
  hub: OriginHub | null,
): PartitionedRecommendations {
  const excludedHomeSlugs = hub?.homeDestinationSlugs ?? [];
  const filtered = excludeHomeDestinations(results, hub);
  const bySlug = new Map(filtered.map((r) => [r.slug, r]));

  const weekendNearby = hub
    ? pickBySlugs(bySlug, hub.weekendNearbySlugs)
    : [];
  const quickFlights = hub
    ? pickBySlugs(bySlug, hub.quickFlightSlugs)
    : [];

  const sectionSlugs = new Set([
    ...weekendNearby.map((r) => r.slug),
    ...quickFlights.map((r) => r.slug),
  ]);

  // Best matches: overall ranking minus home, de-duplicated against section picks
  // so the primary list stays useful when hub buckets already cover top nearby options.
  const bestMatches = filtered.filter((r) => !sectionSlugs.has(r.slug));

  return {
    weekendNearby,
    quickFlights,
    bestMatches,
    excludedHomeSlugs,
    hub,
  };
}
