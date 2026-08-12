import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import type { NotificationPreferences } from '@gayi/shared';
import type { LocalTrip } from '../providers/AppProviders';
import { supabase } from './supabase';

const PREFERENCES_KEY = 'outing:notification-preferences:v1';
const DEVICE_ID_KEY = 'outing:notification-device-id:v1';
const REMINDER_IDS_KEY = 'outing:active-trip-reminder-ids:v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    discoveryDigestEnabled: false,
    activeTripRemindersEnabled: false,
    digestWeekday: 3,
    digestLocalHour: 18,
    quietHoursStart: 21,
    quietHoursEnd: 8,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  const fallback = defaultNotificationPreferences();
  const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!raw) return fallback;
  try { return { ...fallback, ...(JSON.parse(raw) as Partial<NotificationPreferences>) }; }
  catch { return fallback; }
}

async function deviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

async function registerPushToken(): Promise<void> {
  if (!supabase || process.env.EXPO_OS === 'web') return;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.id) return;
  if (process.env.EXPO_OS === 'android') {
    await Notifications.setNotificationChannelAsync('outing-plans', {
      name: 'Outing plans', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Push notification project ID is unavailable.');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.from('device_push_tokens').upsert({
    user_id: data.session.user.id,
    installation_id: await deviceId(),
    expo_push_token: token.data,
    platform: process.env.EXPO_OS,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    enabled: true,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'user_id,installation_id' });
  if (error) throw error;
}

export async function saveNotificationPreferences(value: NotificationPreferences): Promise<void> {
  const wantsNotifications = value.discoveryDigestEnabled || value.activeTripRemindersEnabled;
  if (wantsNotifications) {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) throw new Error('Notifications are off. You can enable them in device Settings.');
    await registerPushToken();
  }
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(value));
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id) {
      const { error } = await supabase.from('notification_preferences').upsert({
        user_id: data.session.user.id,
        preferences: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
    }
  }
}

async function cancelItineraryReminders(): Promise<void> {
  const raw = await AsyncStorage.getItem(REMINDER_IDS_KEY);
  const ids = raw ? JSON.parse(raw) as string[] : [];
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  await AsyncStorage.removeItem(REMINDER_IDS_KEY);
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function zonedInstant(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let guess = target;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess -= rendered - target;
  }
  return new Date(guess);
}

export async function scheduleItineraryReminders(trip: LocalTrip): Promise<void> {
  await cancelItineraryReminders();
  const preferences = await loadNotificationPreferences();
  if (!preferences.activeTripRemindersEnabled || !trip.startDate) return;
  const now = Date.now();
  const upcoming = (trip.tripPlan?.items ?? [])
    .filter((item) => item.kind !== 'downtime')
    .map((item) => {
      const date = zonedInstant(
        addCalendarDays(trip.startDate!, item.day - 1),
        item.time,
        item.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      );
      date.setMinutes(date.getMinutes() - Math.max(15, (item.travelFromPrevious?.durationMinutes ?? 0) + 10));
      return { item, date };
    })
    .filter(({ date }) => date.getTime() > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 3);
  const ids: string[] = [];
  for (const { item, date } of upcoming) {
    ids.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: `Coming up: ${item.title}`,
        body: item.travelFromPrevious?.durationMinutes ? `Allow about ${item.travelFromPrevious.durationMinutes} minutes to get there.` : 'Open Today for the latest plan.',
        data: { tripId: trip.tripId, path: `/trips/${trip.tripId}/today` },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    }));
  }
  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(ids));
}
