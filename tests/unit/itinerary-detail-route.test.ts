import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync(new URL('../../apps/mobile/app/trips/[tripId]/itinerary/[itemId].tsx', import.meta.url), 'utf8');
const timeline = readFileSync(new URL('../../apps/mobile/app/trips/[tripId]/index.tsx', import.meta.url), 'utf8');

describe('itinerary place detail experience', () => {
  it('routes every itinerary card into the contextual detail screen', () => {
    expect(timeline).toContain("pathname: '/trips/[tripId]/itinerary/[itemId]'");
    expect(timeline).toContain('itemId: itineraryItemRouteId(item)');
    expect(route).toContain('resolveItineraryItem(plan.items, itemId)');
    expect(route).toContain('Change time');
    expect(route).toContain('Change place');
    expect(route).toContain('Add your own');
  });

  it('supports context-aware meal and free-window discovery', () => {
    expect(route).toContain('Find the right table');
    expect(route).toContain('Use this free window');
    expect(route).toContain('searchPlacesNearContext');
    expect(route).toContain('Any cuisine');
    expect(route).toContain('Any price');
    expect(route).toContain('rankItineraryPlaceRecommendations');
    expect(route).toContain('How it fits the day');
    expect(route).toContain('Add at {slotTime}');
    expect(route).toContain('createItineraryItemEditProposal');
    expect(route).toContain('Ask Outing to narrow it down');
  });

  it('applies a reviewed place through the durable plan path', () => {
    expect(route).toContain('tripPlanChangeRequiresVote');
    expect(route).toContain('lookupPlaceById');
    expect(route).toContain('isPlaceOpenAtItineraryTime');
    expect(route).toContain('itineraryItems: nextPlan.items');
    expect(route).toContain('router.back()');
  });

  it('keeps the trip itinerary focused on the day-by-day timeline', () => {
    expect(timeline).toContain('Tap any time to shape that part of the day.');
    expect(timeline).toContain('Choose a restaurant');
    expect(timeline).toContain('Add something here');
    expect(timeline).not.toContain('Your group-first trip plan');
    expect(timeline).not.toContain('Blended group preferences');
    expect(timeline).not.toContain('View details and shape this stop');
  });
});
