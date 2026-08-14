import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DESTINATION_EXPANSION } from '../fixtures/catalog/destination-expansion.mjs';

const ROOT = process.cwd();
const ENRICHMENT_PATH = resolve(ROOT, 'fixtures/catalog/destination-provider-enrichment.json');
const apply = process.argv.includes('--apply');
const skipGoogle = process.argv.includes('--skip-google');
const resume = process.argv.includes('--resume');
const requestedWave = process.argv.find((argument) => argument.startsWith('--wave='))?.split('=')[1];
const requestedSlug = process.argv.find((argument) => argument.startsWith('--slug='))?.split('=')[1];
const allowedWaves = new Set(['lgbtq_priority', 'global_popular']);
const googleKey = process.env.GOOGLE_PLACES_API_KEY;
const pexelsKey = process.env.PEXELS_API_KEY;
const supabaseUrl = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useTravelApiProxy = Boolean(supabaseUrl && supabaseServiceRoleKey);

if (requestedWave && !allowedWaves.has(requestedWave)) {
  throw new Error(`Unknown wave "${requestedWave}". Use lgbtq_priority or global_popular.`);
}

const selected = DESTINATION_EXPANSION.filter((destination) =>
  (!requestedWave || destination.wave === requestedWave)
  && (!requestedSlug || destination.slug === requestedSlug));
if (!selected.length) throw new Error('No destinations matched the requested hydration scope.');
if (!apply) {
  console.log(`Provider hydration dry run: ${selected.length} destination(s).`);
  console.log('No provider requests or file writes were made. Re-run with --apply after configuring GOOGLE_PLACES_API_KEY and PEXELS_API_KEY.');
  process.exit(0);
}
if ((!skipGoogle && !googleKey && !useTravelApiProxy) || !pexelsKey) {
  throw new Error('PEXELS_API_KEY and either GOOGLE_PLACES_API_KEY or the Supabase travel-api proxy credentials are required for --apply. Keep them server-side.');
}

function loadEnrichment() {
  try {
    return JSON.parse(readFileSync(ENRICHMENT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function requestJson(url, init, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(`${label} failed (${response.status}): ${body}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function travelApi(operation, input, label) {
  return requestJson(`${supabaseUrl}/functions/v1/travel-api`, {
    method: 'POST',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operation, ...input }),
  }, label);
}

async function googleTextSearch(textQuery, destination, maxResultCount = 1) {
  if (useTravelApiProxy) {
    const result = await travelApi('placeTextSearch', {
      query: textQuery,
      lat: destination.lat,
      lng: destination.lng,
      radiusMeters: destination.destinationType === 'island' ? 50_000 : 50_000,
      limit: maxResultCount,
    }, `Supabase Google Places proxy search for ${textQuery}`);
    return result.places ?? [];
  }
  const body = {
    textQuery,
    maxResultCount,
    locationBias: {
      circle: {
        center: { latitude: destination.lat, longitude: destination.lng },
        radius: destination.destinationType === 'island' ? 80_000 : 50_000,
      },
    },
  };
  const result = await requestJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus',
    },
    body: JSON.stringify(body),
  }, `Google Places search for ${textQuery}`);
  return result.places ?? [];
}

async function pexelsSearch(query, perPage) {
  if (pexelsThrottled) return wikimediaSearch(query, perPage);
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('per_page', String(perPage));
  try {
    const result = await requestJson(url, {
      headers: { Authorization: pexelsKey },
    }, `Pexels search for ${query}`);
    return (result.photos ?? []).map((photo) => photo.src?.large2x ?? photo.src?.large).filter(Boolean);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('(429)')) throw error;
    pexelsThrottled = true;
    console.warn('  Pexels throttled this run; using attributed Wikimedia Commons imagery for the remaining searches.');
    return wikimediaSearch(query, perPage);
  }
}

let pexelsThrottled = false;
let lastWikimediaRequestAt = 0;

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function wikimediaSearch(query, limit) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', String(Math.min(8, Math.max(1, limit))));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url');
  url.searchParams.set('iiurlwidth', '1400');
  let result;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const spacing = Math.max(0, 1_100 - (Date.now() - lastWikimediaRequestAt));
    if (spacing) await wait(spacing);
    lastWikimediaRequestAt = Date.now();
    try {
      result = await requestJson(url, {
        headers: { 'User-Agent': 'Outing destination catalog research/1.0 (catalog-enrichment)' },
      }, `Wikimedia Commons search for ${query}`);
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('(429)') || attempt === 3) throw error;
      await wait(2_000 * (attempt + 1));
    }
  }
  const pages = result.query?.pages ? Object.values(result.query.pages) : [];
  return pages.flatMap((page) => {
    const info = page?.imageinfo?.[0];
    const imageUrl = info?.thumburl ?? info?.url;
    return imageUrl ? [imageUrl] : [];
  }).slice(0, limit);
}

function compactPlace(place) {
  const providerPlaceId = place.providerPlaceId ?? place.id;
  const businessStatus = place.businessStatus ?? 'BUSINESS_STATUS_UNSPECIFIED';
  return {
    providerPlaceId,
    providerValidationStatus: businessStatus === 'CLOSED_PERMANENTLY' ? 'closed' : 'validated',
    businessStatus,
    address: place.address ?? place.formattedAddress,
    lat: place.lat ?? place.location?.latitude,
    lng: place.lng ?? place.location?.longitude,
    googleMapsUri: place.googleMapsUri,
    websiteUri: place.websiteUri,
    rating: place.rating,
    reviewCount: place.reviewCount,
    openingHours: place.weekdayDescriptions,
  };
}

const enrichment = loadEnrichment();
for (const [destinationIndex, destination] of selected.entries()) {
  console.log(`[${destinationIndex + 1}/${selected.length}] Validating ${destination.name}…`);
  const prior = enrichment[destination.slug] ?? {};
  const priorPlaces = Object.values(prior.places ?? {});
  const imageryComplete = prior.heroImageUrl && (prior.galleryImageUrls?.length ?? 0) >= 4
    && priorPlaces.length >= destination.places.length
    && priorPlaces.every((place) => place?.imageUrl);
  const googleComplete = prior.providerValidationStatus === 'validated' && prior.placesValidated === true;
  if (resume && imageryComplete && (skipGoogle || googleComplete)) {
    console.log('  Already hydrated; skipping.');
    continue;
  }
  const identityResults = skipGoogle
    ? []
    : await googleTextSearch(`${destination.name}, ${destination.country}`, destination);
  const identity = identityResults[0] ?? prior;
  const identityPlaceId = identity?.providerPlaceId ?? identity?.id;
  const identityLat = identity?.lat ?? identity?.location?.latitude;
  const identityLng = identity?.lng ?? identity?.location?.longitude;
  if (!skipGoogle && (!identityPlaceId || !Number.isFinite(identityLat) || !Number.isFinite(identityLng))) {
    console.warn(`  Destination identity was not resolved; leaving ${destination.slug} review-gated.`);
    continue;
  }

  const places = {};
  let everyPlaceValidated = !skipGoogle;
  for (const [placeName] of destination.places) {
    const priorPlace = prior.places?.[placeName] ?? {};
    const results = skipGoogle
      ? []
      : await googleTextSearch(`${placeName}, ${destination.name}, ${destination.country}`, destination);
    const providerPlace = results[0] ?? priorPlace;
    const providerPlaceId = providerPlace?.providerPlaceId ?? providerPlace?.id;
    const providerLat = providerPlace?.lat ?? providerPlace?.location?.latitude;
    const providerLng = providerPlace?.lng ?? providerPlace?.location?.longitude;
    if (!skipGoogle && (!providerPlaceId || !Number.isFinite(providerLat) || !Number.isFinite(providerLng) || providerPlace.businessStatus === 'CLOSED_PERMANENTLY')) {
      everyPlaceValidated = false;
      places[placeName] = providerPlace ? compactPlace(providerPlace) : { providerValidationStatus: 'not_found' };
      console.warn(`  Review needed: ${placeName} was ${providerPlace ? 'closed or incomplete' : 'not found'}.`);
      continue;
    }
    const retainedImages = Array.isArray(priorPlace.imageUrls) && priorPlace.imageUrls.length
      ? priorPlace.imageUrls
      : priorPlace.imageUrl ? [priorPlace.imageUrl] : [];
    const specificImages = retainedImages.length ? retainedImages : await pexelsSearch(`${placeName} ${destination.name}`, 3);
    const fallbackImages = specificImages.length ? [] : await pexelsSearch(`${destination.name} ${destination.country}`, 3);
    const imageUrls = [...new Set([...specificImages, ...fallbackImages])].slice(0, 3);
    places[placeName] = {
      ...priorPlace,
      ...(!skipGoogle ? compactPlace(providerPlace) : {}),
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      imageSearchSpecific: retainedImages.length
        ? priorPlace.imageSearchSpecific === true
        : specificImages.length > 0,
    };
  }

  const retainedDestinationImages = prior.heroImageUrl
    ? [prior.heroImageUrl, ...(prior.galleryImageUrls ?? [])]
    : [];
  const destinationImages = retainedDestinationImages.length >= 5
    ? retainedDestinationImages
    : await pexelsSearch(`${destination.name} ${destination.country} travel`, 8);
  enrichment[destination.slug] = {
    ...prior,
    ...(identityPlaceId ? { providerPlaceId: identityPlaceId } : {}),
    providerValidationStatus: skipGoogle ? (prior.providerValidationStatus ?? 'pending') : 'validated',
    placesValidated: everyPlaceValidated,
    heroImageUrl: destinationImages[0] ?? null,
    galleryImageUrls: [...new Set(destinationImages.slice(1))].slice(0, 6),
    places,
    hydratedAt: new Date().toISOString(),
  };
  writeFileSync(ENRICHMENT_PATH, `${JSON.stringify(enrichment, null, 2)}\n`);
}

writeFileSync(ENRICHMENT_PATH, `${JSON.stringify(enrichment, null, 2)}\n`);
console.log(`Saved provider enrichment for ${selected.length} destination(s).`);
console.log('Next: pnpm seed:expand-catalog, verify every image and place, then complete human editorial review.');
