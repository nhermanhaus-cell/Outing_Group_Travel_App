import { defineProviderPlugin } from '../../registry.js';
import type { NotificationsReq, NotificationsRes } from '../../interfaces.js';

export const notificationsNoop = defineProviderPlugin<NotificationsReq, NotificationsRes>({
  id: 'notifications:noop',
  slot: 'notifications',
  label: 'No-op Notifications',
  description: 'Silently discards all notification requests. Safe for development and testing.',
  isMock: true,
  create() {
    return {
      async call(_req) {
        return { sent: false };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
