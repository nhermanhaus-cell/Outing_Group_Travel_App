/**
 * Government travel advisory links — returns official LGBT / advisory URLs only.
 * Never invents safety ratings. Fixture-backed by default.
 *
 * Data: fixtures/public/travel-advisories.json
 */

import { defineProviderPlugin } from '../../registry';
import type { LgbtqContextReq, LgbtqContextRes, LgbtqContext } from '../../interfaces';

interface AdvisoryLink {
  title: string;
  url: string;
}

interface AdvisoryEntry {
  countryCode: string;
  issuer: string;
  links: AdvisoryLink[];
}

const ADVISORIES: AdvisoryEntry[] = [
  {
    countryCode: 'US',
    issuer: 'U.S. Department of State',
    links: [
      {
        title: 'LGBTQI+ Travelers — U.S. Department of State',
        url: 'https://travel.state.gov/content/travel/en/international-travel/before-you-go/travelers-with-special-considerations/lgbtqi.html',
      },
      {
        title: 'U.S. State Department Travel Advisories',
        url: 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html/',
      },
    ],
  },
  {
    countryCode: 'GB',
    issuer: 'UK Foreign, Commonwealth & Development Office',
    links: [
      {
        title: 'LGBTQ+ travel advice — FCDO',
        url: 'https://www.gov.uk/guidance/lesbian-gay-bisexual-and-transgender-foreign-travel-advice',
      },
      {
        title: 'FCDO Travel Advice',
        url: 'https://www.gov.uk/foreign-travel-advice',
      },
    ],
  },
  {
    countryCode: 'CA',
    issuer: 'Government of Canada',
    links: [
      {
        title: 'Travel advice for LGBTQ2 travellers — Government of Canada',
        url: 'https://travel.gc.ca/travelling/health-safety/lgbt-travel',
      },
    ],
  },
  {
    countryCode: 'DE',
    issuer: 'German Federal Foreign Office',
    links: [
      {
        title: 'German Federal Foreign Office travel & safety advice',
        url: 'https://www.auswaertiges-amt.de/en/reiseundsicherheit',
      },
    ],
  },
  {
    countryCode: 'ES',
    issuer: 'Spanish Ministry of Foreign Affairs',
    links: [
      {
        title: 'Spain — travel recommendations',
        url: 'https://www.exteriores.gob.es/en/ServiciosAlCiudadano/Paginas/Recomendaciones-de-viaje.aspx',
      },
    ],
  },
  {
    countryCode: 'NL',
    issuer: 'Government of the Netherlands',
    links: [
      {
        title: 'Netherlands travel advice',
        url: 'https://www.netherlandsandyou.nl/',
      },
    ],
  },
  {
    countryCode: 'MX',
    issuer: 'U.S. Department of State (Mexico advisory)',
    links: [
      {
        title: 'Mexico Travel Advisory — U.S. State Department',
        url: 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/mexico-travel-advisory.html',
      },
      {
        title: 'LGBTQI+ Travelers — U.S. Department of State',
        url: 'https://travel.state.gov/content/travel/en/international-travel/before-you-go/travelers-with-special-considerations/lgbtqi.html',
      },
    ],
  },
  {
    countryCode: 'JP',
    issuer: 'U.S. Department of State (Japan advisory)',
    links: [
      {
        title: 'Japan Travel Advisory — U.S. State Department',
        url: 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/japan-travel-advisory.html',
      },
    ],
  },
  {
    countryCode: 'PT',
    issuer: 'UK FCDO (Portugal)',
    links: [
      {
        title: 'Portugal travel advice — FCDO',
        url: 'https://www.gov.uk/foreign-travel-advice/portugal',
      },
    ],
  },
];

const SLUG_TO_COUNTRY: Record<string, string> = {
  'san-francisco': 'US',
  'palm-springs': 'US',
  'miami': 'US',
  'new-york-city': 'US',
  'provincetown': 'US',
  'guerneville': 'US',
  'los-angeles': 'US',
  'las-vegas': 'US',
  'montreal': 'CA',
  'london': 'GB',
  'berlin': 'DE',
  'madrid': 'ES',
  'barcelona': 'ES',
  'lisbon': 'PT',
  'amsterdam': 'NL',
  'tokyo': 'JP',
  'mexico-city': 'MX',
  'puerto-vallarta': 'MX',
};

function buildContext(slug: string, entry: AdvisoryEntry): LgbtqContext {
  return {
    destinationSlug: slug,
    editorialSummary:
      `Official travel advisory links from ${entry.issuer}. ` +
      `Gay-i surfaces government links only — we never declare a destination universally safe.`,
    safetyTips: entry.links.map((l) => `${l.title}: ${l.url}`),
    neighborhoodsToKnow: [],
    annualHighlights: [],
    communityNotes:
      'Links retrieved from fixtures/public/travel-advisories.json. Verify URLs before travel; government pages change.',
    lastReviewed: '2026-06-01',
  };
}

export const lgbtqContextGovAdvisories = defineProviderPlugin<
  LgbtqContextReq,
  LgbtqContextRes
>({
  id: 'lgbtqContext:gov-advisories',
  slot: 'lgbtqContext',
  label: 'Gov travel advisories',
  description:
    'Official LGBT / travel advisory URLs by country (fixture). Links only — no safety claims.',
  isMock: true,
  create() {
    return {
      async call(req) {
        const countryCode = SLUG_TO_COUNTRY[req.destinationSlug];
        const entry = countryCode
          ? ADVISORIES.find((a) => a.countryCode === countryCode)
          : undefined;
        if (!entry) {
          return {
            context: {
              destinationSlug: req.destinationSlug,
              editorialSummary:
                'No curated government advisory links for this destination yet. Check your home foreign office before travel.',
              safetyTips: [
                'https://travel.state.gov/content/travel/en/international-travel/before-you-go/travelers-with-special-considerations/lgbtqi.html',
                'https://www.gov.uk/guidance/lesbian-gay-bisexual-and-transgender-foreign-travel-advice',
              ],
              neighborhoodsToKnow: [],
              annualHighlights: [],
              communityNotes: 'Fallback global LGBT traveler guidance links only.',
              lastReviewed: '2026-06-01',
            },
          };
        }
        return { context: buildContext(req.destinationSlug, entry) };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
