import experiencesSeed from '../../assets/seed/experiences.json';
import { invokeTravelApi, type ApiExperience } from './travel-api';
import { isExactViatorProductUrl } from '@gayi/shared';
export { isExactViatorProductUrl } from '@gayi/shared';

const PRODUCTS_SEARCH_URL = 'https://api.viator.com/partner/products/search';
const DESTINATIONS_URL = 'https://api.viator.com/partner/destinations';
const FREETEXT_URL = 'https://api.viator.com/partner/search/freetext';

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
  productCode?: string;
  productUrl?: string;
  rating?: number;
  reviewCount?: number;
  durationMinutes?: number;
  itinerary?: unknown;
  inclusions?: unknown;
  exclusions?: unknown;
  logistics?: unknown;
  cancellationPolicy?: unknown;
  availabilitySummary?: string[];
  availabilityStartTimes?: string[];
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
      provider: 'editorial',
      bookingMode: 'none',
      affiliateUrl: e.affiliateUrl,
    }));
}

function mapApiExperience(item: ApiExperience, destinationSlug: string): MobileExperience {
  const productUrl = isExactViatorProductUrl(item.productUrl) ? item.productUrl : undefined;
  return {
    id: item.productCode,
    productCode: item.productCode,
    destinationSlug,
    title: item.title,
    summary: item.description ?? `Bookable experience in ${slugToName(destinationSlug)} via Viator.`,
    imageUrls: item.images.map((image) => image.url).slice(0, 5),
    durationHours:
      item.durationMinutes !== undefined ? Math.round((item.durationMinutes / 60) * 10) / 10 : undefined,
    durationMinutes: item.durationMinutes,
    priceFrom: item.priceFrom,
    currency: item.currency,
    rating: item.rating,
    reviewCount: item.reviewCount,
    tags: ['bookable', 'viator'],
    provider: 'viator',
    productUrl,
    affiliateUrl: productUrl,
    bookingMode: productUrl ? 'external' : 'none',
    itinerary: item.itinerary,
    inclusions: item.inclusions,
    exclusions: item.exclusions,
    logistics: item.logistics,
    cancellationPolicy: item.cancellationPolicy,
  };
}


function extractImageUrls(item: JsonRecord): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.startsWith('http') && !urls.includes(value)) {
      urls.push(value);
    }
  };

  const images = item['images'];
  if (Array.isArray(images)) {
    for (const image of images) {
      if (!isRecord(image)) {
        push(image);
        continue;
      }
      push(image['url']);
      push(image['src']);
      push(image['photoURL']);
      const variants = image['variants'];
      if (Array.isArray(variants)) {
        // Prefer larger variants when present.
        const sorted = [...variants].sort((a, b) => {
          const aw = isRecord(a) && typeof a['width'] === 'number' ? a['width'] : 0;
          const bw = isRecord(b) && typeof b['width'] === 'number' ? b['width'] : 0;
          return bw - aw;
        });
        for (const variant of sorted) {
          if (isRecord(variant)) push(variant['url']);
        }
      }
    }
  }

  push(item['image']);
  push(item['imageUrl']);
  push(item['thumbnailURL']);
  return urls.slice(0, 4);
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
      const affiliateUrl = pickString(item, ['productUrl', 'webURL', 'url']);
      const pricing = isRecord(item['pricing']) ? item['pricing'] : null;
      const product = isRecord(item['product']) ? item['product'] : item;
      return {
        id: String(id),
        destinationSlug,
        title,
        summary,
        imageUrls: extractImageUrls(product),
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
        bookingMode: affiliateUrl ? 'external' : 'none',
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
  interests: string[] = [],
): Promise<{ experiences: MobileExperience[]; source: 'viator_live' | 'editorial_fallback' }> {
  const destinationName = slugToName(destinationSlug);

  try {
    const buckets = [[], ...interests.slice(0, 4).map((interest) => [interest])];
    const results = await Promise.all(buckets.map((bucket) => invokeTravelApi<{ products: ApiExperience[] }>('viatorSearch', {
      destination: destinationName,
      interests: bucket,
      limit: 6,
      currency: 'USD',
    }).catch(() => ({ products: [] }))));
    const seen = new Set<string>();
    const live = results.flatMap((result) => result.products)
      .map((product) => mapApiExperience(product, destinationSlug))
      .filter((product) => {
        if (seen.has(product.id)) return false;
        seen.add(product.id);
        return true;
      })
      .slice(0, Math.min(12, Math.max(8, limit)));
    if (live.length > 0) {
      const enriched = await Promise.all(live.map(async (experience, index) => {
        if (index >= 8 || !experience.productCode) return experience;
        const schedule = await invokeTravelApi<{ schedule: unknown }>('viatorSchedule', { productCode: experience.productCode }).catch(() => null);
        return schedule ? { ...experience, availabilitySummary: summarizeAvailability(schedule.schedule), availabilityStartTimes: extractStartTimes(schedule.schedule) } : experience;
      }));
      return { experiences: enriched, source: 'viator_live' };
    }
  } catch {
    // fall through
  }

  return { experiences: editorial(destinationSlug, limit, false), source: 'editorial_fallback' };
}

export async function loadExperienceDetails(
  destinationSlug: string,
  productCode: string,
): Promise<MobileExperience | null> {
  try {
    const [productResult, scheduleResult] = await Promise.all([
      invokeTravelApi<{ product: ApiExperience | null }>('viatorProduct', { productCode }),
      invokeTravelApi<{ schedule: unknown }>('viatorSchedule', { productCode }).catch(() => null),
    ]);
    if (!productResult.product) return null;
    const experience = mapApiExperience(productResult.product, destinationSlug);
    return {
      ...experience,
      availabilitySummary: summarizeAvailability(scheduleResult?.schedule),
      availabilityStartTimes: extractStartTimes(scheduleResult?.schedule),
    };
  } catch {
    return null;
  }
}

function extractStartTimes(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || found.size >= 12) return;
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (/starttime/i.test(key) && typeof child === 'string' && /^\d{2}:\d{2}$/.test(child)) found.add(child);
      else visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return Array.from(found).sort();
}

function summarizeAvailability(schedule: unknown): string[] {
  if (!isRecord(schedule) || !Array.isArray(schedule['bookableItems'])) return [];
  const summaries: string[] = [];
  for (const item of schedule['bookableItems'].slice(0, 3)) {
    if (!isRecord(item) || !Array.isArray(item['seasons'])) continue;
    for (const season of item['seasons'].slice(0, 2)) {
      if (!isRecord(season)) continue;
      const start = pickString(season, ['startDate']);
      const end = pickString(season, ['endDate']);
      if (start) summaries.push(end ? `${start} – ${end}` : `From ${start}`);
    }
  }
  return Array.from(new Set(summaries)).slice(0, 4);
}
