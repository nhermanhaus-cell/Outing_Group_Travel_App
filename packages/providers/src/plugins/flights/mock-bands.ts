import { defineProviderPlugin } from '../../registry';
import type { FlightsReq, FlightsRes, FlightBand } from '../../interfaces';

const BANDS: FlightBand[] = [
  { label: 'Budget', minUsd: 200,  maxUsd: 450,  typicalDurationHours: 10, airlines: ['Ryanair', 'easyJet', 'Vueling'],       stopCount: 1 },
  { label: 'Mid',    minUsd: 450,  maxUsd: 850,  typicalDurationHours: 9,  airlines: ['Iberia', 'KLM', 'Lufthansa'],           stopCount: 0 },
  { label: 'Premium',minUsd: 850,  maxUsd: 1800, typicalDurationHours: 9,  airlines: ['British Airways', 'Air France', 'Swiss'], stopCount: 0 },
];

export const flightsMockBands = defineProviderPlugin<FlightsReq, FlightsRes>({
  id: 'flights:mock-bands',
  slot: 'flights',
  label: 'Mock Flight Bands',
  description: 'Returns illustrative price bands for flight cost estimation.',
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
