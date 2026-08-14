import {
  computeCatalogPulse,
  computePulse,
  PULSE_MIN_THRESHOLDS,
} from '@gayi/domain';
import type { PulseInputs, PulseResult } from '@gayi/domain';

type PulseComponents = {
  upcomingEvents30d?: number;
  venueDensity?: number;
  recentReviews?: number;
  activeContributors?: number;
  publicTrips?: number;
  aggregateCheckins?: number;
  questionResponseRate?: number;
  sourcedCommunityPlaces?: number;
  sourcedCommunityEvents?: number;
  authoritativeCommunitySources?: number;
};

type PulsePlace = {
  category?: string;
  lgbtqRelevance?: string | null;
};

type PulseEvent = {
  title?: string;
  name?: string;
  category?: string;
  type?: string;
  summary?: string;
};

type PulseSource = { type?: string; title?: string };

export type DestinationPulseSource = {
  communityPulseComponents?: PulseComponents | null;
  places?: PulsePlace[] | null;
  events?: PulseEvent[] | null;
  sources?: PulseSource[] | null;
  lgbtqContext?: { sources?: PulseSource[] | null } | null;
  editorialReview?: { status?: string | null } | null;
};

const COMMUNITY_LANGUAGE = /\b(lgbtq|lgbt|queer|gay|lesbian|trans|pride|community life|queer history|nightlife anchor|social glue)\b/i;
const GENERIC_PLACE_LANGUAGE = /included as (?:a strong|a broader) destination anchor/i;
const COMMUNITY_SOURCE_TYPES = new Set([
  'human_rights',
  'ilga',
  'local_advocacy',
  'government',
  'comparative_index',
]);

export function isCommunityPlace(place: PulsePlace): boolean {
  if (['bar', 'club', 'event'].includes(place.category ?? '')) return true;
  const relevance = place.lgbtqRelevance?.trim() ?? '';
  return Boolean(relevance)
    && !GENERIC_PLACE_LANGUAGE.test(relevance)
    && COMMUNITY_LANGUAGE.test(relevance);
}

export function isCommunityEvent(event: PulseEvent): boolean {
  if ((event.category ?? event.type) === 'pride') return true;
  return COMMUNITY_LANGUAGE.test(`${event.title ?? event.name ?? ''} ${event.summary ?? ''}`);
}

function catalogEvidence(destination: DestinationPulseSource) {
  const c = destination.communityPulseComponents;
  const sourceTypes = new Set(
    [...(destination.sources ?? []), ...(destination.lgbtqContext?.sources ?? [])]
      .map((source) => source.type)
      .filter((type): type is string => typeof type === 'string' && COMMUNITY_SOURCE_TYPES.has(type)),
  );
  return {
    communityPlaceCount: c?.sourcedCommunityPlaces
      ?? (destination.places ?? []).filter(isCommunityPlace).length,
    communityEventCount: c?.sourcedCommunityEvents
      ?? (destination.events ?? []).filter(isCommunityEvent).length,
    communitySourceCount: c?.authoritativeCommunitySources ?? sourceTypes.size,
    editoriallyReviewed: destination.editorialReview?.status === 'approved',
  };
}

export function buildDestinationPulse(destination: DestinationPulseSource): PulseResult | null {
  const c = destination.communityPulseComponents;
  if (!c) return null;

  const hasThresholdedOutingActivity =
    (c.recentReviews ?? 0) >= 5
    || (c.activeContributors ?? 0) >= PULSE_MIN_THRESHOLDS.contributors
    || (c.publicTrips ?? 0) >= PULSE_MIN_THRESHOLDS.publicTrips
    || (c.aggregateCheckins ?? 0) >= PULSE_MIN_THRESHOLDS.checkins
    || (c.questionResponseRate ?? 0) > 0;

  if (!hasThresholdedOutingActivity) {
    return computeCatalogPulse(catalogEvidence(destination));
  }

  const communityPlaceCount = catalogEvidence(destination).communityPlaceCount;
  const inputs: PulseInputs = {
    eventCount30d: c.upcomingEvents30d ?? 0,
    venueDensityPer100k: c.venueDensity ?? 0,
    reviewCount: c.recentReviews ?? 0,
    activeContributors30d: c.activeContributors ?? 0,
    publicTripsCount: c.publicTrips ?? 0,
    aggregateCheckins30d: c.aggregateCheckins ?? 0,
    responseRate: c.questionResponseRate ?? 0,
    verifiedVenueCount: communityPlaceCount,
    prideEventThisYear: (destination.events ?? []).some(isCommunityEvent),
  };
  return computePulse(inputs);
}
