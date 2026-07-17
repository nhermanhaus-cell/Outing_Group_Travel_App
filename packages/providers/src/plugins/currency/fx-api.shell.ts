import { defineProviderPlugin } from '../../registry';
import type { CurrencyReq, CurrencyRes } from '../../interfaces';

export const currencyFxApiShell = defineProviderPlugin<CurrencyReq, CurrencyRes>({
  id: 'currency:fx-api',
  slot: 'currency',
  label: 'FX API',
  description: 'Fetches live exchange rates via a configurable FX/currency API.',
  requiredEnv: ['FX_API_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<CurrencyRes> {
        throw new Error('currency:fx-api — not configured');
      },
    };
  },
});
