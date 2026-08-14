import { defineProviderPlugin } from '../../registry';
import type { EventInvitationReq, EventInvitationRes } from '../../interfaces';

/**
 * Partiful handoff: builds a deep-link URL to a pre-filled Partiful event
 * creation page. Partiful is a popular RSVP tool in queer social circles.
 * When Partiful's API becomes available, replace the URL builder with an
 * authenticated POST request.
 */
export const eventInvitationPartifulHandoff = defineProviderPlugin<EventInvitationReq, EventInvitationRes>({
  id: 'eventInvitation:partiful-handoff',
  slot: 'eventInvitation',
  label: 'Partiful Handoff',
  description: 'Opens Partiful with a pre-filled event for queer-friendly RSVP management.',
  isMock: true,
  create() {
    return {
      async call(req) {
        const params = new URLSearchParams({
          name: req.eventName,
          location: req.destinationSlug,
          startDate: req.startDate,
        });
        const url = `https://partiful.com/create?${params.toString()}`;
        return { url, platform: 'partiful' };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
