import { defineProviderPlugin } from '../../registry';
import type { EventsReq, EventsRes } from '../../interfaces';

export const eventsTicketmasterShell = defineProviderPlugin<EventsReq, EventsRes>({
  id: 'events:ticketmaster',
  slot: 'events',
  label: 'Ticketmaster Events',
  description: 'Fetches events via the Ticketmaster Discovery API.',
  requiredEnv: ['TICKETMASTER_API_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<EventsRes> {
        throw new Error('events:ticketmaster — not configured');
      },
    };
  },
});
