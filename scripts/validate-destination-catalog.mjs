import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXPECTED_EXPANSION_SLUGS } from '../fixtures/catalog/destination-expansion.mjs';

const publishMode = process.argv.includes('--publish');
const publishWave = process.argv.find((argument) => argument.startsWith('--wave='))?.split('=')[1];
if (publishWave && !['lgbtq_priority', 'global_popular'].includes(publishWave)) {
  throw new Error(`Unknown wave "${publishWave}". Use lgbtq_priority or global_popular.`);
}
const destinations = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed/destinations.json'), 'utf8'));
const failures = [];
const slugs = new Set();
const ids = new Set();
const validAdvisories = new Set(['standard', 'caution', 'elevated', 'severe']);
const authoritativeSourceTypes = new Set(['human_rights', 'local_advocacy', 'government', 'comparative_index', 'ilga']);

function fail(slug, message) { failures.push(`${slug}: ${message}`); }
function validUrl(value) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
function olderThan(value, days) {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || Date.now() - timestamp > days * 24 * 60 * 60 * 1000;
}

if (destinations.length !== 60) failures.push(`catalog: expected 60 records, found ${destinations.length}`);
for (const expected of EXPECTED_EXPANSION_SLUGS) {
  if (!destinations.some((destination) => destination.slug === expected)) failures.push(`catalog: missing ${expected}`);
}

for (const destination of destinations) {
  const slug = destination.slug ?? 'unknown';
  const inPublishScope = publishMode && (destination.catalogWave === 'original' || !publishWave || destination.catalogWave === publishWave);
  if (slugs.has(slug)) fail(slug, 'duplicate slug');
  if (ids.has(destination.id)) fail(slug, 'duplicate destination id');
  slugs.add(slug); ids.add(destination.id);
  if (!['city', 'island', 'resort_area'].includes(destination.destinationType)) fail(slug, 'invalid destinationType');
  if (!validAdvisories.has(destination.travelerAdvisoryLevel)) fail(slug, 'invalid travelerAdvisoryLevel');
  if (!Number.isFinite(destination.lat) || destination.lat < -90 || destination.lat > 90) fail(slug, 'invalid latitude');
  if (!Number.isFinite(destination.lng) || destination.lng < -180 || destination.lng > 180) fail(slug, 'invalid longitude');
  try { new Intl.DateTimeFormat('en', { timeZone: destination.timezone }); } catch { fail(slug, 'invalid timezone'); }
  try { new Intl.NumberFormat('en', { style: 'currency', currency: destination.currency }); } catch { fail(slug, 'invalid currency'); }
  if (new Set(destination.interests ?? []).size !== (destination.interests ?? []).length) fail(slug, 'duplicate interests');
  if ((destination.bestMonths ?? []).some((month) => !Number.isInteger(month) || month < 1 || month > 12)) fail(slug, 'invalid best month');
  if (destination.weatherProfile?.avgHighByMonth?.length !== 12 || destination.weatherProfile?.avgLowByMonth?.length !== 12) fail(slug, 'weather profile must contain 12 months');
  if ((destination.neighborhoods ?? []).length < 2) fail(slug, 'requires at least two neighborhoods');
  if ((destination.places ?? []).length < 6) fail(slug, 'requires at least six places');
  if ((destination.events ?? []).length < 2) fail(slug, 'requires at least two events');
  const pulse = destination.communityPulseComponents ?? {};
  for (const field of ['sourcedCommunityPlaces', 'sourcedCommunityEvents', 'authoritativeCommunitySources']) {
    if (!Number.isInteger(pulse[field]) || pulse[field] < 0) fail(slug, `invalid Community Pulse ${field}`);
  }
  for (const field of ['recentReviews', 'activeContributors', 'publicTrips', 'aggregateCheckins']) {
    if ((pulse[field] ?? 0) !== 0) fail(slug, `synthetic Community Pulse activity is not allowed in ${field}`);
  }
  const sources = destination.sources ?? [];
  if (sources.length < 5) fail(slug, 'requires at least five sources');
  if (sources.some((source) => !validUrl(source.url))) fail(slug, 'all source URLs must use HTTPS');
  if (sources.some((source) => olderThan(source.accessedAt, 365))) fail(slug, 'source access dates must be refreshed annually');
  const contextSources = destination.lgbtqContext?.sources ?? [];
  if (contextSources.length < 2) fail(slug, 'requires two LGBTQ+ context sources');
  if (!sources.some((source) => authoritativeSourceTypes.has(source.type))) fail(slug, 'requires an authoritative LGBTQ+ source');
  if (['criminalized', 'heavily_criminalized'].includes(destination.scoringMetadata?.legalStatus)
      && destination.travelerAdvisoryLevel !== 'severe') fail(slug, 'criminalized destinations require severe advisory');
  if (inPublishScope && destination.catalogWave !== 'original') {
    if (destination.editorialReview?.status !== 'approved') fail(slug, 'human editorial approval required');
    if (!destination.editorialReview?.legalContextReviewed) fail(slug, 'LGBTQ+ context review required');
    if (!destination.editorialReview?.placesValidated) fail(slug, 'Google place validation required');
    if ((destination.places ?? []).some((place) => !place.providerPlaceId || !Number.isFinite(place.lat) || !Number.isFinite(place.lng))) fail(slug, 'canonical place IDs and coordinates required');
    if ((destination.events ?? []).some((event) => event.scheduleStatus !== 'verified')) fail(slug, 'event dates must be verified');
    if (!destination.heroImageUrl || (destination.galleryImageUrls ?? []).length < 4) fail(slug, 'hero and four gallery images required');
  }
  if (inPublishScope) {
    const freshness = destination.catalogFreshness ?? {};
    if (olderThan(freshness.legalContextReviewedAt ?? destination.lgbtqContext?.lastReviewedAt, 90)) fail(slug, 'LGBTQ+ context is older than 90 days');
    if (contextSources.some((source) => olderThan(source.accessedAt, 90))) fail(slug, 'LGBTQ+ sources are older than 90 days');
    if (olderThan(freshness.venuesReviewedAt, 30)) fail(slug, 'venue data are older than 30 days');
    if (olderThan(freshness.eventsReviewedAt, 30)) fail(slug, 'event data are older than 30 days');
    if (olderThan(freshness.pricingReviewedAt ?? destination.dataFreshness, 90)) fail(slug, 'pricing data are older than 90 days');
    if (olderThan(freshness.climateReviewedAt ?? destination.dataFreshness, 365)) fail(slug, 'climate data are older than one year');
  }
}

const byteSize = Buffer.byteLength(JSON.stringify(destinations)) + Buffer.byteLength(readFileSync(resolve(process.cwd(), 'fixtures/seed/destinations.scoring.json')));
if (byteSize > 1_250_000) failures.push(`catalog: offline payload ${byteSize} bytes exceeds 1.25 MB`);

if (failures.length) {
  console.error(`Catalog validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`Validated ${destinations.length} destinations in ${publishMode ? `publish mode${publishWave ? ` for ${publishWave}` : ''}` : 'draft mode'} (${byteSize} bytes).`);
