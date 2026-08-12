import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const projectUrl = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const catalogRecords = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed/destinations.json'), 'utf8'));
const approved = (destination) =>
  destination.publicationStatus === 'published'
  && destination.editorialReview?.status === 'approved'
  && destination.editorialReview?.legalContextReviewed === true
  && destination.editorialReview?.placesValidated === true;
const expansionWaves = ['lgbtq_priority', 'global_popular'];
const readyWaves = new Set(expansionWaves.filter((wave) => {
  const records = catalogRecords.filter((destination) => destination.catalogWave === wave);
  return records.length > 0 && records.every(approved);
}));
const destinations = catalogRecords.filter((destination) =>
  approved(destination)
  && (destination.catalogWave === 'original' || readyWaves.has(destination.catalogWave)));
const scoringBySlug = new Map(
  JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed/destinations.scoring.json'), 'utf8'))
    .map((destination) => [destination.slug, destination]),
);

if (!Array.isArray(catalogRecords) || catalogRecords.length === 0) {
  throw new Error('fixtures/seed/destinations.json does not contain destinations');
}
if (dryRun) {
  console.log(`Validated ${catalogRecords.length} catalog records; ${destinations.length} are approved for publication. No remote writes performed.`);
  for (const wave of expansionWaves) console.log(`${wave}: ${readyWaves.has(wave) ? 'ready' : 'blocked until the full wave is approved'}`);
  process.exit(0);
}
if (destinations.length === 0) throw new Error('No destinations have completed editorial and place validation');
if (!projectUrl || !serviceKey) {
  throw new Error('SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required');
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 400)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function uniqueSources(destination) {
  const values = [
    ...(destination.sources ?? []).map((source) => ({
      title: source.label,
      url: source.url,
      accessedAt: destination.dataFreshness,
    })),
    ...(destination.lgbtqContext?.sources ?? []).map((source) => ({
      title: source.title,
      url: source.url,
      accessedAt: source.accessedAt,
    })),
  ];
  const seen = new Set();
  return values.filter((source) => {
    const key = `${source.title}|${source.url ?? ''}`;
    if (!source.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

for (const destination of destinations) {
  const destinationRow = {
    id: destination.id,
    slug: destination.slug,
    name: destination.name,
    country: destination.country,
    country_code: destination.countryCode,
    lat: destination.lat,
    lng: destination.lng,
    timezone: destination.timezone,
    currency: destination.currency,
    editorial_summary: destination.editorialSummary,
    hero_image_url: destination.heroImageUrl,
    payload: { ...destination, scoring: scoringBySlug.get(destination.slug) ?? null },
    published: true,
    data_freshness: destination.dataFreshness,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };
  const rows = await rest('destinations?on_conflict=slug', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(destinationRow),
  });
  const destinationId = rows?.[0]?.id ?? destination.id;

  for (const table of ['destination_seasons', 'destination_context', 'destination_sources', 'places', 'events']) {
    await rest(`${table}?destination_id=eq.${encodeURIComponent(destinationId)}`, { method: 'DELETE' });
  }

  await rest('destination_seasons', {
    method: 'POST',
    body: JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
      destination_id: destinationId,
      month: index + 1,
      score: destination.bestMonths?.includes(index + 1) ? 100 : 50,
      notes: destination.bestMonths?.includes(index + 1) ? 'Recommended in Outing editorial data' : null,
    }))),
  });

  if (destination.lgbtqContext) {
    await rest('destination_context', {
      method: 'POST',
      body: JSON.stringify({
        destination_id: destinationId,
        payload: destination.lgbtqContext,
        last_reviewed_at: destination.lgbtqContext.lastReviewedAt,
        data_label: destination.lgbtqContext.dataLabel ?? destination.sourceLabel ?? 'editorial_seed',
      }),
    });
  }

  const sources = uniqueSources(destination).map((source) => ({
    destination_id: destinationId,
    title: source.title,
    url: source.url ?? null,
    accessed_at: source.accessedAt ?? destination.dataFreshness,
  }));
  if (sources.length) await rest('destination_sources', { method: 'POST', body: JSON.stringify(sources) });

  const places = (destination.places ?? []).map((place) => ({
    id: place.id,
    destination_id: destinationId,
    name: place.name,
    category: place.category,
    address: place.address ?? null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    summary: place.summary ?? null,
    payload: place,
    published: true,
    deleted_at: null,
  }));
  if (places.length) await rest('places', { method: 'POST', body: JSON.stringify(places) });

  const events = (destination.events ?? []).map((event) => ({
    id: event.id,
    destination_id: destinationId,
    title: event.title,
    start_date: event.startDate ? `${event.startDate}T12:00:00Z` : null,
    end_date: event.endDate ? `${event.endDate}T12:00:00Z` : null,
    category: event.category ?? null,
    summary: event.summary ?? null,
    payload: event,
    published: true,
  }));
  if (events.length) await rest('events', { method: 'POST', body: JSON.stringify(events) });

  console.log(`Published ${destination.name}`);
}

console.log(`Published ${destinations.length} Outing destinations to Supabase.`);
if (destinations.length < catalogRecords.length) {
  console.log(`Skipped ${catalogRecords.length - destinations.length} review-gated catalog drafts.`);
}
