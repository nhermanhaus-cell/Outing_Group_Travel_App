import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const DESTINATIONS_PATH = resolve(ROOT, 'fixtures/seed/destinations.json');

const ENRICHMENTS = {
  'san-francisco': {
    humanRightsSummary:
      'San Francisco sits inside one of the strongest legal environments for LGBTQ+ rights in the United States, with broad state protections and a long civic history of queer organizing. Even so, day-to-day experience in the U.S. still varies by state, local policing, venue practices, and the specific neighborhood you are moving through.',
    advocacyNotes:
      'The SF LGBT Center, the Transgender District, and long-running Pride organizers continue to shape local advocacy, services, and public visibility.',
    recentRelevantEvents: [
      {
        title: 'San Francisco Pride Weekend 2025',
        date: '2025-06-28',
        summary:
          'The annual Pride weekend returned to Civic Center and Market Street with marches, performances, and community programming that kept rights advocacy visible alongside celebration.',
        sourceUrl: 'https://sfpride.org/',
      },
    ],
  },
  'palm-springs': {
    humanRightsSummary:
      'Palm Springs benefits from California\'s broad legal protections and a hospitality economy that is highly accustomed to LGBTQ+ travelers. As elsewhere in the U.S., though, expectations should still account for local variation between municipalities, operators, and neighboring regions.',
    advocacyNotes:
      'Greater Palm Springs Pride and DAP Health remain central to local community programming, public visibility, and health-focused support work.',
    recentRelevantEvents: [
      {
        title: 'Palm Springs Pride 2025',
        date: '2025-11-06',
        summary:
          'Palm Springs Pride week brought parades, downtown events, and community fundraising back into the city core during the destination\'s busiest queer season.',
        sourceUrl: 'https://pspride.org/',
      },
    ],
  },
  'puerto-vallarta': {
    humanRightsSummary:
      'Puerto Vallarta is one of Mexico\'s most established LGBTQ+ leisure destinations, and travelers benefit from national marriage equality plus a mature visitor economy in the city center. Practical experience can still change across neighborhoods, beaches, and the wider state context, so local awareness matters.',
    advocacyNotes:
      'Vallarta Pride and local HIV, nightlife, and community organizers help sustain visibility while keeping the destination connected to broader Jalisco advocacy conversations.',
    recentRelevantEvents: [
      {
        title: 'Vallarta Pride 2025',
        date: '2025-05-17',
        summary:
          'The annual Pride program again centered the city\'s beach and nightlife districts with cultural events, visibility campaigns, and community-led gatherings.',
        sourceUrl: 'https://vallartapride.org/',
      },
    ],
  },
  'mexico-city': {
    humanRightsSummary:
      'Mexico City has some of the strongest LGBTQ+ legal and civic infrastructure in the country, including long-running public institutions and very visible annual demonstrations. Travelers should still read the city by district and remember that Mexico\'s broader social climate can vary sharply beyond the capital.',
    advocacyNotes:
      'Comité IncluyeT, city cultural agencies, and neighborhood-based collectives keep Pride visibly tied to anti-discrimination and public-space advocacy.',
    recentRelevantEvents: [
      {
        title: 'Mexico City Pride March 2025',
        date: '2025-06-28',
        summary:
          'City officials promoted Pride-month programming in the Zócalo and confirmed the 2025 march route from Ángel de la Independencia to the historic center.',
        sourceUrl: 'https://www.cultura.cdmx.gob.mx/comunicacion/nota/241-25',
      },
    ],
  },
  'new-york-city': {
    humanRightsSummary:
      'New York City combines a dense LGBTQ+ institutional landscape with strong state-level legal protections and a very public movement history. In the U.S., however, traveler experience can still shift with venue policies, policing, and the broader political climate outside New York.',
    advocacyNotes:
      'The Center, NYC Pride, and the Anti-Violence Project remain influential reference points for services, organizing, and public education.',
    recentRelevantEvents: [
      {
        title: 'NYC Pride March 2025',
        date: '2025-06-29',
        summary:
          'The city\'s annual Pride march again used Manhattan\'s streets as a platform for both celebration and highly visible rights messaging.',
        sourceUrl: 'https://www.nycpride.org/',
      },
    ],
  },
  miami: {
    humanRightsSummary:
      'Miami offers a visible LGBTQ+ visitor scene, especially around beach and nightlife corridors, while benefiting from federal recognition and urban hospitality infrastructure. Travelers should still note that legal and cultural conditions in the United States can vary significantly by state, county, and operator.',
    advocacyNotes:
      'Miami Beach Pride and SAVE Florida are among the organizations keeping local visibility tied to statewide policy and voter advocacy.',
    recentRelevantEvents: [
      {
        title: 'Miami Beach Pride 2025',
        date: '2025-04-05',
        summary:
          'Miami Beach Pride returned with its annual festival and parade programming, keeping South Florida\'s LGBTQ+ presence highly visible in public space.',
        sourceUrl: 'https://www.miamibeachpride.com/',
      },
    ],
  },
  provincetown: {
    humanRightsSummary:
      'Provincetown operates inside Massachusetts\' long-standing legal protections and has one of the deepest queer cultural identities in North American tourism. Even within the U.S., though, traveler expectations should still separate this unusually community-centered environment from conditions elsewhere.',
    advocacyNotes:
      'The Provincetown Business Guild and Provincetown Pride Center continue to connect tourism, history, and local queer community programming.',
    recentRelevantEvents: [
      {
        title: 'Provincetown Pride 2025',
        date: '2025-06-06',
        summary:
          'Provincetown\'s 2025 Pride weekend brought rallies, comedy, dance events, and town-wide programming that framed Pride as both festival and civic gathering.',
        sourceUrl: 'https://ptown.org/calendars/pride/',
      },
    ],
  },
  montreal: {
    humanRightsSummary:
      'Montréal benefits from strong Canadian legal protections and a city-scale LGBTQ+ district with year-round civic visibility. Day-to-day experience still depends on language comfort, neighborhood fit, and venue culture rather than a single national shorthand.',
    advocacyNotes:
      'Fierté Montréal and community groups such as GRIS-Montréal help anchor advocacy, education, and visibility across the city.',
    recentRelevantEvents: [
      {
        title: 'Fierté Montréal 2025',
        date: '2025-07-31',
        summary:
          'Festival programming opened at the turn of August with public performances, community events, and Pride-week visibility centered in and around the Village.',
        sourceUrl: 'https://fiertemontreal.com/en/',
      },
    ],
  },
  london: {
    humanRightsSummary:
      'London combines broad national legal recognition with a large, diverse LGBTQ+ population spread across several boroughs rather than one single enclave. Public experience can still differ by neighborhood, late-night route, and the mix of mainstream versus explicitly queer venues.',
    advocacyNotes:
      'Stonewall, London Friend, and Pride in London remain key touchpoints for advocacy, support work, and public education.',
    recentRelevantEvents: [
      {
        title: 'Pride in London 2025',
        date: '2025-07-05',
        summary:
          'Pride in London once again used central London for a major public demonstration paired with cultural programming and community visibility.',
        sourceUrl: 'https://prideinlondon.org/',
      },
    ],
  },
  berlin: {
    humanRightsSummary:
      'Berlin sits within Germany\'s post-marriage-equality legal framework and remains one of Europe\'s most internationally legible queer capitals. The lived experience still changes by district and venue, especially where nightlife cultures, subcultures, and language norms diverge.',
    advocacyNotes:
      'CSD Berlin, Schwules Museum, and a wide network of grassroots venues continue to keep rights history connected to present-day organizing.',
    recentRelevantEvents: [
      {
        title: 'Berlin CSD 2025',
        date: '2025-07-26',
        summary:
          'Christopher Street Day returned with its annual demonstration and city-wide events, reinforcing Berlin\'s role as both party destination and protest stage.',
        sourceUrl: 'https://csd-berlin.de/en/',
      },
    ],
  },
  madrid: {
    humanRightsSummary:
      'Madrid operates within Spain\'s long-established marriage-equality framework and supports one of Europe\'s largest public Pride mobilizations. Travelers will still notice that the city reads differently by district, time of day, and how closely they stay to Chueca-centric social routes.',
    advocacyNotes:
      'COGAM, FELGTBI+, and MADO organizers remain highly visible in keeping Pride tied to rights advocacy as well as tourism and celebration.',
    recentRelevantEvents: [
      {
        title: 'Madrid Orgullo 2025',
        date: '2025-06-27',
        summary:
          'The 2025 MADO program framed the festival around twenty years of marriage equality in Spain while scheduling city-wide Pride events through early July.',
        sourceUrl: 'https://madridorgullo.com/en/frequently-asked-questions/',
      },
    ],
  },
  barcelona: {
    humanRightsSummary:
      'Barcelona benefits from Spain\'s national legal recognition and a visible queer social geography that is easy for visitors to plug into. Experiences still vary by neighborhood, season, and crowd mix, especially between beach zones, nightlife blocks, and residential districts.',
    advocacyNotes:
      'Pride Barcelona and Observatori Contra l\'LGBTIfòbia are among the local actors keeping public visibility connected to anti-discrimination work.',
    recentRelevantEvents: [
      {
        title: 'Pride Barcelona 2025',
        date: '2025-07-17',
        summary:
          'Barcelona\'s annual Pride programming again concentrated public performances and community events across major central-city corridors in mid-July.',
        sourceUrl: 'https://www.pridebarcelona.org/',
      },
    ],
  },
  lisbon: {
    humanRightsSummary:
      'Lisbon sits inside Portugal\'s strong formal legal framework while offering a queer scene that is visible but more distributed than some first-time visitors expect. Practical experience still depends on the venue, district, and how public-facing you plan to be outside major Pride periods.',
    advocacyNotes:
      'ILGA Portugal, rede ex aequo, and Variações are central references for rights advocacy, youth work, and public Pride organizing in Lisbon.',
    recentRelevantEvents: [
      {
        title: 'EuroPride Lisbon 2025 parade',
        date: '2025-06-21',
        summary:
          'Lisbon hosted EuroPride in 2025, bringing a major international parade and rights-focused programming onto Avenida da Liberdade and into the city center.',
        sourceUrl: 'https://europride2025.pt/pt/inicio/',
      },
    ],
  },
  amsterdam: {
    humanRightsSummary:
      'Amsterdam remains symbolically important in global LGBTQ+ travel because the Netherlands paired early legal recognition with visible public memorial and nightlife spaces. That said, the city still contains meaningful differences between tourist zones, local neighborhoods, and venue-specific crowd cultures.',
    advocacyNotes:
      'COC Nederland and Pride Amsterdam continue to link heritage, policy advocacy, and annual public programming.',
    recentRelevantEvents: [
      {
        title: 'Amsterdam Pride 2025',
        date: '2025-07-26',
        summary:
          'Amsterdam Pride opened its 2025 run in late July, setting up the annual week of canal, cultural, and community events that culminates in the city\'s most visible public celebration.',
        sourceUrl: 'https://pride.amsterdam/',
      },
    ],
  },
  tokyo: {
    humanRightsSummary:
      'Tokyo offers a sophisticated queer nightlife ecosystem and increasing municipal recognition, but national legal protections remain more limited than in many peer destinations. In Japan, practical experience can vary by ward, employer, housing context, and whether a space is quietly tolerant versus explicitly welcoming.',
    advocacyNotes:
      'Tokyo Rainbow Pride and Marriage For All Japan are among the most visible groups pushing public education, partnership recognition, and broader legal reform.',
    recentRelevantEvents: [
      {
        title: 'Tokyo Rainbow Pride 2025',
        date: '2025-04-19',
        summary:
          'Tokyo Rainbow Pride returned to the spring calendar with public programming and community visibility that extended beyond Ni-chōme into mainstream city space.',
        sourceUrl: 'https://tokyorainbowpride.com/',
      },
    ],
  },
  guerneville: {
    humanRightsSummary:
      'Guerneville benefits from California\'s legal protections and from a long history as a queer resort community tied to the Russian River. As elsewhere in the United States, that unusually welcoming local culture should not be treated as representative of every nearby county, operator, or route outside town.',
    advocacyNotes:
      'Russian River Pride and Sonoma County community organizers keep local fundraising, visibility, and intergenerational programming active well beyond festival weekend.',
    recentRelevantEvents: [
      {
        title: 'Russian River Pride 2025',
        date: '2025-09-20',
        summary:
          'Russian River Pride brought its 2025 parade and festival back through the center of Guerneville with community fundraising and local visibility at the core.',
        sourceUrl: 'https://russianriverpride.org/pastpride.php',
      },
    ],
  },
  'los-angeles': {
    humanRightsSummary:
      'Los Angeles sits within California\'s expansive legal framework and supports a wide LGBTQ+ ecosystem that stretches far beyond any one nightlife district. Even within the U.S., though, practical experience still changes by neighborhood, transport mode, policing practices, and venue-specific culture.',
    advocacyNotes:
      'The LA LGBT Center and Christopher Street West remain major institutions for services, Pride production, and public advocacy.',
    recentRelevantEvents: [
      {
        title: 'WeHo Pride 2025',
        date: '2025-05-30',
        summary:
          'West Hollywood\'s Pride weekend again combined concerts, marches, and civic visibility with a city-scale visitor draw at the start of summer.',
        sourceUrl: 'https://www.wehopride.com/',
      },
    ],
  },
  'las-vegas': {
    humanRightsSummary:
      'Las Vegas offers a visible LGBTQ+ hospitality scene and benefits from statewide legal recognition, but the city is best understood as a collection of highly different micro-environments rather than one unified traveler experience. In the U.S., expectations should still account for venue rules, off-Strip geography, and broader regional politics.',
    advocacyNotes:
      'The Center in Las Vegas and Las Vegas Pride continue to connect community services with annual public visibility and advocacy work.',
    recentRelevantEvents: [
      {
        title: 'Las Vegas Pride 2025',
        date: '2025-10-10',
        summary:
          'Las Vegas Pride returned to the fall calendar with parade, festival, and community events that emphasize visibility beyond casino branding alone.',
        sourceUrl: 'https://lasvegaspride.org/',
      },
    ],
  },
};

const rawDestinations = JSON.parse(readFileSync(DESTINATIONS_PATH, 'utf8'));

if (!Array.isArray(rawDestinations)) {
  throw new Error('Expected fixtures/seed/destinations.json to contain an array.');
}

for (const destination of rawDestinations) {
  const enrichment = ENRICHMENTS[destination.slug];
  if (!enrichment) {
    throw new Error(`Missing LGBTQ enrichment for destination slug "${destination.slug}"`);
  }
  if (!destination.lgbtqContext || typeof destination.lgbtqContext !== 'object') {
    throw new Error(`Destination "${destination.slug}" is missing lgbtqContext`);
  }

  destination.lgbtqContext = {
    ...destination.lgbtqContext,
    humanRightsSummary: enrichment.humanRightsSummary,
    advocacyNotes: enrichment.advocacyNotes,
    recentRelevantEvents: enrichment.recentRelevantEvents,
  };
}

writeFileSync(DESTINATIONS_PATH, `${JSON.stringify(rawDestinations, null, 2)}\n`);

console.log(`Patched LGBTQ context enrichment for ${rawDestinations.length} destinations.`);
