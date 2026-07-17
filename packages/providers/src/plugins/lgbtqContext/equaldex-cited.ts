/**
 * Equaldex cited-snapshot plugin — maps Equaldex Equality Index scores to LgbtqContext.
 *
 * IMPORTANT: This plugin does NOT call the live Equaldex API.
 * The Equaldex commercial API requires a paid subscription.
 * This plugin uses a static editorial snapshot of approximate EI scores.
 *
 * Data source: Equaldex Equality Index (editorial snapshot)
 * https://www.equaldex.com
 *
 * See fixtures/public/equaldex-cited-scores.json for the raw data.
 */

import { defineProviderPlugin } from '../../registry';
import type { LgbtqContextReq, LgbtqContextRes, LgbtqContext } from '../../interfaces';

// ── EI snapshot ────────────────────────────────────────────────────────────

interface EqualDexEntry {
  countryCode: string;
  countryName: string;
  /** Overall Equality Index 0–100 */
  ei: number;
  /** Legal sub-index 0–100 */
  ei_legal: number;
  /** Public opinion sub-index 0–100 */
  ei_po: number;
  equaldexUrl: string;
}

const EQUALDEX_DATA: EqualDexEntry[] = [
  { countryCode: 'US', countryName: 'United States', ei: 54, ei_legal: 64, ei_po: 44,  equaldexUrl: 'https://www.equaldex.com/region/united-states' },
  { countryCode: 'CA', countryName: 'Canada',         ei: 84, ei_legal: 100, ei_po: 68, equaldexUrl: 'https://www.equaldex.com/region/canada' },
  { countryCode: 'MX', countryName: 'Mexico',         ei: 50, ei_legal: 62,  ei_po: 38, equaldexUrl: 'https://www.equaldex.com/region/mexico' },
  { countryCode: 'GB', countryName: 'United Kingdom', ei: 80, ei_legal: 96,  ei_po: 64, equaldexUrl: 'https://www.equaldex.com/region/united-kingdom' },
  { countryCode: 'DE', countryName: 'Germany',         ei: 76, ei_legal: 93,  ei_po: 59, equaldexUrl: 'https://www.equaldex.com/region/germany' },
  { countryCode: 'ES', countryName: 'Spain',           ei: 82, ei_legal: 100, ei_po: 64, equaldexUrl: 'https://www.equaldex.com/region/spain' },
  { countryCode: 'PT', countryName: 'Portugal',        ei: 74, ei_legal: 93,  ei_po: 55, equaldexUrl: 'https://www.equaldex.com/region/portugal' },
  { countryCode: 'NL', countryName: 'Netherlands',     ei: 90, ei_legal: 100, ei_po: 80, equaldexUrl: 'https://www.equaldex.com/region/netherlands' },
  { countryCode: 'JP', countryName: 'Japan',           ei: 30, ei_legal: 19,  ei_po: 41, equaldexUrl: 'https://www.equaldex.com/region/japan' },
  { countryCode: 'TH', countryName: 'Thailand',        ei: 48, ei_legal: 60,  ei_po: 36, equaldexUrl: 'https://www.equaldex.com/region/thailand' },
  { countryCode: 'FR', countryName: 'France',          ei: 78, ei_legal: 96,  ei_po: 60, equaldexUrl: 'https://www.equaldex.com/region/france' },
];

// ── Destination slug → country code ───────────────────────────────────────

const SLUG_TO_COUNTRY: Record<string, string> = {
  'san-francisco':   'US',
  'palm-springs':    'US',
  'miami':           'US',
  'new-york-city':   'US',
  'provincetown':    'US',
  'guerneville':     'US',
  'los-angeles':     'US',
  'las-vegas':       'US',
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
  'paris':           'FR',
};

// ── EI label helpers ──────────────────────────────────────────────────────

function eiLabel(score: number): string {
  if (score >= 80) return 'very high';
  if (score >= 65) return 'high';
  if (score >= 50) return 'moderate';
  if (score >= 35) return 'low';
  return 'very low';
}

// ── Context synthesis ────────────────────────────────────────────────────

function buildContext(slug: string, entry: EqualDexEntry): LgbtqContext {
  const overall = eiLabel(entry.ei);
  const legal = eiLabel(entry.ei_legal);
  const opinion = eiLabel(entry.ei_po);

  return {
    destinationSlug: slug,
    editorialSummary:
      `${entry.countryName} scores ${entry.ei}/100 on the Equaldex Equality Index (editorial snapshot), ` +
      `indicating ${overall} overall LGBTQ+ equality. ` +
      `Legal sub-index: ${entry.ei_legal}/100 (${legal}). ` +
      `Public opinion sub-index: ${entry.ei_po}/100 (${opinion}).`,
    safetyTips: [
      `Equaldex EI: ${entry.ei}/100 overall (legal ${entry.ei_legal}, public opinion ${entry.ei_po}).`,
      `This is an editorial snapshot — verify current scores at ${entry.equaldexUrl}.`,
      'The Equality Index combines legal rights and public acceptance; check both sub-scores before travelling.',
    ],
    neighborhoodsToKnow: [],
    annualHighlights: [],
    communityNotes:
      `Equaldex Equality Index data (editorial cited snapshot, approx. 2025). ` +
      `Not a live API call — the Equaldex commercial API requires a subscription. ` +
      `See ${entry.equaldexUrl} for authoritative data.`,
    lastReviewed: '2025-06-01',
  };
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export const lgbtqContextEqualdexCited = defineProviderPlugin<LgbtqContextReq, LgbtqContextRes>({
  id: 'lgbtqContext:equaldex-cited',
  slot: 'lgbtqContext',
  label: 'Equaldex Equality Index (cited snapshot)',
  description:
    'Maps Equaldex EI scores from a static editorial snapshot to LgbtqContext. ' +
    'Does NOT call the live Equaldex API (commercial subscription required). ' +
    'See fixtures/public/equaldex-cited-scores.json.',
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
                'Equaldex Equality Index data is not available for this destination in the current snapshot.',
              safetyTips: [
                'Visit https://www.equaldex.com to look up this country\'s equality index.',
                'Research local laws and community resources before travelling.',
              ],
              neighborhoodsToKnow: [],
              annualHighlights: [],
              communityNotes:
                'This plugin uses an editorial cited snapshot. The Equaldex commercial API requires a paid subscription.',
              lastReviewed: '2025-06-01',
            },
          };
        }

        const entry = EQUALDEX_DATA.find((e) => e.countryCode === countryCode);
        if (!entry) {
          return {
            context: {
              destinationSlug: req.destinationSlug,
              editorialSummary:
                `Equaldex data for ${countryCode} is not in this snapshot.`,
              safetyTips: [
                `Visit https://www.equaldex.com/region/${countryCode.toLowerCase()} for this country's data.`,
              ],
              neighborhoodsToKnow: [],
              annualHighlights: [],
              communityNotes: '',
              lastReviewed: '2025-06-01',
            },
          };
        }

        return { context: buildContext(req.destinationSlug, entry) };
      },
    };
  },
});
