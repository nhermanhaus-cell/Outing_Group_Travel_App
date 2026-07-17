import { defineProviderPlugin } from '../../registry';
import type { TripsReq, TripsRes } from '../../interfaces';
import type { Trip } from '@gayi/shared';

/**
 * In-memory trip store that mirrors an AsyncStorage interface.
 * Data is keyed by tripId and survives only for the process lifetime.
 */
const store = new Map<string, Trip>();

export const tripsLocalDraft = defineProviderPlugin<TripsReq, TripsRes>({
  id: 'trips:local-draft',
  slot: 'trips',
  label: 'Local Draft Trips',
  description: 'Persists trips in-memory (or AsyncStorage in RN) for offline-first use.',
  isMock: true,
  create() {
    return {
      async call(req): Promise<TripsRes> {
        if (req.action === 'get') {
          if (req.tripId) {
            const trip = store.get(req.tripId);
            return { action: 'get', trips: trip ? [trip] : [] };
          }
          const trips = [...store.values()].filter((t) => t.userId === req.userId);
          return { action: 'get', trips };
        }
        if (req.action === 'save') {
          store.set(req.trip.tripId, req.trip);
          return { action: 'save', trip: req.trip };
        }
        // delete
        store.delete(req.tripId);
        return { action: 'delete', success: true };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
