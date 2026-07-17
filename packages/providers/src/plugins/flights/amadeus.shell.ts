import { defineProviderPlugin } from '../../registry.js';
import type { FlightsReq, FlightsRes } from '../../interfaces.js';

export const flightsAmadeusShell = defineProviderPlugin<FlightsReq, FlightsRes>({
  id: 'flights:amadeus',
  slot: 'flights',
  label: 'Amadeus Flights',
  description: 'Fetches live flight offers via the Amadeus for Developers API.',
  requiredEnv: ['AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<FlightsRes> {
        throw new Error('flights:amadeus — not configured');
      },
    };
  },
});
