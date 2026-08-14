import type { ApiFlightDeal } from './travel-api';

export interface DateRecommendationEvent {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  category?: string;
}

export interface DateRecommendationPreferences {
  interests: string[];
  goals: string[];
  hallmarkIds: string[];
  nightlife: number;
  preferredMonths: number[];
}

export interface MonthlyFareObservation {
  requestedMonth: string;
  deal: ApiFlightDeal;
}

export interface TripDateRecommendation {
  id: string;
  startDate: string;
  endDate: string;
  title: string;
  reason: string;
  source: 'fare_observation' | 'matching_event' | 'seasonal_fallback';
  price?: number;
  currency?: string;
  eventTitle?: string;
  googleFlightsUrl: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function exactOrRepresentativeDate(value: string | undefined, month: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${month}-08T12:00:00Z`);
  while (date.getUTCDay() !== 2) date.setUTCDate(date.getUTCDate() + 1);
  return isoDate(date);
}

export function googleFlightsSearchUrl(
  originIata: string,
  destinationIata: string,
  startDate: string,
  endDate: string,
): string {
  const query = `Flights from ${originIata} to ${destinationIata} on ${startDate} returning ${endDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

export function upcomingCandidateMonths(
  now = new Date(),
  preferredMonths: number[] = [],
  count = 6,
): string[] {
  const preferred = new Set(preferredMonths);
  const candidates: string[] = [];
  for (let offset = 1; offset <= 14 && candidates.length < count; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1, 12));
    if (preferred.size > 0 && !preferred.has(date.getUTCMonth() + 1)) continue;
    candidates.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  if (candidates.length > 0) return candidates;
  return upcomingCandidateMonths(now, [], count);
}

function eventPreferenceScore(
  event: DateRecommendationEvent,
  preferences: DateRecommendationPreferences,
): number {
  if (preferences.hallmarkIds.includes(event.id)) return 100;
  const category = event.category?.toLowerCase() ?? '';
  const text = `${event.title} ${category}`.toLowerCase();
  const interests = new Set(preferences.interests);
  const goals = new Set(preferences.goals);
  let score = 0;
  if (category === 'pride' && (interests.has('pride') || interests.has('lgbtq_venues'))) score += 50;
  if (category === 'party' && preferences.nightlife >= 3) score += 35;
  if (category === 'festival' && (interests.has('music') || interests.has('culture'))) score += 35;
  if (interests.has('music') && /(music|concert|jazz|dance|festival)/.test(text)) score += 35;
  if (interests.has('sports') && /(sport|game|match|football|baseball|basketball|soccer)/.test(text)) score += 35;
  if (interests.has('drag') && text.includes('drag')) score += 45;
  if (interests.has('pride') && /(pride|lgbtq|queer)/.test(text)) score += 50;
  if (goals.has('celebrate')) score += 20;
  if (goals.has('connect') && ['pride', 'festival'].includes(category)) score += 20;
  return score;
}

export function buildTripDateRecommendations(input: {
  originIata: string;
  destinationIata: string;
  durationDays: number;
  fareObservations: MonthlyFareObservation[];
  events: DateRecommendationEvent[];
  bestMonths?: number[];
  preferences: DateRecommendationPreferences;
  now?: Date;
}): TripDateRecommendation[] {
  const now = input.now ?? new Date();
  const today = isoDate(now);
  const duration = Math.max(1, input.durationDays);
  const results: TripDateRecommendation[] = [];

  const fares = input.fareObservations
    .filter(({ deal }) =>
      !deal.destinationIata
      || deal.destinationIata.toUpperCase() === input.destinationIata.toUpperCase())
    .sort((left, right) => left.deal.price - right.deal.price)
    .slice(0, 2);
  fares.forEach(({ requestedMonth, deal }, index) => {
    const startDate = exactOrRepresentativeDate(deal.departureDate, requestedMonth);
    const endDate = deal.returnDate && /^\d{4}-\d{2}-\d{2}$/.test(deal.returnDate)
      ? deal.returnDate
      : addDays(startDate, duration - 1);
    results.push({
      id: `fare-${requestedMonth}-${deal.id}`,
      startDate,
      endDate,
      title: index === 0 ? 'Lowest observed fare window' : 'Another lower-cost window',
      reason: `${deal.currency} ${Math.round(deal.price).toLocaleString()} indicative fare observed for this route. Verify the live date grid before booking.`,
      source: 'fare_observation',
      price: deal.price,
      currency: deal.currency,
      googleFlightsUrl: googleFlightsSearchUrl(
        input.originIata,
        input.destinationIata,
        startDate,
        endDate,
      ),
    });
  });

  input.events
    .filter((event) => event.startDate >= today)
    .map((event) => ({ event, score: eventPreferenceScore(event, input.preferences) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.event.startDate.localeCompare(right.event.startDate))
    .slice(0, 2)
    .forEach(({ event }) => {
      const leadDays = Math.min(2, Math.max(0, Math.floor(duration / 3)));
      const proposedStart = addDays(event.startDate, -leadDays);
      const startDate = proposedStart >= today ? proposedStart : event.startDate;
      const eventEnd = event.endDate && event.endDate >= event.startDate
        ? event.endDate
        : event.startDate;
      const minimumEnd = addDays(startDate, duration - 1);
      const endDate = eventEnd > minimumEnd ? eventEnd : minimumEnd;
      if (results.some((item) => item.startDate === startDate && item.endDate === endDate)) return;
      results.push({
        id: `event-${event.id}`,
        startDate,
        endDate,
        title: `Plan around ${event.title}`,
        reason: `This ${event.category ?? 'event'} matches preferences from your questionnaire.`,
        source: 'matching_event',
        eventTitle: event.title,
        googleFlightsUrl: googleFlightsSearchUrl(
          input.originIata,
          input.destinationIata,
          startDate,
          endDate,
        ),
      });
    });

  if (results.length === 0) {
    const month = upcomingCandidateMonths(
      now,
      input.preferences.preferredMonths.length > 0
        ? input.preferences.preferredMonths
        : input.bestMonths ?? [],
      1,
    )[0];
    if (month) {
      const startDate = exactOrRepresentativeDate(undefined, month);
      const endDate = addDays(startDate, duration - 1);
      results.push({
        id: `seasonal-${month}`,
        startDate,
        endDate,
        title: 'Good seasonal fit',
        reason: 'This window matches the destination season and your preferred travel months. Check live fares before booking.',
        source: 'seasonal_fallback',
        googleFlightsUrl: googleFlightsSearchUrl(
          input.originIata,
          input.destinationIata,
          startDate,
          endDate,
        ),
      });
    }
  }

  return results.slice(0, 4);
}
