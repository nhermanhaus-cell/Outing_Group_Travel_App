import { describe, expect, it } from 'vitest';
import type { ItineraryItem, TripPlan } from '@gayi/domain';
import {
  clearTripPlanItemToOpenSlot,
  createItineraryItemEditProposal,
  insertTripPlanItemAfter,
  itinerarySearchContext,
  itineraryItemRouteId,
  itineraryTimingConflicts,
  isPlaceOpenAtItineraryTime,
  legacyItineraryItemRouteId,
  removeTripPlanItem,
  rankItineraryPlaceRecommendations,
  resolveItineraryItem,
  scheduledItineraryTimestamps,
  shiftItineraryClock,
  updateTripPlanItem,
} from '../../apps/mobile/src/lib/itinerary-item-actions';

const item = (itemId: string, time: string, title: string, lat: number, lng: number, kind: ItineraryItem['kind'] = 'place'): ItineraryItem => ({
  itemId, day: 1, time, title, category: 'landmark', placeId: itemId, duration: 60,
  estimatedCost: 0, bookingRequired: false, source: 'test', confidence: 1,
  coords: { lat, lng }, whySelected: 'Test', kind,
});

describe('itinerary item actions', () => {
  it('recovers legacy open slots through canonical and old route identifiers', () => {
    const legacy = { ...item('ignored', '12:00', 'Open meal time', 40, -74, 'meal'), itemId: undefined, placeId: 'meal-1-12:00' };
    expect(itineraryItemRouteId(legacy)).toBe('item-1-meal-1-12-00-1200');
    expect(resolveItineraryItem([legacy], itineraryItemRouteId(legacy))).toBe(legacy);
    expect(resolveItineraryItem([legacy], legacyItineraryItemRouteId(legacy))).toBe(legacy);
  });

  it('centers an open slot between the surrounding real stops', () => {
    const before = item('before', '10:00', 'Museum', 40, -74);
    const open = item('open', '12:00', 'Open meal time', 40, -74, 'meal');
    const after = item('after', '14:00', 'Gallery', 42, -72);
    expect(itinerarySearchContext([before, open, after], open)).toMatchObject({
      center: { lat: 41, lng: -73 },
      label: 'Between Museum and Gallery',
    });
  });

  it('filters restaurants closed during the meal and explains the route fit', () => {
    const before = item('before', '10:00', 'Museum', 40, -74);
    const open = item('open', '12:00', 'Open meal time', 40, -74, 'meal');
    const after = item('after', '14:00', 'Gallery', 40.02, -74);
    const context = itinerarySearchContext([before, open, after], open);
    const place = (placeId: string, openingHours: unknown[], priceLevel = 'PRICE_LEVEL_MODERATE') => ({
      placeId, name: placeId, category: 'restaurant', lat: 40.01, lng: -74, imageUrls: [], source: 'google_places' as const,
      rating: 4.7, userRatingsTotal: 400, openingHours, priceLevel,
    });
    const openPlace = place('open-place', [{ dayOfWeek: 1, open: '11:00', close: '14:00' }]);
    const closedPlace = place('closed-place', [{ dayOfWeek: 1, open: '18:00', close: '23:00' }]);
    expect(isPlaceOpenAtItineraryTime(openPlace, '2026-08-17', 1, '12:00')).toBe(true);
    expect(isPlaceOpenAtItineraryTime(closedPlace, '2026-08-17', 1, '12:00')).toBe(false);
    const ranked = rankItineraryPlaceRecommendations([closedPlace, openPlace], open, context, {
      startDate: '2026-08-17', mealPreferences: ['casual_gems'], preferredTransportMode: 'walking',
    });
    expect(ranked.map((entry) => entry.place.placeId)).toEqual(['open-place']);
    expect(ranked[0]?.fitReasons).toContain('Open around 12:00');
  });

  it('shifts times safely across midnight', () => {
    expect(shiftItineraryClock('00:15', -30)).toBe('23:45');
    expect(shiftItineraryClock('23:45', 30)).toBe('00:15');
  });

  it('keeps exact itinerary timestamps aligned when timing changes', () => {
    expect(scheduledItineraryTimestamps('2026-09-10', 2, '14:30', 90)).toEqual({
      startsAt: '2026-09-11T14:30:00',
      endsAt: '2026-09-11T16:00:00',
    });
  });

  it('detects a timing overlap before moving a stop', () => {
    const first = item('first', '10:00', 'Museum', 40, -74);
    const second = item('second', '11:00', 'Lunch', 40, -74);
    const plan = {
      planId: 'plan', revision: 1, schemaVersion: 2, algorithmVersion: 'test', generatedAt: 'before',
      inputHash: 'hash', destinationName: 'New York', durationDays: 1, summary: '', items: [first, second],
      days: [], bookingTimeline: [], feedback: [], sources: [],
    } satisfies TripPlan;
    expect(itineraryTimingConflicts(plan, 'second', '10:30', 60).map((entry) => entry.itemId)).toEqual(['first']);
  });

  it('updates one item without changing its stable identity', () => {
    const original = item('target', '12:00', 'Open meal time', 40, -74, 'meal');
    const plan = {
      planId: 'plan', revision: 1, schemaVersion: 2, algorithmVersion: 'test', generatedAt: 'before',
      inputHash: 'hash', destinationName: 'New York', durationDays: 1, summary: '', items: [original],
      days: [], bookingTimeline: [], feedback: [], sources: [],
    } satisfies TripPlan;
    const next = updateTripPlanItem(plan, 'target', { title: 'Lunch', kind: 'place' }, 'after');
    expect(next.revision).toBe(2);
    expect(next.items[0]).toMatchObject({ itemId: 'target', title: 'Lunch', kind: 'place' });
  });

  it('can add a traveler idea after the selected itinerary stop', () => {
    const original = item('target', '12:00', 'Lunch', 40, -74);
    const plan = {
      planId: 'plan', revision: 1, schemaVersion: 2, algorithmVersion: 'test', generatedAt: 'before',
      inputHash: 'hash', destinationName: 'New York', durationDays: 1, summary: '', items: [original],
      days: [{ day: 1, title: 'Day', summary: '', itemIds: ['target'], sharedAnchorItemIds: [], freeWindowSuggestions: [] }],
      bookingTimeline: [], feedback: [], sources: [],
    } satisfies TripPlan;
    const next = insertTripPlanItemAfter(plan, 'target', item('custom', '13:30', 'My idea', 40, -74), 'after');
    expect(next.items.map((entry) => entry.itemId)).toEqual(['target', 'custom']);
    expect(next.days[0]?.itemIds).toEqual(['target', 'custom']);
  });

  it('removes a stop and its day references together', () => {
    const original = item('target', '12:00', 'Lunch', 40, -74);
    const plan = {
      planId: 'plan', revision: 1, schemaVersion: 2, algorithmVersion: 'test', generatedAt: 'before',
      inputHash: 'hash', destinationName: 'New York', durationDays: 1, summary: '', items: [original],
      days: [{ day: 1, title: 'Day', summary: '', itemIds: ['target'], sharedAnchorItemIds: ['target'], freeWindowSuggestions: [] }],
      bookingTimeline: [], feedback: [], sources: [],
    } satisfies TripPlan;
    const next = removeTripPlanItem(plan, 'target', 'after');
    expect(next.items).toEqual([]);
    expect(next.days[0]?.itemIds).toEqual([]);
    expect(next.days[0]?.sharedAnchorItemIds).toEqual([]);
  });

  it('restores a selected restaurant to an open meal without collapsing time', () => {
    const selected = { ...item('meal-slot', '12:00', 'Via Carota', 40, -74), slotRole: 'meal' as const };
    const plan = {
      planId: 'plan', revision: 1, schemaVersion: 2, algorithmVersion: 'test', generatedAt: 'before',
      inputHash: 'hash', destinationName: 'New York', durationDays: 1, summary: '', items: [selected],
      days: [{ day: 1, title: 'Day', summary: '', itemIds: ['meal-slot'], sharedAnchorItemIds: [], freeWindowSuggestions: [] }],
      bookingTimeline: [], feedback: [], sources: [],
    } satisfies TripPlan;
    const next = clearTripPlanItemToOpenSlot(plan, 'meal-slot', 'after');
    expect(next.items[0]).toMatchObject({ itemId: 'meal-slot', title: 'Open meal time', kind: 'meal', slotRole: 'meal' });
    expect(next.days[0]?.itemIds).toEqual(['meal-slot']);
  });

  it('creates a reviewable item-edit proposal for group voting', () => {
    const original = item('meal-slot', '12:00', 'Open meal time', 40, -74, 'meal');
    const prior = {
      planId: 'plan', revision: 1, schemaVersion: 2, algorithmVersion: 'test', generatedAt: 'before',
      inputHash: 'hash', destinationName: 'New York', durationDays: 1, summary: '', items: [original],
      days: [], bookingTimeline: [], feedback: [], sources: [],
    } satisfies TripPlan;
    const preview = updateTripPlanItem(prior, 'meal-slot', { title: 'Via Carota', kind: 'place', slotRole: 'meal' }, 'after');
    const proposal = createItineraryItemEditProposal(prior, preview, 1, 'fill_open_slot', 'Add Via Carota for lunch', undefined, 1_700_000_000_000);
    expect(proposal).toMatchObject({
      proposalKind: 'item_edit', action: 'fill_open_slot', status: 'polling', priorRevision: 1,
      summary: 'Add Via Carota for lunch',
    });
    expect(proposal.preview.items[0]?.title).toBe('Via Carota');
  });
});
