import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth, useTrips } from '../../src/providers/AppProviders';
import { cleanupExpiredTripAwareness, refreshTripAwareness, syncPrivateVisitEvents } from '../../src/lib/trip-awareness';

export function TripAwarenessCoordinator() {
  const { trips } = useTrips();
  const { user } = useAuth();

  useEffect(() => {
    const reconcile = async () => {
      await cleanupExpiredTripAwareness(trips, user?.id);
      await refreshTripAwareness(trips);
      await syncPrivateVisitEvents();
    };
    void reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reconcile();
      }
    });
    return () => subscription.remove();
  }, [trips, user?.id]);
  return null;
}
