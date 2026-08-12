import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DESTINATION_EXPANSION } from '../fixtures/catalog/destination-expansion.mjs';

const ROOT = process.cwd();
const DESTINATIONS_PATH = resolve(ROOT, 'fixtures/seed/destinations.json');
const SCORING_PATH = resolve(ROOT, 'fixtures/seed/destinations.scoring.json');
const PROVIDER_ENRICHMENT_PATH = resolve(ROOT, 'fixtures/catalog/destination-provider-enrichment.json');
const REVIEWED_AT = '2026-08-12T00:00:00.000Z';
const PROVIDER_ENRICHMENT = existsSync(PROVIDER_ENRICHMENT_PATH)
  ? JSON.parse(readFileSync(PROVIDER_ENRICHMENT_PATH, 'utf8'))
  : {};

const CLIMATES = {
  marine: { high: [8, 9, 11, 14, 18, 21, 24, 24, 20, 15, 11, 8], low: [3, 3, 5, 7, 10, 13, 15, 15, 12, 9, 6, 3] },
  marine_cool: { high: [7, 8, 10, 13, 16, 19, 21, 21, 18, 14, 10, 8], low: [2, 2, 3, 5, 8, 11, 13, 13, 11, 8, 5, 3] },
  continental: { high: [0, 2, 8, 15, 21, 26, 28, 27, 23, 16, 9, 3], low: [-7, -6, -1, 5, 11, 16, 19, 18, 14, 7, 2, -4] },
  continental_mild: { high: [6, 9, 14, 18, 23, 27, 29, 28, 24, 18, 11, 7], low: [0, 1, 5, 9, 13, 17, 19, 19, 15, 10, 5, 1] },
  humid_subtropical: { high: [10, 13, 18, 24, 28, 31, 33, 32, 29, 23, 17, 12], low: [2, 4, 9, 14, 19, 23, 25, 24, 21, 15, 9, 4] },
  highland: { high: [25, 27, 30, 32, 32, 29, 27, 27, 27, 27, 26, 25], low: [8, 9, 11, 13, 15, 16, 16, 16, 16, 13, 10, 8] },
  mediterranean: { high: [13, 14, 17, 20, 24, 29, 32, 32, 28, 23, 18, 14], low: [6, 7, 9, 12, 16, 20, 23, 23, 20, 16, 11, 8] },
  hot_mediterranean: { high: [16, 18, 22, 25, 30, 35, 39, 39, 34, 28, 21, 17], low: [6, 8, 11, 13, 17, 20, 23, 23, 20, 16, 11, 7] },
  tropical: { high: [29, 30, 31, 32, 32, 32, 32, 32, 32, 31, 30, 29], low: [22, 22, 23, 24, 25, 25, 25, 25, 24, 24, 23, 22] },
  desert: { high: [24, 25, 29, 34, 39, 41, 42, 42, 40, 36, 31, 26], low: [15, 16, 19, 23, 27, 29, 31, 31, 28, 24, 20, 17] },
  subarctic_marine: { high: [3, 3, 4, 7, 10, 13, 15, 14, 11, 7, 4, 3], low: [-2, -2, -1, 1, 4, 7, 9, 8, 5, 2, -1, -2] },
  southern_temperate: { high: [29, 28, 26, 22, 18, 15, 15, 17, 20, 23, 26, 28], low: [20, 19, 17, 13, 10, 8, 7, 9, 11, 14, 17, 19] },
  southern_subtropical: { high: [27, 27, 25, 22, 19, 17, 16, 18, 20, 22, 24, 26], low: [19, 19, 17, 14, 11, 9, 8, 9, 11, 14, 16, 18] },
  southern_tropical: { high: [31, 31, 30, 28, 27, 26, 26, 27, 27, 28, 29, 30], low: [24, 24, 23, 22, 20, 19, 19, 19, 20, 21, 22, 23] },
  southern_mediterranean: { high: [29, 29, 27, 24, 21, 18, 17, 18, 20, 23, 25, 28], low: [18, 18, 16, 13, 11, 8, 7, 8, 10, 13, 15, 17] },
  alpine_southern: { high: [22, 22, 19, 15, 11, 8, 8, 10, 13, 16, 18, 21], low: [10, 10, 8, 5, 2, 0, -1, 0, 2, 5, 7, 9] },
};

const SCORING_INTEREST_MAP = {
  art_culture: ['art', 'culture'], architecture: ['culture', 'history'], outdoors: ['hiking', 'adventure'],
  luxury: ['shopping', 'wellness'], romance: ['culture'], winter_sports: ['sports', 'adventure'],
};

const LEGACY_EXTRA_PLACES = {
  'palm-springs': [['Palm Springs Art Museum', 'museum'], ['Palm Springs Aerial Tramway', 'landmark'], ['Moorten Botanical Garden', 'park']],
  'puerto-vallarta': [['Los Muertos Beach', 'beach'], ['Malecón Boardwalk', 'landmark'], ['Cuale Island', 'park'], ['Naval Museum Puerto Vallarta', 'museum']],
  'mexico-city': [['National Museum of Anthropology', 'museum'], ['Palacio de Bellas Artes', 'museum'], ['Frida Kahlo Museum', 'museum']],
  'new-york-city': [['The Lesbian, Gay, Bisexual & Transgender Community Center', 'other'], ['Whitney Museum of American Art', 'museum']],
  miami: [['Pérez Art Museum Miami', 'museum'], ['Vizcaya Museum and Gardens', 'museum'], ['The Bass', 'museum']],
  provincetown: [['Provincetown Art Association and Museum', 'museum'], ['Race Point Beach', 'beach'], ['Pilgrim Monument', 'landmark']],
  montreal: [['Montreal Museum of Fine Arts', 'museum'], ['Montreal Botanical Garden', 'park'], ['Museum of Contemporary Art', 'museum']],
  london: [['Tate Modern', 'museum'], ['British Museum', 'museum']],
  berlin: [['Schwules Museum', 'museum'], ['East Side Gallery', 'landmark']],
  madrid: [['Museo del Prado', 'museum'], ['Museo Reina Sofía', 'museum'], ['El Retiro Park', 'park']],
  barcelona: [["Museu Nacional d'Art de Catalunya", 'museum'], ['Sagrada Família', 'landmark'], ['Picasso Museum', 'museum']],
  lisbon: [['National Tile Museum', 'museum'], ['MAAT', 'museum'], ['Time Out Market Lisbon', 'restaurant']],
  amsterdam: [['Rijksmuseum', 'museum'], ['Van Gogh Museum', 'museum'], ['Vondelpark', 'park']],
  tokyo: [['teamLab Borderless', 'museum'], ['Meiji Shrine', 'landmark'], ['Mori Art Museum', 'museum']],
  guerneville: [['Armstrong Redwoods State Natural Reserve', 'park'], ['Guerneville Plaza', 'park'], ['Korbel California Champagne', 'landmark'], ['Boon Eat + Drink', 'restaurant']],
  'los-angeles': [['Griffith Observatory', 'landmark'], ['Getty Center', 'museum'], ['Griffith Park', 'park']],
  'las-vegas': [['The Neon Museum', 'museum'], ['The Mob Museum', 'museum'], ['Bellagio Gallery of Fine Art', 'museum']],
};

const LEGAL_STATUS_OVERRIDES = {
  'puerto-vallarta': 'marriage_equality',
  'mexico-city': 'marriage_equality',
  miami: 'marriage_equality',
};

const ADVISORY_OVERRIDES = {
  // Florida's local queer infrastructure does not erase the statewide policy
  // context. Keep that tradeoff visible on the original Miami record too.
  miami: 'elevated',
};

function uuidFor(value) {
  const hex = createHash('sha256').update(`outing:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function scoringInterests(interests) {
  return [...new Set(interests.flatMap((interest) => SCORING_INTEREST_MAP[interest] ?? [interest]))]
    .filter((interest) => ['beach', 'hiking', 'culture', 'nightlife', 'food', 'art', 'history', 'shopping', 'wellness', 'adventure', 'pride', 'sports', 'music', 'lgbtq_venues', 'drag'].includes(interest));
}

function source(type, label, url) {
  return { type, label, url, accessedAt: REVIEWED_AT.slice(0, 10) };
}

const COMMUNITY_LANGUAGE = /\b(lgbtq|lgbt|queer|gay|lesbian|trans|pride|community life|queer history|nightlife anchor|social glue)\b/i;
const GENERIC_PLACE_LANGUAGE = /included as (?:a strong|a broader) destination anchor/i;
const COMMUNITY_SOURCE_TYPES = new Set(['human_rights', 'ilga', 'local_advocacy', 'government', 'comparative_index']);

function isCommunityPlace(place) {
  if (['bar', 'club', 'event'].includes(place.category)) return true;
  const relevance = String(place.lgbtqRelevance ?? '').trim();
  return Boolean(relevance) && !GENERIC_PLACE_LANGUAGE.test(relevance) && COMMUNITY_LANGUAGE.test(relevance);
}

function isCommunityEvent(event) {
  if (event.category === 'pride') return true;
  return COMMUNITY_LANGUAGE.test(`${event.title ?? event.name ?? ''} ${event.summary ?? ''}`);
}

function catalogPulseComponents(places, events, sources) {
  const sourcedCommunityPlaces = places.filter(isCommunityPlace).length;
  return {
    upcomingEvents30d: 0,
    upcomingEvents90d: 0,
    venueDensity: sourcedCommunityPlaces,
    recentReviews: 0,
    activeContributors: 0,
    publicTrips: 0,
    aggregateCheckins: 0,
    questionResponseRate: 0,
    sourcedCommunityPlaces,
    sourcedCommunityEvents: events.filter(isCommunityEvent).length,
    authoritativeCommunitySources: new Set(
      sources.map((item) => item.type).filter((type) => COMMUNITY_SOURCE_TYPES.has(type)),
    ).size,
  };
}

function buildDestination(author) {
  const climate = CLIMATES[author.climate];
  if (!climate) throw new Error(`Unknown climate profile ${author.climate} for ${author.slug}`);
  const sources = [
    source('official_tourism', `${author.name} official tourism`, author.tourismUrl),
    source('local_advocacy', `${author.name} LGBTQ+ community source`, author.communityUrl),
    source('human_rights', 'ILGA World Database', 'https://database.ilga.org/en'),
    source('comparative_index', 'Spartacus Gay Travel Index 2026', 'https://spartacus.gayguide.travel/gaytravelindex.pdf'),
    source('openstreetmap', 'OpenStreetMap © contributors', 'https://www.openstreetmap.org/copyright'),
    source('weather', 'Open-Meteo', 'https://open-meteo.com/'),
  ];
  const restrictive = author.legalStatus === 'criminalized' || author.legalStatus === 'heavily_criminalized';
  const sameSexRecognition = author.legalStatus === 'marriage_equality' || author.legalStatus === 'civil_union';
  const destinationId = uuidFor(`destination:${author.slug}`);
  const neighborhoods = author.neighborhoods.map((name, index) => ({
    id: uuidFor(`neighborhood:${author.slug}:${name}`),
    name,
    slug: name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    summary: `${name} is one of the most useful areas for understanding ${author.name}'s ${index === 0 ? 'social and cultural rhythm' : 'broader neighborhood character'}.`,
    vibeTags: author.interests.slice(index * 2, index * 2 + 3),
    lat: Number((author.lat + (index === 0 ? 0.006 : -0.007)).toFixed(5)),
    lng: Number((author.lng + (index === 0 ? 0.006 : -0.007)).toFixed(5)),
    validationStatus: 'pending_google_places',
  }));
  const places = author.places.map(([name, category], index) => ({
    id: uuidFor(`place:${author.slug}:${name}`),
    name,
    category: category === 'community' ? 'other' : category,
    address: `${name}, ${author.name}`,
    summary: `${name} is a useful ${category === 'community' ? 'community reference point' : `${category} stop`} for a ${author.name} itinerary. Verify hours, access, and current operating status before visiting.`,
    lgbtqRelevance: category === 'community' || category === 'bar'
      ? 'Included for its direct connection to local LGBTQ+ community life.'
      : 'Included as a strong destination anchor; individual welcome and access should be checked directly.',
    estimatedCostUsd: category === 'museum' ? 20 : category === 'restaurant' || category === 'bar' ? 30 : 0,
    durationMinutes: category === 'park' || category === 'beach' ? 120 : 90,
    providerValidationStatus: 'pending',
    imageUrls: [],
  }));
  const events = author.events.map(([title, month, category]) => ({
    id: uuidFor(`event:${author.slug}:${title}`),
    title,
    startDate: `2027-${String(month).padStart(2, '0')}-01`,
    endDate: `2027-${String(month).padStart(2, '0')}-01`,
    category,
    summary: `${title} is an annual ${author.name} event. The month is useful for planning, but exact dates must be verified with the organizer before booking.`,
    estimatedCostUsd: 0,
    scheduleStatus: 'estimated',
  }));
  const daily = author.costs;
  const destination = {
    id: destinationId,
    slug: author.slug,
    name: author.name,
    country: author.country,
    countryCode: author.countryCode,
    destinationType: author.destinationType ?? 'city',
    travelerAdvisoryLevel: author.advisory,
    catalogWave: author.wave,
    publicationStatus: author.publicationStatus ?? 'draft',
    editorialReview: author.editorialReview ?? { status: 'pending', legalContextReviewed: false, placesValidated: false, reviewedAt: null },
    catalogFreshness: author.catalogFreshness ?? {
      legalContextReviewedAt: null,
      venuesReviewedAt: null,
      eventsReviewedAt: null,
      pricingReviewedAt: REVIEWED_AT,
      climateReviewedAt: REVIEWED_AT,
    },
    lat: author.lat,
    lng: author.lng,
    timezone: author.timezone,
    currency: author.currency,
    editorialSummary: author.summary,
    heroImageUrl: null,
    bestMonths: author.bestMonths,
    weatherProfile: { avgHighByMonth: climate.high, avgLowByMonth: climate.low },
    priceBands: {
      shoestring: { perPersonPerDayUsd: { low: daily[0], high: Math.round(daily[0] * 1.45) } },
      mid: { perPersonPerDayUsd: { low: daily[1], high: Math.round(daily[1] * 1.45) } },
      luxury: { perPersonPerDayUsd: { low: daily[2], high: Math.round(daily[2] * 1.65) } },
    },
    interests: author.interests,
    lgbtqContext: {
      legalEqualityScore: author.legalScore,
      publicOpinionScore: author.publicScore,
      criminalizationStatus: restrictive ? author.legalStatus : 'none',
      sameSexRecognition,
      antiDiscrimination: author.legalScore >= 70,
      genderRecognitionNotes: 'Requirements and practical access vary. Review the linked human-rights and local community sources before relying on this draft.',
      expressionRestrictions: restrictive || author.advisory === 'severe'
        ? 'Law or enforcement can restrict same-sex intimacy, advocacy, or gender expression. Current official guidance is required.'
        : author.advisory === 'elevated'
          ? 'Public expression, events, or advocacy may face material restrictions; verify current local guidance.'
          : null,
      localVariation: author.context,
      neighborhoodNotes: neighborhoods.map((neighborhood) => `${neighborhood.name}: ${neighborhood.summary}`),
      recentChanges: 'This catalog-expansion record requires final human review before publication.',
      emergencyResources: [{ name: 'ILGA World Database', url: 'https://database.ilga.org/en' }],
      embassyGuidanceUrl: `https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages.html`,
      sources: sources.slice(1, 4).map((item) => ({ title: item.label, url: item.url, accessedAt: item.accessedAt })),
      lastReviewedAt: REVIEWED_AT,
      dataLabel: 'editorial_draft',
      travelerAdvisoryLevel: author.advisory,
      humanRightsSummary: author.context,
      advocacyNotes: `Review current guidance from the linked local community source: ${author.communityUrl}`,
      recentRelevantEvents: [],
    },
    communityPulseComponents: catalogPulseComponents(places, events, sources),
    accessibility: {
      wheelchairFriendly: false,
      brailleAvailable: false,
      notes: 'Accessibility varies by venue and transport provider. Verify step-free access and accommodations directly before booking.',
    },
    neighborhoods,
    places,
    events,
    sampleItineraryHint: `Use ${author.neighborhoods[0]} as one anchor, pair it with ${author.places[3]?.[0] ?? author.places[0][0]}, and leave a flexible window for weather, transit, and a locally verified recommendation.`,
    dataFreshness: REVIEWED_AT,
    sourceLabel: 'catalog_expansion_draft',
    sources,
    galleryImageUrls: [],
    scoringMetadata: {
      continentCode: author.continentCode,
      nearestAirportCodes: author.airports,
      legalStatus: author.legalStatus,
      nightlifeScore: author.nightlife,
      typicalStayDays: author.destinationType === 'island' || author.destinationType === 'resort_area' ? { min: 4, max: 8 } : { min: 3, max: 6 },
      interests: scoringInterests(author.interests),
    },
  };
  const enrichment = PROVIDER_ENRICHMENT[author.slug];
  if (!enrichment) return destination;
  const placeEnrichment = enrichment.places ?? {};
  return {
    ...destination,
    providerPlaceId: enrichment.providerPlaceId ?? destination.providerPlaceId,
    providerValidationStatus: enrichment.providerValidationStatus ?? destination.providerValidationStatus,
    heroImageUrl: enrichment.heroImageUrl ?? destination.heroImageUrl,
    galleryImageUrls: enrichment.galleryImageUrls ?? destination.galleryImageUrls,
    editorialReview: {
      ...destination.editorialReview,
      placesValidated: enrichment.placesValidated === true,
    },
    catalogFreshness: {
      ...destination.catalogFreshness,
      venuesReviewedAt: enrichment.hydratedAt ?? destination.catalogFreshness.venuesReviewedAt,
    },
    places: destination.places.map((place) => ({
      ...place,
      ...(placeEnrichment[place.name] ?? {}),
    })),
  };
}

const existing = JSON.parse(readFileSync(DESTINATIONS_PATH, 'utf8'));
const priorScoring = JSON.parse(readFileSync(SCORING_PATH, 'utf8'));
const scoringBySlug = new Map(priorScoring.map((destination) => [destination.slug, destination]));
const normalizedExisting = existing
  .filter((destination) => !DESTINATION_EXPANSION.some((candidate) => candidate.slug === destination.slug))
  .map((destination) => {
    const scoring = scoringBySlug.get(destination.slug);
    const contextScore = Math.round(((destination.lgbtqContext?.legalEqualityScore ?? 70) + (destination.lgbtqContext?.publicOpinionScore ?? 70)) / 2);
    const advisory = ADVISORY_OVERRIDES[destination.slug] ?? destination.travelerAdvisoryLevel
      ?? (contextScore < 35 ? 'severe' : contextScore < 55 ? 'elevated' : contextScore < 75 ? 'caution' : 'standard');
    const extraPlaces = LEGACY_EXTRA_PLACES[destination.slug] ?? [];
    const places = [...(destination.places ?? [])];
    for (const extraPlace of extraPlaces) {
      if (places.length >= 6) break;
      if (places.some((place) => place.name === extraPlace[0])) continue;
      places.push({
        id: uuidFor(`place:${destination.slug}:${extraPlace[0]}`),
        name: extraPlace[0],
        category: extraPlace[1],
        address: `${extraPlace[0]}, ${destination.name}`,
        summary: `${extraPlace[0]} adds a current cultural or outdoor anchor to the ${destination.name} catalog. Verify hours and accessibility before visiting.`,
        lgbtqRelevance: 'Included as a broader destination anchor; individual welcome and access should be checked directly.',
        estimatedCostUsd: extraPlace[1] === 'museum' ? 20 : 0,
        durationMinutes: 90,
        imageUrls: destination.galleryImageUrls?.slice(0, 3) ?? [],
        imageUrl: destination.galleryImageUrls?.[0] ?? destination.heroImageUrl ?? null,
      });
    }
    const sources = (destination.sources ?? []).map((item) => ({
      ...item,
      url: typeof item.url === 'string' ? item.url.replace(/^http:\/\//i, 'https://') : item.url,
      accessedAt: item.accessedAt ?? String(destination.dataFreshness).slice(0, 10),
    }));
    if (!sources.some((item) => ['human_rights', 'ilga'].includes(item.type))) {
      sources.push(source('human_rights', 'ILGA World Database', 'https://database.ilga.org/en'));
    }
    const contextSources = (destination.lgbtqContext?.sources ?? []).map((item) => ({
      ...item,
      url: typeof item.url === 'string' ? item.url.replace(/^http:\/\//i, 'https://') : item.url,
      accessedAt: item.accessedAt ?? String(destination.dataFreshness).slice(0, 10),
    }));
    return {
      ...destination,
      places,
      sources,
      lgbtqContext: { ...destination.lgbtqContext, sources: contextSources },
      communityPulseComponents: catalogPulseComponents(places, destination.events ?? [], sources),
      destinationType: destination.destinationType ?? 'city',
      travelerAdvisoryLevel: advisory,
      catalogWave: destination.catalogWave ?? 'original',
      publicationStatus: 'published',
      editorialReview: destination.editorialReview ?? {
        status: 'approved', legalContextReviewed: true, placesValidated: true,
        reviewedAt: destination.lgbtqContext?.lastReviewedAt ?? destination.dataFreshness,
      },
      catalogFreshness: destination.catalogFreshness ?? {
        legalContextReviewedAt: destination.lgbtqContext?.lastReviewedAt ?? destination.dataFreshness,
        venuesReviewedAt: destination.dataFreshness,
        eventsReviewedAt: destination.dataFreshness,
        pricingReviewedAt: destination.dataFreshness,
        climateReviewedAt: destination.dataFreshness,
      },
      scoringMetadata: destination.scoringMetadata ?? {
        continentCode: scoring?.continentCode,
        nearestAirportCodes: scoring?.nearestAirportCodes,
        legalStatus: LEGAL_STATUS_OVERRIDES[destination.slug] ?? scoring?.legalStatus,
        nightlifeScore: scoring?.nightlifeScore,
        typicalStayDays: scoring?.typicalStayDays,
        interests: scoring?.interests,
      },
    };
  });

const output = [...normalizedExisting, ...DESTINATION_EXPANSION.map(buildDestination)];
writeFileSync(DESTINATIONS_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${output.length} catalog records (${normalizedExisting.length} published, ${DESTINATION_EXPANSION.length} review-gated drafts).`);
