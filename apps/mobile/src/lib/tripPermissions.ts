import type { LocalTrip } from '../providers/AppProviders';

export function canDeleteTrip(trip: LocalTrip, userId?: string | null): boolean {
  if (trip.localOnly || !userId) return true;
  const role = trip.members?.find((member) => member.id === userId)?.role;
  return role === 'owner' || role === 'organizer';
}
