/**
 * Live Google Places + Geocoding plugin.
 * Uses Geocoding API + Places Nearby Search (legacy) — works with standard
 * Google Maps Platform keys that have those APIs enabled.
 *
 * Mobile clients should prefer EXPO_PUBLIC_GOOGLE_PLACES_API_KEY (restricted).
 */

import { defineProviderPlugin, withTimeout } from '../../registry';
import type { Place, PlaceCategory, PlacesReq, PlacesRes } from '../../interfaces';

const TIMEOUT_MS = 8000;

function apiKey(): string | undefined {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}

function mapGoogleType(types: string[] | undefined): PlaceCategory {
  const t = new Set(types ?? []);
  if (t.has('night_club')) return 'club';
  if (t.has('bar') || t.has('cafe')) return t.has('bar') ? 'bar' : 'cafe';
  if (t.has('restaurant') || t.has('meal_takeaway')) return 'restaurant';
  if (t.has('museum')) return 'museum';
  if (t.has('park')) return 'park';
  if (t.has('lodging')) return 'hotel';
  if (t.has('spa')) return 'spa';
  if (t.has('shopping_mall') || t.has('store')) return 'shop';
  if (t.has('tourist_attraction') || t.has('point_of_interest')) return 'landmark';
  return 'other';
}

export async function geocodeAddress(
  address: string,
  key: string,
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
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

export async function nearbySearch(
  lat: number,
  lng: number,
  key: string,
  opts?: { radiusMeters?: number; type?: string; limit?: number },
): Promise<Place[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(opts?.radiusMeters ?? 2000));
  url.searchParams.set('key', key);
  if (opts?.type) url.searchParams.set('type', opts.type);

  const resp = await fetch(url.toString());
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    status: string;
    results?: Array<{
      place_id: string;
      name: string;
      types?: string[];
      vicinity?: string;
      rating?: number;
      user_ratings_total?: number;
      geometry?: { location: { lat: number; lng: number } };
      price_level?: number;
    }>;
  };
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

  const limit = opts?.limit ?? 12;
  return (data.results ?? [])
    .filter((r) => r.geometry?.location && (r.rating ?? 0) >= 4.0)
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0),
    )
    .slice(0, limit)
    .map((r) => {
      const category = mapGoogleType(r.types);
      const priceLevel = r.price_level ?? 2;
      return {
        placeId: r.place_id,
        name: r.name,
        category,
        coords: {
          lat: r.geometry!.location.lat,
          lng: r.geometry!.location.lng,
        },
        durationMinutes: category === 'museum' || category === 'landmark' ? 120 : 90,
        estimatedCostPerPerson: priceLevel * 25,
        bookingRequired: false,
        interests: [],
        source: 'google_places',
        lgbtqRelevance: undefined,
      } satisfies Place;
    });
}

/** Deduplicate places by normalized name + ~120m proximity. */
export function mergePlaces(editorial: Place[], live: Place[]): Place[] {
  const out = [...editorial];
  for (const livePlace of live) {
    const dup = out.some((existing) => {
      const nameMatch =
        existing.name.trim().toLowerCase() === livePlace.name.trim().toLowerCase();
      if (nameMatch) return true;
      const dLat = existing.coords.lat - livePlace.coords.lat;
      const dLng = existing.coords.lng - livePlace.coords.lng;
      const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111_000;
      return approxMeters < 120 && namesLooselyMatch(existing.name, livePlace.name);
    });
    if (!dup) out.push(livePlace);
  }
  return out;
}

function namesLooselyMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  return na.includes(nb) || nb.includes(na);
}

export const placesGoogleShell = defineProviderPlugin<PlacesReq, PlacesRes>({
  id: 'places:google-places',
  slot: 'places',
  label: 'Google Places',
  description:
    'Geocodes lodging and fetches highly rated Nearby Search results. Falls back empty when unkeyed.',
  requiredEnv: ['GOOGLE_PLACES_API_KEY'],
  async healthCheck() {
    return Boolean(apiKey());
  },
  create() {
    const inner = {
      async call(req: PlacesReq): Promise<PlacesRes> {
        const key = apiKey();
        if (!key) return { places: [] };

        const lodging = req.lodging;
        if (!lodging && !req.searchQuery) {
          return { places: [] };
        }

        let lat = lodging?.lat;
        let lng = lodging?.lng;

        if ((lat == null || lng == null) && req.searchQuery) {
          const geo = await geocodeAddress(req.searchQuery, key);
          if (geo) {
            lat = geo.lat;
            lng = geo.lng;
          }
        }

        if (lat == null || lng == null) return { places: [] };

        // Pull a few types and merge/dedupe
        const types = ['bar', 'restaurant', 'tourist_attraction', 'night_club', 'cafe'];
        const batches = await Promise.all(
          types.map((type) =>
            nearbySearch(lat!, lng!, key, {
              type,
              limit: Math.max(4, Math.floor((req.limit ?? 12) / types.length) + 1),
            }),
          ),
        );
        const merged = mergePlaces([], batches.flat());
        return { places: merged.slice(0, req.limit ?? 16) };
      },
    };
    return withTimeout(inner, TIMEOUT_MS);
  },
});
