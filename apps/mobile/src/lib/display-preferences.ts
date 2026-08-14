import 'expo-sqlite/localStorage/install';
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_CURRENCIES,
  type DisplayPreferences,
} from './display-format';

const STORAGE_KEY = 'outing:display-preferences:v1';
const listeners = new Set<() => void>();

function readStoredPreferences(): DisplayPreferences {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_DISPLAY_PREFERENCES;
    const value = JSON.parse(stored) as Partial<DisplayPreferences>;
    return {
      timeFormat: value.timeFormat === '24h' ? '24h' : '12h',
      temperatureUnit: value.temperatureUnit === 'celsius' ? 'celsius' : 'fahrenheit',
      currency: DISPLAY_CURRENCIES.includes(value.currency as DisplayPreferences['currency'])
        ? value.currency as DisplayPreferences['currency']
        : 'USD',
    };
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES;
  }
}

let snapshot = readStoredPreferences();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DisplayPreferences {
  return snapshot;
}

export function setDisplayPreferences(updates: Partial<DisplayPreferences>): void {
  snapshot = { ...snapshot, ...updates };
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Keep the in-memory preference. */ }
  listeners.forEach((listener) => listener());
}

export function useDisplayPreferences(): [DisplayPreferences, (updates: Partial<DisplayPreferences>) => void] {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return [preferences, setDisplayPreferences];
}
