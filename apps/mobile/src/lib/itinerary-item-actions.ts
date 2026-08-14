import {
  itineraryItemId,
  type ItineraryItem,
  type TripPlan,
  type TripPlanItemEditAction,
  type TripPlanPreviewProposal,
} from '@gayi/domain';
import type { NearbyPlaceResult } from './googlePlaces';

export type ItinerarySearchContext = {
  center: { lat: number; lng: number };
  label: string;
  previous?: ItineraryItem;
  next?: ItineraryItem;
};

export type ItineraryPlaceRecommendation = {
  place: NearbyPlaceResult;
  score: number;
  fromPreviousMinutes?: number;
  toNextMinutes?: number;
  detourMinutes?: number;
  openAtSlot?: boolean;
  fitReasons: string[];
};

export type ItineraryRecommendationPreferences = {
  startDate?: string;
  mealPreferences?: string[];
  avoidances?: string[];
  preferredTransportMode?: 'auto' | 'walking' | 'transit' | 'driving';
};

/** Legacy itinerary rows did not always persist itemId. Keep old links usable. */
export function legacyItineraryItemRouteId(item: ItineraryItem): string {
  return `${item.day}-${item.placeId}-${item.time}`;
}

export function resolveItineraryItem(
  items: ItineraryItem[],
  routeId: string | undefined,
): ItineraryItem | undefined {
  if (!routeId) return undefined;
  const decodedRouteId = decodeURIComponent(routeId);
  return items.find((item) =>
    item.itemId === decodedRouteId ||
    itineraryItemId(item) === decodedRouteId ||
    legacyItineraryItemRouteId(item) === decodedRouteId,
  );
}

export function itineraryItemRouteId(item: ItineraryItem): string {
  return itineraryItemId(item);
}

function matchesItineraryItemId(item: ItineraryItem, value: string): boolean {
  return item.itemId === value || itineraryItemId(item) === value || legacyItineraryItemRouteId(item) === value;
}

function isSpecificStop(item: ItineraryItem): boolean {
  return item.kind !== 'meal' && item.kind !== 'downtime' &&
    Number.isFinite(item.coords?.lat) && Number.isFinite(item.coords?.lng);
}

function distanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const radius = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.asin(Math.sqrt(haversine));
}

function estimatedTravelMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: ItineraryRecommendationPreferences['preferredTransportMode'],
): number {
  const metersPerMinute = mode === 'walking' ? 75 : mode === 'driving' ? 500 : mode === 'transit' ? 250 : 180;
  return Math.max(2, Math.round(distanceMeters(from, to) / metersPerMinute));
}

function minutesFromClock(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function tripDayOfWeek(startDate: string | undefined, day: number): number | undefined {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return undefined;
  const date = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.getUTCDay();
}

export function isPlaceOpenAtItineraryTime(
  place: Pick<NearbyPlaceResult, 'openingHours'>,
  startDate: string | undefined,
  day: number,
  time: string,
  durationMinutes = 1,
): boolean | undefined {
  const dayOfWeek = tripDayOfWeek(startDate, day);
  const minute = minutesFromClock(time);
  if (dayOfWeek === undefined || minute === undefined || !place.openingHours?.length) return undefined;
  const periods = place.openingHours.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const period = value as { dayOfWeek?: unknown; open?: unknown; close?: unknown };
    if (typeof period.dayOfWeek !== 'number' || typeof period.open !== 'string' || typeof period.close !== 'string') return [];
    const opens = minutesFromClock(period.open);
    const closes = minutesFromClock(period.close);
    return opens === undefined || closes === undefined ? [] : [{ dayOfWeek: period.dayOfWeek, opens, closes }];
  });
  if (!periods.length) return undefined;
  const visitStarts = dayOfWeek * 1_440 + minute;
  const visitEnds = visitStarts + Math.max(1, durationMinutes);
  return periods.some((period) => {
    const periodStarts = period.dayOfWeek * 1_440 + period.opens;
    const periodEnds = period.opens === period.closes
      ? periodStarts + 1_440
      : period.dayOfWeek * 1_440 + period.closes + (period.closes < period.opens ? 1_440 : 0);
    return [-10_080, 0, 10_080].some((weekOffset) =>
      visitStarts >= periodStarts + weekOffset && visitEnds <= periodEnds + weekOffset,
    );
  });
}

export function rankItineraryPlaceRecommendations(
  places: NearbyPlaceResult[],
  target: ItineraryItem,
  context: ItinerarySearchContext,
  preferences: ItineraryRecommendationPreferences = {},
): ItineraryPlaceRecommendation[] {
  const mealPreferences = new Set(preferences.mealPreferences ?? []);
  const avoidances = new Set(preferences.avoidances ?? []);
  const directMinutes = context.previous && context.next
    ? estimatedTravelMinutes(context.previous.coords, context.next.coords, preferences.preferredTransportMode)
    : 0;

  return places.flatMap((place) => {
    if (/closed_(?:permanently|temporarily)/i.test(place.businessStatus ?? '')) return [];
    const openAtSlot = isPlaceOpenAtItineraryTime(
      place,
      preferences.startDate,
      target.day,
      target.time,
      target.duration,
    );
    if (openAtSlot === false) return [];
    const coords = { lat: place.lat, lng: place.lng };
    const fromPreviousMinutes = context.previous
      ? estimatedTravelMinutes(context.previous.coords, coords, preferences.preferredTransportMode)
      : undefined;
    const toNextMinutes = context.next
      ? estimatedTravelMinutes(coords, context.next.coords, preferences.preferredTransportMode)
      : undefined;
    const routeMinutes = (fromPreviousMinutes ?? 0) + (toNextMinutes ?? 0);
    const detourMinutes = context.previous && context.next
      ? Math.max(0, routeMinutes - directMinutes)
      : routeMinutes;
    const price = priceNumberForRanking(place.priceLevel);
    let score = 30 + (place.rating ?? 3.8) * 8 + Math.min(12, Math.log10(Math.max(1, place.userRatingsTotal ?? 1)) * 4);
    score -= Math.min(30, detourMinutes * 0.7);
    if (openAtSlot) score += 8;
    if (mealPreferences.has('casual_gems') && price !== undefined && price <= 2) score += 7;
    if (mealPreferences.has('fine_dining') && price !== undefined && price >= 3) score += 7;
    if (mealPreferences.has('markets_cafes') && place.category === 'cafe') score += 8;
    if (mealPreferences.has('dietary_friendly') && place.attributes?.servesVegetarianFood) score += 9;
    if (mealPreferences.has('food_low_priority')) score -= Math.min(10, detourMinutes * 0.5);
    if (avoidances.has('long_walks') && preferences.preferredTransportMode === 'walking' && routeMinutes > 20) score -= 16;
    if (avoidances.has('expensive_surprises') && price !== undefined && price >= 3) score -= 12;
    if (avoidances.has('too_many_reservations') && place.attributes?.reservable) score -= 2;

    const fitReasons = [
      openAtSlot ? `Open for this ${target.duration}-minute window` : undefined,
      detourMinutes <= 8 ? 'Fits naturally into this route' : detourMinutes <= 18 ? 'A manageable detour' : undefined,
      mealPreferences.has('casual_gems') && price !== undefined && price <= 2 ? 'Matches your casual-gems preference' : undefined,
      mealPreferences.has('fine_dining') && price !== undefined && price >= 3 ? 'Matches your destination-dining preference' : undefined,
      mealPreferences.has('markets_cafes') && place.category === 'cafe' ? 'Matches your markets-and-cafés preference' : undefined,
      mealPreferences.has('dietary_friendly') && place.attributes?.servesVegetarianFood ? 'Vegetarian-friendly options listed' : undefined,
      (place.rating ?? 0) >= 4.5 && (place.userRatingsTotal ?? 0) >= 100 ? 'Consistently well reviewed' : undefined,
    ].filter((reason): reason is string => Boolean(reason)).slice(0, 3);

    return [{
      place,
      score,
      ...(fromPreviousMinutes !== undefined ? { fromPreviousMinutes } : {}),
      ...(toNextMinutes !== undefined ? { toNextMinutes } : {}),
      detourMinutes,
      ...(openAtSlot !== undefined ? { openAtSlot } : {}),
      fitReasons: fitReasons.length ? fitReasons : ['Near this part of your itinerary'],
    }];
  }).sort((left, right) => right.score - left.score || (right.place.rating ?? 0) - (left.place.rating ?? 0));
}

function priceNumberForRanking(value?: string): number | undefined {
  if (!value) return undefined;
  if (/inexpensive|free|level_?1|^1$/i.test(value)) return 1;
  if (/moderate|level_?2|^2$/i.test(value)) return 2;
  if (/very_expensive|level_?4|^4$/i.test(value)) return 4;
  if (/expensive|level_?3|^3$/i.test(value)) return 3;
  return undefined;
}

export function shiftItineraryClock(value: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const total = ((Number(match[1]) * 60 + Number(match[2]) + minutes) % 1_440 + 1_440) % 1_440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function scheduledItineraryTimestamps(
  startDate: string | undefined,
  day: number,
  time: string,
  durationMinutes: number,
): Pick<ItineraryItem, 'startsAt' | 'endsAt'> {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{2}:\d{2}$/.test(time)) return {};
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours! > 23 || minutes! > 59) return {};
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return {};
  start.setUTCDate(start.getUTCDate() + Math.max(0, day - 1));
  start.setUTCHours(hours!, minutes!, 0, 0);
  const end = new Date(start.getTime() + Math.max(1, durationMinutes) * 60_000);
  return { startsAt: start.toISOString().slice(0, 19), endsAt: end.toISOString().slice(0, 19) };
}

export function itinerarySearchContext(items: ItineraryItem[], target: ItineraryItem): ItinerarySearchContext {
  const dayItems = items
    .filter((item) => item.day === target.day)
    .sort((left, right) => left.time.localeCompare(right.time));
  const targetId = itineraryItemId(target);
  const index = dayItems.findIndex((item) => itineraryItemId(item) === targetId);
  const previous = dayItems.slice(0, Math.max(0, index)).reverse().find(isSpecificStop);
  const next = dayItems.slice(Math.max(0, index + 1)).find(isSpecificStop);
  if (previous && next) {
    return {
      center: { lat: (previous.coords.lat + next.coords.lat) / 2, lng: (previous.coords.lng + next.coords.lng) / 2 },
      label: `Between ${previous.title} and ${next.title}`,
      previous,
      next,
    };
  }
  const neighbor = previous ?? next;
  if (neighbor) {
    return {
      center: neighbor.coords,
      label: `${previous ? 'After' : 'Before'} ${neighbor.title}`,
      ...(previous ? { previous } : {}),
      ...(next ? { next } : {}),
    };
  }
  return {
    center: target.coords,
    label: 'Near the rest of your day',
  };
}

export function updateTripPlanItem(
  plan: TripPlan,
  itemId: string,
  updates: Partial<ItineraryItem>,
  generatedAt = new Date().toISOString(),
): TripPlan {
  return {
    ...plan,
    revision: plan.revision + 1,
    generatedAt,
    items: plan.items.map((item) => matchesItineraryItemId(item, itemId)
      ? { ...item, ...updates, itemId: itineraryItemId(item) }
      : item),
  };
}

export function itineraryTimingConflicts(
  plan: TripPlan,
  itemId: string,
  time: string,
  durationMinutes: number,
): ItineraryItem[] {
  const target = plan.items.find((item) => matchesItineraryItemId(item, itemId));
  const start = minutesFromClock(time);
  if (!target || start === undefined) return [];
  const end = start + Math.max(1, durationMinutes);
  return plan.items.filter((item) => {
    if (item.day !== target.day || matchesItineraryItemId(item, itemId)) return false;
    const otherStart = minutesFromClock(item.time);
    if (otherStart === undefined) return false;
    const otherEnd = otherStart + Math.max(1, item.duration);
    return start < otherEnd && end > otherStart;
  });
}

/** Clear a choice without collapsing the day's time structure. */
export function clearTripPlanItemToOpenSlot(
  plan: TripPlan,
  itemId: string,
  generatedAt = new Date().toISOString(),
): TripPlan {
  const target = plan.items.find((item) => matchesItineraryItemId(item, itemId));
  if (!target) return plan;
  const role = target.slotRole ?? (target.kind === 'meal' ? 'meal' : 'free_time');
  const title = role === 'meal' ? 'Open meal time' : 'Open free time';
  return updateTripPlanItem(plan, itemId, {
    title,
    summary: role === 'meal'
      ? 'Choose a meal that fits this part of the day.'
      : 'Keep this breathing room or add another idea.',
    category: role === 'meal' ? 'restaurant' : 'other',
    placeId: `${role === 'meal' ? 'meal' : 'free'}-${target.day}-${target.time}`,
    estimatedCost: 0,
    bookingRequired: false,
    source: 'schedule',
    confidence: 1,
    whySelected: role === 'meal'
      ? 'Meal time held open until you choose a place'
      : 'Intentional breathing room between plans',
    kind: role === 'meal' ? 'meal' : 'downtime',
    slotRole: role,
    locked: false,
    scheduleStatus: 'estimated',
    bookingOffer: undefined,
  }, generatedAt);
}

export function createItineraryItemEditProposal(
  priorPlan: TripPlan,
  preview: TripPlan,
  day: number,
  action: TripPlanItemEditAction,
  summary: string,
  tripId?: string,
  now = Date.now(),
): TripPlanPreviewProposal {
  return {
    proposalId: `item-edit-${priorPlan.planId}-${day}-${action}-${now}`,
    ...(tripId ? { tripId } : {}),
    proposalKind: 'item_edit',
    action,
    day,
    priorPlanId: priorPlan.planId,
    priorRevision: priorPlan.revision,
    preview,
    summary,
    createdAt: new Date(now).toISOString(),
    status: 'polling',
  };
}

export function insertTripPlanItemAfter(
  plan: TripPlan,
  afterItemId: string,
  item: ItineraryItem,
  generatedAt = new Date().toISOString(),
): TripPlan {
  const index = plan.items.findIndex((candidate) => matchesItineraryItemId(candidate, afterItemId));
  const resolvedAfterId = index >= 0 ? itineraryItemId(plan.items[index]!) : afterItemId;
  const items = [...plan.items];
  items.splice(index < 0 ? items.length : index + 1, 0, item);
  return {
    ...plan,
    revision: plan.revision + 1,
    generatedAt,
    items,
    days: plan.days.map((day) => {
      if (day.day !== item.day || !item.itemId) return day;
      const afterIndex = Math.max(day.itemIds.indexOf(afterItemId), day.itemIds.indexOf(resolvedAfterId));
      const itemIds = [...day.itemIds];
      itemIds.splice(afterIndex < 0 ? itemIds.length : afterIndex + 1, 0, item.itemId);
      return { ...day, itemIds };
    }),
  };
}

export function removeTripPlanItem(
  plan: TripPlan,
  itemId: string,
  generatedAt = new Date().toISOString(),
): TripPlan {
  const target = plan.items.find((item) => matchesItineraryItemId(item, itemId));
  const targetIds = new Set([
    itemId,
    ...(target ? [itineraryItemId(target), legacyItineraryItemRouteId(target)] : []),
    ...(target?.itemId ? [target.itemId] : []),
  ]);
  return {
    ...plan,
    revision: plan.revision + 1,
    generatedAt,
    items: plan.items.filter((item) => !matchesItineraryItemId(item, itemId)),
    days: plan.days.map((day) => ({
      ...day,
      itemIds: day.itemIds.filter((id) => !targetIds.has(id)),
      sharedAnchorItemIds: day.sharedAnchorItemIds.filter((id) => !targetIds.has(id)),
      freeWindowSuggestions: day.freeWindowSuggestions.filter((suggestion) => !targetIds.has(suggestion.windowItemId)),
    })),
  };
}
