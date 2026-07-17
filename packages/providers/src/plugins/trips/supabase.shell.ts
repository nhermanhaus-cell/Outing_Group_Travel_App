import { defineProviderPlugin } from '../../registry';
import type { TripsReq, TripsRes } from '../../interfaces';

export const tripsSupabaseShell = defineProviderPlugin<TripsReq, TripsRes>({
  id: 'trips:supabase',
  slot: 'trips',
  label: 'Supabase Trips',
  description: 'Syncs trips to the Supabase database for cross-device persistence.',
  requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<TripsRes> {
        throw new Error('trips:supabase — not configured');
      },
    };
  },
});
