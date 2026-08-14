import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.24.2';
import { corsHeaders } from '../_shared/http.ts';

type Json = Record<string, unknown>;

const requestSchema = z.object({
  tripId: z.string().uuid(),
  situation: z.enum(['closed', 'tired', 'raining', 'hungry', 'crowded', 'changed_mood']).optional(),
});

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: corsHeaders });
}

function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function minutes(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return undefined;
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

function clock(value: number): string {
  const normalized = ((Math.round(value) % 1_440) + 1_440) % 1_440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function zonedParts(timezone: string): { date: string; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute) };
}

function dayNumber(startDate: unknown, localDate: string): number {
  if (typeof startDate !== 'string') return 1;
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00Z`).getTime();
  const today = new Date(`${localDate}T12:00:00Z`).getTime();
  return Math.max(1, Math.floor((today - start) / 86_400_000) + 1);
}

function todayPlace(item: Json, confirmations: Json): Json {
  const start = minutes(item.time) ?? 0;
  const duration = typeof item.duration === 'number' ? item.duration : 60;
  const route = record(item.travelFromPrevious);
  const confirmation = typeof item.itemId === 'string' ? confirmations[item.itemId] : undefined;
  return {
    itemId: String(item.itemId),
    placeId: String(item.placeId),
    title: String(item.title),
    startTime: clock(start),
    endTime: clock(start + duration),
    ...(typeof confirmation === 'string' ? { reservationSummary: confirmation.slice(0, 400) } : {}),
    ...(typeof route.durationMinutes === 'number' ? { routeMinutes: route.durationMinutes } : {}),
  };
}

function weatherSummary(code: unknown): string {
  if (typeof code !== 'number') return 'Live conditions are limited';
  if ([0, 1].includes(code)) return 'Clear';
  if ([2, 3].includes(code)) return 'Cloudy';
  if (code >= 51 && code <= 82) return 'Rain possible';
  if (code >= 95) return 'Storms possible';
  return 'Mixed conditions';
}

function providerDurationMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.max(1, Math.round(Number(match[1]) / 60)) : undefined;
}

function waypoint(item: Json): Json | undefined {
  const coords = record(item.coords);
  if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return undefined;
  return { location: { latLng: { latitude: coords.lat, longitude: coords.lng } } };
}

function coordinates(item: Json): { lat: number; lng: number } | undefined {
  const coords = record(item.coords);
  if (typeof coords.lat === 'number' && typeof coords.lng === 'number') return { lat: coords.lat, lng: coords.lng };
  if (typeof item.lat === 'number' && typeof item.lng === 'number') return { lat: item.lat, lng: item.lng };
  return undefined;
}

function distanceMeters(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number },
): number {
  const radius = 6_371_000;
  const lat1 = left.lat * Math.PI / 180;
  const lat2 = right.lat * Math.PI / 180;
  const deltaLat = (right.lat - left.lat) * Math.PI / 180;
  const deltaLng = (right.lng - left.lng) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

async function travelApi(authorization: string, operation: string, input: Json): Promise<Json> {
  const response = await fetch(`${env('SUPABASE_URL')}/functions/v1/travel-api`, {
    method: 'POST',
    headers: { Authorization: authorization, apikey: env('SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, ...input }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('Live provider unavailable');
  return record(await response.json().catch(() => ({})));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid Today request' }, 400);
  const userClient = createClient<any>(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Authentication required' }, 401);
  const { data: trip } = await userClient.from('trips')
    .select('id,destination_slug,start_date,end_date,payload')
    .eq('id', parsed.data.tripId).maybeSingle();
  if (!trip) return json({ error: 'Trip unavailable' }, 404);
  const { data: destination } = trip.destination_slug
    ? await userClient.from('destinations').select('slug,timezone,lat,lng,payload').eq('slug', trip.destination_slug).maybeSingle()
    : { data: null };
  const payload = record(trip.payload);
  const plan = record(payload.tripPlan);
  const timezone = typeof destination?.timezone === 'string'
    ? destination.timezone
    : Array.isArray(plan.items) && typeof record(plan.items[0]).timezone === 'string'
      ? String(record(plan.items[0]).timezone)
      : 'UTC';
  const local = zonedParts(timezone);
  const day = dayNumber(trip.start_date, local.date);
  const confirmations = record(payload.bookingConfirmations);
  const items = (Array.isArray(plan.items) ? plan.items.map(record) : [])
    .filter((item) => item.day === day && typeof item.itemId === 'string' && minutes(item.time) !== undefined)
    .sort((a, b) => (minutes(a.time) ?? 0) - (minutes(b.time) ?? 0));
  const currentItem = items.find((item) => {
    const start = minutes(item.time)!;
    return local.minute >= start && local.minute < start + (typeof item.duration === 'number' ? item.duration : 60);
  });
  const nextItem = items.find((item) => (minutes(item.time) ?? 0) > local.minute);
  let nextRouteMinutes = typeof record(nextItem?.travelFromPrevious).durationMinutes === 'number'
    ? Number(record(nextItem?.travelFromPrevious).durationMinutes)
    : undefined;
  const routeOrigin = currentItem ? waypoint(currentItem) : undefined;
  const routeDestination = nextItem ? waypoint(nextItem) : undefined;
  if (routeOrigin && routeDestination) {
    try {
      const routeResult = await travelApi(authorization, 'route', { origin: routeOrigin, destination: routeDestination, travelMode: 'TRANSIT' });
      const route = Array.isArray(routeResult.routes) ? record(routeResult.routes[0]) : {};
      nextRouteMinutes = providerDurationMinutes(route.duration) ?? nextRouteMinutes;
    } catch { /* Use the cached itinerary estimate. */ }
  }
  let weather: Json | undefined;
  try {
    const lat = Number(destination?.lat);
    const lng = Number(destination?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const result = await travelApi(authorization, 'weatherForecast', { lat, lng });
      const provider = record(result.weather);
      const todayWeather = Array.isArray(provider.daily)
        ? provider.daily.map(record).find((entry) => entry.date === local.date)
        : undefined;
      weather = {
        summary: weatherSummary(provider.currentWeatherCode ?? todayWeather?.weatherCode),
        ...(typeof provider.currentTemperatureC === 'number' ? { temperatureC: provider.currentTemperatureC } : {}),
        ...(typeof todayWeather?.precipitationProbabilityMax === 'number'
          ? { precipitationChance: Number(todayWeather.precipitationProbabilityMax) / 100 }
          : {}),
        source: 'Open-Meteo',
      };
    }
  } catch { /* Cached itinerary remains usable. */ }
  const dayPlan = (Array.isArray(plan.days) ? plan.days.map(record) : []).find((candidate) => candidate.day === day);
  const savedIds = (Array.isArray(payload.savedPlaces) ? payload.savedPlaces.map(String) : []).slice(0, 12);
  const catalogPayload = record(destination?.payload);
  const catalogPlaces = Array.isArray(catalogPayload.places) ? catalogPayload.places.map(record) : [];
  const itineraryPlaces = (Array.isArray(plan.items) ? plan.items.map(record) : []);
  const reference = coordinates(currentItem ?? nextItem ?? {});
  const resolvedSaved = await Promise.all(savedIds.map(async (placeId) => {
    const itinerary = itineraryPlaces.find((item) => item.placeId === placeId);
    const catalog = catalogPlaces.find((item) => String(item.id ?? item.providerPlaceId ?? '') === placeId);
    if (itinerary) return { item: itinerary, source: 'itinerary' as const };
    if (catalog) return { item: catalog, source: 'outing_catalog' as const };
    try {
      const details = await travelApi(authorization, 'placeDetails', { placeId });
      const place = record(details.place);
      return Object.keys(place).length ? { item: place, source: 'google_places' as const } : undefined;
    } catch { return undefined; }
  }));
  const nearbySavedPlaces = resolvedSaved.flatMap((resolved, index) => {
    if (!resolved) return [];
    const coords = coordinates(resolved.item);
    const distance = reference && coords ? distanceMeters(reference, coords) : undefined;
    if (distance !== undefined && distance > 5_000) return [];
    return [{
      placeId: savedIds[index]!,
      title: String(resolved.item.title ?? resolved.item.name ?? 'Saved place').slice(0, 240),
      ...(distance !== undefined ? { distanceMeters: distance, routeMinutes: Math.max(1, Math.round(distance / 80)) } : {}),
      source: resolved.source,
    }];
  }).sort((left, right) => (left.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (right.distanceMeters ?? Number.MAX_SAFE_INTEGER));
  const snapshot = {
    version: 'v1',
    tripId: trip.id,
    localDate: local.date,
    timezone,
    ...(currentItem ? { current: todayPlace(currentItem, confirmations) } : {}),
    ...(nextItem ? { next: { ...todayPlace(nextItem, confirmations), ...(nextRouteMinutes !== undefined ? { routeMinutes: nextRouteMinutes } : {}) } } : {}),
    ...(nextItem && nextRouteMinutes !== undefined ? { leaveBy: clock(minutes(nextItem.time)! - nextRouteMinutes - 10) } : {}),
    ...(weather ? { weather } : {}),
    nearbySavedPlaceIds: savedIds,
    nearbySavedPlaces,
    freeWindowItemIds: items.filter((item) => item.kind === 'downtime').map((item) => String(item.itemId)).slice(0, 12),
    generatedAt: new Date().toISOString(),
    providerFreshness: weather ? 'live' : dayPlan?.freshness ?? 'cached',
    offline: false,
  };
  const alternatives = parsed.data.situation
    ? (Array.isArray(dayPlan?.backups) ? dayPlan.backups.map(record) : []).slice(0, 3).map((backup, index) => ({
        id: `${trip.id}-${day}-${parsed.data.situation}-${index}`,
        title: String(backup.title ?? 'Backup idea'),
        summary: `${String(backup.reason ?? 'A flexible backup for this day')} This is only a proposal until you review it.`,
        situation: parsed.data.situation,
        source: String(backup.source ?? 'outing'),
        confidence: 0.72,
        reviewAction: { type: 'review_proposal', value: JSON.stringify({ tripId: trip.id, day, placeId: backup.placeId }) },
      }))
    : [];
  return json({ snapshot, alternatives });
});
