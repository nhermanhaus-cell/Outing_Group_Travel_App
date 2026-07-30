import type { Destination, Place, TravelPreferences } from '@gayi/shared';
import type { ItineraryItem, ItineraryTravelLeg } from '../types';

// ─── Time-slot scaffolding ────────────────────────────────────────────────────

interface TimeSlot {
  time: string;
  /** Soft category bias for the slot */
  bias: string[];
  /** Maximum duration for the slot in minutes */
  maxMinutes: number;
  /** If true, this is a free/rest block inserted for downtime pace */
  freeBlock?: boolean;
}

const PACKED_SLOTS: TimeSlot[] = [
  { time: '09:00', bias: ['museum', 'landmark', 'tour', 'park', 'beach'], maxMinutes: 120 },
  { time: '11:30', bias: ['cafe', 'shop', 'museum'], maxMinutes: 60 },
  { time: '13:00', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 75 },
  { time: '14:30', bias: ['museum', 'shop', 'spa', 'tour', 'beach', 'park'], maxMinutes: 120 },
  { time: '16:30', bias: [], maxMinutes: 45, freeBlock: true },
  { time: '17:30', bias: ['bar', 'cafe', 'landmark'], maxMinutes: 60 },
  { time: '19:00', bias: ['restaurant'], maxMinutes: 90 },
  { time: '21:00', bias: ['bar', 'club', 'event'], maxMinutes: 105 },
];

const BALANCED_SLOTS: TimeSlot[] = [
  { time: '09:00', bias: ['museum', 'landmark', 'tour', 'park', 'beach'], maxMinutes: 120 },
  { time: '12:30', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 75 },
  { time: '14:30', bias: ['museum', 'shop', 'spa', 'tour', 'beach', 'park'], maxMinutes: 120 },
  { time: '16:30', bias: [], maxMinutes: 90, freeBlock: true },
  { time: '18:00', bias: ['bar', 'cafe'], maxMinutes: 60 },
  { time: '19:30', bias: ['restaurant'], maxMinutes: 90 },
  { time: '21:30', bias: ['bar', 'club', 'event'], maxMinutes: 90 },
];

const DOWNTIME_SLOTS: TimeSlot[] = [
  { time: '10:00', bias: ['cafe', 'park', 'beach', 'spa'], maxMinutes: 90 },
  { time: '12:30', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 75 },
  { time: '14:00', bias: [], maxMinutes: 120, freeBlock: true },
  { time: '16:30', bias: ['museum', 'shop', 'landmark', 'park'], maxMinutes: 90 },
  { time: '19:00', bias: ['restaurant'], maxMinutes: 75 },
  { time: '21:00', bias: ['bar', 'cafe'], maxMinutes: 75 },
];

const NIGHTLIFE_BIAS = new Set(['bar', 'club', 'event']);

function slotsForPace(prefs: TravelPreferences): TimeSlot[] {
  const pace = prefs.activityPace ?? 'balanced';
  const base =
    pace === 'packed' ? PACKED_SLOTS : pace === 'downtime' ? DOWNTIME_SLOTS : BALANCED_SLOTS;
  const shiftMinutes = prefs.dayRhythm === 'early' ? -30 : prefs.dayRhythm === 'late' ? 90 : 0;
  const rhythmAdjusted = shiftMinutes === 0
    ? base
    : base.map((slot) => ({
        ...slot,
        time: clockFromMinutes(minutesFromClock(slot.time) + shiftMinutes),
      }));

  const includeNightlife = prefs.nightlifeImportance >= 0.3;
  if (includeNightlife) return rhythmAdjusted;

  return rhythmAdjusted.filter(
    (slot) =>
      slot.freeBlock ||
      !slot.bias.every((b) => NIGHTLIFE_BIAS.has(b)) ||
      slot.bias.length === 0,
  ).filter((slot) => {
    // Drop pure nightlife evening slots when nightlife is low
    if (!includeNightlife && slot.bias.length > 0 && slot.bias.every((b) => NIGHTLIFE_BIAS.has(b))) {
      return false;
    }
    return true;
  });
}

// ─── Place scoring ────────────────────────────────────────────────────────────

function scorePlaceForSlot(
  place: Place,
  slot: TimeSlot,
  prefs: TravelPreferences,
): number {
  let score = 0;

  if (slot.bias.includes(place.category)) score += 40;

  const hits = place.interests.filter((i) => prefs.interests.includes(i)).length;
  score += hits * 12;

  if (place.lgbtqRelevance && prefs.lookingFor.includes('community')) score += 20;
  if (place.lgbtqRelevance && prefs.lookingFor.includes('dancing')) score += 10;

  if (place.durationMinutes <= slot.maxMinutes) score += 10;

  if (
    (prefs.budgetLevel === 'shoestring_slay' || prefs.budgetLevel === 'cute_but_controlled') &&
    place.estimatedCostPerPerson < 20
  ) {
    score += 8;
  }

  return score;
}

function whySelected(place: Place, prefs: TravelPreferences): string {
  const interestHits = place.interests.filter((i) => prefs.interests.includes(i));
  if (place.lgbtqRelevance) return place.lgbtqRelevance;
  if (interestHits.length > 0) return `Matches your interest in ${interestHits[0]}`;
  return 'Highly rated in the area';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ItineraryInput {
  destination: Destination;
  places: Place[];
  preferences: TravelPreferences;
  tripDurationDays: number;
  /** YYYY-MM-DD. When omitted, generated clock times are explicitly estimated. */
  startDate?: string;
  timezone?: string;
  lodging?: { placeId?: string; coords: { lat: number; lng: number }; label?: string };
  routeEstimates?: ItineraryRouteEstimate[];
  lockedItems?: ItineraryItem[];
  /** Feedback-derived hard exclusions. */
  excludedPlaceIds?: string[];
  /** Feedback-derived score deltas keyed by placeId. */
  scoreAdjustments?: Record<string, number>;
}

export interface ItineraryRouteEstimate {
  fromPlaceId: string;
  toPlaceId: string;
  mode: ItineraryTravelLeg['mode'];
  durationMinutes: number;
  distanceMeters?: number;
  encodedPolyline?: string;
  estimated?: boolean;
}

function minutesFromClock(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (Number.isFinite(hour) ? hour! : 0) * 60 + (Number.isFinite(minute) ? minute! : 0);
}

function clockFromMinutes(value: number): string {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, Math.round(value)));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dateForDay(startDate: string | undefined, day: number): string | undefined {
  if (!startDate) return undefined;
  const parsed = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  parsed.setUTCDate(parsed.getUTCDate() + day - 1);
  return parsed.toISOString().slice(0, 10);
}

function isoAt(date: string | undefined, minute: number): string | undefined {
  if (!date) return undefined;
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMinutes(minute);
  return value.toISOString().replace(/Z$/, '');
}

function isOpenForVisit(place: Place, dayDate: string | undefined, start: number, end: number): boolean {
  if (place.businessStatus === 'closed_permanently' || place.businessStatus === 'closed_temporarily') {
    return false;
  }
  if (!place.openingHours || place.openingHours.length === 0) return true;
  const dayOfWeek = dayDate ? new Date(`${dayDate}T12:00:00Z`).getUTCDay() : undefined;
  const periods = place.openingHours.filter(
    (period) => period.dayOfWeek === undefined || dayOfWeek === undefined || period.dayOfWeek === dayOfWeek,
  );
  if (periods.length === 0) return false;
  return periods.some((period) => {
    const open = minutesFromClock(period.open);
    let close = minutesFromClock(period.close);
    if (close <= open) close += 24 * 60;
    const normalizedEnd = end < start ? end + 24 * 60 : end;
    return start >= open && normalizedEnd <= close;
  });
}

function fallbackTravelMinutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const latKm = (to.lat - from.lat) * 111;
  const lngKm = (to.lng - from.lng) * 111 * Math.cos((from.lat * Math.PI) / 180);
  const km = Math.sqrt(latKm * latKm + lngKm * lngKm);
  return Math.max(5, Math.round((km / 4.8) * 60));
}

function avoidWindows(start: number, duration: number, windows: Array<{ start: number; end: number }>): number {
  let candidate = start;
  for (const window of windows) {
    if (candidate < window.end && candidate + duration > window.start) candidate = window.end;
  }
  return candidate;
}

function routeBetween(
  fromId: string,
  fromCoords: { lat: number; lng: number },
  to: Place,
  estimates: ItineraryRouteEstimate[],
  preferredMode: TravelPreferences['preferredTransportMode'],
): ItineraryTravelLeg {
  const candidates = estimates.filter(
    (estimate) => estimate.fromPlaceId === fromId && estimate.toPlaceId === to.placeId,
  );
  const exact = preferredMode && preferredMode !== 'auto'
    ? candidates.find((estimate) => estimate.mode === preferredMode)
    : candidates.sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  if (exact) {
    return {
      fromPlaceId: fromId,
      toPlaceId: to.placeId,
      mode: exact.mode,
      durationMinutes: exact.durationMinutes,
      ...(exact.distanceMeters !== undefined && { distanceMeters: exact.distanceMeters }),
      ...(exact.encodedPolyline !== undefined && { encodedPolyline: exact.encodedPolyline }),
      ...(exact.estimated !== undefined && { estimated: exact.estimated }),
    };
  }
  const durationMinutes = fallbackTravelMinutes(fromCoords, to.coords);
  return {
    fromPlaceId: fromId,
    toPlaceId: to.placeId,
    mode:
      preferredMode && preferredMode !== 'auto'
        ? preferredMode
        : durationMinutes <= 20
          ? 'walking'
          : 'transit',
    durationMinutes,
    estimated: true,
  };
}

/**
 * Generate a day-by-day itinerary using only the provided `places`.
 * Pace controls slot density: packed / balanced / downtime (more free blocks).
 * No venues are invented. Each place appears at most once.
 */
export function generateItinerary(input: ItineraryInput): ItineraryItem[] {
  const { places, preferences, tripDurationDays } = input;
  const used = new Set<string>();
  const excluded = new Set(input.excludedPlaceIds ?? []);
  const items: ItineraryItem[] = [];
  const slots = slotsForPace(preferences);
  const routeEstimates = input.routeEstimates ?? [];
  const lockedByDay = new Map<number, ItineraryItem[]>();
  for (const item of input.lockedItems ?? []) {
    if (!item.locked) continue;
    used.add(item.placeId);
    lockedByDay.set(item.day, [...(lockedByDay.get(item.day) ?? []), item]);
  }

  for (let day = 1; day <= tripDurationDays; day++) {
    const dayDate = dateForDay(input.startDate, day);
    const locked = (lockedByDay.get(day) ?? []).sort((a, b) => a.time.localeCompare(b.time));
    items.push(...locked);
    const lockedWindows = locked.map((item) => ({
      start: minutesFromClock(item.time),
      end: minutesFromClock(item.time) + item.duration,
    }));
    let cursor = minutesFromClock(slots[0]?.time ?? '09:00');
    let previousId = input.lodging?.placeId ?? `lodging-day-${day}`;
    let previousCoords = input.lodging?.coords ?? places[0]?.coords ?? { lat: 0, lng: 0 };

    for (const slot of slots) {
      if (slot.freeBlock) {
        const startMinute = avoidWindows(Math.max(cursor, minutesFromClock(slot.time)), slot.maxMinutes, lockedWindows);
        const endMinute = startMinute + slot.maxMinutes;
        items.push({
          day,
          time: clockFromMinutes(startMinute),
          title: preferences.activityPace === 'downtime' ? 'Open downtime' : 'Open free time',
          category: 'other',
          placeId: `free-${day}-${slot.time}`,
          duration: slot.maxMinutes,
          estimatedCost: 0,
          bookingRequired: false,
          source: 'editorial',
          confidence: 1,
          coords: places[0]?.coords ?? { lat: 0, lng: 0 },
          whySelected: preferences.activityPace === 'downtime' ? 'Protected rest block for your downtime pace' : 'Intentional breathing room between plans',
          kind: 'downtime',
          locked: false,
          scheduleStatus: dayDate ? 'verified' : 'estimated',
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(isoAt(dayDate, startMinute) !== undefined && { startsAt: isoAt(dayDate, startMinute)! }),
          ...(isoAt(dayDate, endMinute) !== undefined && { endsAt: isoAt(dayDate, endMinute)! }),
        });
        cursor = endMinute;
        continue;
      }

      const candidates = places
        .filter((p) => !used.has(p.placeId) && !excluded.has(p.placeId))
        .map((p) => {
          const route = routeBetween(
            previousId,
            previousCoords,
            p,
            routeEstimates,
            preferences.preferredTransportMode,
          );
          const ratingBoost = (p.rating ?? 0) >= 4.5 ? 8 : 0;
          const reviewBoost = Math.min(6, Math.log10(Math.max(1, p.reviewCount ?? 1)) * 2);
          const travelPenalty = Math.min(30, route.durationMinutes * 0.45);
          return {
            place: p,
            route,
            score:
              scorePlaceForSlot(p, slot, preferences) +
              ratingBoost +
              reviewBoost -
              travelPenalty +
              (input.scoreAdjustments?.[p.placeId] ?? 0),
          };
        })
        .filter((c) => c.score > 10)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.place.placeId.localeCompare(b.place.placeId);
        });

      const slotStart = Math.max(cursor, minutesFromClock(slot.time));
      const top = candidates.map((candidate) => {
        const arrivalBuffer = candidate.place.bookingRequired ? 15 : 10;
        let start = Math.max(
          slotStart,
          cursor + candidate.route.durationMinutes + arrivalBuffer,
        );
        if (candidate.place.fixedStartTimes && candidate.place.fixedStartTimes.length > 0) {
          const fixed = candidate.place.fixedStartTimes.map(minutesFromClock).filter((minute) => minute >= start).sort((a, b) => a - b)[0];
          if (fixed === undefined) return null;
          start = fixed;
        }
        const duration = Math.min(candidate.place.durationMinutes, slot.maxMinutes);
        start = avoidWindows(start, duration, lockedWindows);
        return isOpenForVisit(candidate.place, dayDate, start, start + duration)
          ? { ...candidate, scheduledStart: start, scheduledDuration: duration }
          : null;
      }).find((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
      if (!top) {
        if (slot.bias.includes('restaurant')) {
          const startMinute = avoidWindows(slotStart, slot.maxMinutes, lockedWindows);
          const endMinute = startMinute + slot.maxMinutes;
          items.push({ day, time: clockFromMinutes(startMinute), title: 'Open meal time', category: 'restaurant', placeId: `meal-${day}-${slot.time}`, duration: slot.maxMinutes, estimatedCost: 0, bookingRequired: false, source: 'schedule', confidence: 1, coords: previousCoords, whySelected: 'Meal time held open until you choose a place', kind: 'meal', locked: false, scheduleStatus: 'estimated', ...(input.timezone !== undefined && { timezone: input.timezone }), ...(isoAt(dayDate, startMinute) !== undefined && { startsAt: isoAt(dayDate, startMinute)! }), ...(isoAt(dayDate, endMinute) !== undefined && { endsAt: isoAt(dayDate, endMinute)! }) });
          cursor = endMinute;
        }
        continue;
      }

      const { place } = top;
      used.add(place.placeId);

      const confidence = Math.min(1, 0.5 + (top.score / 100) * 0.5);
      const arrivalBufferMinutes = place.bookingRequired ? 15 : 10;
      const startMinute = top.scheduledStart;
      const duration = top.scheduledDuration;
      const endMinute = startMinute + duration;

      items.push({
        day,
        time: clockFromMinutes(startMinute),
        title: place.name,
        category: place.category,
        placeId: place.placeId,
        duration,
        estimatedCost: place.estimatedCostPerPerson,
        bookingRequired: place.bookingRequired,
        source: place.source,
        confidence: Math.round(confidence * 100) / 100,
        coords: place.coords,
        ...(place.accessibilityNotes !== undefined && {
          accessibilityNotes: place.accessibilityNotes,
        }),
        ...(place.lgbtqRelevance !== undefined && {
          lgbtqRelevance: place.lgbtqRelevance,
        }),
        whySelected: whySelected(place, preferences),
        kind: place.category === 'tour' ? 'experience' : place.category === 'restaurant' || place.category === 'cafe' ? 'meal' : 'place',
        locked: false,
        arrivalBufferMinutes,
        scheduleStatus:
          place.openingHours && place.openingHours.length > 0 && dayDate ? 'verified' : 'estimated',
        travelFromPrevious: top.route,
        attendance: 'group',
        timeFlexibility: place.fixedStartTimes?.length ? 'fixed' : 'window',
        ...(place.bookingOffer !== undefined && { bookingOffer: place.bookingOffer }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(isoAt(dayDate, startMinute) !== undefined && { startsAt: isoAt(dayDate, startMinute)! }),
        ...(isoAt(dayDate, endMinute) !== undefined && { endsAt: isoAt(dayDate, endMinute)! }),
      });
      cursor = endMinute;
      previousId = place.placeId;
      previousCoords = place.coords;
    }
  }

  return items.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.time.localeCompare(b.time);
  });
}

export type { Destination };
