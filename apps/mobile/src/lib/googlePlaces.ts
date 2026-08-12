import { getGooglePlacesApiKey, getViatorApiKey } from './apiKeys';
import { invokeTravelApi, type ApiPlace } from './travel-api';
import { scorePlaceMatch } from '@gayi/shared';

export { getGooglePlacesApiKey, getViatorApiKey } from './apiKeys';

export async function geocodeLodgingAddress(
  address: string,
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  if (!address.trim()) return null;
  try {
    const data = await invokeTravelApi<{
      result: { lat: number; lng: number; formattedAddress: string } | null;
    }>('geocode', { address: address.trim() });
    return data.result;
  } catch {
    return null;
  }
}

export interface NearbyPlaceResult {
  placeId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  vicinity?: string;
  imageUrls: string[];
  imageAttributions?: string[];
  address?: string;
  openingHours?: unknown[];
  businessStatus?: string;
  priceLevel?: string;
  verifiedAt?: string;
  googleMapsUri?: string;
  source: 'google_places';
}

function mapType(types: string[] | undefined): string {
  const t = new Set(types ?? []);
  if (t.has('night_club')) return 'club';
  if (t.has('bar')) return 'bar';
  if (t.has('cafe')) return 'cafe';
  if (t.has('restaurant')) return 'restaurant';
  if (t.has('museum')) return 'museum';
  if (t.has('art_gallery')) return 'museum';
  if (t.has('spa')) return 'spa';
  if (t.has('park')) return 'park';
  if (t.has('shopping_mall')) return 'shop';
  if (t.has('tourist_attraction')) return 'landmark';
  return 'other';
}

const INTEREST_TYPE_MAP: Record<string, string[]> = {
  food: ['restaurant', 'cafe'],
  nightlife: ['bar', 'night_club'],
  drag: ['bar', 'night_club'],
  lgbtq_venues: ['bar', 'night_club'],
  art: ['museum', 'art_gallery'],
  history: ['museum', 'tourist_attraction'],
  culture: ['museum', 'tourist_attraction'],
  beach: ['tourist_attraction'],
  wellness: ['spa', 'park'],
  shopping: ['shopping_mall'],
  hiking: ['park'],
  adventure: ['tourist_attraction'],
  pride: ['tourist_attraction'],
  music: ['bar', 'night_club'],
};

function uniqueByPlaceId(places: NearbyPlaceResult[]): NearbyPlaceResult[] {
  const byId = new Map<string, NearbyPlaceResult>();
  for (const place of places) {
    const existing = byId.get(place.placeId);
    if (!existing || (place.rating ?? 0) > (existing.rating ?? 0)) {
      byId.set(place.placeId, place);
    }
  }
  return [...byId.values()];
}

function mapApiPlace(r: ApiPlace): NearbyPlaceResult {
  return {
    placeId: r.providerPlaceId,
    name: r.name,
    category: mapType(r.types),
    lat: r.lat,
    lng: r.lng,
    rating: r.rating,
    userRatingsTotal: r.reviewCount,
    vicinity: r.address,
    address: r.address,
    imageUrls: r.photos.flatMap((photo) => photo.url ? [photo.url] : []),
    imageAttributions: r.photos.flatMap((photo) => photo.attribution ? [photo.attribution] : []),
    openingHours: r.openingHours,
    businessStatus: r.businessStatus,
    priceLevel: r.priceLevel,
    verifiedAt: r.verifiedAt,
    googleMapsUri: r.googleMapsUri,
    source: 'google_places',
  };
}

/** Resolve an editorial place to its exact Google record for fresh photos and a Maps link. */
export async function lookupPlaceByName(
  name: string,
  destinationName: string,
  context?: {
    center?: { lat: number; lng: number };
    address?: string;
  },
): Promise<NearbyPlaceResult | null> {
  try {
    const queryContext = context?.address || destinationName;
    const data = await invokeTravelApi<{ places: ApiPlace[] }>('placeTextSearch', {
      query: `${name}, ${queryContext}`,
      limit: 5,
      radiusMeters: context?.center ? 8_000 : 20_000,
      ...(context?.center ? { lat: context.center.lat, lng: context.center.lng } : {}),
    });
    if (!context?.center) return null;

    const ranked = data.places
      .map((place) => ({
        place,
        match: scorePlaceMatch(
          {
            name,
            destinationName,
            lat: context.center!.lat,
            lng: context.center!.lng,
            ...(context.address ? { address: context.address } : {}),
          },
          {
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            ...(place.address ? { address: place.address } : {}),
          },
        ),
      }))
      .filter(({ match }) => match.accepted)
      .sort((a, b) => b.match.score - a.match.score);

    return ranked[0] ? mapApiPlace(ranked[0].place) : null;
  } catch {
    return null;
  }
}

async function fetchLivePlaces(
  lat: number,
  lng: number,
  includedTypes: string[],
  limit: number,
  radiusMeters: number,
): Promise<NearbyPlaceResult[]> {
  const data = await invokeTravelApi<{ places: ApiPlace[] }>('placeSearch', {
    lat,
    lng,
    includedTypes,
    limit,
    radiusMeters,
  });
  return data.places.map(mapApiPlace);
}

export async function fetchNearbyHighlyRated(
  lat: number,
  lng: number,
  limit = 12,
): Promise<NearbyPlaceResult[]> {
  const types = ['bar', 'restaurant', 'tourist_attraction', 'night_club', 'cafe'];
  let batches: NearbyPlaceResult[][] = [];
  try {
    batches = await Promise.all(
      types.map((type) => fetchLivePlaces(lat, lng, [type], limit, 2_000)),
    );
  } catch {
    return [];
  }

  const byId = new Map<string, NearbyPlaceResult>();
  for (const place of batches.flat()) {
    if (!byId.has(place.placeId)) byId.set(place.placeId, place);
  }

  return [...byId.values()]
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0),
    )
    .slice(0, limit);
}

/**
 * Search Google Places around the destination center using trip interests.
 * Used as live candidates for itinerary generation; falls back to caller's seed places.
 */
export async function searchPlacesForInterests(
  lat: number,
  lng: number,
  interests: string[],
  limit = 10,
): Promise<NearbyPlaceResult[]> {
  if (interests.length === 0) return [];

  const types = Array.from(
    new Set(
      interests
        .flatMap((interest) => INTEREST_TYPE_MAP[interest] ?? [])
        .slice(0, 10),
    ),
  );
  if (types.length === 0) return [];

  const results = await Promise.allSettled(
    types.map((type) => fetchLivePlaces(lat, lng, [type], Math.min(20, limit), 12_000)),
  );
  const batches = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (batches.length === 0) return [];

  return uniqueByPlaceId(batches.flat())
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0),
    )
    .slice(0, limit);
}
