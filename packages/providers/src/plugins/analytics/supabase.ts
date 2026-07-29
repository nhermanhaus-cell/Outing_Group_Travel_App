import { defineProviderPlugin } from '../../registry';
import type { AnalyticsReq, AnalyticsRes } from '../../interfaces';

const supabaseUrl =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? ''
    : '';
const supabaseAnonKey =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''
    : '';

export const analyticsSupabase = defineProviderPlugin<AnalyticsReq, AnalyticsRes>({
  id: 'analytics:supabase',
  slot: 'analytics',
  label: 'Outing analytics ingest',
  description: 'Sends validated event batches to the first-party Supabase Edge Function.',
  requiredEnv: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
  async healthCheck() {
    return Boolean(supabaseUrl && supabaseAnonKey);
  },
  create() {
    return {
      async call(request): Promise<AnalyticsRes> {
        const baseUrl = supabaseUrl.replace(/\/$/, '');
        const anonKey = supabaseAnonKey;
        if (!baseUrl || !anonKey) {
          return {
            acceptedEventIds: [],
            rejected: request.events.map((event) => ({
              eventId: event.eventId,
              reason: 'analytics_not_configured',
            })),
          };
        }

        const response = await fetch(`${baseUrl}/functions/v1/analytics-ingest`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${request.authorization || anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ events: request.events }),
        });
        if (!response.ok) {
          throw new Error(`Analytics ingest failed with HTTP ${response.status}`);
        }
        return await response.json() as AnalyticsRes;
      },
    };
  },
});
