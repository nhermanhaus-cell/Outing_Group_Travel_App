import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { ItineraryItem } from '@gayi/domain';
import type { TripAwarenessSettings, TripVisitEvent } from '@gayi/shared';
import type { LocalTrip } from '../providers/AppProviders';
import { supabase } from './supabase';

export const OUTING_GEOFENCE_TASK = 'outing-active-trip-geofences-v1';
export const OUTING_LOCATION_TASK = 'outing-active-trip-location-v1';
const MONITORED_STOPS_KEY = 'outing:awareness:monitored-stops:v1';
const GEOFENCE_STATE_KEY = 'outing:awareness:inside-state:v1';
const VISIT_QUEUE_KEY = 'outing:awareness:visit-queue:v1';
const SETTINGS_KEY = 'outing:awareness:settings:v1';
const VISITED_STOPS_KEY = 'outing:awareness:visited-stops:v1';

type MonitoredStop = {
  tripId: string;
  itemId: string;
  placeId: string;
  latitude: number;
  longitude: number;
  radius: number;
};

type PendingVisit = Omit<TripVisitEvent, 'ownerId'>;

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const earth = 6_371_000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function enqueueVisit(event: PendingVisit): Promise<void> {
  const queue = await loadJson<PendingVisit[]>(VISIT_QUEUE_KEY, []);
  const duplicate = queue.some((candidate) =>
    candidate.tripId === event.tripId && candidate.itemId === event.itemId && candidate.event === event.event &&
    Math.abs(new Date(candidate.occurredAt).getTime() - new Date(event.occurredAt).getTime()) < 5 * 60_000,
  );
  if (!duplicate) await AsyncStorage.setItem(VISIT_QUEUE_KEY, JSON.stringify([...queue, event].slice(-500)));
  if ((event.event === 'arrived' || event.event === 'manually_visited') && event.itemId) {
    const visited = await loadJson<string[]>(VISITED_STOPS_KEY, []);
    const key = `${event.tripId}:${event.itemId}`;
    if (!visited.includes(key)) await AsyncStorage.setItem(VISITED_STOPS_KEY, JSON.stringify([...visited, key].slice(-500)));
  }
}

function pendingVisit(stop: MonitoredStop, event: PendingVisit['event']): PendingVisit {
  return {
    id: Crypto.randomUUID(),
    tripId: stop.tripId,
    itemId: stop.itemId,
    placeId: stop.placeId,
    event,
    occurredAt: new Date().toISOString(),
    source: 'device_geofence',
  };
}

if (!TaskManager.isTaskDefined(OUTING_GEOFENCE_TASK)) {
  TaskManager.defineTask<{ eventType: Location.LocationGeofencingEventType; region: Location.LocationRegion }>(
    OUTING_GEOFENCE_TASK,
    async ({ data, error }) => {
      if (error || !data?.region.identifier) return;
      const stops = await loadJson<MonitoredStop[]>(MONITORED_STOPS_KEY, []);
      const stop = stops.find((candidate) => candidate.itemId === data.region.identifier);
      if (!stop) return;
      await enqueueVisit(pendingVisit(
        stop,
        data.eventType === Location.LocationGeofencingEventType.Enter ? 'arrived' : 'departed',
      ));
    },
  );
}

if (!TaskManager.isTaskDefined(OUTING_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    OUTING_LOCATION_TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const stops = await loadJson<MonitoredStop[]>(MONITORED_STOPS_KEY, []);
      const state = await loadJson<Record<string, boolean>>(GEOFENCE_STATE_KEY, {});
      for (const location of data.locations) {
        // Coordinates are used only in memory for on-device matching and are never persisted.
        for (const stop of stops) {
          const inside = distanceMeters(
            { latitude: location.coords.latitude, longitude: location.coords.longitude },
            stop,
          ) <= stop.radius;
          const prior = state[stop.itemId] === true;
          if (inside && !prior) await enqueueVisit(pendingVisit(stop, 'arrived'));
          if (!inside && prior) await enqueueVisit(pendingVisit(stop, 'departed'));
          state[stop.itemId] = inside;
        }
      }
      await AsyncStorage.setItem(GEOFENCE_STATE_KEY, JSON.stringify(state));
    },
  );
}

function tripClock(trip: LocalTrip, now = new Date()): { date: string; minute: number } {
  const timezone = trip.tripPlan?.items.find((item) => item.timezone)?.timezone ?? 'UTC';
  try {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((part) => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute) };
  } catch {
    return { date: now.toISOString().slice(0, 10), minute: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

function tripActive(trip: LocalTrip, now = new Date()): boolean {
  if (!trip.startDate || !trip.endDate) return false;
  const today = tripClock(trip, now).date;
  return today >= trip.startDate && today <= trip.endDate;
}

function nextStops(trip: LocalTrip, now = new Date()): MonitoredStop[] {
  const local = tripClock(trip, now);
  const today = local.date;
  const start = trip.startDate ?? today;
  const day = Math.max(1, Math.floor((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000) + 1);
  const currentMinutes = local.minute;
  return (trip.tripPlan?.items ?? [])
    .filter((item) => item.day >= day && item.kind !== 'downtime' && item.kind !== 'meal' && Number.isFinite(item.coords.lat) && Number.isFinite(item.coords.lng))
    .filter((item) => item.day > day || Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3, 5)) >= currentMinutes - item.duration)
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
    .slice(0, 3)
    .map((item) => ({
      tripId: trip.tripId,
      itemId: item.itemId ?? `${item.day}-${item.placeId}`,
      placeId: item.placeId,
      latitude: item.coords.lat,
      longitude: item.coords.lng,
      radius: 140,
    }));
}

async function saveSetting(setting: TripAwarenessSettings): Promise<void> {
  const settings = await loadJson<Record<string, TripAwarenessSettings>>(SETTINGS_KEY, {});
  settings[setting.tripId] = setting;
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id === setting.ownerId) {
      await supabase.from('trip_awareness_settings').upsert({
        trip_id: setting.tripId,
        owner_id: setting.ownerId,
        enabled: setting.enabled,
        background_location_enabled: setting.backgroundLocationEnabled,
        itinerary_reminders_enabled: setting.itineraryRemindersEnabled,
        consented_at: setting.consentedAt ?? null,
        monitoring_ends_at: setting.monitoringEndsAt ?? null,
        updated_at: setting.updatedAt,
      }, { onConflict: 'trip_id,owner_id' });
    }
  }
}

async function startMonitoring(stops: MonitoredStop[]): Promise<void> {
  await AsyncStorage.setItem(MONITORED_STOPS_KEY, JSON.stringify(stops));
  if (process.env.EXPO_OS === 'android') {
    if (await Location.hasStartedLocationUpdatesAsync(OUTING_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(OUTING_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(OUTING_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,
      distanceInterval: 75,
      deferredUpdatesDistance: 100,
      foregroundService: {
        notificationTitle: 'Outing trip awareness is on',
        notificationBody: 'Privately matching your next itinerary stops. No location trail is uploaded.',
        notificationColor: '#EF765F',
        killServiceOnDestroy: false,
      },
    });
  } else {
    await Location.startGeofencingAsync(OUTING_GEOFENCE_TASK, stops.map((stop) => ({
      identifier: stop.itemId,
      latitude: stop.latitude,
      longitude: stop.longitude,
      radius: stop.radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    })));
  }
}

export async function getTripAwarenessSetting(tripId: string): Promise<TripAwarenessSettings | undefined> {
  return (await loadJson<Record<string, TripAwarenessSettings>>(SETTINGS_KEY, {}))[tripId];
}

export async function enableTripAwareness(
  trip: LocalTrip,
  ownerId: string,
): Promise<{ backgroundEnabled: boolean; reason?: string }> {
  if (!tripActive(trip)) return { backgroundEnabled: false, reason: 'Trip awareness is available only during active trip dates.' };
  const stops = nextStops(trip);
  if (!stops.length) return { backgroundEnabled: false, reason: 'Add upcoming itinerary stops before enabling awareness.' };
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    await saveSetting({ tripId: trip.tripId, ownerId, enabled: true, backgroundLocationEnabled: false, itineraryRemindersEnabled: true, consentedAt: new Date().toISOString(), monitoringEndsAt: `${trip.endDate}T23:59:59.000Z`, updatedAt: new Date().toISOString() });
    return { backgroundEnabled: false, reason: 'Today will use manual refresh and itinerary reminders.' };
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.granted) {
    await startMonitoring(stops);
  }
  await saveSetting({
    tripId: trip.tripId,
    ownerId,
    enabled: true,
    backgroundLocationEnabled: background.granted,
    itineraryRemindersEnabled: true,
    consentedAt: new Date().toISOString(),
    monitoringEndsAt: `${trip.endDate}T23:59:59.000Z`,
    updatedAt: new Date().toISOString(),
  });
  return { backgroundEnabled: background.granted, ...(!background.granted ? { reason: 'Today will use manual refresh and itinerary reminders.' } : {}) };
}

export async function disableTripAwareness(tripId: string, ownerId: string): Promise<void> {
  if (await Location.hasStartedGeofencingAsync(OUTING_GEOFENCE_TASK)) await Location.stopGeofencingAsync(OUTING_GEOFENCE_TASK);
  if (await Location.hasStartedLocationUpdatesAsync(OUTING_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(OUTING_LOCATION_TASK);
  await AsyncStorage.removeItem(MONITORED_STOPS_KEY);
  await AsyncStorage.removeItem(GEOFENCE_STATE_KEY);
  await saveSetting({ tripId, ownerId, enabled: false, backgroundLocationEnabled: false, itineraryRemindersEnabled: false, updatedAt: new Date().toISOString() });
}

export async function cleanupExpiredTripAwareness(trips: LocalTrip[], ownerId?: string): Promise<void> {
  const monitored = await loadJson<MonitoredStop[]>(MONITORED_STOPS_KEY, []);
  const active = trips.find((trip) => trip.tripId === monitored[0]?.tripId);
  if (active && tripActive(active)) return;
  if (await Location.hasStartedGeofencingAsync(OUTING_GEOFENCE_TASK)) await Location.stopGeofencingAsync(OUTING_GEOFENCE_TASK);
  if (await Location.hasStartedLocationUpdatesAsync(OUTING_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(OUTING_LOCATION_TASK);
  const visited = await loadJson<string[]>(VISITED_STOPS_KEY, []);
  for (const stop of monitored) {
    if (!visited.includes(`${stop.tripId}:${stop.itemId}`)) await enqueueVisit(pendingVisit(stop, 'skipped'));
  }
  await AsyncStorage.removeItem(MONITORED_STOPS_KEY);
  await AsyncStorage.removeItem(GEOFENCE_STATE_KEY);
  if (active && ownerId) await saveSetting({ tripId: active.tripId, ownerId, enabled: false, backgroundLocationEnabled: false, itineraryRemindersEnabled: false, updatedAt: new Date().toISOString() });
}

export async function refreshTripAwareness(trips: LocalTrip[]): Promise<void> {
  const settings = await loadJson<Record<string, TripAwarenessSettings>>(SETTINGS_KEY, {});
  const trip = trips.find((candidate) => settings[candidate.tripId]?.enabled && tripActive(candidate));
  if (!trip || !settings[trip.tripId]?.backgroundLocationEnabled) return;
  const permission = await Location.getBackgroundPermissionsAsync();
  if (!permission.granted) return;
  const next = nextStops(trip);
  if (!next.length) return;
  const current = await loadJson<MonitoredStop[]>(MONITORED_STOPS_KEY, []);
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  await startMonitoring(next);
}

export async function syncPrivateVisitEvents(): Promise<void> {
  if (!supabase) return;
  const queue = await loadJson<PendingVisit[]>(VISIT_QUEUE_KEY, []);
  if (!queue.length) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  const rows = queue.map((event) => ({
    id: event.id, trip_id: event.tripId, owner_id: userId,
    item_id: event.itemId ?? null, place_id: event.placeId ?? null,
    event: event.event, occurred_at: event.occurredAt, source: event.source,
  }));
  const { error } = await supabase.from('trip_visit_events').upsert(rows, { onConflict: 'id' });
  if (!error) await AsyncStorage.removeItem(VISIT_QUEUE_KEY);
}

export async function recordManualVisit(tripId: string, item: ItineraryItem): Promise<void> {
  await enqueueVisit({
    id: Crypto.randomUUID(), tripId, itemId: item.itemId, placeId: item.placeId,
    event: 'manually_visited', occurredAt: new Date().toISOString(), source: 'manual',
  });
  await syncPrivateVisitEvents();
}

export async function deleteVisitEvent(eventId: string): Promise<void> {
  if (supabase) await supabase.from('trip_visit_events').delete().eq('id', eventId);
  const queue = await loadJson<PendingVisit[]>(VISIT_QUEUE_KEY, []);
  await AsyncStorage.setItem(VISIT_QUEUE_KEY, JSON.stringify(queue.filter((event) => event.id !== eventId)));
}

export async function loadVisitHistory(tripId?: string): Promise<TripVisitEvent[]> {
  const queue = await loadJson<PendingVisit[]>(VISIT_QUEUE_KEY, []);
  let remote: TripVisitEvent[] = [];
  let ownerId = 'local-device';
  if (supabase) {
    const { data: session } = await supabase.auth.getSession();
    ownerId = session.session?.user.id ?? ownerId;
    let query = supabase.from('trip_visit_events').select('*').order('occurred_at', { ascending: false }).limit(500);
    if (tripId) query = query.eq('trip_id', tripId);
    const { data, error } = await query;
    if (error) throw error;
    remote = (data ?? []).map((row) => ({
      id: row.id,
      tripId: row.trip_id,
      ownerId: row.owner_id,
      ...(row.item_id ? { itemId: row.item_id } : {}),
      ...(row.place_id ? { placeId: row.place_id } : {}),
      event: row.event,
      occurredAt: row.occurred_at,
      source: row.source,
    }));
  }
  const remoteIds = new Set(remote.map((event) => event.id));
  const pending = queue
    .filter((event) => !tripId || event.tripId === tripId)
    .filter((event) => !remoteIds.has(event.id))
    .map((event) => ({ ...event, ownerId }));
  return [...remote, ...pending].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export async function deleteTripVisitHistory(tripId: string): Promise<void> {
  if (supabase) await supabase.from('trip_visit_events').delete().eq('trip_id', tripId);
  const queue = await loadJson<PendingVisit[]>(VISIT_QUEUE_KEY, []);
  await AsyncStorage.setItem(VISIT_QUEUE_KEY, JSON.stringify(queue.filter((event) => event.tripId !== tripId)));
  const visited = await loadJson<string[]>(VISITED_STOPS_KEY, []);
  await AsyncStorage.setItem(VISITED_STOPS_KEY, JSON.stringify(visited.filter((key) => !key.startsWith(`${tripId}:`))));
}

export async function deleteAllVisitHistory(): Promise<void> {
  if (supabase) await supabase.from('trip_visit_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await AsyncStorage.removeItem(VISIT_QUEUE_KEY);
  await AsyncStorage.removeItem(VISITED_STOPS_KEY);
}
