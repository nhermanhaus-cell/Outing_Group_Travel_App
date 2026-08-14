import { defineProviderPlugin, withTimeout } from '../../registry';
import type { Experience, ExperiencesReq, ExperiencesRes } from '../../interfaces';
import {
  fetchJsonWithTimeout,
  slugToDestinationName,
} from './shared';

const PRODUCTS_SEARCH_URL = 'https://api.viator.com/partner/products/search';
const DESTINATIONS_URL = 'https://api.viator.com/partner/destinations';
const FREETEXT_URL = 'https://api.viator.com/partner/search/freetext';
const TIMEOUT_MS = 8000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json;version=2.0',
    'Accept-Language': 'en-US',
    'Content-Type': 'application/json',
    'exp-api-key': apiKey,
  };
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

function mapProducts(rawProducts: unknown[], req: ExperiencesReq): Experience[] {
  const destinationName = slugToDestinationName(req.destinationSlug);
  return rawProducts
    .map((rawProduct, index): Experience | null => {
      if (!isRecord(rawProduct)) return null;
      const title = pickString(rawProduct, ['title', 'productName', 'name']);
      if (!title) return null;

      const id =
        pickString(rawProduct, ['productCode', 'code', 'id']) ??
        `viator-${req.destinationSlug}-${index}`;
      const summary =
        pickString(rawProduct, ['summary', 'description', 'shortDescription']) ??
        `Bookable experience in ${destinationName} via Viator.`;
      const imageUrls = extractImageUrls(rawProduct);
      const durationHours = pickNumber(rawProduct, ['durationHours', 'duration']);
      const pricing = isRecord(rawProduct['pricing']) ? rawProduct['pricing'] : null;
      const priceFrom =
        pickNumber(rawProduct, ['fromPrice', 'priceFrom', 'price']) ??
        (pricing ? pickNumber(pricing, ['summary', 'fromPrice', 'price']) : undefined);
      const currency =
        pickString(rawProduct, ['currency', 'currencyCode']) ??
        (pricing ? pickString(pricing, ['currency', 'currencyCode']) : undefined);
      const affiliateUrl = pickString(rawProduct, ['productUrl', 'webURL', 'url']);

      const reviews = isRecord(rawProduct['reviews']) ? rawProduct['reviews'] : null;
      const rating = reviews ? pickNumber(reviews, ['combinedAverageRating', 'averageRating']) : undefined;

      return {
        id: String(id),
        destinationSlug: req.destinationSlug,
        title,
        summary,
        imageUrls,
        ...(durationHours != null ? { durationHours } : {}),
        ...(priceFrom != null ? { priceFrom } : {}),
        ...(currency ? { currency } : {}),
        tags: ['bookable', 'viator', ...(rating && rating >= 4.5 ? ['highly_rated'] : [])],
        provider: 'viator',
        ...(affiliateUrl ? { affiliateUrl } : {}),
        bookingMode: affiliateUrl ? 'external' : 'none',
      };
    })
    .filter((experience): experience is Experience => experience != null)
    .slice(0, req.limit ?? 8);
}

async function resolveDestinationId(
  destinationName: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const data = await fetchJsonWithTimeout(
      DESTINATIONS_URL,
      { headers: authHeaders(apiKey) },
      4000,
    );
    if (!isRecord(data)) return null;
    const list = Array.isArray(data['destinations'])
      ? data['destinations']
      : Array.isArray(data['data'])
        ? data['data']
        : [];

    const needle = destinationName.toLowerCase();
    for (const item of list) {
      if (!isRecord(item)) continue;
      const name = pickString(item, ['name', 'destinationName', 'lookupId']);
      const id = pickString(item, ['destinationId', 'id', 'iataCode']) ??
        (typeof item['destinationId'] === 'number' ? String(item['destinationId']) : undefined);
      if (name && id && name.toLowerCase().includes(needle.split(',')[0]!.trim())) {
        return id;
      }
    }

    // Try city-only match (e.g. "San Francisco" from "San Francisco")
    const city = needle.replace(/\s+/g, ' ').trim();
    for (const item of list) {
      if (!isRecord(item)) continue;
      const name = pickString(item, ['name', 'destinationName']);
      const id =
        pickString(item, ['destinationId', 'id']) ??
        (typeof item['destinationId'] === 'number' ? String(item['destinationId']) : undefined);
      if (name && id && name.toLowerCase() === city) return id;
    }
  } catch {
    return null;
  }
  return null;
}

async function searchByDestinationId(
  destinationId: string,
  apiKey: string,
  limit: number,
): Promise<unknown[]> {
  const data = await fetchJsonWithTimeout(
    PRODUCTS_SEARCH_URL,
    {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        filtering: { destination: destinationId },
        sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
        pagination: { start: 1, count: limit },
        currency: 'USD',
      }),
    },
    5000,
  );
  if (!isRecord(data)) return [];
  if (Array.isArray(data['products'])) return data['products'];
  if (Array.isArray(data['results'])) return data['results'];
  return [];
}

async function searchFreetext(
  term: string,
  apiKey: string,
  limit: number,
): Promise<unknown[]> {
  const data = await fetchJsonWithTimeout(
    FREETEXT_URL,
    {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        searchTerm: term,
        searchTypes: ['PRODUCTS'],
        currency: 'USD',
        pagination: { start: 1, count: limit },
      }),
    },
    5000,
  );
  if (!isRecord(data)) return [];
  if (Array.isArray(data['products'])) return data['products'];
  if (Array.isArray(data['results'])) return data['results'];
  if (isRecord(data['products']) && Array.isArray((data['products'] as JsonRecord)['results'])) {
    return (data['products'] as JsonRecord)['results'] as unknown[];
  }
  return [];
}

export const experiencesViatorShell = defineProviderPlugin<ExperiencesReq, ExperiencesRes>({
  id: 'experiences:viator',
  slot: 'experiences',
  label: 'Viator Experiences',
  description:
    'Server-only Viator Partner API product search. Mobile discovery uses the authenticated travel-api Edge proxy.',
  requiredEnv: ['VIATOR_API_KEY'],
  async healthCheck() {
    return Boolean(process.env['VIATOR_API_KEY']);
  },
  create() {
    const inner = {
      async call(req: ExperiencesReq): Promise<ExperiencesRes> {
        const limit = req.limit ?? 6;
        const fallbackExperiences: Experience[] = [];
        const apiKey = process.env['VIATOR_API_KEY'];

        if (!apiKey) {
          return { experiences: fallbackExperiences };
        }

        const destinationName = slugToDestinationName(req.destinationSlug);

        try {
          const destId = await resolveDestinationId(destinationName, apiKey);
          let products: unknown[] = [];
          if (destId) {
            products = await searchByDestinationId(destId, apiKey, limit);
          }
          if (products.length === 0) {
            products = await searchFreetext(destinationName, apiKey, limit);
          }

          const liveExperiences = mapProducts(products, req);
          if (liveExperiences.length > 0) {
            return { experiences: liveExperiences };
          }
        } catch {
          // Fall through to editorial + affiliate search URLs
        }

        return { experiences: fallbackExperiences };
      },
    };

    return withTimeout(inner, TIMEOUT_MS);
  },
});
