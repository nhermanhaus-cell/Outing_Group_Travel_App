import { defineProviderPlugin } from '../../registry';
import type { ImagesReq, ImagesRes } from '../../interfaces';

const PLACEHOLDER_BASE = 'https://placehold.co';

/** Builds deterministic placeholder image URLs with destination-aware colours. */
function placeholderUrl(
  width: number,
  height: number,
  slug: string | undefined,
  index: number,
): string {
  const palettes: [string, string][] = [
    ['FF6B9D', 'fff'], // pink
    ['9B59B6', 'fff'], // purple
    ['3498DB', 'fff'], // blue
    ['E91E63', 'fff'], // magenta
    ['00BCD4', 'fff'], // cyan
  ];
  const [bg, fg] = palettes[(index + (slug?.charCodeAt(0) ?? 0)) % palettes.length]!;
  const label = slug ? encodeURIComponent(slug.split('-')[0] ?? slug) : 'gayi';
  return `${PLACEHOLDER_BASE}/${width}x${height}/${bg}/${fg}?text=${label}`;
}

export const imagesRemotePlaceholder = defineProviderPlugin<ImagesReq, ImagesRes>({
  id: 'images:remote-placeholder',
  slot: 'images',
  label: 'Remote Placeholder Images',
  description: 'Returns colourful placeholder images. Replace with a real CDN/Unsplash integration.',
  isMock: true,
  create() {
    return {
      async call(req) {
        const count = req.count ?? 3;
        const w = req.width ?? 800;
        const h = req.height ?? 600;
        const images = Array.from({ length: count }, (_, i) => ({
          url: placeholderUrl(w, h, req.destinationSlug ?? req.query, i),
          altText: req.destinationSlug ?? req.query ?? 'Outing destination',
        }));
        return { images };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
