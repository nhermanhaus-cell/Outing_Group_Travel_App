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
  TripPlanDayReworkAction,
  TripPlanPreviewProposal,
} from '../types';
import {
  generateItinerary,
  type ItineraryInput,
} from './engine';

const ALGORITHM_VERSION_V1 = 'trip-plan-v1';
const ALGORITHM_VERSION_V2 = 'trip-plan-v2';
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
  planSchemaVersion?: 1 | 2;
  owner?: PlannerTraveler;
  members?: MemberPreferenceSnapshot[];
  budget?: BudgetResult;
  feedback?: TripPlanFeedback[];
  priorPlan?: TripPlan;
  /** Only these days are regenerated; all other prior-plan days remain unchanged. */
  regenerateDays?: number[];
  flightPriceContext?: TripPlanFlightPriceContext;
  anchorCandidatePlaceIds?: string[];
  minorityFavoriteMemberIdsByPlace?: Record<string, string[]>;
}

export interface ActivityPreferenceSignals {
  excludedPlaceIds: string[];
  scoreAdjustments: Record<string, number>;
  tallies: Record<string, {
    mustDo: number;
    interested: number;
    maybe: number;
    notForThisTrip: number;
    weightedScore: number;
  }>;
  anchorCandidatePlaceIds: string[];
  pollPlaceIds: string[];
  minorityFavoritePlaceIds: string[];
  minorityFavoriteMemberIdsByPlace: Record<string, string[]>;
}

const PREFERENCE_WEIGHTS = {
  must_do: 3,
  interested: 1,
  maybe: 0,
  not_for_this_trip: -1,
} as const;

export function normalizeActivityPreferenceChoice(
  choice: ActivityPreferenceVote['choice'],
): keyof typeof PREFERENCE_WEIGHTS {
  return choice === 'not_interested' ? 'not_for_this_trip' : choice;
}

export function isActivityPreferenceSessionComplete(
  votes: ActivityPreferenceVote[],
  candidateCount: number,
): boolean {
  const latest = new Map<string, ActivityPreferenceVote>();
  for (const vote of votes) {
    const current = latest.get(vote.placeId);
    if (!current || current.createdAt <= vote.createdAt) latest.set(vote.placeId, vote);
  }
  const categories = new Set([...latest.values()].map((vote) => vote.category));
  return latest.size >= candidateCount || (latest.size >= 10 && categories.size >= 4);
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
    const tally = tallies[vote.placeId] ?? {
      mustDo: 0,
      interested: 0,
      maybe: 0,
      notForThisTrip: 0,
      weightedScore: 0,
    };
    const choice = normalizeActivityPreferenceChoice(vote.choice);
    if (choice === 'must_do') tally.mustDo += 1;
    if (choice === 'interested') tally.interested += 1;
    if (choice === 'maybe') tally.maybe += 1;
    if (choice === 'not_for_this_trip') tally.notForThisTrip += 1;
    tally.weightedScore += PREFERENCE_WEIGHTS[choice];
    tallies[vote.placeId] = tally;
  }

  const excludedPlaceIds: string[] = [];
  const scoreAdjustments: Record<string, number> = {};
  const anchorCandidatePlaceIds: string[] = [];
  const pollPlaceIds: string[] = [];
  const minorityFavoritePlaceIds: string[] = [];
  const minorityFavoriteMemberIdsByPlace: Record<string, string[]> = {};
  const majority = Math.floor(Math.max(1, eligibleMemberCount) / 2) + 1;
  for (const [placeId, tally] of Object.entries(tallies)) {
    const positive = tally.mustDo + tally.interested;
    const negative = tally.notForThisTrip;
    scoreAdjustments[placeId] = Math.max(-45, Math.min(90, tally.weightedScore * 24));
    const soloRejected = eligibleMemberCount <= 1 && negative > 0 && positive === 0;
    const groupRejected = negative >= majority && negative > positive;
    if (soloRejected || groupRejected) excludedPlaceIds.push(placeId);
    if (positive >= majority && tally.weightedScore > 0) anchorCandidatePlaceIds.push(placeId);
    else if (positive === negative && positive > 0) pollPlaceIds.push(placeId);
    else if (tally.mustDo > 0 && positive < majority) {
      minorityFavoritePlaceIds.push(placeId);
      minorityFavoriteMemberIdsByPlace[placeId] = [...latestByMemberAndPlace.values()]
        .filter((vote) => vote.placeId === placeId && normalizeActivityPreferenceChoice(vote.choice) === 'must_do')
        .map((vote) => vote.memberId);
    }
  }
  return {
    excludedPlaceIds,
    scoreAdjustments,
    tallies,
    anchorCandidatePlaceIds,
    pollPlaceIds,
    minorityFavoritePlaceIds,
    minorityFavoriteMemberIdsByPlace,
  };
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

function chooseAnchorIds(items: ItineraryItem[], preferred = new Set<string>()): string[] {
  return items
    .filter(
      (item) =>
        item.kind !== 'downtime' &&
        item.kind !== 'meal' &&
        !item.placeId.startsWith('meal-'),
    )
    .sort((a, b) => {
      const preferredDelta = Number(preferred.has(b.placeId)) - Number(preferred.has(a.placeId));
      if (preferredDelta) return preferredDelta;
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
        const minorityMemberIds = new Set(input.minorityFavoriteMemberIdsByPlace?.[place.placeId] ?? []);
        const eligible = travelers
          .map((traveler) => ({ traveler, utility: utilityForTraveler(place, traveler) }))
          .filter((entry) => minorityMemberIds.has(entry.traveler.memberId) || entry.utility >= 18);
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
  input: Pick<TripPlanInput, 'startDate' | 'tripDurationDays' | 'anchorCandidatePlaceIds'>,
  items: ItineraryItem[],
  suggestions: FreeWindowSuggestion[],
  context?: Pick<TripPlanInput, 'places' | 'preferences'>,
): TripPlanDay[] {
  const days: TripPlanDay[] = [];
  const selectedPlaceIds = new Set(items.map((item) => item.placeId));
  for (let day = 1; day <= input.tripDurationDays; day += 1) {
    const dayItems = items.filter((item) => item.day === day);
    const anchorIds = chooseAnchorIds(dayItems, new Set(input.anchorCandidatePlaceIds ?? []));
    for (const item of dayItems) item.anchor = Boolean(item.itemId && anchorIds.includes(item.itemId));
    const title = themeForDay(dayItems, day, input.tripDurationDays);
    const anchorNames = dayItems.filter((item) => item.anchor).map((item) => item.title);
    const travelMinutes = dayItems.reduce(
      (total, item) => total + (item.travelFromPrevious?.durationMinutes ?? 0),
      0,
    );
    const reservationCount = dayItems.filter((item) => item.bookingRequired).length;
    const fitReasons = [...new Set(dayItems.map((item) => item.whySelected).filter(Boolean))].slice(0, 4);
    const tradeoffs = [
      ...(travelMinutes > 90 ? [`About ${travelMinutes} minutes of estimated travel.`] : []),
      ...(reservationCount >= 2 ? [`${reservationCount} activities may need reservations.`] : []),
      ...(dayItems.some((item) => item.scheduleStatus === 'fallback') ? ['Some timing is estimated until live hours are confirmed.'] : []),
    ].slice(0, 3);
    const dayCategories = new Set(dayItems.map((item) => item.category));
    const backups = context?.places
      .filter((place) => !selectedPlaceIds.has(place.placeId) && place.businessStatus !== 'closed_permanently')
      .map((place) => ({
        place,
        score: place.interests.filter((interest) => context.preferences.interests.includes(interest)).length * 10
          + (dayCategories.has(place.category) ? 8 : 0)
          - Math.min(10, place.estimatedCostPerPerson / 20),
      }))
      .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
      .slice(0, 2)
      .map(({ place }) => ({
        placeId: place.placeId,
        title: place.name,
        reason: place.fitReasons?.[0] ?? `A flexible ${place.category.replace(/_/g, ' ')} backup that still matches this day.`,
        source: place.source,
      })) ?? [];
    const freshnessValues = dayItems.map((item) =>
      context?.places.find((place) => place.placeId === item.placeId)?.freshness ??
      (item.scheduleStatus === 'verified' ? 'recent' : 'limited'),
    );
    const freshness = freshnessValues.includes('stale')
      ? 'stale' as const
      : freshnessValues.includes('limited')
        ? 'limited' as const
        : freshnessValues.includes('cached')
          ? 'cached' as const
          : freshnessValues.includes('live')
            ? 'live' as const
            : 'recent' as const;
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
      ...(context ? {
        rationale: anchorNames.length
          ? `${anchorNames.join(' and ')} create the day’s shared spine; meals, travel, and breathing room are spaced around them.`
          : 'This intentionally lighter day protects flexibility while keeping meals and travel realistic.',
        pace: context.preferences.activityPace === 'packed'
          ? 'packed' as const
          : context.preferences.activityPace === 'downtime'
            ? 'light' as const
            : 'balanced' as const,
        estimatedTravelMinutes: travelMinutes,
        fitReasons,
        tradeoffs,
        backups,
        reservationRisk: reservationCount >= 2 ? 'high' as const : reservationCount === 1 ? 'medium' as const : 'low' as const,
        freshness,
      } : {}),
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
      ...Object.keys(input.minorityFavoriteMemberIdsByPlace ?? {}),
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
    new Set([...(input.excludedPlaceIds ?? []), ...signals.excludedPlaceIds]),
  );
  const days = buildDays(input, items, suggestions, input);
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
      schemaVersion: input.planSchemaVersion ?? 2,
    }),
  );
  const generatedAt = new Date().toISOString();
  const schemaVersion = input.planSchemaVersion ?? 2;
  const plan: TripPlan = {
    planId: `plan-${inputHash}-${generatedAt.slice(0, 10)}`,
    revision: (input.priorPlan?.revision ?? 0) + 1,
    schemaVersion,
    algorithmVersion: schemaVersion === 2 ? ALGORITHM_VERSION_V2 : ALGORITHM_VERSION_V1,
    generatedAt,
    inputHash,
    destinationName: input.destination.name,
    durationDays: input.tripDurationDays,
    summary: schemaVersion === 2
      ? `${input.tripDurationDays}-day ${input.preferences.activityPace ?? 'balanced'} plan with shared anchors, protected free time, and preference-aware options.`
      : `${input.tripDurationDays}-day ${input.preferences.activityPace ?? 'balanced'} itinerary with group anchors and open windows.`,
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

function reworkAdjustments(input: TripPlanInput, action: TripPlanDayReworkAction): Record<string, number> {
  const adjustments: Record<string, number> = { ...(input.scoreAdjustments ?? {}) };
  for (const place of input.places) {
    let delta = 0;
    if (action === 'less_walking') delta -= Math.max(0, (place.routeTimeMinutes ?? 0) - 15) * 1.5;
    if (action === 'cheaper') delta += Math.max(-35, 24 - place.estimatedCostPerPerson * 0.8);
    if (action === 'more_spontaneous') delta += place.bookingRequired || place.fixedStartTimes?.length ? -28 : 18;
    if (action === 'rainy_day') {
      delta += ['museum', 'restaurant', 'cafe', 'spa', 'shop'].includes(place.category) ? 28 : 0;
      delta -= ['beach', 'park'].includes(place.category) ? 45 : 0;
    }
    adjustments[place.placeId] = (adjustments[place.placeId] ?? 0) + delta;
  }
  return adjustments;
}

/**
 * Builds a reviewable day-only preview. Callers must explicitly accept and save
 * `preview`; this function never mutates the prior plan.
 */
export function createTripPlanReworkPreview(
  input: Omit<TripPlanInput, 'priorPlan' | 'regenerateDays'>,
  priorPlan: TripPlan,
  day: number,
  action: TripPlanDayReworkAction,
  tripId?: string,
): TripPlanPreviewProposal {
  const preferences = {
    ...input.preferences,
    ...(action === 'later_start' ? { dayRhythm: 'late' as const } : {}),
    ...(action === 'lighter_pace' ? { activityPace: 'downtime' as const } : {}),
  };
  const preview = generateTripPlan({
    ...input,
    preferences,
    scoreAdjustments: reworkAdjustments(input, action),
    priorPlan,
    regenerateDays: [day],
  });
  const label = action.replace(/_/g, ' ');
  return {
    proposalId: `rework-${priorPlan.planId}-${day}-${action}-${Date.now()}`,
    ...(tripId ? { tripId } : {}),
    action,
    day,
    priorPlanId: priorPlan.planId,
    priorRevision: priorPlan.revision,
    preview,
    summary: `Preview Day ${day} with ${label}. Review the route, timing, and tradeoffs before applying it.`,
    createdAt: new Date().toISOString(),
    status: 'preview',
  };
}

/** Decode stored plans without rewriting schema-v1 records. */
export function decodeTripPlan(value: unknown): TripPlan | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<TripPlan>;
  if (!Array.isArray(candidate.items) || !Array.isArray(candidate.days)) return undefined;
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) return undefined;
  if (typeof candidate.planId !== 'string' || typeof candidate.revision !== 'number') return undefined;
  return candidate as TripPlan;
}

export type { Interest };
