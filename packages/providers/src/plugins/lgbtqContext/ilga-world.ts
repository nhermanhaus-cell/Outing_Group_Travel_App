/**
 * ILGA World legal plugin — maps ILGA World legal-status data to LgbtqContext.
 *
 * Data source: ILGA World — State-Sponsored Homophobia Report & Database (snapshot)
 * https://ilga.org
 *
 * This plugin uses a static editorial snapshot (see fixtures/public/ilga-world-legal.json).
 * It does NOT call the ILGA World API at runtime.
 */

import { defineProviderPlugin } from '../../registry';
import type { LgbtqContextReq, LgbtqContextRes, LgbtqContext } from '../../interfaces';

// ── Legal data snapshot ────────────────────────────────────────────────────

interface WorldLegalEntry {
  countryCode: string;
  countryName: string;
  criminalizationStatus: 'none' | 'partial' | 'criminalized';
  sameSexRecognition: boolean;
  antiDiscrimination: boolean;
  notes: string;
  reportYear: number;
}

const WORLD_LEGAL: WorldLegalEntry[] = [
  {
    countryCode: 'US',
    countryName: 'United States',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'Federal marriage equality since Obergefell (2015). Federal employment protections via Bostock (2020). Sub-national protections vary significantly by state.',
    reportYear: 2024,
  },
  {
    countryCode: 'CA',
    countryName: 'Canada',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'Civil Marriage Act (2005). Canadian Human Rights Act prohibits discrimination on sexual orientation and gender identity.',
    reportYear: 2024,
  },
  {
    countryCode: 'MX',
    countryName: 'Mexico',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'Supreme Court ruling (2015) established marriage equality federally. Federal anti-discrimination law covers sexual orientation.',
    reportYear: 2024,
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'Marriage (Same Sex Couples) Act 2013 (England & Wales). Equality Act 2010 provides broad protections.',
    reportYear: 2024,
  },
  {
    countryCode: 'DE',
    countryName: 'Germany',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'Marriage equality since October 2017. General Equal Treatment Act (AGG) covers sexual orientation.',
    reportYear: 2024,
  },
  {
    countryCode: 'ES',
    countryName: 'Spain',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'Marriage equality since 2005 (Ley 13/2005). Spain was the third country in the world to legalise same-sex marriage.',
    reportYear: 2024,
  },
  {
    countryCode: 'PT',
    countryName: 'Portugal',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'Marriage equality since 2010. Joint adoption rights since 2016. Constitution prohibits discrimination on grounds of sexual orientation.',
    reportYear: 2024,
  },
  {
    countryCode: 'NL',
    countryName: 'Netherlands',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: true,
    notes: 'First country in the world to legalise same-sex marriage (2001). Equal Treatment Act prohibits discrimination on grounds of sexual orientation.',
    reportYear: 2024,
  },
  {
    countryCode: 'JP',
    countryName: 'Japan',
    criminalizationStatus: 'none',
    sameSexRecognition: false,
    antiDiscrimination: false,
    notes: 'No national same-sex marriage as of 2024; some municipalities offer partnership certificates. No comprehensive national anti-discrimination law for sexual orientation.',
    reportYear: 2024,
  },
  {
    countryCode: 'TH',
    countryName: 'Thailand',
    criminalizationStatus: 'none',
    sameSexRecognition: true,
    antiDiscrimination: false,
    notes: 'Marriage Equality Act signed September 2024 (effective January 2025), first in Southeast Asia. No broad anti-discrimination legislation.',
    reportYear: 2024,
  },
];

// ── Destination slug → country code ───────────────────────────────────────

const SLUG_TO_COUNTRY: Record<string, string> = {
  'san-francisco':   'US',
  'palm-springs':    'US',
  'miami':           'US',
  'new-york-city':   'US',
  'provincetown':    'US',
  'montreal':        'CA',
  'puerto-vallarta': 'MX',
  'mexico-city':     'MX',
  'mexico-city-mx':  'MX',
  'london':          'GB',
  'berlin':          'DE',
  'berlin-de':       'DE',
  'madrid':          'ES',
  'barcelona':       'ES',
  'barcelona-es':    'ES',
  'lisbon':          'PT',
  'amsterdam':       'NL',
  'amsterdam-nl':    'NL',
  'tokyo':           'JP',
};

// ── Context synthesis ─────────────────────────────────────────────────────

function buildContext(slug: string, entry: WorldLegalEntry): LgbtqContext {
  const recogText = entry.sameSexRecognition
    ? 'Same-sex relationships have legal recognition.'
    : 'Same-sex relationships do not currently have national legal recognition.';
  const adText = entry.antiDiscrimination
    ? 'National anti-discrimination protections cover sexual orientation.'
    : 'There is no comprehensive national anti-discrimination law for sexual orientation.';
  const crimText =
    entry.criminalizationStatus === 'none'
      ? 'Same-sex relations are not criminalised.'
      : entry.criminalizationStatus === 'partial'
      ? 'Some same-sex conduct may be subject to criminal penalties in parts of this country.'
      : 'Same-sex relations are criminalised — exercise significant caution.';

  const safetyTips = [
    crimText,
    recogText,
    adText,
    entry.notes,
    `Source: ILGA World (${entry.reportYear}) — https://ilga.org`,
  ];

  return {
    destinationSlug: slug,
    editorialSummary:
      `${entry.countryName} LGBTQ+ legal overview (ILGA World ${entry.reportYear}): ${crimText} ${recogText} ${adText}`,
    safetyTips,
    neighborhoodsToKnow: [],
    annualHighlights: [],
    communityNotes: entry.notes,
    lastReviewed: `${entry.reportYear}-12-31`,
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const lgbtqContextIlgaWorld = defineProviderPlugin<LgbtqContextReq, LgbtqContextRes>({
  id: 'lgbtqContext:ilga-world',
  slot: 'lgbtqContext',
  label: 'ILGA World Legal Status',
  description:
    'Maps ILGA World legal-status data (criminalization, recognition, anti-discrimination) to LgbtqContext. Uses a static editorial snapshot — not a live API call.',
  isMock: false,

  async healthCheck() {
    return true;
  },

  create() {
    return {
      async call(req: LgbtqContextReq): Promise<LgbtqContextRes> {
        const countryCode = SLUG_TO_COUNTRY[req.destinationSlug];
        if (!countryCode) {
          return {
            context: {
              destinationSlug: req.destinationSlug,
              editorialSummary:
                'ILGA World legal data is not available for this destination in the current snapshot.',
              safetyTips: [
                'Consult ILGA World for legal data: https://ilga.org',
                'Research local laws and community resources before travelling.',
              ],
              neighborhoodsToKnow: [],
              annualHighlights: [],
              communityNotes: '',
              lastReviewed: '2024-12-31',
            },
          };
        }

        const entry = WORLD_LEGAL.find((e) => e.countryCode === countryCode);
        if (!entry) {
          return {
            context: {
              destinationSlug: req.destinationSlug,
              editorialSummary:
                `ILGA World data for ${countryCode} is not available in this snapshot.`,
              safetyTips: ['Visit https://ilga.org for the latest data.'],
              neighborhoodsToKnow: [],
              annualHighlights: [],
              communityNotes: '',
              lastReviewed: '2024-12-31',
            },
          };
        }

        return { context: buildContext(req.destinationSlug, entry) };
      },
    };
  },
});
