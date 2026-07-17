import { defineProviderPlugin } from '../../registry.js';
import type { EventsReq, EventsRes } from '../../interfaces.js';

export const eventsSupabaseShell = defineProviderPlugin<EventsReq, EventsRes>({
  id: 'events:supabase',
  slot: 'events',
  label: 'Supabase Events',
  description: 'Fetches events from the Supabase database.',
  requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<EventsRes> {
        throw new Error('events:supabase — not configured');
      },
    };
  },
});
