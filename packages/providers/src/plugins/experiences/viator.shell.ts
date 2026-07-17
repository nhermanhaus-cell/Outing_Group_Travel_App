import { defineProviderPlugin, withTimeout } from '../../registry';
import type { Experience, ExperiencesReq, ExperiencesRes } from '../../interfaces';
import {
  buildExternalFallbackExperiences,
  fetchJsonWithTimeout,
  slugToDestinationName,
} from './shared';

const SEARCH_URL = 'https://api.viator.com/partner/products/search';
const FALLBACK_SEARCH_URL = 'https://www.viator.com/searchResults/all?text=';
const TIMEOUT_MS = 5000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function extractImageUrls(record: JsonRecord): string[] {
  const candidates = record['images'];
  if (!Array.isArray(candidates)) return [];

  const urls = candidates.flatMap((image) => {
    if (typeof image === 'string' && image) return [image];
    if (!isRecord(image)) return [];

    const direct = pickString(image, ['url', 'src']);
    if (direct) return [direct];

    const variants = image['variants'];
    if (!Array.isArray(variants)) return [];

    return variants.flatMap((variant) => {
      if (!isRecord(variant)) return [];
      const variantUrl = pickString(variant, ['url', 'src']);
      return variantUrl ? [variantUrl] : [];
    });
  });

  return urls.filter(Boolean).slice(0, 3);
}

function mapViatorResults(data: unknown, req: ExperiencesReq): Experience[] {
  if (!isRecord(data)) return [];

  const rawProducts = Array.isArray(data['products'])
    ? data['products']
    : Array.isArray(data['results'])
      ? data['results']
      : [];

  const destinationName = slugToDestinationName(req.destinationSlug);

  return rawProducts
    .map((rawProduct, index): Experience | null => {
      if (!isRecord(rawProduct)) return null;

      const title = pickString(rawProduct, ['title', 'productName', 'name']);
      if (!title) return null;

      const id = pickString(rawProduct, ['productCode', 'code', 'id']) ?? `viator-${req.destinationSlug}-${index}`;
      const summary =
        pickString(rawProduct, ['summary', 'description', 'shortDescription']) ??
        `Live Viator inventory for ${destinationName} is available through the provider search flow.`;
      const imageUrls = extractImageUrls(rawProduct);
      const durationHours = pickNumber(rawProduct, ['durationHours', 'duration']);
      const priceFrom = pickNumber(rawProduct, ['fromPrice', 'priceFrom', 'price']);
      const currency = pickString(rawProduct, ['currency', 'currencyCode']);
      const affiliateUrl =
        pickString(rawProduct, ['productUrl', 'webURL', 'url']) ??
        `${FALLBACK_SEARCH_URL}${encodeURIComponent(`${destinationName} ${title}`)}`;

      return {
        id: String(id),
        destinationSlug: req.destinationSlug,
        title,
        summary,
        imageUrls,
        ...(durationHours != null ? { durationHours } : {}),
        ...(priceFrom != null ? { priceFrom } : {}),
        ...(currency ? { currency } : {}),
        tags: ['bookable', 'viator'],
        provider: 'viator',
        affiliateUrl,
        bookingMode: 'external',
      };
    })
    .filter((experience): experience is Experience => experience != null)
    .slice(0, req.limit ?? rawProducts.length);
}

export const experiencesViatorShell = defineProviderPlugin<ExperiencesReq, ExperiencesRes>({
  id: 'experiences:viator',
  slot: 'experiences',
  label: 'Viator Experiences',
  description:
    'Uses the Viator partner search endpoint when available and otherwise falls back ' +
    'to curated editorial experiences linked to Viator search results.',
  requiredEnv: ['VIATOR_API_KEY'],
  async healthCheck() {
    return Boolean(process.env['VIATOR_API_KEY']);
  },
  create() {
    const inner = {
      async call(req: ExperiencesReq): Promise<ExperiencesRes> {
        const fallbackExperiences = buildExternalFallbackExperiences(
          req,
          'viator',
          FALLBACK_SEARCH_URL,
        );
        const apiKey = process.env['VIATOR_API_KEY'];

        if (!apiKey) {
          return { experiences: fallbackExperiences };
        }

        try {
          const url = new URL(SEARCH_URL);
          url.searchParams.set('text', slugToDestinationName(req.destinationSlug));
          if (req.limit != null) {
            url.searchParams.set('count', String(req.limit));
          }

          const data = await fetchJsonWithTimeout(
            url.toString(),
            {
              headers: {
                Accept: 'application/json',
                'exp-api-key': apiKey,
              },
            },
            3500,
          );

          const liveExperiences = mapViatorResults(data, req);
          if (liveExperiences.length > 0) {
            return { experiences: liveExperiences };
          }
        } catch {
          // Phase 1 fallback keeps the provider deterministic when the live search
          // contract or network path is unavailable.
        }

        return { experiences: fallbackExperiences };
      },
    };

    return withTimeout(inner, TIMEOUT_MS);
  },
});
