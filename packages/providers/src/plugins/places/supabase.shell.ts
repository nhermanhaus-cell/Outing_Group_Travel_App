import { defineProviderPlugin } from '../../registry';
import type { PlacesReq, PlacesRes } from '../../interfaces';

export const placesSupabaseShell = defineProviderPlugin<PlacesReq, PlacesRes>({
  id: 'places:supabase',
  slot: 'places',
  label: 'Supabase Places',
  description: 'Fetches LGBTQ+ places from the Supabase database.',
  requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<PlacesRes> {
        throw new Error('places:supabase — not configured');
      },
    };
  },
});
