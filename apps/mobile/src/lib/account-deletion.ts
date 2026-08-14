import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { posthog } from '../config/posthog';
import { supabase } from './supabase';
import { isAccountDataStorageKey } from './account-deletion-state';

export class AccountDeletionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

export interface AccountDeletionResult {
  appleManualRevokeRequired: boolean;
}

function localTripIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as Array<{ tripId?: unknown }>;
    return Array.isArray(value)
      ? value.flatMap((trip) => typeof trip?.tripId === 'string' ? [trip.tripId] : [])
      : [];
  } catch {
    return [];
  }
}

export async function requestRemoteAccountDeletion(input?: {
  appleAuthorizationCode?: string;
}): Promise<AccountDeletionResult> {
  if (!supabase) throw new AccountDeletionError('Outing is not connected. Sign in again, then retry.');
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken) throw new AccountDeletionError('Your session expired. Sign in again, then retry.', 401);
  if (!baseUrl || !anonKey) throw new AccountDeletionError('Account deletion is not configured in this build.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${baseUrl}/functions/v1/account-deletion`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        confirmation: 'DELETE',
        ...(input?.appleAuthorizationCode
          ? { appleAuthorizationCode: input.appleAuthorizationCode }
          : {}),
      }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({})) as {
      deleted?: unknown;
      error?: unknown;
      appleManualRevokeRequired?: unknown;
    };
    if (!response.ok || result.deleted !== true) {
      throw new AccountDeletionError(
        typeof result.error === 'string' ? result.error : 'Outing could not delete your account. Try again.',
        response.status,
      );
    }
    return { appleManualRevokeRequired: result.appleManualRevokeRequired === true };
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error;
    if ((error as { name?: string }).name === 'AbortError') {
      throw new AccountDeletionError('Account deletion timed out. Check your connection and try again.');
    }
    throw new AccountDeletionError('Outing could not delete your account. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function clearLocalAccountData(): Promise<void> {
  const tripIds = localTripIds(await AsyncStorage.getItem('gayi:trips').catch(() => null));

  await Promise.allSettled([
    import('./notifications').then(({ cancelItineraryReminders }) => cancelItineraryReminders()),
    import('./trip-awareness').then(({ clearAllTripAwarenessLocalData }) => clearAllTripAwarenessLocalData()),
    import('./inspiration-imports').then(({ clearGuestInspirationQueue }) => clearGuestInspirationQueue()),
  ]);

  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const accountKeys = keys.filter(isAccountDataStorageKey);
  if (accountKeys.length) await AsyncStorage.multiRemove(accountKeys);

  await Promise.allSettled([
    SecureStore.deleteItemAsync('gayi:new-trip-travel-buddies'),
    ...tripIds.map((tripId) => SecureStore.deleteItemAsync(`gayi:pending-invites:${tripId}`)),
  ]);

  posthog.reset();
}
