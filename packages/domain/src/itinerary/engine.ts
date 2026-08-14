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
  { time: '10:00', bias: ['cafe', 'park', 'beach', 'spa', 'tour', 'landmark'], maxMinutes: 120 },
  { time: '12:30', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 75 },
  { time: '14:00', bias: [], maxMinutes: 120, freeBlock: true },
  { time: '16:30', bias: ['museum', 'shop', 'landmark', 'park'], maxMinutes: 90 },
  { time: '19:00', bias: ['restaurant'], maxMinutes: 75 },
  { time: '21:00', bias: ['bar', 'cafe'], maxMinutes: 75 },
];

const NIGHTLIFE_BIAS = new Set(['bar', 'club', 'event']);
const HOURS_SENSITIVE_CATEGORIES = new Set<string>([
  'bar',
  'cafe',
  'club',
  'landmark',
  'museum',
  'restaurant',
  'shop',
  'spa',
]);
const DAYTIME_CATEGORIES = new Set<string>([
  'beach',
  'landmark',
  'museum',
  'park',
  'shop',
  'spa',
  'tour',
]);

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

function categoryFitsSlot(place: Place, slot: TimeSlot): boolean {
  if (slot.bias.length === 0) return true;
  if (place.category === 'restaurant' || place.category === 'cafe') {
    return slot.bias.some((category) => ['restaurant', 'cafe', 'food'].includes(category));
  }
  if (place.category === 'bar' || place.category === 'club') {
    return slot.bias.some((category) => ['bar', 'club', 'event'].includes(category));
  }
  return slot.bias.includes(place.category)
    || (place.category === 'tour' && slot.bias.includes('landmark'))
    || (place.category === 'event' && slot.bias.includes('tour'));
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
  /** User-declared must-sees. These outrank soft preferences but never hard exclusions. */
  requiredPlaceIds?: string[];
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

function parseClockMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesFromClock(value: string): number {
  // Internal slots are valid HH:MM values. A safe daytime fallback prevents a
  // malformed legacy/provider time from silently becoming midnight.
  return parseClockMinutes(value) ?? 9 * 60;
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

function hasAuthoritativeFixedStart(place: Place): boolean {
  return (place.fixedStartTimes ?? []).some((value) => {
    const minute = parseClockMinutes(value);
    if (minute === null) return false;
    return !DAYTIME_CATEGORIES.has(place.category) || minute >= 6 * 60;
  });
}

function needsVerifiedHours(place: Place, dayDate: string | undefined): boolean {
  if (!dayDate) return false;
  if (HOURS_SENSITIVE_CATEGORIES.has(place.category)) return true;
  if (place.category === 'tour' || place.category === 'event') {
    return !hasAuthoritativeFixedStart(place);
  }
  return false;
}

function plausibleStartForCategory(place: Place, start: number): boolean {
  if (!DAYTIME_CATEGORIES.has(place.category)) return true;
  return start >= 6 * 60;
}

export function isPlaceOpenForVisit(
  place: Place,
  dayDate: string | undefined,
  start: number,
  end: number,
): boolean {
  if (place.businessStatus === 'closed_permanently' || place.businessStatus === 'closed_temporarily') {
    return false;
  }
  if (!plausibleStartForCategory(place, start)) return false;
  if (!place.openingHours || place.openingHours.length === 0) {
    return !needsVerifiedHours(place, dayDate);
  }
  const dayOfWeek = dayDate ? new Date(`${dayDate}T12:00:00Z`).getUTCDay() : undefined;
  const periods = place.openingHours.filter(
    (period) => period.dayOfWeek === undefined || dayOfWeek === undefined || period.dayOfWeek === dayOfWeek,
  );
  if (periods.length === 0) return false;
  return periods.some((period) => {
    const open = parseClockMinutes(period.open);
    const parsedClose = parseClockMinutes(period.close);
    if (open === null || parsedClose === null) return false;
    let close = parsedClose;
    if (close <= open) close += 24 * 60;
    const normalizedEnd = end < start ? end + 24 * 60 : end;
    return start >= open && normalizedEnd <= close;
  });
}

/** True for a machine-generated stop that should be rebuilt instead of shown. */
export function hasImplausibleItineraryTime(item: ItineraryItem): boolean {
  if (item.kind === 'downtime' || item.placeId.startsWith('free-') || item.placeId.startsWith('meal-')) {
    return false;
  }
  const start = parseClockMinutes(item.time);
  if (start === null) return true;
  return !NIGHTLIFE_BIAS.has(item.category) && start < 5 * 60;
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
  const required = new Set(input.requiredPlaceIds ?? []);
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
    const remainingCandidateCount = places.filter(
      (place) => !used.has(place.placeId) && !excluded.has(place.placeId),
    ).length;
    const remainingDays = tripDurationDays - day + 1;
    // Reserve scarce offline/editorial candidates for later days instead of
    // exhausting the entire destination catalog on day one.
    const newPlaceTarget = Math.max(1, Math.ceil(remainingCandidateCount / remainingDays));
    let newPlacesScheduled = 0;
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
      if (newPlacesScheduled >= newPlaceTarget) continue;

      const candidates = places
        .filter((p) => !used.has(p.placeId) && !excluded.has(p.placeId) && (
          categoryFitsSlot(p, slot) || (required.has(p.placeId) && p.category === 'other')
        ))
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
              (required.has(p.placeId) ? 1_000 : 0) +
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
          const fixed = candidate.place.fixedStartTimes
            .map(parseClockMinutes)
            .filter((minute): minute is number => minute !== null)
            .filter((minute) => plausibleStartForCategory(candidate.place, minute))
            .filter((minute) => minute >= start)
            .sort((a, b) => a - b)[0];
          if (fixed === undefined) return null;
          start = fixed;
        }
        const duration = Math.min(candidate.place.durationMinutes, slot.maxMinutes);
        start = avoidWindows(start, duration, lockedWindows);
        return isPlaceOpenForVisit(candidate.place, dayDate, start, start + duration)
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
      newPlacesScheduled += 1;

      const confidence = Math.min(1, 0.5 + (top.score / 100) * 0.5);
      const arrivalBufferMinutes = place.bookingRequired ? 15 : 10;
      const startMinute = top.scheduledStart;
      const duration = top.scheduledDuration;
      const endMinute = startMinute + duration;

      items.push({
        day,
        time: clockFromMinutes(startMinute),
        title: place.name,
        ...(place.summary !== undefined && { summary: place.summary }),
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
