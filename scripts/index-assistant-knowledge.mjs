import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlaceKnowledgeChunks } from './lib/place-intelligence.mjs';

const dryRun = process.argv.includes('--dry-run');
const projectUrl = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const mistralKey = process.env.MISTRAL_API_KEY ?? '';
const embeddingModel = process.env.MISTRAL_EMBED_MODEL ?? 'mistral-embed-2312';
const includeDrafts = process.argv.includes('--include-drafts');
const catalogRecords = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed/destinations.json'), 'utf8'));
const destinations = catalogRecords.filter((destination) => includeDrafts || (
  destination.publicationStatus === 'published'
  && destination.editorialReview?.status === 'approved'
  && destination.editorialReview?.legalContextReviewed === true
  && destination.editorialReview?.placesValidated === true
));
const experiences = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed/experiences.json'), 'utf8'));

async function loadPublishedPlaceOverlays() {
  if (dryRun || !projectUrl || !serviceKey) return new Map();
  const response = await fetch(`${projectUrl}/rest/v1/places?select=*&published=eq.true&deleted_at=is.null&limit=1000`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) throw new Error(`Could not load enriched place records (${response.status})`);
  const rows = await response.json();
  return new Map(rows.map((row) => {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return [String(row.id), {
      ...payload,
      id: row.id,
      name: row.name,
      category: row.category,
      address: row.address,
      summary: row.summary,
      lat: row.lat,
      lng: row.lng,
      primaryType: row.primary_type ?? payload.primaryType,
      neighborhood: row.neighborhood ?? payload.neighborhood,
      lgbtqRelevance: row.lgbtq_relevance ?? payload.lgbtqRelevance,
      estimatedCostUsd: row.estimated_cost_usd ?? payload.estimatedCostUsd,
      durationMinutes: row.duration_minutes ?? payload.durationMinutes,
      accessibilityNotes: row.accessibility_notes ?? payload.accessibilityNotes,
      websiteUri: row.website_uri ?? payload.websiteUri,
      googleMapsUri: row.google_maps_uri ?? payload.googleMapsUri,
      rating: row.rating ?? payload.rating,
      reviewCount: row.review_count ?? payload.reviewCount,
      priceLevel: row.price_level ?? payload.priceLevel,
      businessStatus: row.business_status ?? payload.businessStatus,
      openingHours: payload.openingHours ?? row.opening_hours?.periods ?? [],
      weekdayDescriptions: payload.weekdayDescriptions ?? row.opening_hours?.weekdayDescriptions ?? [],
      currentWeekdayDescriptions: payload.currentWeekdayDescriptions ?? row.opening_hours?.currentWeekdayDescriptions ?? [],
      openNow: payload.openNow ?? row.opening_hours?.openNow,
      accessibilityOptions: payload.accessibilityOptions ?? row.attributes?.accessibilityOptions ?? {},
      attributes: payload.attributes ?? row.attributes ?? {},
      providerPlaceId: row.provider_place_id ?? payload.providerPlaceId,
      verifiedAt: row.verified_at ?? payload.verifiedAt,
    }];
  }));
}

const publishedPlaceOverlays = await loadPublishedPlaceOverlays();

function clean(value, limit = 7_500) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceIds(destination) {
  return [...new Set([
    ...(destination.sources ?? []).map((source) => source.id ?? source.url ?? source.label),
    ...(destination.lgbtqContext?.sources ?? []).map((source) => source.id ?? source.url ?? source.title),
  ].filter(Boolean).map(String))].slice(0, 20);
}

function chunk(entityType, entityId, destinationSlug, chunkKind, text, sources, freshness, metadata = {}) {
  const approvedText = clean(text);
  if (!approvedText) return null;
  return {
    entity_type: entityType,
    entity_id: String(entityId),
    destination_slug: destinationSlug ?? null,
    chunk_kind: chunkKind,
    approved_text: approvedText,
    content_hash: hash(approvedText),
    source_ids: sources,
    metadata,
    data_freshness: freshness ?? null,
    published: true,
  };
}

const chunks = destinations.flatMap((destination) => {
  const sources = sourceIds(destination);
  const values = [
    chunk('destination', destination.slug, destination.slug, 'overview', [
      destination.name,
      destination.country,
      destination.editorialSummary,
      `Interests: ${(destination.interests ?? []).join(', ')}`,
      `Best months: ${(destination.bestMonths ?? []).join(', ')}`,
    ].join('. '), sources, destination.dataFreshness, { name: destination.name, country: destination.country }),
    ...(destination.neighborhoods ?? []).map((neighborhood, index) => chunk(
      'neighborhood',
      neighborhood.id ?? `${destination.slug}-neighborhood-${index}`,
      destination.slug,
      'neighborhood',
      `${neighborhood.name}. ${neighborhood.summary ?? neighborhood.description ?? ''}`,
      sources,
      destination.dataFreshness,
      { name: neighborhood.name },
    )),
    ...(destination.places ?? []).flatMap((fixturePlace) => {
      const place = { ...fixturePlace, ...(publishedPlaceOverlays.get(String(fixturePlace.id)) ?? {}) };
      return buildPlaceKnowledgeChunks(place, {
      destinationSourceIds: sources,
      freshness: destination.dataFreshness,
      }).map((placeChunk) => chunk(
        'place', place.id, destination.slug, placeChunk.chunkKind,
        placeChunk.text, placeChunk.sourceIds, placeChunk.freshness, placeChunk.metadata,
      ));
    }),
    ...(destination.events ?? []).map((event) => chunk(
      'event', event.id, destination.slug, 'event',
      `${event.title ?? event.name}. ${event.category ?? ''}. ${event.summary ?? ''}. ${event.startDate ?? ''}`,
      sources, destination.dataFreshness, { name: event.title ?? event.name, startDate: event.startDate },
    )),
  ];
  if (destination.lgbtqContext) values.push(chunk(
    'destination_context', `${destination.slug}-lgbtq`, destination.slug, 'lgbtq_context',
    [
      destination.lgbtqContext.humanRightsSummary,
      destination.lgbtqContext.localVariation,
      destination.lgbtqContext.practicalNotes,
    ].filter(Boolean).join('. '),
    sources,
    destination.lgbtqContext.lastReviewedAt ?? destination.dataFreshness,
    { dataLabel: destination.lgbtqContext.dataLabel ?? 'editorial' },
  ));
  return values.filter(Boolean);
});

for (const experience of experiences) {
  const destinationSlug = experience.destinationSlug ?? experience.destination_slug;
  chunks.push(chunk(
    'experience', experience.id, destinationSlug, 'experience',
    `${experience.title}. ${experience.summary ?? experience.description ?? ''}. ${(experience.tags ?? []).join(', ')}`,
    ['outing-experience-catalog'], experience.dataFreshness ?? null,
    { title: experience.title, category: experience.category },
  ));
}

const validChunks = chunks.filter(Boolean);
if (dryRun) {
  console.log(`Validated ${validChunks.length} approved knowledge chunks. No remote writes performed.`);
  process.exit(0);
}
if (!projectUrl || !serviceKey || !mistralKey) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MISTRAL_API_KEY are required');
}

const restHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders, ...init.headers },
  });
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

const existing = await rest('assistant_knowledge_chunks?select=id,entity_type,entity_id,chunk_kind,content_hash,embedding_model');
const existingByKey = new Map((existing ?? []).map((row) => [
  `${row.entity_type}|${row.entity_id}|${row.chunk_kind}`,
  row,
]));
const changed = validChunks.filter((item) => {
  const prior = existingByKey.get(`${item.entity_type}|${item.entity_id}|${item.chunk_kind}`);
  return prior?.content_hash !== item.content_hash || prior?.embedding_model !== embeddingModel;
});
const validKeys = new Set(validChunks.map((item) => `${item.entity_type}|${item.entity_id}|${item.chunk_kind}`));
const managedEntityTypes = new Set(['destination', 'destination_context', 'place', 'event', 'experience', 'neighborhood']);
const obsolete = (existing ?? []).filter((item) =>
  managedEntityTypes.has(item.entity_type)
  && !validKeys.has(`${item.entity_type}|${item.entity_id}|${item.chunk_kind}`));

for (let start = 0; start < changed.length; start += 32) {
  const batch = changed.slice(start, start + 32);
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mistralKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: embeddingModel, input: batch.map((item) => item.approved_text) }),
  });
  if (!response.ok) throw new Error(`Mistral embeddings failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  const body = await response.json();
  const now = new Date().toISOString();
  const rows = batch.map((item, index) => {
    const embedding = body.data?.[index]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1024) throw new Error(`Unexpected embedding for ${item.entity_id}`);
    return { ...item, embedding, embedding_model: embeddingModel, embedded_at: now, updated_at: now };
  });
  await rest('assistant_knowledge_chunks?on_conflict=entity_type,entity_id,chunk_kind', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  console.log(`Indexed ${Math.min(start + batch.length, changed.length)}/${changed.length} changed chunks`);
}

for (let start = 0; start < obsolete.length; start += 100) {
  const ids = obsolete.slice(start, start + 100).map((item) => item.id).filter(Boolean);
  if (!ids.length) continue;
  await rest(`assistant_knowledge_chunks?id=in.(${ids.join(',')})`, { method: 'DELETE' });
}

console.log(`Knowledge index ready: ${validChunks.length} total, ${changed.length} embedded or refreshed, ${obsolete.length} obsolete chunks removed.`);
