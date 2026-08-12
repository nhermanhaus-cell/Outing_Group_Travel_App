import { describe, expect, it } from 'vitest';
import {
  buildDestinationPulse,
  isCommunityEvent,
  isCommunityPlace,
} from '../../apps/mobile/src/lib/communityPulse';

const catalogDestination = {
  communityPulseComponents: {
    upcomingEvents30d: 0,
    venueDensity: 2,
    recentReviews: 0,
    activeContributors: 0,
    publicTrips: 0,
    aggregateCheckins: 0,
    questionResponseRate: 0,
  },
  places: [
    { category: 'other', lgbtqRelevance: 'Included for its direct connection to local LGBTQ+ community life.' },
    { category: 'museum', lgbtqRelevance: 'Included as a strong destination anchor; check access directly.' },
    { category: 'bar', lgbtqRelevance: null },
  ],
  events: [
    { title: 'City Pride', category: 'pride', summary: 'Annual event.' },
    { title: 'Food week', category: 'festival', summary: 'Annual dining event.' },
  ],
  sources: [
    { type: 'official_tourism' },
    { type: 'local_advocacy' },
    { type: 'human_rights' },
  ],
  editorialReview: { status: 'pending' },
};

describe('destination Community Pulse fallback', () => {
  it('does not treat generic itinerary anchors as community infrastructure', () => {
    expect(isCommunityPlace(catalogDestination.places[0])).toBe(true);
    expect(isCommunityPlace(catalogDestination.places[1])).toBe(false);
    expect(isCommunityPlace(catalogDestination.places[2])).toBe(true);
  });

  it('recognizes community events without classifying generic festivals', () => {
    expect(isCommunityEvent(catalogDestination.events[0])).toBe(true);
    expect(isCommunityEvent(catalogDestination.events[1])).toBe(false);
  });

  it('uses sourced evidence when private activity has not met its thresholds', () => {
    const pulse = buildDestinationPulse(catalogDestination);
    expect(pulse?.dataBasis).toBe('catalog_evidence');
    expect(pulse?.evidence).toEqual(expect.arrayContaining([
      { key: 'places', label: 'community places', count: 2 },
      { key: 'events', label: 'community events', count: 1 },
      { key: 'sources', label: 'context sources', count: 2 },
    ]));
  });

  it('switches to privacy-thresholded Outing activity when enough activity exists', () => {
    const pulse = buildDestinationPulse({
      ...catalogDestination,
      communityPulseComponents: {
        ...catalogDestination.communityPulseComponents,
        activeContributors: PULSE_THRESHOLD_CONTRIBUTORS,
        aggregateCheckins: 25,
      },
    });
    expect(pulse?.dataBasis).toBe('outing_activity');
    expect(pulse?.evidence).toBeUndefined();
  });
});

const PULSE_THRESHOLD_CONTRIBUTORS = 3;
