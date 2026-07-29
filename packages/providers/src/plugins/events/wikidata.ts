/**
 * Wikidata SPARQL plugin — queries Wikidata for LGBTQ+ pride events near a destination,
 * with a static fixture fallback.
 *
 * Wikidata SPARQL endpoint: https://query.wikidata.org/sparql
 * License: CC0 (Wikidata content)
 *
 * On network failure or timeout, the plugin falls back to the static sample in
 * fixtures/public/wikidata-events-sample.json.
 */

import { defineProviderPlugin, withTimeout } from '../../registry';
import type { EventsReq, EventsRes, LocalEvent } from '../../interfaces';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const TIMEOUT_MS = 7000;
const USER_AGENT = 'Outing-App/0.1 (https://gayi.app; contact@gayi.app) wikidata-events-plugin';

// ── Static fallback fixture ───────────────────────────────────────────────

/** Inline copy of fixtures/public/wikidata-events-sample.json */
const FIXTURE_EVENTS: LocalEvent[] = [
  {
    eventId: 'wd-ams-pride-2026',
    name: 'Amsterdam Pride',
    destinationSlug: 'amsterdam',
    startDate: '2026-07-31',
    endDate: '2026-08-09',
    type: 'pride',
    venue: 'Canal Parade & Vondelpark',
    ticketUrl: 'https://amsterdampride.nl',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-ber-csd-2026',
    name: 'Berlin CSD (Christopher Street Day)',
    destinationSlug: 'berlin',
    startDate: '2026-07-19',
    endDate: '2026-07-26',
    type: 'pride',
    venue: 'Tiergarten / Brandenburg Gate',
    ticketUrl: 'https://csd-berlin.de',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-lon-pride-2026',
    name: 'Pride in London',
    destinationSlug: 'london',
    startDate: '2026-06-27',
    type: 'pride',
    venue: 'Central London / Trafalgar Square',
    ticketUrl: 'https://prideinlondon.org',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-mad-pride-2026',
    name: 'WorldPride Madrid / Orgullo Madrid',
    destinationSlug: 'madrid',
    startDate: '2026-06-26',
    endDate: '2026-07-05',
    type: 'pride',
    venue: 'Chueca / Paseo del Prado',
    ticketUrl: 'https://orgullomadrid.es',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-bcn-pride-2026',
    name: 'Barcelona Pride',
    destinationSlug: 'barcelona',
    startDate: '2026-06-20',
    endDate: '2026-06-28',
    type: 'pride',
    venue: 'Eixample / Passeig de Gràcia',
    ticketUrl: 'https://pridebarcelona.org',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-sfo-pride-2026',
    name: 'San Francisco Pride',
    destinationSlug: 'san-francisco',
    startDate: '2026-06-27',
    endDate: '2026-06-28',
    type: 'pride',
    venue: 'Civic Center / Market Street',
    ticketUrl: 'https://sfpride.org',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-nyc-pride-2026',
    name: 'NYC Pride March',
    destinationSlug: 'new-york-city',
    startDate: '2026-06-28',
    type: 'pride',
    venue: 'Fifth Avenue',
    ticketUrl: 'https://nycpride.org',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-mtl-pride-2026',
    name: 'Fierté Montréal Pride',
    destinationSlug: 'montreal',
    startDate: '2026-08-07',
    endDate: '2026-08-16',
    type: 'pride',
    venue: 'Village / Quartier des spectacles',
    ticketUrl: 'https://fiertemontrealpride.com',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-tyo-pride-2026',
    name: 'Tokyo Rainbow Pride',
    destinationSlug: 'tokyo',
    startDate: '2026-04-25',
    endDate: '2026-05-06',
    type: 'pride',
    venue: 'Yoyogi Park',
    ticketUrl: 'https://tokyorainbowpride.com',
    lgbtqFocused: true,
  },
  {
    eventId: 'wd-lis-pride-2026',
    name: 'Lisboa Pride',
    destinationSlug: 'lisbon',
    startDate: '2026-06-20',
    type: 'pride',
    venue: 'Praça do Marquês de Pombal',
    ticketUrl: 'https://ilga-portugal.pt',
    lgbtqFocused: true,
  },
];

// ── Slug alias normalisation ──────────────────────────────────────────────

const SLUG_ALIASES: Record<string, string> = {
  'amsterdam-nl':   'amsterdam',
  'barcelona-es':   'barcelona',
  'berlin-de':      'berlin',
  'mexico-city-mx': 'mexico-city',
};

function normaliseSlug(slug: string): string {
  return SLUG_ALIASES[slug] ?? slug;
}

// ── Wikidata SPARQL query ─────────────────────────────────────────────────

/**
 * City Wikidata QID map. Used to build a targeted SPARQL query.
 * Expand as more destinations are added.
 */
const CITY_QIDS: Record<string, string> = {
  'amsterdam':       'Q727',
  'barcelona':       'Q1492',
  'berlin':          'Q64',
  'london':          'Q84',
  'madrid':          'Q2807',
  'lisbon':          'Q597',
  'san-francisco':   'Q62',
  'new-york-city':   'Q60',
  'miami':           'Q8652',
  'palm-springs':    'Q49239',
  'provincetown':    'Q1378479',
  'montreal':        'Q340',
  'puerto-vallarta': 'Q193830',
  'mexico-city':     'Q1489',
  'tokyo':           'Q1490',
};

function buildSparqlQuery(cityQid: string, year: number): string {
  return `
SELECT ?event ?eventLabel ?startDate ?endDate ?locationLabel WHERE {
  ?event wdt:P31/wdt:P279* wd:Q1777138 .
  ?event wdt:P276 ?location .
  ?location wdt:P131* wd:${cityQid} .
  OPTIONAL { ?event wdt:P580 ?startDate . }
  OPTIONAL { ?event wdt:P582 ?endDate . }
  OPTIONAL { ?event wdt:P585 ?pointInTime . }
  BIND(COALESCE(?startDate, ?pointInTime) AS ?sd)
  FILTER(YEAR(COALESCE(?sd, NOW())) >= ${year})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 10
`.trim();
}

type SparqlBinding = { value: string; type: string };
type SparqlResult = {
  results: {
    bindings: Array<Record<string, SparqlBinding>>;
  };
};

async function queryWikidata(slug: string): Promise<LocalEvent[]> {
  const normalised = normaliseSlug(slug);
  const cityQid = CITY_QIDS[normalised];
  if (!cityQid) return [];

  const currentYear = new Date().getFullYear();
  const query = buildSparqlQuery(cityQid, currentYear);
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;

  const resp = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!resp.ok) return [];

  const data = (await resp.json()) as SparqlResult;
  const events: LocalEvent[] = [];

  for (const binding of data.results.bindings) {
    const qid = binding['event']?.value?.split('/').pop() ?? '';
    const name = binding['eventLabel']?.value ?? '';
    if (!name || name.startsWith('Q')) continue; // skip unlabelled

    const startDate = binding['startDate']?.value?.slice(0, 10) ?? `${currentYear}-01-01`;
    const endDate = binding['endDate']?.value?.slice(0, 10);
    const venue = binding['locationLabel']?.value;

    events.push({
      eventId: `wd-sparql-${qid}`,
      name,
      destinationSlug: normalised,
      startDate,
      ...(endDate ? { endDate } : {}),
      type: 'pride',
      ...(venue ? { venue } : {}),
      lgbtqFocused: true,
    });
  }

  return events;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const eventsWikidata = defineProviderPlugin<EventsReq, EventsRes>({
  id: 'events:wikidata',
  slot: 'events',
  label: 'Wikidata SPARQL Pride Events',
  description:
    'Queries Wikidata SPARQL for LGBTQ+ pride events near a destination. ' +
    'Falls back to a static fixture sample on network failure or timeout. ' +
    'Data: Wikidata CC0. Endpoint: https://query.wikidata.org/sparql',
  isMock: false,

  async healthCheck() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const resp = await fetch(`${SPARQL_ENDPOINT}?query=ASK+%7B%7D&format=json`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
      }).catch(() => null);
      clearTimeout(timer);
      return resp != null && resp.status < 500;
    } catch {
      return false;
    }
  },

  create() {
    const inner = {
      async call(req: EventsReq): Promise<EventsRes> {
        const normalised = normaliseSlug(req.destinationSlug);

        let events: LocalEvent[];
        try {
          events = await queryWikidata(normalised);
          if (events.length === 0) {
            // SPARQL returned nothing — fall back to fixture.
            events = FIXTURE_EVENTS.filter((e) => normaliseSlug(e.destinationSlug) === normalised);
          }
        } catch {
          // Network error — fall back to fixture.
          events = FIXTURE_EVENTS.filter((e) => normaliseSlug(e.destinationSlug) === normalised);
        }

        if (req.months?.length) {
          events = events.filter((e) => {
            const month = new Date(e.startDate).getMonth() + 1;
            return req.months!.includes(month);
          });
        }

        return { events: req.limit != null ? events.slice(0, req.limit) : events };
      },
    };

    return withTimeout(inner, TIMEOUT_MS);
  },
});
