import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const INPUT_PATH = resolve(ROOT, 'fixtures/seed/destinations.json');
const OUTPUT_PATH = resolve(ROOT, 'fixtures/seed/destinations.scoring.json');

const EVENT_TYPE_MAP = {
  pride: 'pride', festival: 'festival', party: 'party', arts: 'other', community: 'other',
};

function deriveCommunityScore(destination) {
  const pulse = destination.communityPulseComponents ?? {};
  const directCommunityPlaces = pulse.sourcedCommunityPlaces ?? 0;
  const queerEvents = pulse.sourcedCommunityEvents ?? 0;
  const authoritativeSources = pulse.authoritativeCommunitySources ?? 0;
  return Math.max(20, Math.min(95,
    12
      + Math.min(48, directCommunityPlaces * 8)
      + Math.min(24, queerEvents * 12)
      + Math.min(12, authoritativeSources * 4),
  ));
}

function buildRow(destination) {
  const metadata = destination.scoringMetadata;
  if (!metadata?.continentCode || !metadata?.nearestAirportCodes?.length || !metadata?.legalStatus) {
    throw new Error(`Missing scoringMetadata for ${destination.slug}`);
  }
  const highByMonth = destination.weatherProfile?.avgHighByMonth ?? [];
  return {
    slug: destination.slug,
    name: destination.name,
    country: destination.country,
    countryCode: destination.countryCode,
    destinationType: destination.destinationType ?? 'city',
    travelerAdvisoryLevel: destination.travelerAdvisoryLevel ?? 'standard',
    continentCode: metadata.continentCode,
    nearestAirportCodes: metadata.nearestAirportCodes,
    legalStatus: metadata.legalStatus,
    safetyScore: destination.lgbtqContext?.publicOpinionScore ?? 50,
    communityScore: deriveCommunityScore(destination),
    nightlifeScore: metadata.nightlifeScore ?? 50,
    bestMonths: destination.bestMonths ?? [],
    avgTempCByMonth: Object.fromEntries(highByMonth.map((temperature, index) => [String(index + 1), temperature])),
    interests: metadata.interests ?? [],
    upcomingEvents: (destination.events ?? []).map((event) => ({
      name: event.title,
      month: new Date(`${event.startDate}T12:00:00Z`).getUTCMonth() + 1,
      type: EVENT_TYPE_MAP[event.category] ?? 'other',
    })),
    accessibility: {
      wheelchairFriendly: Boolean(destination.accessibility?.wheelchairFriendly),
      brailleAvailable: Boolean(destination.accessibility?.brailleAvailable),
      notes: destination.accessibility?.notes
        ?? 'Check individual venues and transport providers for current accessibility details.',
    },
    costPerDay: {
      budget: destination.priceBands?.shoestring?.perPersonPerDayUsd?.low ?? 0,
      mid: destination.priceBands?.mid?.perPersonPerDayUsd?.low ?? 0,
      luxury: destination.priceBands?.luxury?.perPersonPerDayUsd?.low ?? 0,
    },
    lastUpdated: String(destination.dataFreshness).slice(0, 10),
    typicalStayDays: metadata.typicalStayDays,
  };
}

const destinations = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
if (!Array.isArray(destinations)) throw new Error('Expected destinations.json to contain an array.');

const rows = destinations.map(buildRow);
writeFileSync(OUTPUT_PATH, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Wrote ${rows.length} lightweight scoring destinations to ${OUTPUT_PATH}`);
