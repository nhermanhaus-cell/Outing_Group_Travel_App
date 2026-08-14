/**
 * Live Equaldex API shell — DISABLED until a commercial license is obtained.
 *
 * Equaldex API terms are non-commercial-only by default. Do not enable this
 * plugin in production without a paid commercial license.
 *
 * Gate: EQUALDEX_API_KEY must be set AND GAYI_ENABLE_EQUALDEX_LIVE=1.
 * Even then, healthCheck returns false unless both are present — registry
 * will keep equaldex-cited / mock active.
 *
 * Prefer lgbtqContext:equaldex-cited for MVP.
 */

import { defineProviderPlugin } from '../../registry';
import type { LgbtqContextReq, LgbtqContextRes } from '../../interfaces';

function liveEnabled(): boolean {
  return (
    process.env.GAYI_ENABLE_EQUALDEX_LIVE === '1' &&
    Boolean(process.env.EQUALDEX_API_KEY)
  );
}

export const lgbtqContextEqualdexApiShell = defineProviderPlugin<
  LgbtqContextReq,
  LgbtqContextRes
>({
  id: 'lgbtqContext:equaldex-api',
  slot: 'lgbtqContext',
  label: 'Equaldex API (license required)',
  description:
    'Live Equaldex Equality Index API. Feature-flagged OFF until commercial license. Use equaldex-cited instead.',
  isMock: false,
  requiredEnv: ['EQUALDEX_API_KEY'],
  create() {
    return {
      async call() {
        throw new Error(
          'lgbtqContext:equaldex-api — live Equaldex calls are disabled. ' +
            'Obtain a commercial license, then set GAYI_ENABLE_EQUALDEX_LIVE=1 and EQUALDEX_API_KEY. ' +
            'Until then use lgbtqContext:equaldex-cited.',
        );
      },
    };
  },
  async healthCheck() {
    // Always fail unless explicitly licensed + keyed — keeps registry on cited/mock.
    if (!liveEnabled()) return false;
    return false; // Still no live implementation without license work
  },
});
