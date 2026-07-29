import { invokeTravelApi } from './travel-api';
import type { ItineraryRouteEstimate } from '@gayi/domain';

export type TravelMode = 'walking' | 'transit' | 'driving';

export interface TravelLeg {
  fromLabel: string;
  toLabel: string;
  durationText: string;
  durationSeconds: number;
  distanceText: string;
  distanceMeters: number;
  mode: TravelMode;
  encodedPolyline?: string;
  routeCoords?: Array<{ latitude: number; longitude: number }>;
  estimated?: boolean;
}

export interface TimedStop {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export async function fetchCandidateRouteMatrix(
  points: Array<{ placeId: string; lat: number; lng: number }>,
  mode: TravelMode = 'transit',
): Promise<ItineraryRouteEstimate[]> {
  if (points.length < 2) return [];
  const selected = points.slice(0, 12);
  const waypoints = selected.map((point) => ({ waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lng } } } }));
  const data = await invokeTravelApi<{ elements: unknown[] }>('routeMatrix', { origins: waypoints, destinations: waypoints, travelMode: mode.toUpperCase() });
  return data.elements.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const element = raw as { originIndex?: number; destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string };
    const from = selected[element.originIndex ?? -1];
    const to = selected[element.destinationIndex ?? -1];
    if (!from || !to || from.placeId === to.placeId || element.condition === 'ROUTE_NOT_FOUND') return [];
    return [{ fromPlaceId: from.placeId, toPlaceId: to.placeId, mode, durationMinutes: Math.max(1, Math.round(parseDurationSeconds(element.duration) / 60)), ...(typeof element.distanceMeters === 'number' ? { distanceMeters: element.distanceMeters } : {}) }];
  });
}

/**
 * Fetch travel times between consecutive stops via Distance Matrix API.
 * Stays in-app — no redirect to Google Maps.
 */
export async function fetchTravelLegs(
  stops: TimedStop[],
  mode: TravelMode | 'auto' = 'auto',
): Promise<TravelLeg[]> {
  if (stops.length < 2) return [];

  const legs: TravelLeg[] = [];

  // Distance Matrix allows multiple origins/destinations; batch consecutive pairs
  // in chunks to stay within URL limits.
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]!;
    const to = stops[i + 1]!;
    const directDistance = straightLineMeters(from, to);
    let selectedMode: TravelMode = mode === 'auto'
      ? directDistance <= 1_600 ? 'walking' : 'transit'
      : mode;
    try {
      let data = await invokeTravelApi<{
        routes: Array<{
          duration?: string;
          distanceMeters?: number;
          polyline?: { encodedPolyline?: string };
        }>;
      }>('route', {
        origin: waypoint(from),
        destination: waypoint(to),
        travelMode: selectedMode.toUpperCase(),
      });
      let route = data.routes[0];
      if (!route && mode === 'auto' && selectedMode === 'transit') {
        selectedMode = 'driving';
        data = await invokeTravelApi('route', { origin: waypoint(from), destination: waypoint(to), travelMode: 'DRIVING' });
        route = data.routes[0];
      }
      if (!route) throw new Error('No route');
      const durationSeconds = parseDurationSeconds(route.duration);
      const distanceMeters = route.distanceMeters ?? 0;
      const encodedPolyline = route.polyline?.encodedPolyline;
      legs.push({
        fromLabel: from.label,
        toLabel: to.label,
        durationText: formatDuration(durationSeconds),
        durationSeconds,
        distanceText: formatDistance(distanceMeters),
        distanceMeters,
        mode: selectedMode,
        ...(encodedPolyline ? {
          encodedPolyline,
          routeCoords: decodePolyline(encodedPolyline),
        } : {}),
      });
    } catch {
      const distanceMeters = directDistance;
      const speedMetersPerSecond = selectedMode === 'walking' ? 1.35 : selectedMode === 'driving' ? 10 : 6;
      const durationSeconds = Math.max(300, Math.round(distanceMeters / speedMetersPerSecond));
      legs.push({
        fromLabel: from.label,
        toLabel: to.label,
        durationText: `about ${formatDuration(durationSeconds)}`,
        durationSeconds,
        distanceText: formatDistance(distanceMeters),
        distanceMeters,
        mode: selectedMode,
        estimated: true,
      });
    }
  }

  return legs;
}

/** Build ordered stops for one itinerary day (skip free/downtime blocks without coords). */
export function itineraryStopsForDay(
  items: Array<{
    day: number;
    time: string;
    title: string;
    placeId: string;
    coords?: { lat: number; lng: number };
  }>,
  day: number,
  lodging?: TimedStop,
): TimedStop[] {
  const activityStops = items
    .filter(
      (item) =>
        item.day === day &&
        !item.placeId.startsWith('free-') && !item.placeId.startsWith('meal-') &&
        typeof item.coords?.lat === 'number' &&
        typeof item.coords?.lng === 'number',
    )
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((item) => ({
      id: `${item.placeId}-${item.time}`,
      label: item.title,
      lat: item.coords!.lat,
      lng: item.coords!.lng,
    }));
  if (!lodging) return activityStops;
  return [
    { ...lodging, id: `${lodging.id}-start-${day}`, label: `${lodging.label} · start` },
    ...activityStops,
    { ...lodging, id: `${lodging.id}-end-${day}`, label: `${lodging.label} · return` },
  ];
}

function waypoint(stop: TimedStop) {
  return {
    location: {
      latLng: { latitude: stop.lat, longitude: stop.lng },
    },
  };
}

function parseDurationSeconds(value?: string): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/s$/, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function formatDistance(meters: number): string {
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1)} km`;
}

function straightLineMeters(a: TimedStop, b: TimedStop): number {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const deltaLat = (b.lat - a.lat) * rad;
  const deltaLng = (b.lng - a.lng) * rad;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  const coordinates: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const read = () => {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encoded.length);
      return (result & 1) ? ~(result >> 1) : result >> 1;
    };
    lat += read();
    lng += read();
    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coordinates;
}
