import type { Router } from 'expo-router';

export const TRIP_PLANNING_HOME_HREF = '/' as const;

export function exitTripPlanning(router: Pick<Router, 'dismissTo'>): void {
  router.dismissTo(TRIP_PLANNING_HOME_HREF);
}
