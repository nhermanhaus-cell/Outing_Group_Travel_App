import { corsHeaders, errorResponse, json, providerJson, readJson } from '../_shared/http.ts';

type JsonRecord = Record<string, unknown>;

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const GOOGLE_ROUTES_BASE = 'https://routes.googleapis.com';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const VIATOR_BASE = 'https://api.viator.com/partner';
const BOOKING_BASE = 'https://demandapi.booking.com/3.2';
const SKYSCANNER_BASE = 'https://partners.api.skyscanner.net/apiservices/v3';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const TICKETMASTER_API = 'https://app.ticketmaster.com/discovery/v2/events.json';
const NPS_API = 'https://developer.nps.gov/api/v1/parks';

class RateLimitError extends Error {}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stripHtml(value: unknown): string | undefined {
  const text = string(value);
  return text?.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() || undefined;
}

function googleHeaders(fieldMask: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': env('GOOGLE_PLACES_API_KEY'),
    'X-Goog-FieldMask': fieldMask,
  };
}

function viatorHeaders(): Record<string, string> {
  return {
    Accept: 'application/json;version=2.0',
    'Accept-Language': 'en-US',
    'Content-Type': 'application/json',
    'exp-api-key': env('VIATOR_API_KEY'),
  };
}

function bookingHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env('BOOKING_DEMAND_API_TOKEN')}`,
    'X-Affiliate-Id': env('BOOKING_AFFILIATE_ID'),
    'Content-Type': 'application/json',
  };
}

function skyscannerHeaders(): Record<string, string> {
  return { 'x-api-key': env('SKYSCANNER_API_KEY'), 'Content-Type': 'application/json' };
}

function normalizeGooglePhoto(photo: unknown): JsonRecord | null {
  const value = record(photo);
  const name = value ? string(value.name) : undefined;
  if (!value || !name) return null;
  const authors = Array.isArray(value.authorAttributions)
    ? value.authorAttributions.flatMap((author) => {
        const item = record(author);
        const displayName = item ? string(item.displayName) : undefined;
        return displayName ? [displayName] : [];
      })
    : [];
  return {
    name,
    widthPx: number(value.widthPx),
    heightPx: number(value.heightPx),
    attribution: authors.join(', ') || undefined,
  };
}

function normalizeOpeningPeriod(value: unknown): JsonRecord | null {
  const period = record(value);
  const open = period ? record(period.open) : null;
  const close = period ? record(period.close) : null;
  if (!open) return null;
  const openHour = number(open.hour) ?? 0;
  const openMinute = number(open.minute) ?? 0;
  const closeHour = close ? number(close.hour) ?? 23 : 23;
  const closeMinute = close ? number(close.minute) ?? 59 : 59;
  return {
    dayOfWeek: number(open.day),
    open: `${String(openHour).padStart(2, '0')}:${String(openMinute).padStart(2, '0')}`,
    close: `${String(closeHour).padStart(2, '0')}:${String(closeMinute).padStart(2, '0')}`,
  };
}

function normalizeGooglePlace(value: unknown): JsonRecord | null {
  const place = record(value);
  if (!place) return null;
  const displayName = record(place.displayName);
  const location = record(place.location);
  const id = string(place.id);
  const name = displayName ? string(displayName.text) : undefined;
  if (!id || !name || !location) return null;
  const regularOpeningHours = record(place.regularOpeningHours);
  const photos = Array.isArray(place.photos)
    ? place.photos.map(normalizeGooglePhoto).filter(Boolean).slice(0, 5)
    : [];
  return {
    providerPlaceId: id,
    name,
    address: string(place.formattedAddress) ?? string(place.shortFormattedAddress),
    lat: number(location.latitude),
    lng: number(location.longitude),
    types: Array.isArray(place.types) ? place.types.filter((type) => typeof type === 'string') : [],
    rating: number(place.rating),
    reviewCount: number(place.userRatingCount),
    priceLevel: string(place.priceLevel),
    businessStatus: string(place.businessStatus),
    openingHours: regularOpeningHours && Array.isArray(regularOpeningHours.periods)
      ? regularOpeningHours.periods.map(normalizeOpeningPeriod).filter(Boolean)
      : [],
    weekdayDescriptions: regularOpeningHours && Array.isArray(regularOpeningHours.weekdayDescriptions)
      ? regularOpeningHours.weekdayDescriptions
      : [],
    photos,
    googleMapsUri: string(place.googleMapsUri),
    websiteUri: string(place.websiteUri),
    verifiedAt: new Date().toISOString(),
  };
}

async function resolveGooglePhoto(photo: unknown): Promise<JsonRecord | null> {
  const normalized = normalizeGooglePhoto(photo);
  const name = normalized ? string(normalized.name) : undefined;
  if (!normalized || !name) return null;
  try {
    const url = new URL(`${GOOGLE_PLACES_BASE}/${name}/media`);
    url.searchParams.set('maxWidthPx', '1200');
    url.searchParams.set('skipHttpRedirect', 'true');
    const data = record(await providerJson(url.toString(), {
      headers: { 'X-Goog-Api-Key': env('GOOGLE_PLACES_API_KEY') },
    }, 5_000));
    return { ...normalized, url: data ? string(data.photoUri) : undefined };
  } catch {
    return normalized;
  }
}

async function enrichGooglePlace(value: unknown): Promise<JsonRecord | null> {
  const normalized = normalizeGooglePlace(value);
  const raw = record(value);
  if (!normalized || !raw) return normalized;
  const photos = Array.isArray(raw.photos)
    ? (await Promise.all(raw.photos.slice(0, 5).map(resolveGooglePhoto))).filter(Boolean)
    : [];
  return { ...normalized, photos };
}

function normalizeViatorProduct(value: unknown): JsonRecord | null {
  const product = record(value);
  if (!product) return null;
  const productCode = string(product.productCode) ?? string(product.code);
  const title = string(product.title);
  if (!productCode || !title) return null;
  const pricing = record(product.pricing);
  const summary = pricing ? record(pricing.summary) : null;
  const reviews = record(product.reviews);
  const duration = record(product.duration);
  const images = Array.isArray(product.images)
    ? product.images.flatMap((image) => {
        const item = record(image);
        if (!item) return [];
        const variants = Array.isArray(item.variants) ? item.variants : [];
        return variants
          .flatMap((variant) => {
            const candidate = record(variant);
            const url = candidate ? string(candidate.url) : undefined;
            return url ? [{ url, width: number(candidate?.width), height: number(candidate?.height) }] : [];
          })
          .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
          .slice(0, 1);
      }).slice(0, 5)
    : [];
  return {
    productCode,
    title,
    description: string(product.description) ?? string(product.summary),
    productUrl: string(product.productUrl),
    images,
    rating: reviews ? number(reviews.combinedAverageRating) : undefined,
    reviewCount: reviews ? number(reviews.totalReviews) : undefined,
    priceFrom: summary ? number(summary.fromPrice) : undefined,
    currency: pricing ? string(pricing.currency) : undefined,
    durationMinutes: duration
      ? number(duration.fixedDurationInMinutes) ?? number(duration.variableDurationFromMinutes)
      : undefined,
    itinerary: product.itinerary,
    inclusions: product.inclusions,
    exclusions: product.exclusions,
    logistics: product.logistics,
    cancellationPolicy: product.cancellationPolicy,
    tags: product.tags,
    provider: 'viator',
    bookingMode: string(product.productUrl) ? 'external' : 'none',
  };
}

async function placeSearch(body: JsonRecord): Promise<Response> {
  const lat = number(body.lat);
  const lng = number(body.lng);
  const includedTypes = Array.isArray(body.includedTypes)
    ? body.includedTypes.filter((item) => typeof item === 'string').slice(0, 20)
    : [];
  if (lat === undefined || lng === undefined || includedTypes.length === 0) {
    return json({ error: 'lat, lng, and includedTypes are required' }, 400);
  }
  const data = await providerJson(`${GOOGLE_PLACES_BASE}/places:searchNearby`, {
    method: 'POST',
    headers: googleHeaders([
      'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
      'places.types', 'places.rating', 'places.userRatingCount', 'places.priceLevel',
      'places.businessStatus', 'places.regularOpeningHours', 'places.photos',
      'places.googleMapsUri',
    ].join(',')),
    body: JSON.stringify({
      includedTypes,
      maxResultCount: Math.min(20, Math.max(1, number(body.limit) ?? 12)),
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: Math.min(50_000, Math.max(500, number(body.radiusMeters) ?? 5_000)),
        },
      },
    }),
  });
  const root = record(data);
  const places = Array.isArray(root?.places)
    ? (await Promise.all(root.places.map(enrichGooglePlace))).filter(Boolean)
    : [];
  return json({ places, source: 'google_places_live' });
}

async function placeTextSearch(body: JsonRecord): Promise<Response> {
  const query = string(body.query);
  if (!query) return json({ error: 'query is required' }, 400);
  const lat = number(body.lat);
  const lng = number(body.lng);
  const requestBody: JsonRecord = {
    textQuery: query,
    maxResultCount: Math.min(5, Math.max(1, number(body.limit) ?? 3)),
    languageCode: 'en',
  };
  if (lat !== undefined && lng !== undefined) {
    requestBody.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(50_000, Math.max(1_000, number(body.radiusMeters) ?? 15_000)),
      },
    };
  }
  const data = await providerJson(`${GOOGLE_PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: googleHeaders([
      'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
      'places.types', 'places.rating', 'places.userRatingCount', 'places.priceLevel',
      'places.businessStatus', 'places.regularOpeningHours', 'places.photos',
      'places.googleMapsUri', 'places.websiteUri',
    ].join(',')),
    body: JSON.stringify(requestBody),
  });
  const root = record(data);
  const places = Array.isArray(root?.places)
    ? (await Promise.all(root.places.map(enrichGooglePlace))).filter(Boolean)
    : [];
  return json({ places, source: 'google_places_live' });
}

async function placeDetails(body: JsonRecord): Promise<Response> {
  const placeId = string(body.placeId);
  if (!placeId) return json({ error: 'placeId is required' }, 400);
  const data = await providerJson(`${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: googleHeaders([
      'id', 'displayName', 'formattedAddress', 'location', 'types', 'rating',
      'userRatingCount', 'priceLevel', 'businessStatus', 'regularOpeningHours',
      'currentOpeningHours', 'photos', 'googleMapsUri', 'websiteUri',
    ].join(',')),
  });
  return json({ place: await enrichGooglePlace(data), source: 'google_places_live' });
}

async function geocode(body: JsonRecord): Promise<Response> {
  const address = string(body.address);
  if (!address) return json({ error: 'address is required' }, 400);
  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('key', env('GOOGLE_PLACES_API_KEY'));
  const data = record(await providerJson(url.toString(), {}));
  const first = Array.isArray(data?.results) ? record(data.results[0]) : null;
  const geometry = first ? record(first.geometry) : null;
  const location = geometry ? record(geometry.location) : null;
  if (!first || !location) return json({ result: null });
  return json({ result: {
    formattedAddress: string(first.formatted_address),
    lat: number(location.lat),
    lng: number(location.lng),
  } });
}

async function routeMatrix(body: JsonRecord): Promise<Response> {
  const origins = Array.isArray(body.origins) ? body.origins.slice(0, 12) : [];
  const destinations = Array.isArray(body.destinations) ? body.destinations.slice(0, 12) : [];
  if (origins.length === 0 || destinations.length === 0) {
    return json({ error: 'origins and destinations are required' }, 400);
  }
  const mode = string(body.travelMode) ?? 'TRANSIT';
  const response = await fetch(`${GOOGLE_ROUTES_BASE}/distanceMatrix/v2:computeRouteMatrix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env('GOOGLE_PLACES_API_KEY'),
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status,condition',
    },
    body: JSON.stringify({ origins, destinations, travelMode: mode }),
  });
  if (!response.ok) throw new Error(`Routes HTTP ${response.status}`);
  return json({ elements: await response.json(), source: 'google_routes_live' });
}

async function route(body: JsonRecord): Promise<Response> {
  if (!record(body.origin) || !record(body.destination)) {
    return json({ error: 'origin and destination are required' }, 400);
  }
  const data = await providerJson(`${GOOGLE_ROUTES_BASE}/directions/v2:computeRoutes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env('GOOGLE_PLACES_API_KEY'),
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: body.origin,
      destination: body.destination,
      travelMode: string(body.travelMode) ?? 'TRANSIT',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC',
    }),
  });
  return json({ routes: record(data)?.routes ?? [], source: 'google_routes_live' });
}

async function viatorSearch(body: JsonRecord): Promise<Response> {
  const destination = string(body.destination);
  if (!destination) return json({ error: 'destination is required' }, 400);
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((item) => typeof item === 'string').slice(0, 4)
    : [];
  const data = record(await providerJson(`${VIATOR_BASE}/search/freetext`, {
    method: 'POST',
    headers: viatorHeaders(),
    body: JSON.stringify({
      searchTerm: [destination, ...interests].join(' '),
      searchTypes: ['PRODUCTS'],
      currency: string(body.currency) ?? 'USD',
      pagination: { start: 1, count: Math.min(20, Math.max(1, number(body.limit) ?? 12)) },
    }),
  }));
  const rawProducts = Array.isArray(data?.products)
    ? data.products
    : record(data?.products) && Array.isArray(record(data?.products)?.results)
      ? record(data?.products)!.results as unknown[]
      : [];
  const products = rawProducts.map(normalizeViatorProduct).filter(Boolean);
  return json({ products, source: 'viator_live' });
}

async function viatorProduct(body: JsonRecord): Promise<Response> {
  const productCode = string(body.productCode);
  if (!productCode) return json({ error: 'productCode is required' }, 400);
  const data = await providerJson(`${VIATOR_BASE}/products/${encodeURIComponent(productCode)}`, {
    headers: viatorHeaders(),
  });
  return json({ product: normalizeViatorProduct(data), source: 'viator_live' });
}

async function viatorSchedule(body: JsonRecord): Promise<Response> {
  const productCode = string(body.productCode);
  if (!productCode) return json({ error: 'productCode is required' }, 400);
  const data = await providerJson(
    `${VIATOR_BASE}/availability/schedules/${encodeURIComponent(productCode)}`,
    { headers: viatorHeaders() },
  );
  return json({ schedule: data, source: 'viator_live' });
}

async function commonsImageSearch(body: JsonRecord): Promise<Response> {
  const query = string(body.query);
  if (!query) return json({ error: 'query is required' }, 400);
  const limit = Math.min(8, Math.max(1, number(body.limit) ?? 5));
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', String(limit));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('iiurlwidth', '1400');
  const data = record(await providerJson(url.toString(), { headers: { 'User-Agent': 'Outing travel research/1.0' } }, 8_000));
  const pages = record(record(data?.query)?.pages);
  const images = pages ? Object.values(pages).flatMap((page) => {
    const item = record(page);
    const info = item && Array.isArray(item.imageinfo) ? record(item.imageinfo[0]) : null;
    const metadata = info ? record(info.extmetadata) : null;
    const metadataValue = (key: string) => stripHtml(record(metadata?.[key])?.value);
    const imageUrl = info ? string(info.thumburl) ?? string(info.url) : undefined;
    const sourcePage = info ? string(info.descriptionurl) : undefined;
    if (!imageUrl || !sourcePage) return [];
    return [{
      url: imageUrl,
      thumbnailUrl: string(info?.thumburl),
      sourcePage,
      author: metadataValue('Artist') ?? metadataValue('Credit'),
      license: metadataValue('LicenseShortName') ?? metadataValue('UsageTerms'),
      licenseUrl: metadataValue('LicenseUrl'),
    }];
  }).slice(0, limit) : [];
  return json({ images, source: 'wikimedia_commons' });
}

async function weatherForecast(body: JsonRecord): Promise<Response> {
  const lat = number(body.lat);
  const lng = number(body.lng);
  if (lat === undefined || lng === undefined) return json({ error: 'lat and lng are required' }, 400);
  const url = new URL(OPEN_METEO_API);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  const apiKey = optionalEnv('OPEN_METEO_API_KEY');
  if (apiKey) url.searchParams.set('apikey', apiKey);
  const data = record(await providerJson(url.toString(), {}, 8_000));
  const current = record(data?.current);
  const daily = record(data?.daily);
  const dates = Array.isArray(daily?.time) ? daily.time : [];
  const valueAt = (field: string, index: number) => Array.isArray(daily?.[field]) ? number((daily?.[field] as unknown[])[index]) : undefined;
  return json({ weather: {
    timezone: string(data?.timezone) ?? 'auto',
    currentTemperatureC: number(current?.temperature_2m),
    currentWeatherCode: number(current?.weather_code),
    daily: dates.flatMap((date, index) => typeof date === 'string' ? [{
      date,
      weatherCode: valueAt('weather_code', index),
      temperatureMaxC: valueAt('temperature_2m_max', index),
      temperatureMinC: valueAt('temperature_2m_min', index),
      precipitationProbabilityMax: valueAt('precipitation_probability_max', index),
    }] : []),
    source: 'open_meteo',
    retrievedAt: new Date().toISOString(),
  } });
}

async function ticketmasterEvents(body: JsonRecord): Promise<Response> {
  const lat = number(body.lat);
  const lng = number(body.lng);
  if (lat === undefined || lng === undefined) return json({ error: 'lat and lng are required' }, 400);
  const url = new URL(TICKETMASTER_API);
  url.searchParams.set('apikey', env('TICKETMASTER_API_KEY'));
  url.searchParams.set('latlong', `${lat},${lng}`);
  url.searchParams.set('radius', String(Math.min(100, Math.max(1, number(body.radiusMiles) ?? 35))));
  url.searchParams.set('unit', 'miles');
  url.searchParams.set('size', String(Math.min(20, Math.max(1, number(body.limit) ?? 10))));
  url.searchParams.set('sort', 'date,asc');
  const keyword = string(body.keyword);
  if (keyword) url.searchParams.set('keyword', keyword);
  const startDate = string(body.startDate);
  const endDate = string(body.endDate);
  if (startDate) url.searchParams.set('startDateTime', `${startDate}T00:00:00Z`);
  if (endDate) url.searchParams.set('endDateTime', `${endDate}T23:59:59Z`);
  const data = record(await providerJson(url.toString(), {}, 8_000));
  const embedded = record(data?._embedded);
  const events = Array.isArray(embedded?.events) ? embedded.events.flatMap((raw) => {
    const event = record(raw);
    const id = event ? string(event.id) : undefined;
    const name = event ? string(event.name) : undefined;
    const eventUrl = event ? string(event.url) : undefined;
    if (!event || !id || !name || !eventUrl) return [];
    const dates = record(event.dates);
    const start = record(dates?.start);
    const eventEmbedded = record(event._embedded);
    const venue = eventEmbedded && Array.isArray(eventEmbedded.venues) ? record(eventEmbedded.venues[0]) : null;
    const city = record(venue?.city);
    const classifications = Array.isArray(event.classifications) ? record(event.classifications[0]) : null;
    const genre = record(classifications?.genre);
    const images = Array.isArray(event.images) ? event.images.flatMap((image) => {
      const candidate = record(image);
      const imageUrl = candidate ? string(candidate.url) : undefined;
      return imageUrl ? [{ url: imageUrl, width: number(candidate?.width) ?? 0 }] : [];
    }).sort((a, b) => b.width - a.width) : [];
    return [{ id, name, url: eventUrl, startDate: string(start?.localDate), startTime: string(start?.localTime), venueName: string(venue?.name), city: string(city?.name), imageUrl: images[0]?.url, genre: string(genre?.name), source: 'ticketmaster' }];
  }) : [];
  return json({ events, source: 'ticketmaster' });
}

async function npsNearby(body: JsonRecord): Promise<Response> {
  const query = string(body.query);
  if (!query) return json({ error: 'query is required' }, 400);
  const url = new URL(NPS_API);
  url.searchParams.set('api_key', env('NPS_API_KEY'));
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.min(10, Math.max(1, number(body.limit) ?? 5))));
  const data = record(await providerJson(url.toString(), {}, 8_000));
  const parks = Array.isArray(data?.data) ? data.data.flatMap((raw) => {
    const park = record(raw);
    const id = park ? string(park.id) ?? string(park.parkCode) : undefined;
    const name = park ? string(park.fullName) ?? string(park.name) : undefined;
    const parkUrl = park ? string(park.url) : undefined;
    if (!park || !id || !name || !parkUrl) return [];
    const image = Array.isArray(park.images) ? record(park.images[0]) : null;
    return [{ id, name, description: string(park.description), designation: string(park.designation), states: string(park.states), url: parkUrl, imageUrl: string(image?.url), imageAttribution: string(image?.credit), lat: number(park.latitude), lng: number(park.longitude), source: 'nps' }];
  }) : [];
  return json({ parks, source: 'nps' });
}

function normalizeBookingStay(raw: unknown, detailsById: Map<string, JsonRecord>): JsonRecord | null {
  const stay = record(raw);
  const id = stay ? String(stay.id ?? stay.accommodation ?? '') : '';
  if (!stay || !id) return null;
  const details = detailsById.get(id) ?? {};
  const urlValue = record(stay.url);
  const exactUrl = string(urlValue?.mobile) ?? string(urlValue?.web) ?? string(stay.url) ?? string(details.url);
  if (!exactUrl) return null;
  const price = record(stay.price);
  const currency = record(stay.currency);
  const review = record(details.review_score) ?? record(stay.review_score);
  const photos = Array.isArray(details.photos) ? details.photos.flatMap((rawPhoto) => {
    const photo = record(rawPhoto);
    const photoUrl = photo ? string(photo.url) ?? string(photo.url_1440) ?? string(photo.url_max) : undefined;
    return photoUrl ? [photoUrl] : [];
  }).slice(0, 5) : [];
  const address = record(details.address);
  const programmes = record(details.programmes) ?? record(stay.programmes);
  return {
    id,
    name: string(details.name) ?? string(stay.name) ?? `Stay ${id}`,
    url: exactUrl,
    imageUrls: photos,
    reviewScore: number(review?.score) ?? number(details.review_score) ?? number(stay.review_score),
    reviewCount: number(review?.number_of_reviews) ?? number(details.number_of_reviews),
    price: number(price?.total) ?? number(price?.display) ?? number(price?.base),
    currency: string(currency?.booker) ?? string(stay.currency) ?? string(price?.currency) ?? string(price?.currency_code),
    address: string(address?.address_line) ?? string(details.address),
    travelProud: Boolean(programmes?.travel_proud ?? details.travel_proud ?? stay.travel_proud),
    source: 'booking_com',
  };
}

async function bookingStays(body: JsonRecord): Promise<Response> {
  const airport = string(body.airportIata)?.toUpperCase();
  const checkin = string(body.checkin);
  const checkout = string(body.checkout);
  if (!airport || !checkin || !checkout) return json({ error: 'airportIata, checkin, and checkout are required' }, 400);
  const base = optionalEnv('BOOKING_DEMAND_BASE_URL') ?? BOOKING_BASE;
  const cities = record(await providerJson(`${base}/common/locations/cities`, {
    method: 'POST', headers: bookingHeaders(), body: JSON.stringify({ airport, languages: ['en-us'] }),
  }, 10_000));
  const cityRows = Array.isArray(cities?.data) ? cities.data : [];
  const city = record(cityRows[0]);
  const destinationId = city ? String(city.id ?? '') : '';
  if (!destinationId) return json({ stays: [], source: 'booking_com' });
  const search = record(await providerJson(`${base}/accommodations/search`, {
    method: 'POST',
    headers: bookingHeaders(),
    body: JSON.stringify({
      booker: { country: string(body.bookerCountry)?.toLowerCase() ?? 'us', platform: 'mobile' },
      checkin,
      checkout,
      city: destinationId,
      currency: string(body.currency)?.toUpperCase() ?? 'USD',
      guests: { number_of_adults: Math.min(30, Math.max(1, number(body.adults) ?? 1)), number_of_rooms: Math.min(10, Math.max(1, number(body.rooms) ?? 1)) },
      extras: ['products'],
      ...(body.travelProudOnly === true ? { filters: { travel_proud: true } } : {}),
    }),
  }, 15_000));
  const results = Array.isArray(search?.data) ? search.data.slice(0, Math.min(12, Math.max(1, number(body.limit) ?? 6))) : [];
  const ids = results.flatMap((value) => {
    const item = record(value);
    const id = item ? String(item.id ?? item.accommodation ?? '') : '';
    return id ? [Number.isNaN(Number(id)) ? id : Number(id)] : [];
  });
  let detailsRows: unknown[] = [];
  if (ids.length > 0) {
    try {
      const details = record(await providerJson(`${base}/accommodations/details`, {
        method: 'POST', headers: bookingHeaders(), body: JSON.stringify({ accommodations: ids, extras: ['photos'], languages: ['en-us'] }),
      }, 12_000));
      detailsRows = Array.isArray(details?.data) ? details.data : [];
    } catch {
      detailsRows = [];
    }
  }
  const detailsById = new Map(detailsRows.flatMap((value) => {
    const item = record(value);
    const id = item ? String(item.id ?? '') : '';
    return item && id ? [[id, item] as const] : [];
  }));
  return json({ stays: results.map((value) => normalizeBookingStay(value, detailsById)).filter(Boolean), destinationId, source: 'booking_com' });
}

function skyscannerDate(month: string | undefined): JsonRecord {
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return { anytime: true };
  return { dateRange: { startDate: { year: Number(match[1]), month: Number(match[2]) }, endDate: { year: Number(match[1]), month: Number(match[2]) } } };
}

async function addFlightPriceContext(
  deals: JsonRecord[],
  originIata: string,
  currency: string,
  departureMonth: string | undefined,
): Promise<JsonRecord[]> {
  const supabaseUrl = optionalEnv('SUPABASE_URL');
  const serviceKey = optionalEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey || deals.length === 0) return deals;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const enriched = await Promise.all(deals.map(async (deal) => {
    const destinationKey = string(deal.destinationIata) ?? string(deal.destinationName);
    const price = number(deal.price);
    if (!destinationKey || price === undefined) return deal;
    try {
      const historyUrl = new URL(`${supabaseUrl}/rest/v1/travel_price_observations`);
      historyUrl.searchParams.set('select', 'price');
      historyUrl.searchParams.set('origin_iata', `eq.${originIata}`);
      historyUrl.searchParams.set('destination_key', `eq.${destinationKey}`);
      historyUrl.searchParams.set('currency', `eq.${currency}`);
      historyUrl.searchParams.set('limit', '90');
      const historyResponse = await fetch(historyUrl, { headers });
      const history = historyResponse.ok ? await historyResponse.json() as unknown[] : [];
      const prices = history.flatMap((row) => {
        const value = number(record(row)?.price);
        return value === undefined ? [] : [value];
      }).sort((a, b) => a - b);
      const observationCount = prices.length;
      const baselinePrice = observationCount >= 5 ? prices[Math.floor(prices.length / 2)] : undefined;
      await fetch(`${supabaseUrl}/rest/v1/travel_price_observations`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ provider: 'skyscanner_indicative', origin_iata: originIata, destination_key: destinationKey, destination_name: deal.destinationName, currency, departure_month: departureMonth, price, observed_at: deal.observedAt }),
      });
      return baselinePrice && baselinePrice > price
        ? { ...deal, baselinePrice, savingsPercent: Math.round((1 - price / baselinePrice) * 100), observationCount }
        : { ...deal, observationCount };
    } catch {
      return deal;
    }
  }));
  return enriched;
}

async function skyscannerIndicative(body: JsonRecord): Promise<Response> {
  const originIata = string(body.originIata)?.toUpperCase();
  if (!originIata) return json({ error: 'originIata is required' }, 400);
  const currency = string(body.currency)?.toUpperCase() ?? 'USD';
  const queryLegs: JsonRecord[] = [{ originPlace: { queryPlace: { iata: originIata } }, destinationPlace: { anywhere: true }, ...skyscannerDate(string(body.departureMonth)) }];
  const returnMonth = string(body.returnMonth);
  if (returnMonth) queryLegs.push({ originPlace: { anywhere: true }, destinationPlace: { queryPlace: { iata: originIata } }, ...skyscannerDate(returnMonth) });
  const data = record(await providerJson(`${SKYSCANNER_BASE}/flights/indicative/search`, {
    method: 'POST', headers: skyscannerHeaders(), body: JSON.stringify({ query: { market: string(body.market) ?? 'US', locale: string(body.locale) ?? 'en-US', currency, queryLegs } }),
  }, 15_000));
  const content = record(data?.content);
  const results = record(content?.results);
  const quotes = record(results?.quotes);
  const places = record(results?.places) ?? {};
  const observedAt = new Date().toISOString();
  const resolvePlace = (id: unknown) => record(places[String(id ?? '')]);
  const resolveCountry = (place: JsonRecord | null) => {
    let current = place;
    for (let depth = 0; current && depth < 4; depth += 1) {
      if (string(current.type)?.toUpperCase().endsWith('COUNTRY')) return string(current.name);
      current = resolvePlace(current.parentId);
    }
    return undefined;
  };
  const rawDeals = quotes ? Object.entries(quotes).flatMap(([id, raw]) => {
    const quote = record(raw);
    const price = record(quote?.minPrice);
    const outbound = record(quote?.outboundLeg);
    const destination = resolvePlace(outbound?.destinationPlaceId);
    const amount = number(price?.amount);
    const destinationName = string(destination?.name);
    if (!quote || amount === undefined || !destinationName) return [];
    const departure = record(outbound?.departureDateTime);
    const inbound = record(quote.inboundLeg);
    const returnDate = record(inbound?.departureDateTime);
    const formatDate = (date: JsonRecord | null) => date && number(date.year) && number(date.month) ? `${number(date.year)}-${String(number(date.month)).padStart(2, '0')}${number(date.day) ? `-${String(number(date.day)).padStart(2, '0')}` : ''}` : undefined;
    return [{ id, originIata, destinationIata: string(destination?.iata), destinationName, destinationCountry: resolveCountry(destination), departureDate: formatDate(departure), returnDate: formatDate(returnDate), price: amount, currency, direct: quote.isDirect === true, observedAt, source: 'skyscanner_indicative' }];
  }).sort((a, b) => a.price - b.price).slice(0, Math.min(30, Math.max(1, number(body.limit) ?? 16))) : [];
  const deals = await addFlightPriceContext(rawDeals, originIata, currency, string(body.departureMonth));
  return json({ deals, observedAt, indicative: true, source: 'skyscanner_indicative' });
}

async function enforceRateLimit(request: Request, operation: string) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new Error('Authentication required');
  const supabaseUrl = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const provider = operation.startsWith('viator') ? 'viator'
    : operation.startsWith('booking') ? 'booking'
    : operation.startsWith('skyscanner') ? 'skyscanner'
    : operation.startsWith('ticketmaster') ? 'ticketmaster'
    : operation.startsWith('nps') ? 'nps'
    : operation.startsWith('commons') ? 'commons'
    : operation.startsWith('weather') ? 'weather'
    : 'google';
  const limits: Record<string, number> = { google: 90, viator: 45, booking: 30, skyscanner: 20, ticketmaster: 45, nps: 45, commons: 60, weather: 60 };
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/check_provider_rate_limit`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_provider: provider, p_limit: limits[provider] ?? 45 }),
  });
  if (!response.ok || await response.json() !== true) throw new RateLimitError('Provider request limit reached; try again shortly');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const body = await readJson(request);
    const operation = string(body.operation);
    if (!operation) return json({ error: 'operation is required' }, 400);
    await enforceRateLimit(request, operation);
    const startedAt = Date.now();
    let response: Response;
    switch (operation) {
      case 'placeSearch': response = await placeSearch(body); break;
      case 'placeTextSearch': response = await placeTextSearch(body); break;
      case 'placeDetails': response = await placeDetails(body); break;
      case 'geocode': response = await geocode(body); break;
      case 'routeMatrix': response = await routeMatrix(body); break;
      case 'route': response = await route(body); break;
      case 'viatorSearch': response = await viatorSearch(body); break;
      case 'viatorProduct': response = await viatorProduct(body); break;
      case 'viatorSchedule': response = await viatorSchedule(body); break;
      case 'commonsImageSearch': response = await commonsImageSearch(body); break;
      case 'weatherForecast': response = await weatherForecast(body); break;
      case 'ticketmasterEvents': response = await ticketmasterEvents(body); break;
      case 'npsNearby': response = await npsNearby(body); break;
      case 'bookingStays': response = await bookingStays(body); break;
      case 'skyscannerIndicative': response = await skyscannerIndicative(body); break;
      default: return json({ error: 'Unknown operation' }, 400);
    }
    console.log(JSON.stringify({ event: 'travel_provider_request', operation, status: response.status, latencyMs: Date.now() - startedAt }));
    return response;
  } catch (error) {
    return errorResponse(error, error instanceof RateLimitError ? 429 : 500);
  }
});
