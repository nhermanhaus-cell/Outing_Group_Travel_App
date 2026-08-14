import { defineProviderPlugin } from '../../registry';
import type { EventsReq, EventsRes, LocalEvent } from '../../interfaces';

const SEED: LocalEvent[] = [
  {
    eventId: 'bcn-pride-2026',
    name: 'Barcelona Pride',
    destinationSlug: 'barcelona-es',
    startDate: '2026-06-20',
    endDate: '2026-06-28',
    type: 'pride',
    venue: 'Eixample / Passeig de Gràcia',
    ticketUrl: 'https://pridebarcelona.org',
    lgbtqFocused: true,
  },
  {
    eventId: 'ams-pride-2026',
    name: 'Amsterdam Pride',
    destinationSlug: 'amsterdam-nl',
    startDate: '2026-07-31',
    endDate: '2026-08-09',
    type: 'pride',
    venue: 'Canal Parade & Vondelpark',
    ticketUrl: 'https://amsterdampride.nl',
    lgbtqFocused: true,
  },
  {
    eventId: 'ber-csd-2026',
    name: 'Berlin CSD',
    destinationSlug: 'berlin-de',
    startDate: '2026-07-19',
    endDate: '2026-07-26',
    type: 'pride',
    ticketUrl: 'https://csd-berlin.de',
    lgbtqFocused: true,
  },
  {
    eventId: 'mex-pride-2026',
    name: 'Mexico City Pride',
    destinationSlug: 'mexico-city-mx',
    startDate: '2026-06-27',
    type: 'pride',
    lgbtqFocused: true,
  },
];

export const eventsMockSeed = defineProviderPlugin<EventsReq, EventsRes>({
  id: 'events:mock-seed',
  slot: 'events',
  label: 'Mock Seed Events',
  description: 'In-memory seed events for development and testing.',
  isMock: true,
  create() {
    return {
      async call(req) {
        let results = SEED.filter((e) => e.destinationSlug === req.destinationSlug);
        if (req.months?.length) {
          results = results.filter((e) => {
            const month = new Date(e.startDate).getMonth() + 1;
            return req.months!.includes(month);
          });
        }
        return { events: req.limit != null ? results.slice(0, req.limit) : results };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
