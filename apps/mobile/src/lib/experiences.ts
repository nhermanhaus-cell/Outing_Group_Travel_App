import experiencesSeed from '../../assets/seed/experiences.json';
import { getViatorApiKey } from './googlePlaces';

const PRODUCTS_SEARCH_URL = 'https://api.viator.com/partner/products/search';
const DESTINATIONS_URL = 'https://api.viator.com/partner/destinations';
const FREETEXT_URL = 'https://api.viator.com/partner/search/freetext';
const FALLBACK_SEARCH_URL = 'https://www.viator.com/searchResults/all?text=';

export interface MobileExperience {
  id: string;
  destinationSlug: string;
  title: string;
  summary: string;
  imageUrls: string[];
  durationHours?: number;
  priceFrom?: number;
  currency?: string;
  tags: string[];
  lgbtqRelevance?: string;
  lat?: number;
  lng?: number;
  provider: 'editorial' | 'viator' | 'getyourguide';
  affiliateUrl?: string;
  bookingMode: 'none' | 'external';
}

type SeedExperience = (typeof experiencesSeed)[number] & {
  priceFrom?: number;
  currency?: string;
  lat?: number;
  lng?: number;
  affiliateUrl?: string;
};
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
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

function editorial(destinationSlug: string, limit: number, asViator: boolean): MobileExperience[] {
  return (experiencesSeed as SeedExperience[])
    .filter((e) => e.destinationSlug === destinationSlug)
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      destinationSlug: e.destinationSlug,
      title: e.title,
      summary: e.summary,
      imageUrls: e.imageUrls ?? [],
      durationHours: e.durationHours,
      priceFrom: e.priceFrom,
      currency: e.currency,
      tags: e.tags ?? [],
      lgbtqRelevance: e.lgbtqRelevance,
      lat: e.lat,
      lng: e.lng,
      provider: asViator ? 'viator' : 'editorial',
      bookingMode: asViator ? 'external' : 'none',
      affiliateUrl: asViator
        ? `${FALLBACK_SEARCH_URL}${encodeURIComponent(`${slugToName(destinationSlug)} ${e.title}`)}`
        : e.affiliateUrl,
    }));
}

function mapProducts(raw: unknown[], destinationSlug: string, limit: number): MobileExperience[] {
  const destinationName = slugToName(destinationSlug);
  return raw
    .map((item, index): MobileExperience | null => {
      if (!isRecord(item)) return null;
      const title = pickString(item, ['title', 'productName', 'name']);
      if (!title) return null;
      const id =
        pickString(item, ['productCode', 'code', 'id']) ?? `viator-${destinationSlug}-${index}`;
      const summary =
        pickString(item, ['summary', 'description', 'shortDescription']) ??
        `Bookable experience in ${destinationName} via Viator.`;
      const affiliateUrl =
        pickString(item, ['productUrl', 'webURL', 'url']) ??
        `${FALLBACK_SEARCH_URL}${encodeURIComponent(`${destinationName} ${title}`)}`;
      const pricing = isRecord(item['pricing']) ? item['pricing'] : null;
      return {
        id: String(id),
        destinationSlug,
        title,
        summary,
        imageUrls: [],
        durationHours: pickNumber(item, ['durationHours', 'duration']),
        priceFrom:
          pickNumber(item, ['fromPrice', 'priceFrom', 'price']) ??
          (pricing ? pickNumber(pricing, ['fromPrice', 'price']) : undefined),
        currency:
          pickString(item, ['currency', 'currencyCode']) ??
          (pricing ? pickString(pricing, ['currency', 'currencyCode']) : undefined),
        tags: ['bookable', 'viator'],
        provider: 'viator',
        affiliateUrl,
        bookingMode: 'external',
      };
    })
    .filter((e): e is MobileExperience => e != null)
    .slice(0, limit);
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 5000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load experiences — live Viator Partner API when keyed, else editorial seed.
 */
export async function loadDestinationExperiences(
  destinationSlug: string,
  limit = 6,
): Promise<{ experiences: MobileExperience[]; source: 'viator_live' | 'editorial_fallback' }> {
  const apiKey = getViatorApiKey();
  if (!apiKey) {
    return { experiences: editorial(destinationSlug, limit, false), source: 'editorial_fallback' };
  }

  const destinationName = slugToName(destinationSlug);

  try {
    let destId: string | null = null;
    try {
      const destData = await fetchJson(DESTINATIONS_URL, { headers: authHeaders(apiKey) }, 4000);
      if (isRecord(destData)) {
        const list = Array.isArray(destData['destinations'])
          ? destData['destinations']
          : Array.isArray(destData['data'])
            ? destData['data']
            : [];
        const needle = destinationName.toLowerCase();
        for (const item of list) {
          if (!isRecord(item)) continue;
          const name = pickString(item, ['name', 'destinationName']);
          const id =
            pickString(item, ['destinationId', 'id']) ??
            (typeof item['destinationId'] === 'number' ? String(item['destinationId']) : undefined);
          if (name && id && name.toLowerCase().includes(needle.split(' ')[0]!)) {
            destId = id;
            break;
          }
        }
      }
    } catch {
      destId = null;
    }

    let products: unknown[] = [];
    if (destId) {
      const data = await fetchJson(
        PRODUCTS_SEARCH_URL,
        {
          method: 'POST',
          headers: authHeaders(apiKey),
          body: JSON.stringify({
            filtering: { destination: destId },
            sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
            pagination: { start: 1, count: limit },
            currency: 'USD',
          }),
        },
        5000,
      );
      if (isRecord(data)) {
        products = Array.isArray(data['products'])
          ? data['products']
          : Array.isArray(data['results'])
            ? data['results']
            : [];
      }
    }

    if (products.length === 0) {
      const data = await fetchJson(
        FREETEXT_URL,
        {
          method: 'POST',
          headers: authHeaders(apiKey),
          body: JSON.stringify({
            searchTerm: destinationName,
            searchTypes: ['PRODUCTS'],
            currency: 'USD',
            pagination: { start: 1, count: limit },
          }),
        },
        5000,
      );
      if (isRecord(data)) {
        products = Array.isArray(data['products'])
          ? data['products']
          : Array.isArray(data['results'])
            ? data['results']
            : [];
      }
    }

    const live = mapProducts(products, destinationSlug, limit);
    if (live.length > 0) {
      return { experiences: live, source: 'viator_live' };
    }
  } catch {
    // fall through
  }

  return { experiences: editorial(destinationSlug, limit, true), source: 'editorial_fallback' };
}
