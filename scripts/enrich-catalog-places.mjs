import { placeMetadataCompleteness, placeSourceIds } from './lib/place-intelligence.mjs';

const dryRun = process.argv.includes('--dry-run');
const all = process.argv.includes('--all');
const requestedLimit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1]);
const limit = all ? Number.POSITIVE_INFINITY : Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, requestedLimit)) : 25;
const projectUrl = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!projectUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function request(path, init = {}) {
  const response = await fetch(`${projectUrl}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

function words(value) {
  return new Set(String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((item) => item.length > 1));
}

function nameScore(left, right) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(a.size, b.size);
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stale(value, days = 30) {
  const timestamp = Date.parse(String(value ?? ''));
  return !Number.isFinite(timestamp) || Date.now() - timestamp > days * 86_400_000;
}

const [destinations, places] = await Promise.all([
  request('/rest/v1/destinations?select=id,slug,name,country,lat,lng&published=eq.true&deleted_at=is.null&limit=500'),
  request('/rest/v1/places?select=*&published=eq.true&deleted_at=is.null&order=metadata_completeness.asc&limit=1000'),
]);
const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
const candidates = places.filter((place) =>
  destinationById.has(place.destination_id)
  && (
    Number(place.metadata_completeness ?? 0) < 0.8
    || stale(place.verified_at)
    || !Array.isArray(record(place.payload).photos)
    || record(place.payload).photos.length === 0
  )).slice(0, limit);

if (dryRun) {
  console.log(`Would enrich ${candidates.length} of ${places.length} approved place records${all ? '' : ` (limit ${limit})`}. No provider calls or writes performed.`);
  process.exit(0);
}

let updated = 0;
let unmatched = 0;
let failed = 0;
for (const place of candidates) {
  const destination = destinationById.get(place.destination_id);
  const query = [place.name, place.address, destination.name, destination.country].filter(Boolean).join(', ');
  try {
    const result = await request('/functions/v1/travel-api', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'placeIntelligenceSearch',
        query,
        limit: 3,
        ...(typeof destination.lat === 'number' && typeof destination.lng === 'number'
          ? { lat: destination.lat, lng: destination.lng, radiusMeters: 30_000 }
          : {}),
      }),
    });
    const matches = Array.isArray(result.places) ? result.places : [];
    const provider = matches
      .map((item) => ({ item, score: nameScore(place.name, item.name) }))
      .sort((left, right) => right.score - left.score)[0];
    if (!provider || provider.score < 0.6) {
      unmatched += 1;
      console.log(`No confident provider identity match for ${place.name}`);
      continue;
    }
    const currentPayload = record(place.payload);
    const richPlace = {
      ...currentPayload,
      providerPlaceId: provider.item.providerPlaceId,
      primaryType: provider.item.primaryType ?? currentPayload.primaryType ?? place.primary_type,
      rating: provider.item.rating,
      reviewCount: provider.item.reviewCount,
      priceLevel: provider.item.priceLevel,
      businessStatus: provider.item.businessStatus,
      openingHours: provider.item.openingHours,
      weekdayDescriptions: provider.item.weekdayDescriptions,
      currentWeekdayDescriptions: provider.item.currentWeekdayDescriptions,
      openNow: provider.item.openNow,
      accessibilityOptions: provider.item.accessibilityOptions,
      attributes: provider.item.attributes,
      photos: Array.isArray(provider.item.photos) ? provider.item.photos.slice(0, 5) : [],
      googleMapsUri: provider.item.googleMapsUri,
      websiteUri: provider.item.websiteUri,
      verifiedAt: provider.item.verifiedAt,
    };
    const sourceIds = placeSourceIds(richPlace, Array.isArray(place.source_ids) ? place.source_ids : []);
    await request(`/rest/v1/places?id=eq.${encodeURIComponent(place.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        provider_place_id: richPlace.providerPlaceId ?? null,
        primary_type: richPlace.primaryType ?? null,
        rating: richPlace.rating ?? null,
        review_count: richPlace.reviewCount ?? null,
        price_level: richPlace.priceLevel ?? null,
        business_status: richPlace.businessStatus ?? null,
        opening_hours: {
          periods: richPlace.openingHours ?? [],
          weekdayDescriptions: richPlace.weekdayDescriptions ?? [],
          currentWeekdayDescriptions: richPlace.currentWeekdayDescriptions ?? [],
          openNow: richPlace.openNow,
        },
        attributes: {
          ...(record(richPlace.attributes)),
          accessibilityOptions: record(richPlace.accessibilityOptions),
        },
        website_uri: richPlace.websiteUri ?? null,
        google_maps_uri: richPlace.googleMapsUri ?? null,
        source_ids: sourceIds,
        verified_at: richPlace.verifiedAt ?? new Date().toISOString(),
        metadata_completeness: placeMetadataCompleteness(richPlace),
        payload: richPlace,
        updated_at: new Date().toISOString(),
      }),
    });
    updated += 1;
    console.log(`Enriched ${place.name}`);
  } catch (error) {
    failed += 1;
    console.error(`Could not enrich ${place.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

console.log(`Place enrichment complete: ${updated} updated, ${unmatched} unmatched, ${failed} failed.`);
if (failed) process.exitCode = 1;
