import { defineProviderPlugin } from '../../registry';
import type { LgbtqContextReq, LgbtqContextRes, LgbtqContext } from '../../interfaces';

const EDITORIAL: Record<string, LgbtqContext> = {
  'barcelona-es': {
    destinationSlug: 'barcelona-es',
    editorialSummary:
      'Barcelona is one of Europe\'s most welcoming LGBTQ+ cities. The Gayxample neighbourhood, centred around Carrer del Consell de Cent, pulses with queer bars, clubs, saunas, and community spaces. Spain has had marriage equality since 2005.',
    safetyTips: [
      'The Gayxample (Eixample Esquerre) is the safest and most vibrant queer hub.',
      'Be aware of pickpockets on Las Ramblas; keep valuables secure.',
      'Same-sex public displays of affection are broadly accepted across the city.',
    ],
    neighborhoodsToKnow: ['Gayxample (Eixample Esquerre)', 'Gràcia', 'El Raval'],
    annualHighlights: ['Barcelona Pride (June)', 'Circuit Festival (August)', 'Girlie Circuit (May)'],
    communityNotes: 'Strong local activist community. Look for rainbow flags in bar windows as a sign of welcome.',
    lastReviewed: '2026-01-15',
  },
  'amsterdam-nl': {
    destinationSlug: 'amsterdam-nl',
    editorialSummary:
      'Amsterdam has been a global LGBTQ+ haven for decades. The Reguliersdwarsstraat and Warmoesstraat streets are the epicentres of queer nightlife, with a spectrum from leather to cocktail bars. The Netherlands was the first country to legalise same-sex marriage in 2001.',
    safetyTips: [
      'Reguliersdwarsstraat is the primary gay street — safe and lively.',
      'Public transport is reliable and safe late at night.',
      'Rainbow crossings near the Homomonument mark historic queer space.',
    ],
    neighborhoodsToKnow: ['Reguliersdwarsstraat', 'Warmoesstraat', 'Jordaan'],
    annualHighlights: ['Amsterdam Pride Canal Parade (August)', 'Milkshake Festival (July)'],
    communityNotes: 'The Homomonument is a moving memorial to persecuted LGBTQ+ people — worth a visit.',
    lastReviewed: '2026-01-15',
  },
};

const DEFAULT_CONTEXT: LgbtqContext = {
  destinationSlug: 'unknown',
  editorialSummary: 'Detailed LGBTQ+ context for this destination is coming soon.',
  safetyTips: ['Research local laws before travel.', 'Connect with local LGBTQ+ groups online.'],
  neighborhoodsToKnow: [],
  annualHighlights: [],
  communityNotes: '',
  lastReviewed: '2026-01-01',
};

export const lgbtqContextMockEditorial = defineProviderPlugin<LgbtqContextReq, LgbtqContextRes>({
  id: 'lgbtqContext:mock-editorial',
  slot: 'lgbtqContext',
  label: 'Mock Editorial LGBTQ+ Context',
  description: 'Curated editorial content for a selection of seed destinations.',
  isMock: true,
  create() {
    return {
      async call(req) {
        const context = EDITORIAL[req.destinationSlug] ?? {
          ...DEFAULT_CONTEXT,
          destinationSlug: req.destinationSlug,
        };
        return { context };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
