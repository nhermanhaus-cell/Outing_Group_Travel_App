import type { Destination, Place, TravelPreferences } from '@gayi/shared';
import type { ItineraryItem } from '../types';

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
  { time: '09:00', bias: ['museum', 'landmark', 'tour', 'park', 'beach'], maxMinutes: 150 },
  { time: '11:30', bias: ['cafe', 'shop', 'museum'], maxMinutes: 75 },
  { time: '13:00', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 75 },
  { time: '14:30', bias: ['museum', 'shop', 'spa', 'tour', 'beach', 'park'], maxMinutes: 150 },
  { time: '17:30', bias: ['bar', 'cafe', 'landmark'], maxMinutes: 75 },
  { time: '19:00', bias: ['restaurant'], maxMinutes: 105 },
  { time: '21:00', bias: ['bar', 'club', 'event'], maxMinutes: 180 },
];

const BALANCED_SLOTS: TimeSlot[] = [
  { time: '09:00', bias: ['museum', 'landmark', 'tour', 'park', 'beach'], maxMinutes: 180 },
  { time: '12:30', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 90 },
  { time: '14:30', bias: ['museum', 'shop', 'spa', 'tour', 'beach', 'park'], maxMinutes: 180 },
  { time: '18:00', bias: ['bar', 'cafe'], maxMinutes: 90 },
  { time: '19:30', bias: ['restaurant'], maxMinutes: 120 },
  { time: '21:30', bias: ['bar', 'club', 'event'], maxMinutes: 180 },
];

const DOWNTIME_SLOTS: TimeSlot[] = [
  { time: '10:00', bias: ['cafe', 'park', 'beach', 'spa'], maxMinutes: 120 },
  { time: '12:30', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 90 },
  { time: '14:00', bias: [], maxMinutes: 120, freeBlock: true },
  { time: '16:30', bias: ['museum', 'shop', 'landmark', 'park'], maxMinutes: 120 },
  { time: '19:00', bias: ['restaurant'], maxMinutes: 120 },
  { time: '21:00', bias: ['bar', 'cafe'], maxMinutes: 120 },
];

const NIGHTLIFE_BIAS = new Set(['bar', 'club', 'event']);

function slotsForPace(prefs: TravelPreferences): TimeSlot[] {
  const pace = prefs.activityPace ?? 'balanced';
  const base =
    pace === 'packed' ? PACKED_SLOTS : pace === 'downtime' ? DOWNTIME_SLOTS : BALANCED_SLOTS;

  const includeNightlife = prefs.nightlifeImportance >= 0.3;
  if (includeNightlife) return base;

  return base.filter(
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
}

/**
 * Generate a day-by-day itinerary using only the provided `places`.
 * Pace controls slot density: packed / balanced / downtime (more free blocks).
 * No venues are invented. Each place appears at most once.
 */
export function generateItinerary(input: ItineraryInput): ItineraryItem[] {
  const { places, preferences, tripDurationDays } = input;
  const used = new Set<string>();
  const items: ItineraryItem[] = [];
  const slots = slotsForPace(preferences);

  for (let day = 1; day <= tripDurationDays; day++) {
    for (const slot of slots) {
      if (slot.freeBlock) {
        items.push({
          day,
          time: slot.time,
          title: 'Open downtime',
          category: 'other',
          placeId: `free-${day}-${slot.time}`,
          duration: slot.maxMinutes,
          estimatedCost: 0,
          bookingRequired: false,
          source: 'editorial',
          confidence: 1,
          coords: places[0]?.coords ?? { lat: 0, lng: 0 },
          whySelected: 'Protected rest block for your downtime pace',
        });
        continue;
      }

      const candidates = places
        .filter((p) => !used.has(p.placeId))
        .map((p) => ({ place: p, score: scorePlaceForSlot(p, slot, preferences) }))
        .filter((c) => c.score > 10)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.place.placeId.localeCompare(b.place.placeId);
        });

      const top = candidates[0];
      if (!top) continue;

      const { place } = top;
      used.add(place.placeId);

      const confidence = Math.min(1, 0.5 + (top.score / 100) * 0.5);

      items.push({
        day,
        time: slot.time,
        title: place.name,
        category: place.category,
        placeId: place.placeId,
        duration: Math.min(place.durationMinutes, slot.maxMinutes),
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
      });
    }
  }

  return items.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.time.localeCompare(b.time);
  });
}

export type { Destination };
