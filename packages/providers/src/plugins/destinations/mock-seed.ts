import { defineProviderPlugin } from '../../registry';
import type { DestinationsReq, DestinationsRes } from '../../interfaces';
import type { Destination } from '@gayi/shared';

/** Full MVP seed catalog (15 destinations) — sample/editorial data. */
const SEED: Destination[] = [
  {
    "slug": "san-francisco",
    "name": "San Francisco",
    "country": "United States",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "SFO",
      "OAK"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 88,
    "communityScore": 98,
    "nightlifeScore": 85,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "nightlife",
      "food",
      "art",
      "pride",
      "hiking",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "San Francisco Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 120,
      "mid": 220,
      "luxury": 450
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 120,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "palm-springs",
    "name": "Palm Springs",
    "country": "United States",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "PSP"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 90,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      1,
      2,
      3,
      4,
      10,
      11,
      12
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "wellness",
      "shopping",
      "lgbtq_venues",
      "culture",
      "nightlife"
    ],
    "upcomingEvents": [
      {
        "name": "Palm Springs Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 100,
      "mid": 200,
      "luxury": 400
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "puerto-vallarta",
    "name": "Puerto Vallarta",
    "country": "Mexico",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "PVR"
    ],
    "legalStatus": "civil_union",
    "safetyScore": 82,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3,
      4
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "beach",
      "nightlife",
      "food",
      "lgbtq_venues"
    ],
    "upcomingEvents": [
      {
        "name": "Puerto Vallarta Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 60,
      "mid": 140,
      "luxury": 280
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "mexico-city",
    "name": "Mexico City",
    "country": "Mexico",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "MEX"
    ],
    "legalStatus": "civil_union",
    "safetyScore": 75,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      3,
      4,
      5,
      10,
      11
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "food",
      "art",
      "history",
      "nightlife",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "Mexico City Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 50,
      "mid": 120,
      "luxury": 250
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "new-york-city",
    "name": "New York City",
    "country": "United States",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "JFK",
      "LGA",
      "EWR"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 85,
    "communityScore": 98,
    "nightlifeScore": 85,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "nightlife",
      "art",
      "food",
      "pride",
      "shopping",
      "culture",
      "music"
    ],
    "upcomingEvents": [
      {
        "name": "New York City Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 130,
      "mid": 250,
      "luxury": 500
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 120,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "miami",
    "name": "Miami",
    "country": "United States",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "MIA",
      "FLL"
    ],
    "legalStatus": "civil_union",
    "safetyScore": 80,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      1,
      2,
      3,
      4,
      11,
      12
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "beach",
      "nightlife",
      "shopping",
      "music",
      "food",
      "art"
    ],
    "upcomingEvents": [
      {
        "name": "Miami Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 110,
      "mid": 220,
      "luxury": 450
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "provincetown",
    "name": "Provincetown",
    "country": "United States",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "PVC",
      "BOS"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 95,
    "communityScore": 26,
    "nightlifeScore": 55,
    "bestMonths": [
      6,
      7,
      8,
      9
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "beach",
      "lgbtq_venues",
      "art",
      "wellness",
      "pride"
    ],
    "upcomingEvents": [
      {
        "name": "Provincetown Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 140,
      "mid": 250,
      "luxury": 450
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "montreal",
    "name": "Montréal",
    "country": "Canada",
    "continentCode": "NA",
    "nearestAirportCodes": [
      "YUL"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 90,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      6,
      7,
      8,
      9
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "nightlife",
      "food",
      "music",
      "art",
      "pride",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "Montréal Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 90,
      "mid": 180,
      "luxury": 350
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "london",
    "name": "London",
    "country": "United Kingdom",
    "continentCode": "EU",
    "nearestAirportCodes": [
      "LHR",
      "LGW"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 80,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "nightlife",
      "art",
      "history",
      "food",
      "shopping",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "London Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 110,
      "mid": 220,
      "luxury": 450
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "berlin",
    "name": "Berlin",
    "country": "Germany",
    "continentCode": "EU",
    "nearestAirportCodes": [
      "BER"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 88,
    "communityScore": 98,
    "nightlifeScore": 85,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "nightlife",
      "art",
      "lgbtq_venues",
      "history",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "Berlin Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 70,
      "mid": 150,
      "luxury": 300
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 120,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "madrid",
    "name": "Madrid",
    "country": "Spain",
    "continentCode": "EU",
    "nearestAirportCodes": [
      "MAD"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 86,
    "communityScore": 98,
    "nightlifeScore": 85,
    "bestMonths": [
      4,
      5,
      6,
      9,
      10
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "nightlife",
      "food",
      "pride",
      "art",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "Madrid Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 70,
      "mid": 150,
      "luxury": 300
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 120,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "barcelona",
    "name": "Barcelona",
    "country": "Spain",
    "continentCode": "EU",
    "nearestAirportCodes": [
      "BCN"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 85,
    "communityScore": 98,
    "nightlifeScore": 85,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "beach",
      "nightlife",
      "culture",
      "food",
      "art",
      "music"
    ],
    "upcomingEvents": [
      {
        "name": "Barcelona Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 80,
      "mid": 170,
      "luxury": 350
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 120,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "lisbon",
    "name": "Lisbon",
    "country": "Portugal",
    "continentCode": "EU",
    "nearestAirportCodes": [
      "LIS"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 82,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      4,
      5,
      6,
      9,
      10
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "food",
      "nightlife",
      "culture",
      "lgbtq_venues",
      "hiking"
    ],
    "upcomingEvents": [
      {
        "name": "Lisbon Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 65,
      "mid": 140,
      "luxury": 280
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "amsterdam",
    "name": "Amsterdam",
    "country": "Netherlands",
    "continentCode": "EU",
    "nearestAirportCodes": [
      "AMS"
    ],
    "legalStatus": "marriage_equality",
    "safetyScore": 92,
    "communityScore": 98,
    "nightlifeScore": 85,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "nightlife",
      "art",
      "pride",
      "history",
      "lgbtq_venues",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "Amsterdam Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 100,
      "mid": 200,
      "luxury": 400
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 120,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  },
  {
    "slug": "tokyo",
    "name": "Tokyo",
    "country": "Japan",
    "continentCode": "AS",
    "nearestAirportCodes": [
      "HND",
      "NRT"
    ],
    "legalStatus": "limited_protections",
    "safetyScore": 60,
    "communityScore": 26,
    "nightlifeScore": 85,
    "bestMonths": [
      3,
      4,
      5,
      10,
      11
    ],
    "avgTempCByMonth": {
      "1": 17,
      "2": 18,
      "3": 20,
      "4": 21,
      "5": 23,
      "6": 24,
      "7": 26,
      "8": 27,
      "9": 29,
      "10": 12,
      "11": 14,
      "12": 15
    },
    "interests": [
      "food",
      "nightlife",
      "art",
      "shopping",
      "culture"
    ],
    "upcomingEvents": [
      {
        "name": "Tokyo Pride Weekend",
        "month": 6,
        "type": "pride"
      },
      {
        "name": "Queer Culture Night",
        "month": 9,
        "type": "other"
      }
    ],
    "accessibility": {
      "wheelchairFriendly": true,
      "brailleAvailable": false,
      "notes": "Varies by venue; check accessibility notes on places."
    },
    "costPerDay": {
      "budget": 80,
      "mid": 180,
      "luxury": 400
    },
    "lastUpdated": "2026-06-01",
    "reviewScore": 4.4,
    "reviewCount": 28,
    "typicalStayDays": {
      "min": 3,
      "max": 10
    }
  }
];

export const destinationsMockSeed = defineProviderPlugin<DestinationsReq, DestinationsRes>({
  id: 'destinations:mock-seed',
  slot: 'destinations',
  label: 'Mock Destination Seed',
  description: 'Bundled sample destinations for offline MVP demos.',
  isMock: true,
  create() {
    return {
      async call(req): Promise<DestinationsRes> {
        let items = [...SEED];
        if (req.slugs?.length) {
          const set = new Set(req.slugs);
          items = items.filter((d) => set.has(d.slug));
        }
        if (req.filter?.continentCode) {
          items = items.filter((d) => d.continentCode === req.filter!.continentCode);
        }
        if (req.filter?.minSafetyScore != null) {
          items = items.filter((d) => d.safetyScore >= req.filter!.minSafetyScore!);
        }
        if (req.filter?.legalStatuses?.length) {
          const set = new Set(req.filter.legalStatuses);
          items = items.filter((d) => set.has(d.legalStatus));
        }
        if (req.limit != null) items = items.slice(0, req.limit);
        return { destinations: items };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
