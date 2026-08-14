/**
 * OSM Overpass plugin — queries the public Overpass API for LGBTQ-welcoming places
 * near a destination. No API key required.
 *
 * Attribution: © OpenStreetMap contributors, ODbL 1.0
 * https://www.openstreetmap.org/copyright
 */

import { defineProviderPlugin, withTimeout } from '../../registry';
import type { PlacesReq, PlacesRes } from '../../interfaces';
import type { Place, PlaceCategory } from '@gayi/shared';

// ── Static city coordinates for known destinations ─────────────────────────

const CITY_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  'amsterdam':       { lat: 52.3676,  lng: 4.9041,   name: 'Amsterdam' },
  'amsterdam-nl':    { lat: 52.3676,  lng: 4.9041,   name: 'Amsterdam' },
  'barcelona':       { lat: 41.3851,  lng: 2.1734,   name: 'Barcelona' },
  'barcelona-es':    { lat: 41.3851,  lng: 2.1734,   name: 'Barcelona' },
  'berlin':          { lat: 52.5200,  lng: 13.4050,  name: 'Berlin' },
  'berlin-de':       { lat: 52.5200,  lng: 13.4050,  name: 'Berlin' },
  'london':          { lat: 51.5074,  lng: -0.1278,  name: 'London' },
  'madrid':          { lat: 40.4168,  lng: -3.7038,  name: 'Madrid' },
  'lisbon':          { lat: 38.7169,  lng: -9.1395,  name: 'Lisbon' },
  'san-francisco':   { lat: 37.7749,  lng: -122.4194, name: 'San Francisco' },
  'new-york-city':   { lat: 40.7128,  lng: -74.0060, name: 'New York City' },
  'miami':           { lat: 25.7617,  lng: -80.1918, name: 'Miami' },
  'palm-springs':    { lat: 33.8303,  lng: -116.5453, name: 'Palm Springs' },
  'provincetown':    { lat: 42.0521,  lng: -70.1854, name: 'Provincetown' },
  'montreal':        { lat: 45.5017,  lng: -73.5673, name: 'Montréal' },
  'puerto-vallarta': { lat: 20.6534,  lng: -105.2253, name: 'Puerto Vallarta' },
  'mexico-city':     { lat: 19.4326,  lng: -99.1332, name: 'Mexico City' },
  'mexico-city-mx':  { lat: 19.4326,  lng: -99.1332, name: 'Mexico City' },
  'tokyo':           { lat: 35.6762,  lng: 139.6503, name: 'Tokyo' },
};

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const RADIUS_METRES = 3000;
const DEFAULT_TIMEOUT_MS = 8000;

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function osmCategoryToPlace(tags: Record<string, string>): PlaceCategory {
  const at = tags['amenity'];
  const ls = tags['leisure'];
  const sh = tags['shop'];
  if (at === 'bar' || at === 'pub') return 'bar';
  if (at === 'nightclub') return 'club';
  if (at === 'restaurant' || at === 'fast_food') return 'restaurant';
  if (at === 'cafe') return 'cafe';
  if (at === 'spa' || ls === 'sauna' || ls === 'fitness_centre') return 'spa';
  if (ls === 'park') return 'park';
  if (at === 'hotel' || at === 'hostel' || at === 'guest_house') return 'hotel';
  if (sh) return 'shop';
  return 'other';
}

function buildOverpassQuery(lat: number, lng: number): string {
  const r = RADIUS_METRES;
  const filters = [
    `node["lgbtq"="primary"](around:${r},${lat},${lng});`,
    `way["lgbtq"="primary"](around:${r},${lat},${lng});`,
    `node["lgbtq"="welcome"](around:${r},${lat},${lng});`,
    `way["lgbtq"="welcome"](around:${r},${lat},${lng});`,
  ].join('\n  ');
  return `[out:json][timeout:10];\n(\n  ${filters}\n);\nout center 40;`;
}

function elementToPlace(el: OverpassElement, slug: string): Place | null {
  const tags = el.tags ?? {};
  const name = tags['name'] ?? tags['brand'] ?? '';
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const lgbtqTag = tags['lgbtq'];
  return {
    placeId: `osm-${el.type}-${el.id}`,
    name,
    category: osmCategoryToPlace(tags),
    coords: { lat, lng: lon },
    durationMinutes: 60,
    estimatedCostPerPerson: 0,
    bookingRequired: false,
    interests: ['lgbtq_venues'],
    lgbtqRelevance: lgbtqTag === 'primary'
      ? 'Primarily LGBTQ+ venue (OSM: lgbtq=primary)'
      : 'LGBTQ+ welcoming venue (OSM: lgbtq=welcome)',
    source: 'openstreetmap',
  };
}

async function fetchOverpassPlaces(lat: number, lng: number, slug: string): Promise<Place[]> {
  const query = buildOverpassQuery(lat, lng);
  const resp = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!resp.ok) return [];
  const json = (await resp.json()) as { elements?: OverpassElement[] };
  const places: Place[] = [];
  for (const el of json.elements ?? []) {
    const p = elementToPlace(el, slug);
    if (p) places.push(p);
  }
  return places;
}

export const placesOsmOverpass = defineProviderPlugin<PlacesReq, PlacesRes>({
  id: 'places:osm-overpass',
  slot: 'places',
  label: 'OSM Overpass — LGBTQ+ Places',
  description:
    'Queries the public OpenStreetMap Overpass API for venues tagged lgbtq=primary or lgbtq=welcome. No API key required. Attribution: © OpenStreetMap contributors.',
  isMock: false,
  requiredEnv: [],

  async healthCheck() {
    try {
      // Lightweight status check — HEAD the endpoint.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const resp = await fetch(OVERPASS_ENDPOINT, {
        method: 'HEAD',
        signal: ctrl.signal,
      }).catch(() => null);
      clearTimeout(timer);
      return resp != null && resp.status < 500;
    } catch {
      return false;
    }
  },

  create() {
    const inner = {
      async call(req: PlacesReq): Promise<PlacesRes> {
        const coords = CITY_COORDS[req.destinationSlug];
        if (!coords) {
          // Unknown destination — return empty gracefully.
          return { places: [] };
        }

        let places: Place[];
        try {
          places = await fetchOverpassPlaces(coords.lat, coords.lng, req.destinationSlug);
        } catch {
          // Network failure — return empty gracefully.
          return { places: [] };
        }

        if (req.categories?.length) {
          places = places.filter((p) => req.categories!.includes(p.category));
        }
        if (req.searchQuery) {
          const q = req.searchQuery.toLowerCase();
          places = places.filter((p) => p.name.toLowerCase().includes(q));
        }
        if (req.limit != null) places = places.slice(0, req.limit);
        return { places };
      },
    };

    return withTimeout(inner, DEFAULT_TIMEOUT_MS);
  },
});
