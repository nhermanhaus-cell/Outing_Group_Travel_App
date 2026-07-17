import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const INPUT_PATH = resolve(ROOT, 'fixtures/seed/destinations.json');
const OUTPUT_PATH = resolve(ROOT, 'fixtures/seed/destinations.scoring.json');

const SCORING_METADATA = {
  'san-francisco': { continentCode: 'NA', nearestAirportCodes: ['SFO', 'OAK'], legalStatus: 'marriage_equality', nightlifeScore: 85, typicalStayDays: { min: 3, max: 10 } },
  'palm-springs': { continentCode: 'NA', nearestAirportCodes: ['PSP'], legalStatus: 'marriage_equality', nightlifeScore: 85, typicalStayDays: { min: 3, max: 5 } },
  'puerto-vallarta': { continentCode: 'NA', nearestAirportCodes: ['PVR'], legalStatus: 'civil_union', nightlifeScore: 86, typicalStayDays: { min: 4, max: 7 } },
  'mexico-city': { continentCode: 'NA', nearestAirportCodes: ['MEX'], legalStatus: 'civil_union', nightlifeScore: 82, typicalStayDays: { min: 3, max: 6 } },
  'new-york-city': { continentCode: 'NA', nearestAirportCodes: ['JFK', 'LGA', 'EWR'], legalStatus: 'marriage_equality', nightlifeScore: 88, typicalStayDays: { min: 4, max: 8 } },
  miami: { continentCode: 'NA', nearestAirportCodes: ['MIA', 'FLL'], legalStatus: 'civil_union', nightlifeScore: 87, typicalStayDays: { min: 3, max: 6 } },
  provincetown: { continentCode: 'NA', nearestAirportCodes: ['PVC', 'BOS'], legalStatus: 'marriage_equality', nightlifeScore: 62, typicalStayDays: { min: 2, max: 5 } },
  montreal: { continentCode: 'NA', nearestAirportCodes: ['YUL'], legalStatus: 'marriage_equality', nightlifeScore: 84, typicalStayDays: { min: 3, max: 5 } },
  london: { continentCode: 'EU', nearestAirportCodes: ['LHR', 'LGW'], legalStatus: 'marriage_equality', nightlifeScore: 84, typicalStayDays: { min: 3, max: 6 } },
  berlin: { continentCode: 'EU', nearestAirportCodes: ['BER'], legalStatus: 'marriage_equality', nightlifeScore: 91, typicalStayDays: { min: 3, max: 6 } },
  madrid: { continentCode: 'EU', nearestAirportCodes: ['MAD'], legalStatus: 'marriage_equality', nightlifeScore: 88, typicalStayDays: { min: 3, max: 5 } },
  barcelona: { continentCode: 'EU', nearestAirportCodes: ['BCN'], legalStatus: 'marriage_equality', nightlifeScore: 87, typicalStayDays: { min: 3, max: 5 } },
  lisbon: { continentCode: 'EU', nearestAirportCodes: ['LIS'], legalStatus: 'marriage_equality', nightlifeScore: 80, typicalStayDays: { min: 3, max: 5 } },
  amsterdam: { continentCode: 'EU', nearestAirportCodes: ['AMS'], legalStatus: 'marriage_equality', nightlifeScore: 83, typicalStayDays: { min: 3, max: 5 } },
  tokyo: { continentCode: 'AS', nearestAirportCodes: ['HND', 'NRT'], legalStatus: 'limited_protections', nightlifeScore: 79, typicalStayDays: { min: 4, max: 7 } },
  guerneville: { continentCode: 'NA', nearestAirportCodes: ['SFO', 'STS'], legalStatus: 'marriage_equality', nightlifeScore: 68, typicalStayDays: { min: 2, max: 4 } },
  'los-angeles': { continentCode: 'NA', nearestAirportCodes: ['LAX', 'BUR', 'SNA'], legalStatus: 'marriage_equality', nightlifeScore: 86, typicalStayDays: { min: 3, max: 6 } },
  'las-vegas': { continentCode: 'NA', nearestAirportCodes: ['LAS'], legalStatus: 'marriage_equality', nightlifeScore: 89, typicalStayDays: { min: 2, max: 4 } },
};

const SCORING_INTERESTS = {
  'san-francisco': ['nightlife', 'food', 'art', 'pride', 'hiking', 'culture'],
  'palm-springs': ['wellness', 'shopping', 'lgbtq_venues', 'culture', 'nightlife'],
  'puerto-vallarta': ['beach', 'nightlife', 'food', 'lgbtq_venues'],
  'mexico-city': ['food', 'art', 'history', 'nightlife', 'culture'],
  'new-york-city': ['nightlife', 'art', 'food', 'pride', 'shopping', 'culture', 'music'],
  miami: ['beach', 'nightlife', 'shopping', 'music', 'food', 'art'],
  provincetown: ['beach', 'lgbtq_venues', 'art', 'wellness', 'pride'],
  montreal: ['nightlife', 'food', 'music', 'art', 'pride', 'culture'],
  london: ['nightlife', 'art', 'history', 'food', 'shopping', 'culture'],
  berlin: ['nightlife', 'art', 'lgbtq_venues', 'history', 'culture'],
  madrid: ['nightlife', 'food', 'pride', 'art', 'culture'],
  barcelona: ['beach', 'nightlife', 'culture', 'food', 'art', 'music'],
  lisbon: ['food', 'nightlife', 'culture', 'lgbtq_venues', 'hiking'],
  amsterdam: ['nightlife', 'art', 'pride', 'history', 'lgbtq_venues', 'culture'],
  tokyo: ['food', 'nightlife', 'art', 'shopping', 'culture'],
  guerneville: ['hiking', 'nightlife', 'pride', 'food', 'wellness'],
  'los-angeles': ['nightlife', 'food', 'shopping', 'culture', 'music', 'beach'],
  'las-vegas': ['nightlife', 'food', 'music', 'shopping', 'pride'],
};

const EVENT_TYPE_MAP = {
  pride: 'pride',
  festival: 'festival',
  party: 'party',
  arts: 'other',
  community: 'other',
};

function toAvgTempMap(destination) {
  return Object.fromEntries(
    destination.weatherProfile.avgHighByMonth.map((temp, index) => [String(index + 1), temp]),
  );
}

function toCostPerDay(destination) {
  return {
    budget: destination.priceBands.shoestring.perPersonPerDayUsd.low,
    mid: destination.priceBands.mid.perPersonPerDayUsd.low,
    luxury: destination.priceBands.luxury.perPersonPerDayUsd.low,
  };
}

function deriveCommunityScore(destination) {
  const pulse = destination.communityPulseComponents;
  const raw =
    pulse.venueDensity * 1.25 +
    pulse.activeContributors * 0.45 +
    pulse.publicTrips * 0.35 +
    Math.min(15, pulse.recentReviews / 12) +
    pulse.questionResponseRate * 10;
  return Math.max(20, Math.min(98, Math.round(raw)));
}

function toUpcomingEvents(destination) {
  return destination.events.map((event) => ({
    name: event.title,
    month: new Date(event.startDate).getUTCMonth() + 1,
    type: EVENT_TYPE_MAP[event.category] ?? 'other',
  }));
}

function buildRow(destination) {
  const metadata = SCORING_METADATA[destination.slug];
  const interests = SCORING_INTERESTS[destination.slug];
  if (!metadata) {
    throw new Error(`Missing scoring metadata for ${destination.slug}`);
  }
  if (!interests) {
    throw new Error(`Missing scoring interests for ${destination.slug}`);
  }

  const safetyScore = destination.lgbtqContext.publicOpinionScore;
  return {
    slug: destination.slug,
    name: destination.name,
    country: destination.country,
    continentCode: metadata.continentCode,
    nearestAirportCodes: metadata.nearestAirportCodes,
    legalStatus: metadata.legalStatus,
    safetyScore,
    communityScore: deriveCommunityScore(destination),
    nightlifeScore: metadata.nightlifeScore,
    bestMonths: destination.bestMonths,
    avgTempCByMonth: toAvgTempMap(destination),
    interests,
    upcomingEvents: toUpcomingEvents(destination),
    accessibility: {
      wheelchairFriendly: true,
      brailleAvailable: false,
      notes: 'Check individual venues and neighborhoods for current accessibility details; infrastructure varies.',
    },
    costPerDay: toCostPerDay(destination),
    lastUpdated: destination.dataFreshness.slice(0, 10),
    reviewScore: 4.4,
    reviewCount: destination.communityPulseComponents.recentReviews,
    typicalStayDays: metadata.typicalStayDays,
    catalog: destination,
  };
}

const destinations = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
if (!Array.isArray(destinations)) {
  throw new Error('Expected fixtures/seed/destinations.json to contain an array.');
}

const scoringRows = destinations.map(buildRow);
writeFileSync(OUTPUT_PATH, `${JSON.stringify(scoringRows, null, 2)}\n`);

console.log(`Wrote ${scoringRows.length} scoring destinations to fixtures/seed/destinations.scoring.json`);
