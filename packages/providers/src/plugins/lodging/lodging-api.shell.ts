import { defineProviderPlugin } from '../../registry.js';
import type { LodgingReq, LodgingRes } from '../../interfaces.js';

export const lodgingApiShell = defineProviderPlugin<LodgingReq, LodgingRes>({
  id: 'lodging:lodging-api',
  slot: 'lodging',
  label: 'Lodging API',
  description: 'Fetches live lodging availability via a configurable lodging API.',
  requiredEnv: ['LODGING_API_KEY', 'LODGING_API_URL'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<LodgingRes> {
        throw new Error('lodging:lodging-api — not configured');
      },
    };
  },
});
