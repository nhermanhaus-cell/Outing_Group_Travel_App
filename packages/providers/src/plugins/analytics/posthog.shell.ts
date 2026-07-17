import { defineProviderPlugin } from '../../registry.js';
import type { AnalyticsReq, AnalyticsRes } from '../../interfaces.js';

export const analyticsPosthogShell = defineProviderPlugin<AnalyticsReq, AnalyticsRes>({
  id: 'analytics:posthog',
  slot: 'analytics',
  label: 'PostHog Analytics',
  description: 'Tracks events via the PostHog SDK.',
  requiredEnv: ['POSTHOG_API_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<AnalyticsRes> {
        throw new Error('analytics:posthog — not configured');
      },
    };
  },
});
