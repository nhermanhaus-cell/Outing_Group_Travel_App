import type { HomeJourneyState, HomeNextAction } from '@gayi/shared';

export interface HomeJourneyTripInput {
  tripId: string;
  destinationName?: string;
  destinationTimezone?: string;
  startDate?: string;
  endDate?: string;
  hasLodging: boolean;
  hasBlockingPlanIssue: boolean;
  pendingVoteCount: number;
  tasteDeckComplete: boolean;
}

export interface HomeJourneyResult {
  state: HomeJourneyState;
  trip?: HomeJourneyTripInput;
  nextAction: HomeNextAction;
}

function dateInTimezone(now: Date, timezone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function stateForTrip(trip: HomeJourneyTripInput, now: Date): HomeJourneyState {
  if (!trip.startDate || !trip.endDate) return 'planning';
  const today = dateInTimezone(now, trip.destinationTimezone);
  if (today >= trip.startDate && today <= trip.endDate) return 'in_trip';
  const untilStart = daysBetween(today, trip.startDate);
  if (untilStart > 14) return 'planning';
  if (untilStart >= 0) return 'pre_trip';
  const sinceEnd = daysBetween(trip.endDate, today);
  if (sinceEnd >= 0 && sinceEnd <= 14) return 'post_trip';
  return 'discovering';
}

function selectedTrip(trips: HomeJourneyTripInput[], now: Date): { trip?: HomeJourneyTripInput; state: HomeJourneyState } {
  const ranked = trips
    .map((trip) => ({ trip, state: stateForTrip(trip, now) }))
    .filter(({ state }) => state !== 'discovering')
    .sort((left, right) => {
      const rank: Record<HomeJourneyState, number> = { in_trip: 0, pre_trip: 1, planning: 2, post_trip: 3, discovering: 4 };
      const byState = rank[left.state] - rank[right.state];
      if (byState) return byState;
      if (left.state === 'post_trip') return (right.trip.endDate ?? '').localeCompare(left.trip.endDate ?? '');
      return (left.trip.startDate ?? '9999-12-31').localeCompare(right.trip.startDate ?? '9999-12-31');
    });
  return ranked[0] ?? { state: 'discovering' };
}

export function deriveHomeJourney(
  trips: HomeJourneyTripInput[],
  options: { now?: Date; hasOpportunity?: boolean } = {},
): HomeJourneyResult {
  const { trip, state } = selectedTrip(trips, options.now ?? new Date());
  const name = trip?.destinationName ?? 'your trip';
  const target = trip?.tripId;
  const action = (
    kind: HomeNextAction['kind'], priority: number, title: string, summary: string, href: string, blocking = false,
  ): HomeJourneyResult => ({
    state, ...(trip ? { trip } : {}),
    nextAction: { kind, journeyState: state, priority, title, summary, href, ...(target ? { tripId: target } : {}), blocking },
  });

  if (trip && state === 'in_trip') return action('open_today', 1, `Today in ${name}`, 'See what is next, when to leave, weather, routes, and nearby options.', `/trips/${target}/today`);
  if (trip?.hasBlockingPlanIssue) return action('resolve_plan_issue', 2, 'One plan detail needs attention', 'Review the reservation or itinerary issue before it becomes urgent.', `/trips/${target}?section=plan`, true);
  if (trip && trip.pendingVoteCount > 0) return action('vote', 3, 'Your group is waiting on you', `${trip.pendingVoteCount} decision${trip.pendingVoteCount === 1 ? '' : 's'} need your vote.`, `/trips/${target}?section=group`);
  if (trip && !trip.tasteDeckComplete) return action('finish_taste_deck', 4, `Shape the ${name} itinerary`, 'React to a few ideas so every day reflects what the group actually wants.', `/trips/${target}?deck=1`);
  if (trip && (!trip.startDate || !trip.endDate || !trip.hasLodging)) return action('add_trip_details', 5, 'Lock in the essentials', !trip.startDate || !trip.endDate ? 'Add dates to unlock timing, weather, and day-by-day recommendations.' : 'Add lodging to improve route times and nearby recommendations.', `/trips/${target}?section=plan`);
  if (options.hasOpportunity) return action('review_opportunity', 6, 'A timely trip idea fits you', 'Review a personalized destination, event, or affordable travel window.', '/discover');
  if (trip && state === 'post_trip') return action('share_feedback', 7, `How was ${name}?`, 'A quick recap makes your next recommendations more personal.', `/trips/${target}?feedback=1`);
  return action('start_planning', 8, 'Find your next outing', 'Tell us what sounds good and we’ll turn it into a destination and plan.', '/quiz');
}
