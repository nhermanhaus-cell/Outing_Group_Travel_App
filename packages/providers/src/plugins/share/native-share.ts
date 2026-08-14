import { defineProviderPlugin } from '../../registry';
import type { ShareReq, ShareRes } from '../../interfaces';

/**
 * Calls the React Native Share API when available; gracefully degrades in
 * non-RN environments (e.g. Jest / Node) by logging and returning shared:false.
 */
export const shareNativeShare = defineProviderPlugin<ShareReq, ShareRes>({
  id: 'share:native-share',
  slot: 'share',
  label: 'Native Share',
  description: 'Invokes the device share sheet via React Native\'s Share API.',
  isMock: true,
  create() {
    return {
      async call(req) {
        // In a React Native context this would call Share.share(...)
        // Outside RN (e.g. web / tests) we fall back gracefully.
        if (
          typeof globalThis !== 'undefined' &&
          'navigator' in globalThis &&
          typeof (globalThis as { navigator?: { share?: unknown } }).navigator?.share === 'function'
        ) {
          const nav = (globalThis as unknown as {
            navigator: { share: (d: Record<string, string>) => Promise<void> };
          }).navigator;
          await nav.share({
            title: req.title,
            text: req.message,
            url: req.url ?? '',
          });
          return { shared: true, platform: 'web-share-api' };
        }
        return { shared: false };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
