import { defineProviderPlugin } from '../../registry';
import type { AnalyticsReq, AnalyticsRes } from '../../interfaces';

export const analyticsNoop = defineProviderPlugin<AnalyticsReq, AnalyticsRes>({
  id: 'analytics:noop',
  slot: 'analytics',
  label: 'No-op Analytics',
  description: 'Silently discards all events. Safe for development and testing.',
  isMock: true,
  create() {
    return {
      async call(req) {
        return {
          acceptedEventIds: req.events.map((event) => event.eventId),
          rejected: [],
        };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
