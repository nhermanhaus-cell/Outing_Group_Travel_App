import type { Destination, Place, TravelPreferences } from '@gayi/shared';
import type { ItineraryItem } from '../types.js';

// ─── Time-slot scaffolding ────────────────────────────────────────────────────

interface TimeSlot {
  time: string;
  /** Soft category bias for the slot */
  bias: string[];
  /** Maximum duration for the slot in minutes */
  maxMinutes: number;
}

const DAILY_SLOTS: TimeSlot[] = [
  { time: '09:00', bias: ['museum', 'landmark', 'tour', 'park', 'beach'], maxMinutes: 180 },
  { time: '12:30', bias: ['restaurant', 'cafe', 'food'], maxMinutes: 90 },
  { time: '14:30', bias: ['museum', 'shop', 'spa', 'tour', 'beach', 'park'], maxMinutes: 180 },
  { time: '18:00', bias: ['bar', 'cafe'], maxMinutes: 90 },
  { time: '19:30', bias: ['restaurant'], maxMinutes: 120 },
  { time: '21:30', bias: ['bar', 'club', 'event'], maxMinutes: 180 },
];

// Slot index for nightlife (only scheduled when nightlifeImportance is sufficient)
const NIGHTLIFE_SLOT_INDEX = 5;

// ─── Place scoring ────────────────────────────────────────────────────────────

function scorePlaceForSlot(
  place: Place,
  slot: TimeSlot,
  prefs: TravelPreferences,
): number {
  let score = 0;

  // Category bias match
  if (slot.bias.includes(place.category)) score += 40;

  // Interest alignment
  const hits = place.interests.filter((i) => prefs.interests.includes(i)).length;
  score += hits * 12;

  // LGBTQ relevance bonus when community-seeking
  if (place.lgbtqRelevance && prefs.lookingFor.includes('community')) score += 20;
  if (place.lgbtqRelevance && prefs.lookingFor.includes('dancing')) score += 10;

  // Duration fit within slot
  if (place.durationMinutes <= slot.maxMinutes) score += 10;

  // Slight preference for lower-cost places at budget levels
  if (
    (prefs.budgetLevel === 'shoestring_slay' || prefs.budgetLevel === 'cute_but_controlled') &&
    place.estimatedCostPerPerson < 20
  ) {
    score += 8;
  }

  return score;
}

/** Return a reason string for why a place was chosen. */
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
 * No venues are invented. Places with low scores for a slot are omitted.
 * Each place appears at most once across the entire itinerary.
 */
export function generateItinerary(input: ItineraryInput): ItineraryItem[] {
  const { destination, places, preferences, tripDurationDays } = input;
  const used = new Set<string>();
  const items: ItineraryItem[] = [];

  const includeNightlife = preferences.nightlifeImportance >= 0.3;

  for (let day = 1; day <= tripDurationDays; day++) {
    const slotsToFill = includeNightlife
      ? DAILY_SLOTS
      : DAILY_SLOTS.filter((_, i) => i !== NIGHTLIFE_SLOT_INDEX);

    for (const slot of slotsToFill) {
      const candidates = places
        .filter((p) => !used.has(p.placeId))
        .map((p) => ({ place: p, score: scorePlaceForSlot(p, slot, preferences) }))
        .filter((c) => c.score > 10)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          // Deterministic secondary sort by placeId
          return a.place.placeId.localeCompare(b.place.placeId);
        });

      const top = candidates[0];
      if (!top) continue;

      const { place } = top;
      used.add(place.placeId);

      const confidence = Math.min(
        1,
        0.5 + (top.score / 100) * 0.5,
      );

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

  // Sort by day asc, then time asc
  return items.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.time.localeCompare(b.time);
  });
}

// Re-export destination type for convenience
export type { Destination };
