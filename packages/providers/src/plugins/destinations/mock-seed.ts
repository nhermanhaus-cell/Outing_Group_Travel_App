import { defineProviderPlugin } from '../../registry.js';
import type { DestinationsReq, DestinationsRes } from '../../interfaces.js';
import type { Destination } from '@gayi/shared';

const SEED: Destination[] = [
  {
    slug: 'barcelona-es',
    name: 'Barcelona',
    country: 'Spain',
    continentCode: 'EU',
    nearestAirportCodes: ['BCN'],
    legalStatus: 'marriage_equality',
    safetyScore: 90,
    communityScore: 88,
    nightlifeScore: 92,
    bestMonths: [5, 6, 9, 10],
    avgTempCByMonth: {
      1: 14, 2: 15, 3: 17, 4: 19, 5: 22, 6: 26,
      7: 29, 8: 29, 9: 26, 10: 22, 11: 17, 12: 14,
    },
    interests: ['nightlife', 'beach', 'culture', 'food', 'lgbtq_venues'],
    upcomingEvents: [{ name: 'Barcelona Pride', month: 6, type: 'pride', url: 'https://pridebarcelona.org' }],
    accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: 'Eixample is accessible.' },
    costPerDay: { budget: 80, mid: 140, luxury: 300 },
    lastUpdated: '2026-01-01',
    reviewScore: 4.7,
    reviewCount: 1203,
    typicalStayDays: { min: 4, max: 8 },
  },
  {
    slug: 'amsterdam-nl',
    name: 'Amsterdam',
    country: 'Netherlands',
    continentCode: 'EU',
    nearestAirportCodes: ['AMS'],
    legalStatus: 'marriage_equality',
    safetyScore: 93,
    communityScore: 91,
    nightlifeScore: 84,
    bestMonths: [5, 6, 7, 8],
    avgTempCByMonth: {
      1: 5, 2: 6, 3: 9, 4: 13, 5: 17, 6: 20,
      7: 22, 8: 22, 9: 19, 10: 14, 11: 9, 12: 6,
    },
    interests: ['culture', 'nightlife', 'history', 'art', 'lgbtq_venues'],
    upcomingEvents: [{ name: 'Amsterdam Pride', month: 8, type: 'pride', url: 'https://amsterdampride.nl' }],
    accessibility: { wheelchairFriendly: true, brailleAvailable: true, notes: 'Canal-side cobblestones can be challenging.' },
    costPerDay: { budget: 90, mid: 160, luxury: 380 },
    lastUpdated: '2026-01-01',
    reviewScore: 4.6,
    reviewCount: 987,
    typicalStayDays: { min: 3, max: 7 },
  },
  {
    slug: 'mexico-city-mx',
    name: 'Mexico City',
    country: 'Mexico',
    continentCode: 'NA',
    nearestAirportCodes: ['MEX'],
    legalStatus: 'marriage_equality',
    safetyScore: 72,
    communityScore: 83,
    nightlifeScore: 88,
    bestMonths: [3, 4, 10, 11, 12],
    avgTempCByMonth: {
      1: 21, 2: 23, 3: 26, 4: 27, 5: 26, 6: 24,
      7: 22, 8: 22, 9: 22, 10: 22, 11: 21, 12: 20,
    },
    interests: ['food', 'culture', 'nightlife', 'art', 'lgbtq_venues'],
    upcomingEvents: [{ name: 'Mexico City Pride', month: 6, type: 'pride' }],
    accessibility: { wheelchairFriendly: false, brailleAvailable: false, notes: 'Centro Histórico has uneven streets.' },
    costPerDay: { budget: 40, mid: 90, luxury: 220 },
    lastUpdated: '2026-01-01',
    reviewScore: 4.5,
    reviewCount: 743,
    typicalStayDays: { min: 4, max: 10 },
  },
  {
    slug: 'bangkok-th',
    name: 'Bangkok',
    country: 'Thailand',
    continentCode: 'AS',
    nearestAirportCodes: ['BKK', 'DMK'],
    legalStatus: 'limited_protections',
    safetyScore: 78,
    communityScore: 79,
    nightlifeScore: 90,
    bestMonths: [11, 12, 1, 2],
    avgTempCByMonth: {
      1: 32, 2: 33, 3: 35, 4: 36, 5: 34, 6: 33,
      7: 32, 8: 32, 9: 32, 10: 31, 11: 31, 12: 31,
    },
    interests: ['nightlife', 'food', 'culture', 'shopping', 'wellness'],
    upcomingEvents: [],
    accessibility: { wheelchairFriendly: false, brailleAvailable: false, notes: 'BTS skytrain is accessible.' },
    costPerDay: { budget: 35, mid: 80, luxury: 200 },
    lastUpdated: '2026-01-01',
    reviewScore: 4.4,
    reviewCount: 1122,
    typicalStayDays: { min: 4, max: 10 },
  },
  {
    slug: 'berlin-de',
    name: 'Berlin',
    country: 'Germany',
    continentCode: 'EU',
    nearestAirportCodes: ['BER'],
    legalStatus: 'marriage_equality',
    safetyScore: 88,
    communityScore: 92,
    nightlifeScore: 98,
    bestMonths: [6, 7, 8],
    avgTempCByMonth: {
      1: 2, 2: 3, 3: 8, 4: 13, 5: 18, 6: 22,
      7: 24, 8: 24, 9: 20, 10: 13, 11: 7, 12: 3,
    },
    interests: ['nightlife', 'culture', 'art', 'music', 'lgbtq_venues', 'history'],
    upcomingEvents: [{ name: 'Berlin Pride (CSD)', month: 7, type: 'pride', url: 'https://csd-berlin.de' }],
    accessibility: { wheelchairFriendly: true, brailleAvailable: true, notes: 'Good public transport accessibility.' },
    costPerDay: { budget: 70, mid: 130, luxury: 280 },
    lastUpdated: '2026-01-01',
    reviewScore: 4.8,
    reviewCount: 1540,
    typicalStayDays: { min: 4, max: 10 },
  },
];

export const destinationsMockSeed = defineProviderPlugin<DestinationsReq, DestinationsRes>({
  id: 'destinations:mock-seed',
  slot: 'destinations',
  label: 'Mock Seed Destinations',
  description: 'In-memory seed data for development and testing.',
  isMock: true,
  create() {
    return {
      async call(req) {
        let results = SEED;
        if (req.slugs?.length) {
          results = results.filter((d) => req.slugs!.includes(d.slug));
        }
        if (req.filter?.continentCode) {
          results = results.filter((d) => d.continentCode === req.filter!.continentCode);
        }
        if (req.filter?.legalStatuses?.length) {
          results = results.filter((d) => req.filter!.legalStatuses!.includes(d.legalStatus));
        }
        if (req.filter?.minSafetyScore != null) {
          results = results.filter((d) => d.safetyScore >= req.filter!.minSafetyScore!);
        }
        return { destinations: req.limit != null ? results.slice(0, req.limit) : results };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
