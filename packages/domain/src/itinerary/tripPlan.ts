import type {
  ActivityPreferenceVote,
  Interest,
  MemberPreferenceSnapshot,
  Place,
  TravelPreferences,
} from '@gayi/shared';
import type {
  BudgetResult,
  FlightPriceGuidance,
  FreeWindowSuggestion,
  ItineraryItem,
  TripPlan,
  TripPlanBookingAction,
  TripPlanDay,
  TripPlanFeedback,
} from '../types';
import {
  generateItinerary,
  type ItineraryInput,
} from './engine';

const ALGORITHM_VERSION = 'trip-plan-v1';
const MIN_PRICE_OBSERVATIONS = 5;

export interface PlannerTraveler {
  memberId: string;
  displayName?: string;
  preferences: Pick<
    TravelPreferences,
    'interests' | 'lookingFor' | 'nightlifeImportance' | 'activityPace'
  >;
}

export interface TripPlanFlightPriceContext {
  currentPrice?: number;
  baselinePrice?: number;
  currency?: string;
  savingsPercent?: number;
  observationCount?: number;
  observedAt?: string;
}

export interface TripPlanInput extends ItineraryInput {
  owner?: PlannerTraveler;
  members?: MemberPreferenceSnapshot[];
  budget?: BudgetResult;
  feedback?: TripPlanFeedback[];
  priorPlan?: TripPlan;
  /** Only these days are regenerated; all other prior-plan days remain unchanged. */
  regenerateDays?: number[];
  flightPriceContext?: TripPlanFlightPriceContext;
}

export interface ActivityPreferenceSignals {
  excludedPlaceIds: string[];
  scoreAdjustments: Record<string, number>;
  tallies: Record<string, { interested: number; notInterested: number }>;
}

/**
 * Turn solo or group activity choices into deterministic planner inputs.
 * Positive interest strongly affects ordering. A rejection becomes a hard
 * exclusion only when it represents a solo traveler or a known group majority.
 */
export function buildActivityPreferenceSignals(
  votes: ActivityPreferenceVote[],
  eligibleMemberCount = 1,
): ActivityPreferenceSignals {
  const tallies: ActivityPreferenceSignals['tallies'] = {};
  const latestByMemberAndPlace = new Map<string, ActivityPreferenceVote>();
  for (const vote of votes) {
    const key = `${vote.placeId}:${vote.memberId}`;
    const existing = latestByMemberAndPlace.get(key);
    if (!existing || existing.createdAt <= vote.createdAt) latestByMemberAndPlace.set(key, vote);
  }
  for (const vote of latestByMemberAndPlace.values()) {
    const tally = tallies[vote.placeId] ?? { interested: 0, notInterested: 0 };
    if (vote.choice === 'interested') tally.interested += 1;
    else tally.notInterested += 1;
    tallies[vote.placeId] = tally;
  }

  const excludedPlaceIds: string[] = [];
  const scoreAdjustments: Record<string, number> = {};
  const majority = Math.floor(Math.max(1, eligibleMemberCount) / 2) + 1;
  for (const [placeId, tally] of Object.entries(tallies)) {
    scoreAdjustments[placeId] = Math.max(-45, Math.min(80, tally.interested * 32 - tally.notInterested * 20));
    const soloRejected = eligibleMemberCount <= 1 && tally.notInterested > 0 && tally.interested === 0;
    const groupRejected = tally.notInterested >= majority && tally.notInterested > tally.interested;
    if (soloRejected || groupRejected) excludedPlaceIds.push(placeId);
  }
  return { excludedPlaceIds, scoreAdjustments, tallies };
}

function minutesFromClock(value: string): number {
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  return Math.max(0, Math.min(24 * 60 - 1, hour * 60 + minute));
}

function clockFromMinutes(value: number): string {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, Math.round(value)));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function dateForDay(startDate: string | undefined, day: number): string | undefined {
  if (!startDate) return undefined;
  const date = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

function stableToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stableItemId(item: ItineraryItem): string {
  return item.itemId ?? `item-${item.day}-${stableToken(item.placeId)}-${item.time.replace(':', '')}`;
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function fallbackTravelMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const latKm = (to.lat - from.lat) * 111;
  const lngKm = (to.lng - from.lng) * 111 * Math.cos((from.lat * Math.PI) / 180);
  const km = Math.sqrt(latKm * latKm + lngKm * lngKm);
  return Math.max(5, Math.round((km / 4.8) * 60));
}

function feedbackSignals(
  places: Place[],
  feedback: TripPlanFeedback[],
): { excludedPlaceIds: string[]; scoreAdjustments: Record<string, number> } {
  const byId = new Map(places.map((place) => [place.placeId, place]));
  const excluded = new Set<string>();
  const adjustments: Record<string, number> = {};

  for (const entry of feedback) {
    if (entry.reaction === 'veto') {
      excluded.add(entry.placeId);
      continue;
    }

    adjustments[entry.placeId] =
      (adjustments[entry.placeId] ?? 0) + (entry.reaction === 'like' ? 14 : -20);
    const reactedPlace = byId.get(entry.placeId);
    if (!reactedPlace) continue;

    for (const candidate of places) {
      const sharedInterests = candidate.interests.filter((interest) =>
        reactedPlace.interests.includes(interest),
      ).length;
      if (sharedInterests === 0) continue;
      const delta = entry.reaction === 'like' ? sharedInterests * 3 : sharedInterests * -4;
      adjustments[candidate.placeId] = (adjustments[candidate.placeId] ?? 0) + delta;
    }
  }

  return {
    excludedPlaceIds: [...excluded],
    scoreAdjustments: adjustments,
  };
}

function canonicalizeItems(items: ItineraryItem[]): ItineraryItem[] {
  return items.map((item) => {
    const itemId = stableItemId(item);
    const windowEndTime =
      item.kind === 'downtime'
        ? clockFromMinutes(minutesFromClock(item.time) + item.duration)
        : undefined;
    return {
      ...item,
      itemId,
      attendance: 'group',
      timeFlexibility:
        item.kind === 'downtime' || item.placeId.startsWith('meal-') ? 'window' : item.timeFlexibility ?? 'fixed',
      ...(windowEndTime !== undefined && { windowEndTime }),
    };
  });
}

function chooseAnchorIds(items: ItineraryItem[]): string[] {
  return items
    .filter(
      (item) =>
        item.kind !== 'downtime' &&
        item.kind !== 'meal' &&
        !item.placeId.startsWith('meal-'),
    )
    .sort((a, b) => {
      const aPriority = (a.bookingRequired ? 3 : 0) + (a.kind === 'experience' ? 2 : 0);
      const bPriority = (b.bookingRequired ? 3 : 0) + (b.kind === 'experience' ? 2 : 0);
      return bPriority - aPriority || b.confidence - a.confidence || a.time.localeCompare(b.time);
    })
    .slice(0, 2)
    .flatMap((item) => (item.itemId ? [item.itemId] : []));
}

function themeForDay(items: ItineraryItem[], day: number, durationDays: number): string {
  const categories = new Set(items.map((item) => item.category));
  if (day === 1 && items.length <= 3) return 'Arrive & ease in';
  if (day === durationDays && items.length <= 3) return 'A flexible final day';
  if (categories.has('beach') || categories.has('park')) return 'Outdoors & open air';
  if (categories.has('museum') || categories.has('landmark')) return 'Culture & local icons';
  if (categories.has('tour')) return 'A signature experience';
  if (categories.has('bar') || categories.has('club')) return 'Neighborhoods & nightlife';
  if (categories.has('restaurant') || categories.has('cafe')) return 'Food & neighborhood flavor';
  return 'Explore at your pace';
}

function utilityForTraveler(place: Place, traveler: PlannerTraveler): number {
  const interestHits = place.interests.filter((interest) =>
    traveler.preferences.interests.includes(interest),
  ).length;
  let utility = interestHits * 18;
  if (
    place.lgbtqRelevance &&
    (traveler.preferences.lookingFor.includes('community') ||
      traveler.preferences.lookingFor.includes('dancing'))
  ) {
    utility += 12;
  }
  if (
    (place.category === 'bar' || place.category === 'club') &&
    traveler.preferences.nightlifeImportance >= 0.65
  ) {
    utility += 8;
  }
  if (
    (place.category === 'spa' || place.category === 'park' || place.category === 'beach') &&
    traveler.preferences.lookingFor.includes('relaxation')
  ) {
    utility += 8;
  }
  return utility;
}

function plannerTravelers(input: TripPlanInput): PlannerTraveler[] {
  const owner: PlannerTraveler = input.owner ?? {
    memberId: 'trip-owner',
    displayName: 'Trip organizer',
    preferences: {
      interests: input.preferences.interests,
      lookingFor: input.preferences.lookingFor,
      nightlifeImportance: input.preferences.nightlifeImportance,
      activityPace: input.preferences.activityPace ?? 'balanced',
    },
  };
  return [
    owner,
    ...(input.members ?? []).map((member) => ({
      memberId: member.memberId,
      ...(member.displayName !== undefined && { displayName: member.displayName }),
      preferences: {
        interests: member.interests ?? [],
        lookingFor: member.lookingFor ?? [],
        nightlifeImportance: member.nightlifeImportance ?? 0.5,
        activityPace: member.activityPace ?? 'balanced',
      },
    })),
  ];
}

function suggestionStart(
  place: Place,
  earliest: number,
  latestReturn: number,
  outbound: number,
  inbound: number,
): { start: number; duration: number } | null {
  const duration = Math.min(place.durationMinutes, 120);
  const earliestActivity = earliest + outbound;
  let start = earliestActivity;
  if (place.fixedStartTimes?.length) {
    const fixed = place.fixedStartTimes
      .map(minutesFromClock)
      .filter((time) => time >= earliestActivity)
      .sort((a, b) => a - b)[0];
    if (fixed === undefined) return null;
    start = fixed;
  }
  return start + duration + inbound <= latestReturn ? { start, duration } : null;
}

function buildFreeWindowSuggestions(
  input: TripPlanInput,
  items: ItineraryItem[],
  excludedPlaceIds: Set<string>,
): FreeWindowSuggestion[] {
  const used = new Set(items.map((item) => item.placeId));
  const suggested = new Set<string>();
  const travelers = plannerTravelers(input);
  const groupSize = Math.max(input.preferences.groupSize, travelers.length);
  const results: FreeWindowSuggestion[] = [];

  for (const windowItem of items.filter((item) => item.kind === 'downtime')) {
    if (!windowItem.itemId) continue;
    const start = minutesFromClock(windowItem.time);
    const end = start + windowItem.duration;
    const dayItems = items
      .filter((item) => item.day === windowItem.day)
      .sort((a, b) => a.time.localeCompare(b.time));
    const windowIndex = dayItems.findIndex((item) => item.itemId === windowItem.itemId);
    const previous = windowIndex > 0 ? dayItems[windowIndex - 1] : undefined;
    const next = windowIndex >= 0 ? dayItems[windowIndex + 1] : undefined;
    const fromCoords = previous?.coords ?? input.lodging?.coords ?? windowItem.coords;
    const returnCoords = next?.coords ?? input.lodging?.coords ?? windowItem.coords;

    const ranked = input.places
      .filter(
        (place) =>
          !used.has(place.placeId) &&
          !suggested.has(place.placeId) &&
          !excludedPlaceIds.has(place.placeId) &&
          place.businessStatus !== 'closed_permanently' &&
          place.businessStatus !== 'closed_temporarily',
      )
      .flatMap((place) => {
        const eligible = travelers
          .map((traveler) => ({ traveler, utility: utilityForTraveler(place, traveler) }))
          .filter((entry) => entry.utility >= 18);
        if (eligible.length === 0) return [];
        if (groupSize > 1 && eligible.length >= groupSize) return [];

        const outbound = fallbackTravelMinutes(fromCoords, place.coords);
        const inbound = fallbackTravelMinutes(place.coords, returnCoords);
        const schedule = suggestionStart(place, start, end, outbound, inbound);
        if (!schedule) return [];
        const score =
          eligible.reduce((sum, entry) => sum + entry.utility, 0) / eligible.length -
          (outbound + inbound) * 0.25 +
          (place.rating ?? 0);
        return [{ place, eligible, outbound, inbound, schedule, score }];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    for (const candidate of ranked) {
      suggested.add(candidate.place.placeId);
      const people = candidate.eligible.map(({ traveler }) => ({
        memberId: traveler.memberId,
        ...(traveler.displayName !== undefined && { displayName: traveler.displayName }),
      }));
      const topInterest = candidate.place.interests.find((interest) =>
        candidate.eligible.some(({ traveler }) =>
          traveler.preferences.interests.includes(interest),
        ),
      );
      const names = people.map((person) => person.displayName).filter(Boolean).join(', ');
      results.push({
        suggestionId: `suggestion-${windowItem.day}-${stableToken(candidate.place.placeId)}`,
        day: windowItem.day,
        windowItemId: windowItem.itemId,
        title: candidate.place.name,
        placeId: candidate.place.placeId,
        category: candidate.place.category,
        attendance: people.length === 1 ? 'solo' : 'subgroup',
        suggestedFor: people,
        acceptedByMemberIds: [],
        suggestedStartTime: clockFromMinutes(candidate.schedule.start),
        returnBy: clockFromMinutes(end),
        durationMinutes: candidate.schedule.duration,
        outboundTravelMinutes: candidate.outbound,
        returnTravelMinutes: candidate.inbound,
        estimatedCost: candidate.place.estimatedCostPerPerson,
        source: candidate.place.source,
        whySuggested: names
          ? `${names} may enjoy this${topInterest ? ` for ${topInterest.replace(/_/g, ' ')}` : ''}; everyone reunites before the next group anchor.`
          : `An optional idea for this free window${topInterest ? ` matching ${topInterest.replace(/_/g, ' ')}` : ''}.`,
        ...(candidate.place.bookingOffer !== undefined && {
          bookingOffer: candidate.place.bookingOffer,
        }),
      });
    }
  }

  return results;
}

function googleFlightsTrackingUrl(
  origin: string,
  destination: string,
  departDate: string | undefined,
  returnDate: string | undefined,
): string {
  const parts = [`Flights from ${origin} to ${destination}`];
  if (departDate) parts.push(`on ${departDate}`);
  if (returnDate) parts.push(`returning ${returnDate}`);
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(parts.join(' '))}`;
}

function buildFlightPriceGuidance(input: TripPlanInput): FlightPriceGuidance | undefined {
  const origin = input.preferences.departureAirports[0];
  const destination = input.destination.nearestAirportCodes[0];
  if (!origin || !destination) return undefined;
  const trackingUrl = googleFlightsTrackingUrl(
    origin,
    destination,
    input.startDate,
    input.startDate
      ? dateForDay(input.startDate, input.tripDurationDays)
      : undefined,
  );
  const context = input.flightPriceContext;
  const observationCount = context?.observationCount ?? 0;
  if (
    context?.currentPrice !== undefined &&
    context.baselinePrice !== undefined &&
    observationCount >= MIN_PRICE_OBSERVATIONS &&
    context.currentPrice < context.baselinePrice
  ) {
    return {
      status: 'below_recent_observations',
      currentPrice: context.currentPrice,
      baselinePrice: context.baselinePrice,
      ...(context.currency !== undefined && { currency: context.currency }),
      ...(context.savingsPercent !== undefined && { savingsPercent: context.savingsPercent }),
      observationCount,
      ...(context.observedAt !== undefined && { observedAt: context.observedAt }),
      message: 'This indicative fare is below recent comparable observations. Prices can still change.',
      trackingUrl,
      confidence: Math.min(0.8, 0.45 + observationCount * 0.03),
    };
  }
  if (context?.currentPrice !== undefined && observationCount >= MIN_PRICE_OBSERVATIONS) {
    return {
      status: 'indicative',
      currentPrice: context.currentPrice,
      ...(context.baselinePrice !== undefined && { baselinePrice: context.baselinePrice }),
      ...(context.currency !== undefined && { currency: context.currency }),
      ...(context.savingsPercent !== undefined && { savingsPercent: context.savingsPercent }),
      observationCount,
      ...(context.observedAt !== undefined && { observedAt: context.observedAt }),
      message: 'This is an indicative recently observed fare, not a live bookable quote.',
      trackingUrl,
      confidence: 0.55,
    };
  }
  return {
    status: 'insufficient_history',
    ...(context?.currentPrice !== undefined && { currentPrice: context.currentPrice }),
    ...(context?.currency !== undefined && { currency: context.currency }),
    observationCount,
    ...(context?.observedAt !== undefined && { observedAt: context.observedAt }),
    message: 'There is not enough comparable history to recommend when to book. Track this route for changes.',
    trackingUrl,
    confidence: 0.25,
  };
}

function buildBookingTimeline(
  input: Pick<TripPlanInput, 'destination' | 'preferences' | 'startDate' | 'tripDurationDays'>,
  items: ItineraryItem[],
  priceGuidance?: FlightPriceGuidance,
): TripPlanBookingAction[] {
  const actions: TripPlanBookingAction[] = [];
  const origin = input.preferences.departureAirports[0];
  const airport = input.destination.nearestAirportCodes[0];
  if (origin && airport) {
    actions.push({
      actionId: 'booking-flight',
      category: 'flight',
      timing: 'watch',
      title: `Track flights from ${origin} to ${airport}`,
      reason: priceGuidance?.message ?? 'Compare price and convenience before committing.',
      provider: 'google_flights',
      ...(priceGuidance?.trackingUrl !== undefined && { url: priceGuidance.trackingUrl }),
      affiliate: false,
      status: 'open',
    });
  }
  if (input.preferences.lodgingStatus !== 'booked') {
    actions.push({
      actionId: 'booking-lodging',
      category: 'lodging',
      timing: 'book_soon',
      title: 'Choose a stay that supports the daily route',
      reason: 'A confirmed neighborhood and address improves routing and nearby suggestions.',
      affiliate: false,
      status: 'open',
    });
  }
  for (const item of items.filter((candidate) => candidate.bookingRequired)) {
    actions.push({
      actionId: `booking-${item.itemId ?? stableToken(item.placeId)}`,
      category: 'experience',
      timing: 'book_soon',
      title: `Reserve ${item.title}`,
      reason: item.anchor
        ? 'This is a shared anchor with limited or fixed availability.'
        : 'This activity may require advance booking.',
      ...(item.itemId !== undefined && { itemId: item.itemId }),
      ...(item.bookingOffer?.provider !== undefined && { provider: item.bookingOffer.provider }),
      ...(item.bookingOffer?.url !== undefined && { url: item.bookingOffer.url }),
      affiliate: item.bookingOffer?.affiliate ?? false,
      ...(item.bookingOffer?.disclosure !== undefined && {
        disclosure: item.bookingOffer.disclosure,
      }),
      status: 'open',
    });
  }
  return actions;
}

function buildDays(
  input: Pick<TripPlanInput, 'startDate' | 'tripDurationDays'>,
  items: ItineraryItem[],
  suggestions: FreeWindowSuggestion[],
): TripPlanDay[] {
  const days: TripPlanDay[] = [];
  for (let day = 1; day <= input.tripDurationDays; day += 1) {
    const dayItems = items.filter((item) => item.day === day);
    const anchorIds = chooseAnchorIds(dayItems);
    for (const item of dayItems) item.anchor = Boolean(item.itemId && anchorIds.includes(item.itemId));
    const title = themeForDay(dayItems, day, input.tripDurationDays);
    const anchorNames = dayItems.filter((item) => item.anchor).map((item) => item.title);
    days.push({
      day,
      ...(dateForDay(input.startDate, day) !== undefined && {
        date: dateForDay(input.startDate, day)!,
      }),
      title,
      summary:
        anchorNames.length > 0
          ? `Built around ${anchorNames.join(' and ')}, with flexible time between group plans.`
          : 'A lighter day with room to choose what feels right.',
      itemIds: dayItems.flatMap((item) => (item.itemId ? [item.itemId] : [])),
      sharedAnchorItemIds: anchorIds,
      freeWindowSuggestions: suggestions.filter((suggestion) => suggestion.day === day),
    });
  }
  return days;
}

export function generateTripPlan(input: TripPlanInput): TripPlan {
  const feedback = input.feedback ?? [];
  const signals = feedbackSignals(input.places, feedback);
  const regenerate = new Set(input.regenerateDays ?? []);
  const retainPriorDays = Boolean(input.priorPlan && regenerate.size > 0);
  const retainedItems = retainPriorDays
    ? input.priorPlan!.items.filter((item) => !regenerate.has(item.day))
    : [];
  const blockingItems = retainedItems.map((item) => ({ ...item, locked: true }));
  const generated = generateItinerary({
    ...input,
    excludedPlaceIds: [
      ...(input.excludedPlaceIds ?? []),
      ...signals.excludedPlaceIds,
    ],
    scoreAdjustments: {
      ...(input.scoreAdjustments ?? {}),
      ...signals.scoreAdjustments,
    },
    lockedItems: [...(input.lockedItems ?? []), ...blockingItems],
  });
  const selectedItems = retainPriorDays
    ? [
        ...retainedItems,
        ...generated.filter((item) => regenerate.has(item.day)),
      ]
    : generated;
  const items = canonicalizeItems(selectedItems).sort(
    (a, b) => a.day - b.day || a.time.localeCompare(b.time),
  );
  const suggestions = buildFreeWindowSuggestions(
    input,
    items,
    new Set(signals.excludedPlaceIds),
  );
  const days = buildDays(input, items, suggestions);
  const priceGuidance = buildFlightPriceGuidance(input);
  const bookingTimeline = buildBookingTimeline(input, items, priceGuidance);
  const inputHash = simpleHash(
    JSON.stringify({
      destination: input.destination.slug,
      startDate: input.startDate,
      days: input.tripDurationDays,
      preferences: input.preferences,
      places: input.places.map((place) => place.placeId).sort(),
      feedback: feedback.map(({ itemId, memberId, reaction }) => ({
        itemId,
        memberId,
        reaction,
      })),
    }),
  );
  const generatedAt = new Date().toISOString();
  const plan: TripPlan = {
    planId: `plan-${inputHash}-${generatedAt.slice(0, 10)}`,
    revision: (input.priorPlan?.revision ?? 0) + 1,
    schemaVersion: 1,
    algorithmVersion: ALGORITHM_VERSION,
    generatedAt,
    inputHash,
    destinationName: input.destination.name,
    durationDays: input.tripDurationDays,
    summary: `${input.tripDurationDays}-day ${input.preferences.activityPace ?? 'balanced'} plan with shared anchors, protected free time, and preference-aware options.`,
    items,
    days,
    bookingTimeline,
    feedback,
    sources: [...new Set(items.map((item) => item.source))].sort(),
    ...(priceGuidance !== undefined && { flightPriceGuidance: priceGuidance }),
    ...(input.budget !== undefined && { budget: input.budget }),
  };
  return plan;
}

export function refineTripPlan(
  input: Omit<TripPlanInput, 'priorPlan' | 'feedback' | 'regenerateDays'>,
  priorPlan: TripPlan,
  feedback: TripPlanFeedback[],
  regenerateDays: number[],
): TripPlan {
  return generateTripPlan({
    ...input,
    priorPlan,
    feedback,
    regenerateDays,
  });
}

export function replaceTripPlanItems(plan: TripPlan, items: ItineraryItem[]): TripPlan {
  const canonical = canonicalizeItems(items).sort(
    (a, b) => a.day - b.day || a.time.localeCompare(b.time),
  );
  const validIds = new Set(canonical.flatMap((item) => (item.itemId ? [item.itemId] : [])));
  const days = plan.days.map((day) => {
    const dayItems = canonical.filter((item) => item.day === day.day);
    const anchorIds = day.sharedAnchorItemIds.filter((id) => validIds.has(id));
    return {
      ...day,
      itemIds: dayItems.flatMap((item) => (item.itemId ? [item.itemId] : [])),
      sharedAnchorItemIds: anchorIds,
      freeWindowSuggestions: day.freeWindowSuggestions.filter((suggestion) =>
        validIds.has(suggestion.windowItemId),
      ),
    };
  });
  return {
    ...plan,
    revision: plan.revision + 1,
    generatedAt: new Date().toISOString(),
    items: canonical,
    days,
  };
}

export function createLegacyTripPlan(
  destinationName: string,
  legacyItems: ItineraryItem[],
  generatedAt = new Date().toISOString(),
): TripPlan {
  const items = canonicalizeItems(legacyItems);
  const durationDays = Math.max(1, ...items.map((item) => item.day));
  const days = buildDays({ tripDurationDays: durationDays }, items, []);
  return {
    planId: `legacy-${simpleHash(`${destinationName}:${generatedAt}`)}`,
    revision: 1,
    schemaVersion: 1,
    algorithmVersion: 'legacy-import-v1',
    generatedAt,
    inputHash: simpleHash(JSON.stringify(items.map((item) => item.placeId))),
    destinationName,
    durationDays,
    summary: 'Imported from the existing saved itinerary.',
    items,
    days,
    bookingTimeline: items
      .filter((item) => item.bookingRequired)
      .map((item) => ({
        actionId: `booking-${item.itemId ?? stableToken(item.placeId)}`,
        category: 'experience' as const,
        timing: 'book_soon' as const,
        title: `Reserve ${item.title}`,
        reason: 'This saved activity may require advance booking.',
        ...(item.itemId !== undefined && { itemId: item.itemId }),
        ...(item.bookingOffer?.provider !== undefined && {
          provider: item.bookingOffer.provider,
        }),
        ...(item.bookingOffer?.url !== undefined && { url: item.bookingOffer.url }),
        affiliate: item.bookingOffer?.affiliate ?? false,
        ...(item.bookingOffer?.disclosure !== undefined && {
          disclosure: item.bookingOffer.disclosure,
        }),
        status: 'open' as const,
      })),
    feedback: [],
    sources: [...new Set(items.map((item) => item.source))].sort(),
  };
}

export type { Interest };
