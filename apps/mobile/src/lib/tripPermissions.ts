import type { LocalTrip } from '../providers/AppProviders';

export function canDeleteTrip(trip: LocalTrip, userId?: string | null): boolean {
  if (trip.localOnly || !userId) return true;
  const role = trip.members?.find((member) => member.id === userId)?.role;
  return role === 'owner' || role === 'organizer';
}

/**
 * Organizers can apply itinerary edits immediately. Local/guest trips are owned
 * by the person holding them on-device. For a shared remote trip, an unknown
 * role stays on the safe proposal path until membership has loaded.
 */
export function tripPlanChangeRequiresVote(
  trip: LocalTrip,
  userId?: string | null,
): boolean {
  const groupSize = Math.max(trip.travelers, trip.members?.length ?? 0);
  if (groupSize <= 1 || trip.localOnly || !userId) return false;
  const role = trip.members?.find((member) => member.id === userId)?.role;
  return role !== 'owner' && role !== 'organizer';
}
