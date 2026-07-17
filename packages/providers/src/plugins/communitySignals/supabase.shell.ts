import { defineProviderPlugin } from '../../registry.js';
import type { CommunitySignalsReq, CommunitySignalsRes } from '../../interfaces.js';

export const communitySignalsSupabaseShell = defineProviderPlugin<CommunitySignalsReq, CommunitySignalsRes>({
  id: 'communitySignals:supabase',
  slot: 'communitySignals',
  label: 'Supabase Community Signals',
  description: 'Reads live community signals (checkins, activity) from Supabase.',
  requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<CommunitySignalsRes> {
        throw new Error('communitySignals:supabase — not configured');
      },
    };
  },
});
