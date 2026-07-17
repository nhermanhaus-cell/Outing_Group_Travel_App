import type { Trip } from '@gayi/shared';
import type { TripPublicPayload } from '../types.js';

/**
 * The keys of a Trip object that must never appear in a public payload.
 *
 * This list is exhaustive and explicit to prevent accidental disclosure when
 * new sensitive fields are added to the Trip type — add them here too.
 */
const SENSITIVE_KEYS: ReadonlyArray<keyof Trip> = [
  'lodgingAddress',
  'bookingConfirmations',
  'legalName',
  'sensitivePreferences',
  'userId',
];

/**
 * Strip all sensitive fields from a trip and return a safe public payload
 * suitable for display to other users.
 *
 * The function never mutates the original object.
 */
export function toTripPublicPayload(
  trip: Trip,
  destinationName: string,
): TripPublicPayload {
  // Parse year/month from startDate (YYYY-MM-DD)
  const [yearStr, monthStr] = trip.startDate.split('-');
  const travelYear = yearStr ? parseInt(yearStr, 10) : 0;
  const travelMonth = monthStr ? parseInt(monthStr, 10) : 0;

  const startMs = new Date(trip.startDate).getTime();
  const endMs = new Date(trip.endDate).getTime();
  const durationDays = Math.max(
    1,
    Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1,
  );

  return {
    tripId: trip.tripId,
    destinationSlug: trip.destinationSlug,
    destinationName,
    travelMonth,
    travelYear,
    durationDays,
    groupSize: trip.groupSize,
    highlights: trip.highlights ?? [],
    photoCount: trip.photoCount ?? 0,
  };
}

/**
 * Verify that a given object is a valid TripPublicPayload and contains no
 * sensitive keys. Returns `true` if the payload is clean, `false` otherwise.
 *
 * Use this as a guard before persisting or transmitting public trip data.
 */
export function isSafePublicPayload(payload: unknown): payload is TripPublicPayload {
  if (typeof payload !== 'object' || payload === null) return false;

  for (const key of SENSITIVE_KEYS) {
    if (key in payload) return false;
  }

  const p = payload as Record<string, unknown>;
  return (
    typeof p['tripId'] === 'string' &&
    typeof p['destinationSlug'] === 'string' &&
    typeof p['destinationName'] === 'string' &&
    typeof p['travelMonth'] === 'number' &&
    typeof p['travelYear'] === 'number' &&
    typeof p['durationDays'] === 'number' &&
    typeof p['groupSize'] === 'number' &&
    Array.isArray(p['highlights']) &&
    typeof p['photoCount'] === 'number'
  );
}
