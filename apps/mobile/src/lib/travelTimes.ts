import { getGooglePlacesApiKey } from './googlePlaces';

export type TravelMode = 'walking' | 'transit' | 'driving';

export interface TravelLeg {
  fromLabel: string;
  toLabel: string;
  durationText: string;
  durationSeconds: number;
  distanceText: string;
  distanceMeters: number;
  mode: TravelMode;
}

export interface TimedStop {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

/**
 * Fetch travel times between consecutive stops via Distance Matrix API.
 * Stays in-app — no redirect to Google Maps.
 */
export async function fetchTravelLegs(
  stops: TimedStop[],
  mode: TravelMode = 'walking',
): Promise<TravelLeg[]> {
  const key = getGooglePlacesApiKey();
  if (!key || stops.length < 2) return [];

  const legs: TravelLeg[] = [];

  // Distance Matrix allows multiple origins/destinations; batch consecutive pairs
  // in chunks to stay within URL limits.
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]!;
    const to = stops[i + 1]!;
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${from.lat},${from.lng}`);
    url.searchParams.set('destinations', `${to.lat},${to.lng}`);
    url.searchParams.set('mode', mode);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', key);

    try {
      const resp = await fetch(url.toString());
      if (!resp.ok) continue;
      const data = (await resp.json()) as {
        status: string;
        rows?: Array<{
          elements?: Array<{
            status: string;
            duration?: { text: string; value: number };
            distance?: { text: string; value: number };
          }>;
        }>;
      };
      const el = data.rows?.[0]?.elements?.[0];
      if (data.status !== 'OK' || !el || el.status !== 'OK' || !el.duration || !el.distance) {
        continue;
      }
      legs.push({
        fromLabel: from.label,
        toLabel: to.label,
        durationText: el.duration.text,
        durationSeconds: el.duration.value,
        distanceText: el.distance.text,
        distanceMeters: el.distance.value,
        mode,
      });
    } catch {
      // skip failed leg
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
): TimedStop[] {
  return items
    .filter(
      (item) =>
        item.day === day &&
        !item.placeId.startsWith('free-') &&
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
}
