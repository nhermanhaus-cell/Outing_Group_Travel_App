import { defineProviderPlugin } from '../../registry.js';
import type { CurrencyReq, CurrencyRes } from '../../interfaces.js';

/** Static rates relative to USD for illustration. */
const RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  THB: 35.2,
  MXN: 17.1,
  JPY: 149.5,
  AUD: 1.53,
  CAD: 1.36,
  CHF: 0.89,
  BRL: 4.95,
};

function getRate(from: string, to: string): number {
  const f = RATES[from.toUpperCase()] ?? 1;
  const t = RATES[to.toUpperCase()] ?? 1;
  return t / f;
}

export const currencyMockRates = defineProviderPlugin<CurrencyReq, CurrencyRes>({
  id: 'currency:mock-rates',
  slot: 'currency',
  label: 'Mock Currency Rates',
  description: 'Returns static illustrative exchange rates for development.',
  isMock: true,
  create() {
    return {
      async call(req) {
        const rate = getRate(req.from, req.to);
        return {
          rate,
          convertedAmount: req.amount != null ? req.amount * rate : undefined,
          from: req.from.toUpperCase(),
          to: req.to.toUpperCase(),
          updatedAt: '2026-01-01T00:00:00Z',
        };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
