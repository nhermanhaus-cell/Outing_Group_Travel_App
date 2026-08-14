import { defineProviderPlugin } from '../../registry';
import type { MapsReq, MapsRes } from '../../interfaces';

/**
 * Stub that builds a geo: URI suitable for React Native MapView or a deep-link
 * to the platform's native maps app. No API key required.
 */
export const mapsRnMapsStub = defineProviderPlugin<MapsReq, MapsRes>({
  id: 'maps:rn-maps',
  slot: 'maps',
  label: 'React Native Maps Stub',
  description: 'Generates a geo: URI / deep-link for the device\'s native maps app.',
  isMock: true,
  create() {
    return {
      async call(req) {
        const { lat, lng } = req.coords;
        const zoom = req.zoom ?? 14;
        const mapUri = `geo:${lat},${lng}?z=${zoom}`;
        return { mapUri };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
