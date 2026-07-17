import { defineProviderPlugin } from '../../registry.js';
import type { AuthReq, AuthRes } from '../../interfaces.js';

export const authSupabaseShell = defineProviderPlugin<AuthReq, AuthRes>({
  id: 'auth:supabase',
  slot: 'auth',
  label: 'Supabase Auth',
  description: 'Handles authentication via Supabase Auth (email, OAuth).',
  requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<AuthRes> {
        throw new Error('auth:supabase — not configured');
      },
    };
  },
});
