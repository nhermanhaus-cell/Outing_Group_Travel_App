import { defineProviderPlugin } from '../../registry.js';
import type { LodgingReq, LodgingRes, LodgingBand } from '../../interfaces.js';

const BANDS: LodgingBand[] = [
  {
    label: 'Budget',
    minUsdPerNight: 30,
    maxUsdPerNight: 80,
    exampleProperties: ['Hostel BCN, HI Amsterdam', 'The Generator Hostels'],
    lgbtqWelcoming: true,
  },
  {
    label: 'Mid-range',
    minUsdPerNight: 80,
    maxUsdPerNight: 180,
    exampleProperties: ['Room Mate Hotels', 'citizenM', 'Axel Hotel (LGBTQ+)'],
    lgbtqWelcoming: true,
  },
  {
    label: 'Luxury',
    minUsdPerNight: 180,
    maxUsdPerNight: 500,
    exampleProperties: ['Hotel Arts Barcelona', 'Conservatorium Amsterdam'],
    lgbtqWelcoming: true,
  },
];

export const lodgingMockBands = defineProviderPlugin<LodgingReq, LodgingRes>({
  id: 'lodging:mock-bands',
  slot: 'lodging',
  label: 'Mock Lodging Bands',
  description: 'Returns illustrative price bands for lodging cost estimation.',
  isMock: true,
  create() {
    return {
      async call(_req) {
        return { bands: BANDS };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
