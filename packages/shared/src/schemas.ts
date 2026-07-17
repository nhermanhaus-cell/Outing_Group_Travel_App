import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const GlamourLevelSchema = z.enum([
  'shoestring_slay',
  'cute_but_controlled',
  'comfortably_fabulous',
  'luxury_gaycation',
  'no_budget_just_vibes',
]);

export const LgbtqLegalStatusSchema = z.enum([
  'marriage_equality',
  'civil_union',
  'limited_protections',
  'no_recognition',
  'criminalized',
  'heavily_criminalized',
]);

export const WeatherPreferenceSchema = z.enum(['hot', 'warm', 'mild', 'cool', 'any']);

export const InterestSchema = z.enum([
  'beach',
  'hiking',
  'culture',
  'nightlife',
  'food',
  'art',
  'history',
  'shopping',
  'wellness',
  'adventure',
  'pride',
  'sports',
  'music',
  'lgbtq_venues',
  'drag',
]);

export const LookingForSchema = z.enum([
  'community',
  'romance',
  'friendship',
  'dancing',
  'relaxation',
  'exploration',
  'activism',
]);

export const PlaceCategorySchema = z.enum([
  'bar',
  'club',
  'restaurant',
  'cafe',
  'museum',
  'park',
  'beach',
  'spa',
  'hotel',
  'tour',
  'event',
  'shop',
  'landmark',
  'other',
]);

// ─── Preferences ─────────────────────────────────────────────────────────────

export const TravelPreferencesSchema = z.object({
  budgetLevel: GlamourLevelSchema,
  departureAirports: z.array(z.string().length(3).toUpperCase()),
  travelMonths: z.array(z.number().int().min(1).max(12)),
  tripDurationDays: z.number().int().min(1).max(365),
  groupSize: z.number().int().min(1).max(50),
  interests: z.array(InterestSchema),
  accessibilityNeeds: z.array(z.string()),
  nightlifeImportance: z.number().min(0).max(1),
  weatherPreference: WeatherPreferenceSchema,
  lgbtqSafetyPriority: z.number().min(0).max(1),
  soloTravel: z.boolean(),
  lookingFor: z.array(LookingForSchema),
});

// ─── Destinations ────────────────────────────────────────────────────────────

export const DestinationEventSchema = z.object({
  name: z.string(),
  month: z.number().int().min(1).max(12),
  type: z.enum(['pride', 'festival', 'conference', 'party', 'other']),
  url: z.string().url().optional(),
});

export const AccessibilityInfoSchema = z.object({
  wheelchairFriendly: z.boolean(),
  brailleAvailable: z.boolean(),
  notes: z.string(),
});

export const CostPerDaySchema = z.object({
  budget: z.number().nonnegative(),
  mid: z.number().nonnegative(),
  luxury: z.number().nonnegative(),
});

export const DestinationSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  country: z.string().min(1),
  continentCode: z.string().min(2).max(3),
  nearestAirportCodes: z.array(z.string().length(3).toUpperCase()),
  legalStatus: LgbtqLegalStatusSchema,
  safetyScore: z.number().min(0).max(100),
  communityScore: z.number().min(0).max(100),
  nightlifeScore: z.number().min(0).max(100),
  bestMonths: z.array(z.number().int().min(1).max(12)),
  avgTempCByMonth: z.record(z.string(), z.number()).default({}),
  interests: z.array(InterestSchema),
  upcomingEvents: z.array(DestinationEventSchema),
  accessibility: AccessibilityInfoSchema,
  costPerDay: CostPerDaySchema,
  lastUpdated: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  reviewScore: z.number().min(0).max(5).optional(),
  reviewCount: z.number().nonnegative().int().optional(),
  typicalStayDays: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).optional(),
});

// ─── Places ──────────────────────────────────────────────────────────────────

export const PlaceSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  category: PlaceCategorySchema,
  coords: z.object({ lat: z.number(), lng: z.number() }),
  durationMinutes: z.number().int().min(0),
  estimatedCostPerPerson: z.number().nonnegative(),
  bookingRequired: z.boolean(),
  interests: z.array(InterestSchema),
  accessibilityNotes: z.string().optional(),
  lgbtqRelevance: z.string().optional(),
  source: z.string().min(1),
  openingHours: z.array(z.object({ open: z.string(), close: z.string() })).optional(),
});

// ─── Trips ────────────────────────────────────────────────────────────────────

export const TripSchema = z.object({
  tripId: z.string().uuid(),
  userId: z.string().min(1),
  destinationSlug: z.string().regex(/^[a-z0-9-]+$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupSize: z.number().int().min(1),
  isPublic: z.boolean(),
  lodgingAddress: z.string().optional(),
  bookingConfirmations: z.record(z.string(), z.string()).optional(),
  legalName: z.string().optional(),
  sensitivePreferences: z.record(z.string(), z.unknown()).optional(),
  highlights: z.array(z.string()).optional(),
  photoCount: z.number().nonnegative().int().optional(),
});
