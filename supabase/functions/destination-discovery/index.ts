import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.24.2';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type Json = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lookup'), query: z.string().trim().min(2).max(120), installationId: z.string().min(8).max(120).optional() }),
  z.object({ action: z.literal('claim'), canonicalPlaceId: z.string().min(1).max(240), originalQuery: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal('get'), candidateId: z.string().uuid() }),
  z.object({ action: z.literal('generate'), candidateId: z.string().uuid() }),
  z.object({ action: z.literal('refresh'), candidateId: z.string().uuid() }),
]);

const GENERATION_VERSION = 'destination-v1';

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function record(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clean(value: string, max = 2_400): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

function safeSlug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'destination';
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

function googleHeaders(fieldMask: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': env('GOOGLE_PLACES_API_KEY'),
    'X-Goog-FieldMask': fieldMask,
  };
}

async function googleCitySearch(query: string): Promise<Json[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: googleHeaders('places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types'),
    body: JSON.stringify({
      textQuery: query,
      includedType: '(cities)',
      strictTypeFiltering: true,
      maxResultCount: 5,
      languageCode: 'en',
    }),
  });
  if (!response.ok) {
    const detail = clean(await response.text().catch(() => ''), 240);
    throw new Error(`Google Places lookup failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  const payload = record(await response.json());
  return Array.isArray(payload?.places) ? payload!.places.map(record).filter((item): item is Json => item !== null) : [];
}

async function googlePlace(placeId: string): Promise<Json> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: googleHeaders('id,displayName,formattedAddress,addressComponents,location,types,googleMapsUri'),
  });
  if (!response.ok) throw new Error(`Google Places validation failed (${response.status})`);
  return record(await response.json()) ?? {};
}

function cityIdentity(place: Json) {
  const displayName = record(place.displayName);
  const components = Array.isArray(place.addressComponents) ? place.addressComponents.map(record).filter(Boolean) as Json[] : [];
  const countryPart = components.find((component) => Array.isArray(component.types) && component.types.includes('country'));
  const formattedAddress = text(place.formattedAddress);
  const country = text(countryPart?.longText) ?? formattedAddress?.split(',').at(-1)?.trim() ?? 'Country not yet verified';
  const countryCode = text(countryPart?.shortText)?.toUpperCase();
  return {
    canonicalPlaceId: text(place.id) ?? '',
    name: text(displayName?.text) ?? formattedAddress?.split(',')[0]?.trim() ?? 'Unknown city',
    country,
    ...(countryCode?.length === 2 ? { countryCode } : {}),
    ...(formattedAddress ? { formattedAddress } : {}),
    lat: numeric(record(place.location)?.latitude),
    lng: numeric(record(place.location)?.longitude),
    googleMapsUri: text(place.googleMapsUri),
  };
}

function source(provider: 'outing' | 'google_places' | 'ticketmaster' | 'viator' | 'mistral_web', label: string, url?: string) {
  return { id: crypto.randomUUID(), provider, label: clean(label, 240), ...(url ? { url } : {}), retrievedAt: new Date().toISOString() };
}

function formatCandidate(candidate: Json, publishedDestinationSlug?: string) {
  return {
    id: candidate.id,
    slug: candidate.slug,
    canonicalPlaceId: candidate.canonical_place_id,
    name: candidate.name,
    country: candidate.country,
    ...(candidate.country_code ? { countryCode: candidate.country_code } : {}),
    status: candidate.status,
    ...(candidate.summary ? { summary: candidate.summary } : {}),
    sources: Array.isArray(candidate.sources) ? candidate.sources : [],
    demandCount: Number(candidate.demand_count ?? 0),
    confidence: Number(candidate.confidence ?? 0),
    ...(candidate.researched_at ? { researchedAt: candidate.researched_at } : {}),
    ...(candidate.expires_at ? { expiresAt: candidate.expires_at } : {}),
    generationStatus: candidate.generation_status ?? 'ready',
    generationStage: candidate.generation_stage ?? 'complete',
    completedSections: Array.isArray(candidate.completed_sections) ? candidate.completed_sections : [],
    generationVersion: candidate.generation_version ?? 'legacy',
    isDiscoverable: candidate.is_discoverable === true,
    ...(candidate.last_generated_at ? { lastGeneratedAt: candidate.last_generated_at } : {}),
    ...(candidate.refresh_after ? { refreshAfter: candidate.refresh_after } : {}),
    ...(candidate.generation_error_category ? { failureCategory: candidate.generation_error_category } : {}),
    ...(publishedDestinationSlug ? { publishedDestinationSlug } : {}),
    ...(record(candidate.payload) ? { payload: candidate.payload } : {}),
  };
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token || token === env('SUPABASE_ANON_KEY')) return null;
  const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'));
  const { data } = await anon.auth.getUser(token);
  return data.user ?? null;
}

async function travelApi(authorization: string, operation: string, input: Json): Promise<Json> {
  const response = await fetch(`${env('SUPABASE_URL')}/functions/v1/travel-api`, {
    method: 'POST',
    headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, ...input }),
  });
  const payload = record(await response.json().catch(() => ({}))) ?? {};
  if (!response.ok || typeof payload.error === 'string') throw new Error(text(payload.error) ?? `${operation} failed`);
  return payload;
}

function startBackgroundGeneration(authorization: string, candidateId: string): void {
  const task = fetch(`${env('SUPABASE_URL')}/functions/v1/destination-discovery`, {
    method: 'POST',
    headers: {
      apikey: env('SUPABASE_ANON_KEY'),
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'generate', candidateId }),
  }).then(async (response) => {
    if (!response.ok) {
      console.error('Destination background generation failed', { candidateId, status: response.status });
    }
  }).catch(() => {
    console.error('Destination background generation request failed', { candidateId });
  });
  EdgeRuntime.waitUntil(task);
}

async function bestEffort<T>(task: Promise<T>, fallback: T): Promise<T> {
  try { return await task; } catch { return fallback; }
}

async function generateOverview(input: { name: string; country: string; places: Json[]; events: Json[]; experiences: Json[] }) {
  const apiKey = optionalEnv('MISTRAL_API_KEY');
  if (!apiKey) return {
    editorialSummary: `Outing is building a first-look guide to ${input.name}, ${input.country}, using current places, events, and bookable experiences.`,
    neighborhoods: [],
    interests: ['food', 'culture', 'history', 'nightlife'],
    practical: { gettingAround: 'Local transportation guidance is not yet verified.', typicalStay: 'Trip length guidance is not yet verified.', costContext: 'Typical costs are not yet verified.' },
  };
  const facts = {
    city: input.name,
    country: input.country,
    places: input.places.slice(0, 8).map((place) => ({ name: place.name, address: place.address, types: place.types })),
    events: input.events.slice(0, 6).map((event) => ({ name: event.name, venueName: event.venueName, startDate: event.startDate })),
    experiences: input.experiences.slice(0, 6).map((experience) => ({ title: experience.title, tags: experience.tags })),
  };
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: optionalEnv('MISTRAL_MODEL') ?? 'mistral-small-2603',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Create concise provisional travel copy using only the supplied provider facts. Return JSON with editorialSummary, neighborhoods [{name,summary}], interests [strings], and practical {gettingAround,typicalStay,costContext}. Do not make legal, safety, LGBTQ+, health, accessibility, seasonality, or cost claims; say not yet verified when facts do not support them.' },
        { role: 'user', content: JSON.stringify(facts) },
      ],
    }),
  });
  if (!response.ok) throw new Error('Mistral overview generation failed');
  const result = record(await response.json());
  const choice = Array.isArray(result?.choices) ? record(result!.choices[0]) : null;
  const content = text(record(choice?.message)?.content);
  const parsed = content ? record(JSON.parse(content)) : null;
  if (!parsed) throw new Error('Mistral returned an invalid overview');
  const neighborhoods = Array.isArray(parsed.neighborhoods) ? parsed.neighborhoods.flatMap((value) => {
    const item = record(value); const name = text(item?.name); const summary = text(item?.summary);
    return name && summary ? [{ name: clean(name, 160), summary: clean(summary, 600) }] : [];
  }).slice(0, 8) : [];
  return {
    editorialSummary: clean(text(parsed.editorialSummary) ?? `A provisional guide to ${input.name}.`),
    neighborhoods,
    interests: Array.isArray(parsed.interests) ? parsed.interests.flatMap((value) => typeof value === 'string' ? [clean(value, 80)] : []).slice(0, 16) : [],
    practical: {
      gettingAround: clean(text(record(parsed.practical)?.gettingAround) ?? 'Transportation guidance is not yet verified.', 800),
      typicalStay: clean(text(record(parsed.practical)?.typicalStay) ?? 'Trip length guidance is not yet verified.', 240),
      costContext: clean(text(record(parsed.practical)?.costContext) ?? 'Typical costs are not yet verified.', 600),
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid destination discovery request' }, 400);

  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const input = parsed.data;

  try {
    if (optionalEnv('AI_ENABLE_GLOBAL_DISCOVERY') !== 'true') {
      return json({ error: 'Destination generation is not enabled for this rollout.' }, 404);
    }
    if (input.action === 'lookup') {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const limiterSecret = optionalEnv('DISCOVERY_HASH_SECRET') ?? optionalEnv('ANALYTICS_FORWARD_SECRET') ?? env('SUPABASE_ANON_KEY');
      const lookupKey = await digest(`${limiterSecret}:${forwarded}:${input.installationId ?? 'guest'}`);
      const { data: allowed } = await service.rpc('check_destination_lookup_rate_limit', { p_key: lookupKey, p_limit: 12 });
      if (allowed !== true) return json({ error: 'Too many destination searches. Try again shortly.' }, 429);

      const normalized = clean(input.query, 120);
      const filterValue = normalized.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      if (filterValue.length < 2) return json({ matches: [] });
      const { data: existing } = await service
        .from('destination_candidates')
        .select('id,canonical_place_id,name,country,country_code')
        .eq('is_discoverable', true)
        .or(`name.ilike.%${filterValue}%,country.ilike.%${filterValue}%`)
        .limit(5);
      if (existing?.length) {
        return json({ matches: existing.map((candidate) => ({
          canonicalPlaceId: candidate.canonical_place_id,
          name: candidate.name,
          country: candidate.country,
          ...(candidate.country_code ? { countryCode: candidate.country_code } : {}),
          existingCandidateId: candidate.id,
        })) });
      }

      const places = await googleCitySearch(normalized);
      const matches = await Promise.all(places.map(async (place) => {
        const identity = cityIdentity(place);
        const { data: candidate } = await service.from('destination_candidates').select('id,is_discoverable').eq('canonical_place_id', identity.canonicalPlaceId).maybeSingle();
        return { ...identity, ...(candidate?.id && candidate.is_discoverable ? { existingCandidateId: candidate.id } : {}) };
      }));
      return json({ matches: matches.filter((match) => match.canonicalPlaceId).slice(0, 5) });
    }

    if (input.action === 'get') {
      const { data: candidate } = await service.from('destination_candidates').select('*').eq('id', input.candidateId).maybeSingle();
      if (!candidate) return json({ error: 'Destination is unavailable' }, 404);
      if (candidate.is_discoverable !== true && candidate.status !== 'published') {
        const viewer = await authenticatedUser(request);
        const { data: requestRow } = viewer
          ? await service.from('destination_candidate_requests').select('id').eq('candidate_id', candidate.id).eq('user_id', viewer.id).maybeSingle()
          : { data: null };
        if (!requestRow) return json({ error: 'Destination is unavailable' }, 404);
      }
      const { data: published } = candidate.published_destination_id
        ? await service.from('destinations').select('slug').eq('id', candidate.published_destination_id).maybeSingle()
        : { data: null };
      return json({ candidate: formatCandidate(candidate, published?.slug) });
    }

    const user = await authenticatedUser(request);
    if (!user) return json({ error: 'Authentication required' }, 401);
    const authorization = request.headers.get('Authorization')!;

    if (input.action === 'claim') {
      const place = await googlePlace(input.canonicalPlaceId);
      const identity = cityIdentity(place);
      if (!identity.canonicalPlaceId || !identity.name) return json({ error: 'City identity could not be confirmed' }, 422);

      const { data: existing } = await service.from('destination_candidates').select('*').eq('canonical_place_id', identity.canonicalPlaceId).maybeSingle();
      let candidate = existing;
      if (candidate) {
        const needsGeneration = candidate.generation_status !== 'generating'
          && (candidate.generation_version !== GENERATION_VERSION || candidate.generation_status === 'failed' || candidate.is_discoverable !== true);
        const { data } = await service.from('destination_candidates').update({
          demand_count: Number(candidate.demand_count ?? 0) + 1,
          ...(needsGeneration ? {
            generation_status: 'queued',
            generation_stage: 'identity',
            generation_version: GENERATION_VERSION,
            generation_error_category: null,
          } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', candidate.id).select('*').single();
        candidate = data;
      } else {
        const shortHash = (await digest(identity.canonicalPlaceId)).slice(0, 7);
        const createdAt = new Date().toISOString();
        const { data, error } = await service.from('destination_candidates').insert({
          canonical_place_id: identity.canonicalPlaceId,
          slug: `${safeSlug(identity.name)}-${safeSlug(identity.country)}-${shortHash}`,
          name: identity.name,
          country: identity.country,
          country_code: identity.countryCode ?? null,
          status: 'researching',
          summary: `Outing is generating a first-look guide to ${identity.name}, ${identity.country}.`,
          payload: { lat: identity.lat, lng: identity.lng, googleMapsUri: identity.googleMapsUri, galleryImageUrls: [], bestMonths: [], interests: [], neighborhoods: [], places: [], events: [], experiences: [], practical: {}, verification: { identity: 'verified', seasonality: 'not_verified', lgbtqContext: 'not_verified', accessibility: 'not_verified', safety: 'not_verified', costs: 'not_verified' } },
          sources: [source('google_places', `Google Places identity: ${identity.name}`, identity.googleMapsUri)],
          demand_count: 1,
          confidence: 0.5,
          generation_status: 'queued',
          generation_stage: 'identity',
          completed_sections: ['identity'],
          generation_version: GENERATION_VERSION,
          is_discoverable: false,
          researched_at: createdAt,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        }).select('*').single();
        if (error || !data) throw new Error(error?.message ?? 'Could not create destination');
        candidate = data;
      }
      await service.from('destination_candidate_requests').upsert({ candidate_id: candidate.id, user_id: user.id, query: clean(input.originalQuery, 120) }, { onConflict: 'candidate_id,user_id' });
      if (candidate.generation_status !== 'ready' && candidate.generation_status !== 'generating') {
        await service.from('destination_generation_jobs').insert({ candidate_id: candidate.id, requested_by: user.id, generation_version: GENERATION_VERSION }).then(() => undefined, () => undefined);
        startBackgroundGeneration(authorization, candidate.id);
      }
      const { data: published } = candidate.published_destination_id
        ? await service.from('destinations').select('slug').eq('id', candidate.published_destination_id).maybeSingle()
        : { data: null };
      return json({ candidate: formatCandidate(candidate, published?.slug), reused: Boolean(existing) });
    }

    const { data: requestRow } = await service.from('destination_candidate_requests').select('id').eq('candidate_id', input.candidateId).eq('user_id', user.id).maybeSingle();
    if (!requestRow) return json({ error: 'Destination research access required' }, 403);
    const { data: candidateRow } = await service.from('destination_candidates').select('*').eq('id', input.candidateId).single();
    let candidate = candidateRow;
    if (!candidate) return json({ error: 'Destination is unavailable' }, 404);
    if (candidate.generation_status === 'ready' && input.action !== 'refresh') return json({ candidate: formatCandidate(candidate), reused: true });
    if (candidate.generation_status === 'generating') return json({ candidate: formatCandidate(candidate), reused: true });

    const now = new Date().toISOString();
    const claimableStatuses = input.action === 'refresh' ? ['queued', 'failed', 'ready'] : ['queued', 'failed'];
    const { data: generationClaim } = await service.from('destination_candidates')
      .update({ generation_status: 'generating', generation_stage: 'places', generation_error_category: null, updated_at: now })
      .eq('id', candidate.id)
      .in('generation_status', claimableStatuses)
      .select('*')
      .maybeSingle();
    if (!generationClaim) {
      const { data: current } = await service.from('destination_candidates').select('*').eq('id', candidate.id).single();
      return json({ candidate: formatCandidate(current ?? candidate), reused: true });
    }
    candidate = generationClaim;
    await service.from('destination_generation_jobs').insert({ candidate_id: candidate.id, requested_by: user.id, generation_version: GENERATION_VERSION }).then(() => undefined, () => undefined);
    await service.from('destination_generation_jobs').update({ status: 'running', started_at: now, attempts: Number(candidate.attempts ?? 0) + 1, updated_at: now }).eq('candidate_id', candidate.id).in('status', ['queued', 'failed']);

    try {
      const basePayload = record(candidate.payload) ?? {};
      const lat = numeric(basePayload.lat);
      const lng = numeric(basePayload.lng);
      const placesData = await bestEffort(travelApi(authorization, 'placeTextSearch', { query: `top attractions and landmarks in ${candidate.name}, ${candidate.country}`, limit: 5, ...(lat !== undefined && lng !== undefined ? { lat, lng, radiusMeters: 20_000 } : {}) }), { places: [] });
      const rawPlaces = Array.isArray(placesData.places) ? placesData.places.map(record).filter((item): item is Json => item !== null) : [];
      const places = rawPlaces.slice(0, 12).map((place) => ({
        id: text(place.providerPlaceId) ?? crypto.randomUUID(),
        name: clean(text(place.name) ?? 'Place', 200),
        category: Array.isArray(place.types) && typeof place.types[0] === 'string' ? clean(place.types[0], 80) : 'place',
        ...(numeric(place.rating) !== undefined ? { rating: numeric(place.rating) } : {}),
        ...(text(place.address) ? { address: clean(text(place.address)!, 300) } : {}),
        ...(Array.isArray(place.photos) && text(record(place.photos[0])?.url) ? { imageUrl: text(record(place.photos[0])?.url) } : {}),
        ...(text(place.googleMapsUri) ? { sourceUrl: text(place.googleMapsUri) } : {}),
      }));
      await service.from('destination_candidates').update({ payload: { ...basePayload, places }, completed_sections: ['identity', 'places'], generation_stage: 'experiences', updated_at: new Date().toISOString() }).eq('id', candidate.id);

      const [experienceData, eventData, imageData] = await Promise.all([
        bestEffort(travelApi(authorization, 'viatorSearch', { destination: `${candidate.name}, ${candidate.country}`, limit: 8 }), { products: [] }),
        lat !== undefined && lng !== undefined ? bestEffort(travelApi(authorization, 'ticketmasterEvents', { lat, lng, limit: 8 }), { events: [] }) : Promise.resolve({ events: [] }),
        bestEffort(travelApi(authorization, 'locationImageSearch', { subject: candidate.name, destination: `${candidate.name}, ${candidate.country}`, kind: 'destination', limit: 5 }), { images: [] }),
      ]);
      const rawExperiences = Array.isArray(experienceData.products) ? experienceData.products.map(record).filter((item): item is Json => item !== null) : [];
      const experiences = rawExperiences.slice(0, 10).map((item) => ({ id: text(item.productCode) ?? crypto.randomUUID(), title: clean(text(item.title) ?? 'Experience', 240), ...(text(item.description) ? { summary: clean(text(item.description)!, 600) } : {}), ...(Array.isArray(item.images) && text(record(item.images[0])?.url) ? { imageUrl: text(record(item.images[0])?.url) } : {}), ...(numeric(item.priceFrom) !== undefined ? { priceFrom: numeric(item.priceFrom) } : {}), ...(text(item.currency) ? { currency: text(item.currency) } : {}), ...(text(item.productUrl) ? { sourceUrl: text(item.productUrl) } : {}) }));
      const rawEvents = Array.isArray(eventData.events) ? eventData.events.map(record).filter((item): item is Json => item !== null) : [];
      const events = rawEvents.slice(0, 10).map((item) => ({ id: text(item.id) ?? crypto.randomUUID(), name: clean(text(item.name) ?? 'Event', 240), ...(text(item.startDate) ? { startDate: text(item.startDate) } : {}), ...(text(item.venueName) ? { venueName: clean(text(item.venueName)!, 240) } : {}), ...(text(item.imageUrl) ? { imageUrl: text(item.imageUrl) } : {}), ...(text(item.url) ? { sourceUrl: text(item.url) } : {}) }));
      const images = Array.isArray(imageData.images) ? imageData.images.map(record).filter((item): item is Json => item !== null) : [];
      const galleryImageUrls = images.flatMap((item) => text(item.url) ? [text(item.url)!] : []).slice(0, 5);
      const heroImage = images[0];
      const enrichedPayload = {
        ...basePayload,
        places,
        experiences,
        events,
        ...(galleryImageUrls[0] ? {
          heroImageUrl: galleryImageUrls[0],
          ...(text(heroImage?.author) ? { heroImageAttribution: `Photo by ${clean(text(heroImage?.author)!, 200)} · Pexels` } : { heroImageAttribution: 'Photo via Pexels' }),
          ...(text(heroImage?.sourcePage) ? { heroImageSourceUrl: text(heroImage?.sourcePage) } : {}),
        } : {}),
        galleryImageUrls,
      };
      await service.from('destination_candidates').update({ payload: enrichedPayload, completed_sections: ['identity', 'places', 'experiences', 'events', 'images'], generation_stage: 'context', updated_at: new Date().toISOString() }).eq('id', candidate.id);

      const overview = await bestEffort(generateOverview({ name: candidate.name, country: candidate.country, places: rawPlaces, events: rawEvents, experiences: rawExperiences }), null);
      const finalPayload = {
        ...enrichedPayload,
        ...(overview ?? {}),
        bestMonths: [],
        verification: { identity: 'verified', places: places.length ? 'verified' : 'limited', experiences: experiences.length ? 'verified' : 'limited', events: events.length ? 'verified' : 'limited', imagery: galleryImageUrls.length ? 'verified' : 'limited', overview: overview ? 'limited' : 'not_verified', seasonality: 'not_verified', lgbtqContext: 'not_verified', accessibility: 'not_verified', safety: 'not_verified', costs: 'not_verified' },
      };
      if (places.length < 3) throw new Error('Insufficient provider data to publish a reusable overview');
      await service.from('destination_candidates').update({ generation_stage: 'finalizing', payload: finalPayload, completed_sections: ['identity', 'places', 'experiences', 'events', 'images', 'overview'], updated_at: new Date().toISOString() }).eq('id', candidate.id);
      const finishedAt = new Date().toISOString();
      const summary = text(finalPayload.editorialSummary) ?? `A provisional Outing guide to ${candidate.name}, ${candidate.country}.`;
      const { data: ready } = await service.from('destination_candidates').update({ status: 'provisional', summary, payload: finalPayload, generation_status: 'ready', generation_stage: 'complete', generation_version: GENERATION_VERSION, is_discoverable: true, confidence: Math.min(0.85, 0.5 + [places.length > 0, experiences.length > 0, events.length > 0, galleryImageUrls.length > 0, Boolean(overview)].filter(Boolean).length * 0.06), last_generated_at: finishedAt, refresh_after: new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString(), researched_at: finishedAt, updated_at: finishedAt }).eq('id', candidate.id).select('*').single();
      await service.from('destination_generation_jobs').update({ status: 'complete', finished_at: finishedAt, updated_at: finishedAt }).eq('candidate_id', candidate.id).in('status', ['queued', 'running']);
      return json({ candidate: formatCandidate(ready) });
    } catch (generationError) {
      const finishedAt = new Date().toISOString();
      const category = generationError instanceof Error && /rate/i.test(generationError.message)
        ? 'rate_limited'
        : generationError instanceof Error && /insufficient/i.test(generationError.message)
          ? 'insufficient_provider_data'
          : 'provider_failed';
      await service.from('destination_candidates').update({ generation_status: 'failed', generation_error_category: category, updated_at: finishedAt }).eq('id', candidate.id);
      await service.from('destination_generation_jobs').update({ status: 'failed', error_category: category, finished_at: finishedAt, updated_at: finishedAt }).eq('candidate_id', candidate.id).in('status', ['queued', 'running']);
      return json({ error: 'Destination generation could not finish', code: category }, 502);
    }
  } catch (caught) {
    return json({ error: caught instanceof Error ? caught.message : 'Destination discovery failed' }, 500);
  }
});
