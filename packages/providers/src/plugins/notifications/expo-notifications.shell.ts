import { defineProviderPlugin } from '../../registry.js';
import type { NotificationsReq, NotificationsRes } from '../../interfaces.js';

export const notificationsExpoShell = defineProviderPlugin<NotificationsReq, NotificationsRes>({
  id: 'notifications:expo',
  slot: 'notifications',
  label: 'Expo Notifications',
  description: 'Sends push notifications via Expo Push Notification service.',
  requiredEnv: ['EXPO_ACCESS_TOKEN'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<NotificationsRes> {
        throw new Error('notifications:expo — not configured');
      },
    };
  },
});
