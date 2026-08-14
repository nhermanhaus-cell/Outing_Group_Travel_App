import experiencesSeed from '../../assets/seed/experiences.json';
import {
  invokeTravelApi,
  searchLocationImages,
  type ApiExperience,
  type ApiAttributedImage,
} from './travel-api';
import { isExactViatorProductUrl } from '@gayi/shared';
import { cleanExperienceText, compactExperienceSummary } from './experience-content';
export { isExactViatorProductUrl } from '@gayi/shared';

export interface MobileExperience {
  id: string;
  destinationSlug: string;
  title: string;
  summary: string;
  description?: string;
  imageUrls: string[];
  imageAttributions?: Array<{ text: string; url?: string } | undefined>;
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
  category?: ApiExperience['category'];
  address?: string;
  locationName?: string;
  confirmationType?: string;
  freeCancellation?: boolean;
  itinerary?: unknown;
  inclusions?: unknown;
  exclusions?: unknown;
  logistics?: unknown;
  cancellationPolicy?: unknown;
  availabilitySummary?: string[];
  availabilityStartTimes?: string[];
  bookingMode: 'none' | 'external';
}

export interface DestinationExperienceQuery {
  destinationSlug: string;
  destinationName: string;
  country: string;
  lat?: number;
  lng?: number;
  destinationType?: string;
  currency?: string;
  interests?: string[];
  searchTerm?: string;
  startDate?: string;
  endDate?: string;
  minPrice?: number;
  maxPrice?: number;
  maxDurationMinutes?: number;
  minRating?: number;
  preferFreeCancellation?: boolean;
  limit?: number;
  signal?: AbortSignal;
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

function editorial(destinationSlug: string, limit: number): MobileExperience[] {
  return (experiencesSeed as SeedExperience[])
    .filter((e) => e.destinationSlug === destinationSlug)
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      destinationSlug: e.destinationSlug,
      title: e.title,
      summary: e.summary,
      description: e.summary,
      imageUrls: e.imageUrls ?? [],
      imageAttributions: (e.imageUrls ?? []).map(() => ({ text: 'Photo via Unsplash' })),
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

function pexelsAttribution(
  image: ApiAttributedImage,
  destinationName: string,
): { text: string; url?: string } {
  const credit = `Photo by ${image.author ?? 'a Pexels contributor'} on Pexels`;
  return {
    text: image.matchType === 'destination_fallback'
      ? `${destinationName} fallback · ${credit}`
      : credit,
    url: image.sourcePage,
  };
}

async function enrichExperienceImages(
  experiences: MobileExperience[],
  destinationName: string,
): Promise<MobileExperience[]> {
  return Promise.all(experiences.map(async (experience, index) => {
    if (experience.provider === 'viator' && experience.imageUrls.length > 0) return experience;
    try {
      const result = await searchLocationImages({
        subject: experience.title,
        destination: destinationName,
        category: experience.tags.join(' '),
        kind: 'activity',
        limit: 4,
        variant: index,
      });
      if (result.images.length === 0) return experience;
      return {
        ...experience,
        imageUrls: result.images.map((image) => image.url),
        imageAttributions: result.images.map((image) => pexelsAttribution(image, destinationName)),
      };
    } catch {
      return experience;
    }
  }));
}

function mapApiExperience(item: ApiExperience, destinationSlug: string): MobileExperience {
  const productUrl = isExactViatorProductUrl(item.productUrl) ? item.productUrl : undefined;
  const fallbackDescription = `Bookable experience in ${slugToName(destinationSlug)} via Viator.`;
  const description = cleanExperienceText(item.description) ?? fallbackDescription;
  return {
    id: item.productCode,
    productCode: item.productCode,
    destinationSlug,
    title: item.title,
    summary: compactExperienceSummary(description, fallbackDescription),
    description,
    imageUrls: item.images.map((image) => image.url).slice(0, 5),
    durationHours:
      item.durationMinutes !== undefined ? Math.round((item.durationMinutes / 60) * 10) / 10 : undefined,
    durationMinutes: item.durationMinutes,
    priceFrom: item.priceFrom,
    currency: item.currency,
    rating: item.rating,
    reviewCount: item.reviewCount,
    tags: [...new Set(['bookable', 'viator', ...(item.interestTags ?? [])])],
    category: item.category,
    lat: item.lat,
    lng: item.lng,
    address: item.address,
    locationName: item.locationName,
    confirmationType: item.confirmationType,
    freeCancellation: item.freeCancellation,
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

export function experienceRouteSeed(experience: MobileExperience): string {
  const description = cleanExperienceText(experience.description ?? experience.summary);
  const seed: MobileExperience = {
    id: experience.id,
    destinationSlug: experience.destinationSlug,
    title: experience.title,
    summary: compactExperienceSummary(experience.summary, experience.title),
    ...(description ? { description: description.slice(0, 1_200) } : {}),
    imageUrls: experience.imageUrls.slice(0, 3),
    ...(experience.imageAttributions ? { imageAttributions: experience.imageAttributions.slice(0, 3) } : {}),
    ...(experience.durationHours !== undefined ? { durationHours: experience.durationHours } : {}),
    ...(experience.durationMinutes !== undefined ? { durationMinutes: experience.durationMinutes } : {}),
    ...(experience.priceFrom !== undefined ? { priceFrom: experience.priceFrom } : {}),
    ...(experience.currency ? { currency: experience.currency } : {}),
    tags: experience.tags.slice(0, 4),
    ...(experience.lat !== undefined ? { lat: experience.lat } : {}),
    ...(experience.lng !== undefined ? { lng: experience.lng } : {}),
    provider: experience.provider,
    ...(experience.affiliateUrl ? { affiliateUrl: experience.affiliateUrl } : {}),
    ...(experience.productCode ? { productCode: experience.productCode } : {}),
    ...(experience.productUrl ? { productUrl: experience.productUrl } : {}),
    ...(experience.rating !== undefined ? { rating: experience.rating } : {}),
    ...(experience.reviewCount !== undefined ? { reviewCount: experience.reviewCount } : {}),
    ...(experience.category ? { category: experience.category } : {}),
    ...(experience.address ? { address: experience.address } : {}),
    ...(experience.locationName ? { locationName: experience.locationName } : {}),
    ...(experience.confirmationType ? { confirmationType: experience.confirmationType } : {}),
    ...(experience.freeCancellation !== undefined ? { freeCancellation: experience.freeCancellation } : {}),
    bookingMode: experience.bookingMode,
  };
  return JSON.stringify(seed);
}

/**
 * Load destination-bound experiences through the server-only Viator proxy.
 * The server resolves the city against Viator's taxonomy before searching, so
 * similarly named destinations do not leak into one another's results.
 */
export async function loadDestinationExperiences(
  query: DestinationExperienceQuery,
): Promise<{ experiences: MobileExperience[]; source: 'viator_live' | 'editorial_fallback' }> {
  const {
    destinationSlug,
    destinationName,
    country,
    lat,
    lng,
    destinationType,
    currency = 'USD',
    interests = [],
    searchTerm,
    startDate,
    endDate,
    minPrice,
    maxPrice,
    maxDurationMinutes,
    minRating,
    preferFreeCancellation = true,
    limit = 8,
    signal,
  } = query;

  try {
    const result = await invokeTravelApi<{ products: ApiExperience[] }>('viatorSearch', {
      destination: destinationName,
      country,
      lat,
      lng,
      destinationType,
      interests: interests.slice(0, 4),
      searchTerm,
      startDate,
      endDate,
      minPrice,
      maxPrice,
      maxDurationMinutes,
      minRating,
      preferFreeCancellation,
      limit: Math.min(12, Math.max(1, limit)),
      currency,
    }, signal);
    const seen = new Set<string>();
    const live = result.products
      .map((product) => mapApiExperience(product, destinationSlug))
      .filter((product) => {
        if (seen.has(product.id)) return false;
        seen.add(product.id);
        return true;
      })
      .slice(0, limit);
    if (live.length > 0) {
      return {
        experiences: await enrichExperienceImages(live, destinationName),
        source: 'viator_live',
      };
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // fall through
  }

  return {
    experiences: await enrichExperienceImages(
      editorial(destinationSlug, limit),
      destinationName,
    ),
    source: 'editorial_fallback',
  };
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
    const withAvailability = {
      ...experience,
      availabilitySummary: summarizeAvailability(scheduleResult?.schedule),
      availabilityStartTimes: extractStartTimes(scheduleResult?.schedule),
    };
    return (await enrichExperienceImages([withAvailability], slugToName(destinationSlug)))[0] ?? withAvailability;
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
