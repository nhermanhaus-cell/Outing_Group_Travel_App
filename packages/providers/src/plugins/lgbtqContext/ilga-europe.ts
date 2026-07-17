/**
 * ILGA-Europe Rainbow Map plugin — maps country-level Rainbow Index scores
 * to LgbtqContext for European destinations.
 *
 * Data source: ILGA-Europe Rainbow Map & Index (snapshot)
 * https://rainbowmap.ilga-europe.org/
 *
 * This plugin uses a static editorial snapshot (see fixtures/public/ilga-europe-rainbow.json).
 * It does NOT call the ILGA-Europe API at runtime.
 */

import { defineProviderPlugin } from '../../registry';
import type { LgbtqContextReq, LgbtqContextRes, LgbtqContext } from '../../interfaces';

// ── Rainbow Index snapshot (2025) ─────────────────────────────────────────

interface RainbowEntry {
  countryCode: string;
  countryName: string;
  rainbowScore: number;
  year: number;
}

const RAINBOW_DATA: RainbowEntry[] = [
  { countryCode: 'NL', countryName: 'Netherlands',     rainbowScore: 76, year: 2025 },
  { countryCode: 'BE', countryName: 'Belgium',          rainbowScore: 71, year: 2025 },
  { countryCode: 'ES', countryName: 'Spain',            rainbowScore: 74, year: 2025 },
  { countryCode: 'PT', countryName: 'Portugal',         rainbowScore: 70, year: 2025 },
  { countryCode: 'DE', countryName: 'Germany',          rainbowScore: 67, year: 2025 },
  { countryCode: 'FR', countryName: 'France',           rainbowScore: 67, year: 2025 },
  { countryCode: 'GB', countryName: 'United Kingdom',   rainbowScore: 70, year: 2025 },
  { countryCode: 'IE', countryName: 'Ireland',          rainbowScore: 72, year: 2025 },
  { countryCode: 'SE', countryName: 'Sweden',           rainbowScore: 73, year: 2025 },
  { countryCode: 'NO', countryName: 'Norway',           rainbowScore: 69, year: 2025 },
];

// ── Destination slug → ISO 3166-1 alpha-2 country code ──────────────────────

const SLUG_TO_COUNTRY: Record<string, string> = {
  'amsterdam':    'NL',
  'amsterdam-nl': 'NL',
  'barcelona':    'ES',
  'barcelona-es': 'ES',
  'berlin':       'DE',
  'berlin-de':    'DE',
  'london':       'GB',
  'madrid':       'ES',
  'lisbon':       'PT',
  'paris':        'FR',
};

// ── Context synthesis ────────────────────────────────────────────────────────

function scoreLabel(score: number): string {
  if (score >= 75) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 50) return 'moderate';
  return 'limited';
}

function buildContext(
  slug: string,
  entry: RainbowEntry,
): LgbtqContext {
  const label = scoreLabel(entry.rainbowScore);
  return {
    destinationSlug: slug,
    editorialSummary:
      `${entry.countryName} ranks ${entry.rainbowScore}/100 on the ILGA-Europe Rainbow Index (${entry.year}), ` +
      `indicating ${label} legal and policy protections for LGBTQ+ people. ` +
      `The index covers equality legislation, freedom of assembly, legal gender recognition, and asylum rights.`,
    safetyTips: [
      `ILGA-Europe Rainbow Score ${entry.year}: ${entry.rainbowScore}/100 (${label} protections).`,
      'Check the latest ILGA-Europe country profile for detailed legal breakdowns at rainbowmap.ilga-europe.org.',
      'Same-sex couples have legal recognition in this country; public displays of affection are broadly accepted in city centres.',
    ],
    neighborhoodsToKnow: [],
    annualHighlights: [],
    communityNotes:
      `Data sourced from the ILGA-Europe Rainbow Map & Index ${entry.year} snapshot. ` +
      'For the most recent scores visit https://rainbowmap.ilga-europe.org/.',
    lastReviewed: `${entry.year}-05-01`,
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const lgbtqContextIlgaEurope = defineProviderPlugin<LgbtqContextReq, LgbtqContextRes>({
  id: 'lgbtqContext:ilga-europe',
  slot: 'lgbtqContext',
  label: 'ILGA-Europe Rainbow Map',
  description:
    'Maps ILGA-Europe Rainbow Index scores to LgbtqContext for European destinations. Uses a static editorial snapshot — not a live API call.',
  isMock: false,

  async healthCheck() {
    return true;
  },

  create() {
    return {
      async call(req: LgbtqContextReq): Promise<LgbtqContextRes> {
        const countryCode = SLUG_TO_COUNTRY[req.destinationSlug];
        if (!countryCode) {
          // Not a European destination covered by this dataset — return null-ish context.
          return {
            context: {
              destinationSlug: req.destinationSlug,
              editorialSummary:
                'ILGA-Europe Rainbow Map data is not available for this destination.',
              safetyTips: [
                'Consult the ILGA-Europe Rainbow Map for European destinations: https://rainbowmap.ilga-europe.org/',
                'Research local laws and community resources before travelling.',
              ],
              neighborhoodsToKnow: [],
              annualHighlights: [],
              communityNotes: '',
              lastReviewed: '2025-05-01',
            },
          };
        }

        const entry = RAINBOW_DATA.find((e) => e.countryCode === countryCode);
        if (!entry) {
          return {
            context: {
              destinationSlug: req.destinationSlug,
              editorialSummary:
                `ILGA-Europe Rainbow Map data for ${countryCode} is not available in this snapshot.`,
              safetyTips: [
                'Visit https://rainbowmap.ilga-europe.org/ for the latest country data.',
              ],
              neighborhoodsToKnow: [],
              annualHighlights: [],
              communityNotes: '',
              lastReviewed: '2025-05-01',
            },
          };
        }

        return { context: buildContext(req.destinationSlug, entry) };
      },
    };
  },
});
