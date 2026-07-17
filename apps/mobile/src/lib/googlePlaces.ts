import {
  getGooglePlacesApiKey,
  getViatorApiKey,
  googlePlacePhotoUrl,
} from './apiKeys';

export { getGooglePlacesApiKey, getViatorApiKey } from './apiKeys';

export async function geocodeLodgingAddress(
  address: string,
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  const key = getGooglePlacesApiKey();
  if (!key || !address.trim()) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address.trim());
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString());
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };
  if (data.status !== 'OK' || !data.results?.[0]) return null;
  const top = data.results[0];
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formattedAddress: top.formatted_address,
  };
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
  source: 'google_places';
}

function mapType(types: string[] | undefined): string {
  const t = new Set(types ?? []);
  if (t.has('night_club')) return 'club';
  if (t.has('bar')) return 'bar';
  if (t.has('cafe')) return 'cafe';
  if (t.has('restaurant')) return 'restaurant';
  if (t.has('museum')) return 'museum';
  if (t.has('park')) return 'park';
  if (t.has('tourist_attraction')) return 'landmark';
  return 'other';
}

export async function fetchNearbyHighlyRated(
  lat: number,
  lng: number,
  limit = 12,
): Promise<NearbyPlaceResult[]> {
  const key = getGooglePlacesApiKey();
  if (!key) return [];

  const types = ['bar', 'restaurant', 'tourist_attraction', 'night_club', 'cafe'];
  const batches = await Promise.all(
    types.map(async (type) => {
      const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      url.searchParams.set('location', `${lat},${lng}`);
      url.searchParams.set('radius', '2000');
      url.searchParams.set('type', type);
      url.searchParams.set('key', key);
      try {
        const resp = await fetch(url.toString());
        if (!resp.ok) return [] as NearbyPlaceResult[];
        const data = (await resp.json()) as {
          status: string;
          results?: Array<{
            place_id: string;
            name: string;
            types?: string[];
            vicinity?: string;
            rating?: number;
            user_ratings_total?: number;
            photos?: Array<{ photo_reference?: string }>;
            geometry?: { location: { lat: number; lng: number } };
          }>;
        };
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
        return (data.results ?? [])
          .filter((r) => r.geometry?.location && (r.rating ?? 0) >= 4.0)
          .map((r) => {
            const photoRef = r.photos?.[0]?.photo_reference;
            const photoUrl = photoRef ? googlePlacePhotoUrl(photoRef, 800) : undefined;
            return {
              placeId: r.place_id,
              name: r.name,
              category: mapType(r.types),
              lat: r.geometry!.location.lat,
              lng: r.geometry!.location.lng,
              rating: r.rating,
              userRatingsTotal: r.user_ratings_total,
              vicinity: r.vicinity,
              imageUrls: photoUrl ? [photoUrl] : [],
              source: 'google_places' as const,
            };
          });
      } catch {
        return [];
      }
    }),
  );

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
