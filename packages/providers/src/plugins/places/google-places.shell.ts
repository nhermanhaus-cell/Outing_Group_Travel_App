import { defineProviderPlugin } from '../../registry.js';
import type { PlacesReq, PlacesRes } from '../../interfaces.js';

export const placesGoogleShell = defineProviderPlugin<PlacesReq, PlacesRes>({
  id: 'places:google-places',
  slot: 'places',
  label: 'Google Places',
  description: 'Fetches places via the Google Places API.',
  requiredEnv: ['GOOGLE_PLACES_API_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<PlacesRes> {
        throw new Error('places:google-places — not configured');
      },
    };
  },
});
