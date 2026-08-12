import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DESTINATION_EXPANSION } from '../fixtures/catalog/destination-expansion.mjs';

const ROOT = process.cwd();
const ENRICHMENT_PATH = resolve(ROOT, 'fixtures/catalog/destination-provider-enrichment.json');
const apply = process.argv.includes('--apply');
const requestedWave = process.argv.find((argument) => argument.startsWith('--wave='))?.split('=')[1];
const allowedWaves = new Set(['lgbtq_priority', 'global_popular']);
const googleKey = process.env.GOOGLE_PLACES_API_KEY;
const pexelsKey = process.env.PEXELS_API_KEY;

if (requestedWave && !allowedWaves.has(requestedWave)) {
  throw new Error(`Unknown wave "${requestedWave}". Use lgbtq_priority or global_popular.`);
}

const selected = DESTINATION_EXPANSION.filter((destination) => !requestedWave || destination.wave === requestedWave);
if (!apply) {
  console.log(`Provider hydration dry run: ${selected.length} destination(s).`);
  console.log('No provider requests or file writes were made. Re-run with --apply after configuring GOOGLE_PLACES_API_KEY and PEXELS_API_KEY.');
  process.exit(0);
}
if (!googleKey || !pexelsKey) {
  throw new Error('GOOGLE_PLACES_API_KEY and PEXELS_API_KEY are required for --apply. Keep both server-side.');
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

async function googleTextSearch(textQuery, destination, maxResultCount = 1) {
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
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('per_page', String(perPage));
  const result = await requestJson(url, {
    headers: { Authorization: pexelsKey },
  }, `Pexels search for ${query}`);
  return (result.photos ?? []).map((photo) => photo.src?.large2x ?? photo.src?.large).filter(Boolean);
}

function compactPlace(place) {
  return {
    providerPlaceId: place.id,
    providerValidationStatus: place.businessStatus === 'CLOSED_PERMANENTLY' ? 'closed' : 'validated',
    businessStatus: place.businessStatus ?? 'BUSINESS_STATUS_UNSPECIFIED',
    address: place.formattedAddress,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
  };
}

const enrichment = loadEnrichment();
for (const [destinationIndex, destination] of selected.entries()) {
  console.log(`[${destinationIndex + 1}/${selected.length}] Validating ${destination.name}…`);
  const identityResults = await googleTextSearch(`${destination.name}, ${destination.country}`, destination);
  const identity = identityResults[0];
  if (!identity?.id || !identity.location) {
    console.warn(`  Destination identity was not resolved; leaving ${destination.slug} review-gated.`);
    continue;
  }

  const places = {};
  let everyPlaceValidated = true;
  for (const [placeName] of destination.places) {
    const results = await googleTextSearch(`${placeName}, ${destination.name}, ${destination.country}`, destination);
    const providerPlace = results[0];
    if (!providerPlace?.id || !providerPlace.location || providerPlace.businessStatus === 'CLOSED_PERMANENTLY') {
      everyPlaceValidated = false;
      places[placeName] = providerPlace ? compactPlace(providerPlace) : { providerValidationStatus: 'not_found' };
      console.warn(`  Review needed: ${placeName} was ${providerPlace ? 'closed or incomplete' : 'not found'}.`);
      continue;
    }
    const specificImages = await pexelsSearch(`${placeName} ${destination.name}`, 3);
    const fallbackImages = specificImages.length ? [] : await pexelsSearch(`${destination.name} ${destination.country}`, 3);
    const imageUrls = [...new Set([...specificImages, ...fallbackImages])].slice(0, 3);
    places[placeName] = {
      ...compactPlace(providerPlace),
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      imageSearchSpecific: specificImages.length > 0,
    };
  }

  const destinationImages = await pexelsSearch(`${destination.name} ${destination.country} travel`, 8);
  enrichment[destination.slug] = {
    providerPlaceId: identity.id,
    providerValidationStatus: 'validated',
    placesValidated: everyPlaceValidated,
    heroImageUrl: destinationImages[0] ?? null,
    galleryImageUrls: [...new Set(destinationImages.slice(1))].slice(0, 6),
    places,
    hydratedAt: new Date().toISOString(),
  };
}

writeFileSync(ENRICHMENT_PATH, `${JSON.stringify(enrichment, null, 2)}\n`);
console.log(`Saved provider enrichment for ${selected.length} destination(s).`);
console.log('Next: pnpm seed:expand-catalog, verify every image and place, then complete human editorial review.');
