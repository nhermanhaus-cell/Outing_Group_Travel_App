import { defineProviderPlugin } from '../../registry.js';
import type { AnalyticsReq, AnalyticsRes } from '../../interfaces.js';

export const analyticsNoop = defineProviderPlugin<AnalyticsReq, AnalyticsRes>({
  id: 'analytics:noop',
  slot: 'analytics',
  label: 'No-op Analytics',
  description: 'Silently discards all events. Safe for development and testing.',
  isMock: true,
  create() {
    return {
      async call(_req) {
        return { tracked: false };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
