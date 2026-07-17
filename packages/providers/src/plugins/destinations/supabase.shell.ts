import { defineProviderPlugin } from '../../registry.js';
import type { DestinationsReq, DestinationsRes } from '../../interfaces.js';

export const destinationsSupabaseShell = defineProviderPlugin<DestinationsReq, DestinationsRes>({
  id: 'destinations:supabase',
  slot: 'destinations',
  label: 'Supabase Destinations',
  description: 'Fetches destinations from the Supabase database.',
  requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<DestinationsRes> {
        throw new Error('destinations:supabase — not configured');
      },
    };
  },
});
