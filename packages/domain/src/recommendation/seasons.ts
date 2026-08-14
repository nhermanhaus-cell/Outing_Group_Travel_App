import { MONTH_NAMES, MONTH_SHORT } from '@gayi/shared';
import type { TravelWindow } from '../types';

// ─── Month helpers ────────────────────────────────────────────────────────────

export function monthName(month: number): string {
  const name = MONTH_NAMES[month - 1];
  if (!name) throw new RangeError(`month must be 1–12, got ${month}`);
  return name;
}

export function monthShort(month: number): string {
  const name = MONTH_SHORT[month - 1];
  if (!name) throw new RangeError(`month must be 1–12, got ${month}`);
  return name;
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

/** Northern-hemisphere seasons. */
export function getSeason(month: number): Season {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

/** Months that share the same season as the given month. */
export function seasonMonths(month: number): number[] {
  const s = getSeason(month);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => getSeason(m) === s);
}

// ─── Overlap scoring ──────────────────────────────────────────────────────────

/**
 * 0–100 score representing how well userMonths fall within the destination's
 * bestMonths. Returns 50 (neutral) when either list is empty.
 */
export function overlapScore(
  userMonths: number[],
  bestMonths: number[],
): number {
  if (userMonths.length === 0 || bestMonths.length === 0) return 50;
  const hits = userMonths.filter((m) => bestMonths.includes(m)).length;
  return Math.round((hits / userMonths.length) * 100);
}

/**
 * Find the contiguous or minimal travel window from the intersection of
 * userMonths and bestMonths. Falls back to the user's own months if there is
 * no intersection.
 */
export function findOptimalTravelWindow(
  userMonths: number[],
  bestMonths: number[],
): TravelWindow | null {
  if (userMonths.length === 0) return null;

  const overlap = userMonths.filter((m) => bestMonths.includes(m)).sort((a, b) => a - b);
  const candidates = overlap.length > 0 ? overlap : [...userMonths].sort((a, b) => a - b);

  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (first === undefined || last === undefined) return null;

  return { startMonth: first, endMonth: last };
}

/**
 * Human-readable label for a travel window, e.g. "June – August".
 */
export function formatTravelWindow(window: TravelWindow): string {
  if (window.startMonth === window.endMonth) {
    return monthName(window.startMonth);
  }
  return `${monthName(window.startMonth)} – ${monthName(window.endMonth)}`;
}

/**
 * Returns a friendly list of month names from an array of month numbers.
 */
export function formatMonthList(months: number[]): string {
  return months.map(monthShort).join(', ');
}

// ─── Temperature helpers ──────────────────────────────────────────────────────

export type WeatherBand = 'hot' | 'warm' | 'mild' | 'cool' | 'cold';

/** Classify a temperature (°C) into a coarse weather band. */
export function tempBand(tempC: number): WeatherBand {
  if (tempC >= 30) return 'hot';
  if (tempC >= 22) return 'warm';
  if (tempC >= 14) return 'mild';
  if (tempC >= 5) return 'cool';
  return 'cold';
}

/** Weather preference → ideal °C range (inclusive). */
export const WEATHER_PREF_RANGES: Record<string, { min: number; max: number }> = {
  hot: { min: 28, max: 50 },
  warm: { min: 20, max: 32 },
  mild: { min: 13, max: 24 },
  cool: { min: 0, max: 18 },
  any: { min: -30, max: 50 },
};

/**
 * Score (0–100) for how well the average temperature across the user's
 * travel months matches their weather preference.
 */
export function weatherMatchScore(
  avgTempCByMonth: Partial<Record<number, number>>,
  travelMonths: number[],
  preference: string,
): number {
  const range = WEATHER_PREF_RANGES[preference];
  if (!range || preference === 'any') return 80;

  const temps = travelMonths
    .map((m) => avgTempCByMonth[m])
    .filter((t): t is number => t !== undefined);

  if (temps.length === 0) return 50;

  const scores = temps.map((t) => {
    if (t >= range.min && t <= range.max) return 100;
    const dist = t < range.min ? range.min - t : t - range.max;
    return Math.max(0, Math.round(100 - dist * 5));
  });

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
