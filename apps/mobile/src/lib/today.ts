import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import {
  todayAlternativeSchema,
  todaySnapshotSchema,
  type TodayAlternative,
  type TodaySituation,
  type TodaySnapshot,
} from '@gayi/shared';
import type { LocalTrip } from '../providers/AppProviders';
import { supabase } from './supabase';

const cacheKey = (tripId: string) => `outing:today:v1:${tripId}`;

function minutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function clock(value: number): string {
  const normalized = ((Math.round(value) % 1_440) + 1_440) % 1_440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function localDateParts(timezone: string): { date: string; minute: number } {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute) };
}

function dayNumber(startDate: string | undefined, localDate: string): number {
  if (!startDate) return 1;
  return Math.max(1, Math.floor((new Date(`${localDate}T12:00:00Z`).getTime() - new Date(`${startDate}T12:00:00Z`).getTime()) / 86_400_000) + 1);
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

export function buildLocalTodaySnapshot(trip: LocalTrip, timezone = 'UTC'): TodaySnapshot {
  const local = localDateParts(timezone);
  const day = dayNumber(trip.startDate, local.date);
  const items = (trip.tripPlan?.items ?? [])
    .filter((item) => item.day === day && /^\d{2}:\d{2}$/.test(item.time))
    .sort((a, b) => a.time.localeCompare(b.time));
  const current = items.find((item) => local.minute >= minutes(item.time) && local.minute < minutes(item.time) + item.duration);
  const next = items.find((item) => minutes(item.time) > local.minute);
  const makePlace = (item: typeof items[number]) => ({
    itemId: item.itemId ?? `${item.day}-${item.placeId}`,
    placeId: item.placeId,
    title: item.title,
    startTime: item.time,
    endTime: clock(minutes(item.time) + item.duration),
    ...(item.travelFromPrevious?.durationMinutes !== undefined ? { routeMinutes: item.travelFromPrevious.durationMinutes } : {}),
  });
  const reference = current?.coords ?? next?.coords;
  const savedIds = new Set(trip.savedPlaces ?? []);
  const nearbySavedPlaces = (trip.tripPlan?.items ?? [])
    .filter((item, index, values) => savedIds.has(item.placeId) && values.findIndex((value) => value.placeId === item.placeId) === index)
    .map((item) => {
      const distance = reference ? distanceMeters(reference, item.coords) : undefined;
      return {
        placeId: item.placeId,
        title: item.title,
        ...(distance !== undefined ? { distanceMeters: distance, routeMinutes: Math.max(1, Math.round(distance / 80)) } : {}),
        source: 'itinerary' as const,
      };
    })
    .filter((item) => item.distanceMeters === undefined || item.distanceMeters <= 5_000)
    .sort((left, right) => (left.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (right.distanceMeters ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 12);
  return {
    version: 'v1',
    tripId: trip.tripId,
    localDate: local.date,
    timezone,
    ...(current ? { current: makePlace(current) } : {}),
    ...(next ? { next: makePlace(next) } : {}),
    ...(next?.travelFromPrevious?.durationMinutes !== undefined
      ? { leaveBy: clock(minutes(next.time) - next.travelFromPrevious.durationMinutes - 10) }
      : {}),
    nearbySavedPlaceIds: (trip.savedPlaces ?? []).slice(0, 12),
    nearbySavedPlaces,
    freeWindowItemIds: items.filter((item) => item.kind === 'downtime').flatMap((item) => item.itemId ? [item.itemId] : []),
    generatedAt: new Date().toISOString(),
    providerFreshness: 'cached',
    offline: true,
  };
}

async function todayFunction(
  tripId: string,
  situation?: TodaySituation,
  signal?: AbortSignal,
): Promise<{ snapshot: TodaySnapshot; alternatives: TodayAlternative[] }> {
  if (!supabase) throw new Error('Outing is offline.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !baseUrl || !anonKey) throw new Error('Sign in for live Today updates.');
  const response = await expoFetch(`${baseUrl}/functions/v1/today-snapshot`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripId, ...(situation ? { situation } : {}) }),
    signal,
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Today could not refresh.');
  return {
    snapshot: todaySnapshotSchema.parse(body.snapshot),
    alternatives: Array.isArray(body.alternatives) ? body.alternatives.map((item) => todayAlternativeSchema.parse(item)) : [],
  };
}

export async function loadTodaySnapshot(
  trip: LocalTrip,
  timezone: string,
  signal?: AbortSignal,
): Promise<{ snapshot: TodaySnapshot; alternatives: TodayAlternative[] }> {
  try {
    const live = await todayFunction(trip.tripId, undefined, signal);
    await AsyncStorage.setItem(cacheKey(trip.tripId), JSON.stringify(live.snapshot));
    return live;
  } catch (error) {
    if (signal?.aborted) throw error;
    const stored = await AsyncStorage.getItem(cacheKey(trip.tripId));
    if (stored) {
      const cached = todaySnapshotSchema.parse(JSON.parse(stored));
      return { snapshot: { ...cached, offline: true, providerFreshness: 'stale' }, alternatives: [] };
    }
    const local = buildLocalTodaySnapshot(trip, timezone);
    await AsyncStorage.setItem(cacheKey(trip.tripId), JSON.stringify(local));
    return { snapshot: local, alternatives: [] };
  }
}

export async function loadTodayAlternatives(
  tripId: string,
  situation: TodaySituation,
  signal?: AbortSignal,
): Promise<TodayAlternative[]> {
  return (await todayFunction(tripId, situation, signal)).alternatives;
}
