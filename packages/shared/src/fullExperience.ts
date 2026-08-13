import { z } from 'zod';

export const homeJourneyStateSchema = z.enum([
  'discovering',
  'planning',
  'pre_trip',
  'in_trip',
  'post_trip',
]);
export type HomeJourneyState = z.infer<typeof homeJourneyStateSchema>;

export const homeNextActionKindSchema = z.enum([
  'open_today',
  'resolve_plan_issue',
  'vote',
  'finish_taste_deck',
  'add_trip_details',
  'review_opportunity',
  'share_feedback',
  'start_planning',
]);

export const homeNextActionSchema = z.object({
  kind: homeNextActionKindSchema,
  journeyState: homeJourneyStateSchema,
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(360),
  href: z.string().min(1).max(500),
  tripId: z.string().min(1).max(160).optional(),
  priority: z.number().int().min(1).max(8),
  blocking: z.boolean().default(false),
});
export type HomeNextAction = z.infer<typeof homeNextActionSchema>;

export const activityPreferenceChoiceV2Schema = z.enum([
  'very_interested',
  'interested',
  'neutral',
  'uninterested',
  'very_uninterested',
  'must_do',
  'maybe',
  'not_for_this_trip',
  'not_interested',
]);
export type ActivityPreferenceChoiceV2 = z.infer<typeof activityPreferenceChoiceV2Schema>;

export const activityPreferenceSessionSchema = z.object({
  tripId: z.string().uuid(),
  memberId: z.string().uuid(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  reviewedPlaceIds: z.array(z.string().min(1).max(240)).max(500),
  reviewedCategories: z.array(z.string().min(1).max(80)).max(40),
  reactionCount: z.number().int().nonnegative(),
  isComplete: z.boolean(),
});
export type ActivityPreferenceSession = z.infer<typeof activityPreferenceSessionSchema>;

export const assistantFocusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('home'), action: z.string().min(1).max(120).optional() }),
  z.object({
    kind: z.literal('destination_section'),
    destinationSlug: z.string().min(1).max(120),
    section: z.enum(['overview', 'timing', 'neighborhoods', 'places', 'events', 'experiences', 'context']),
  }),
  z.object({
    kind: z.literal('itinerary_day'),
    tripId: z.string().uuid(),
    day: z.number().int().min(1).max(90),
    action: z.enum(['explain', 'rework', 'nearby']).default('explain'),
  }),
  z.object({
    kind: z.literal('itinerary_item'),
    tripId: z.string().uuid(),
    itemId: z.string().min(1).max(240),
    action: z.enum(['explain', 'replace', 'nearby']).default('explain'),
  }),
  z.object({ kind: z.literal('trip_map'), tripId: z.string().uuid(), day: z.number().int().min(1).max(90).optional() }),
  z.object({ kind: z.literal('group_decision'), tripId: z.string().uuid(), pollId: z.string().min(1).max(240).optional() }),
  z.object({ kind: z.literal('today'), tripId: z.string().uuid(), situation: z.enum(['closed', 'tired', 'raining', 'hungry', 'crowded', 'changed_mood']).optional() }),
  z.object({ kind: z.literal('inspiration_import'), importId: z.string().uuid() }),
]);
export type AssistantFocus = z.infer<typeof assistantFocusSchema>;

export const inspirationImportStatusSchema = z.enum([
  'queued',
  'uploading',
  'processing',
  'review',
  'completed',
  'failed',
  'expired',
]);
export const inspirationInputKindSchema = z.enum(['image', 'url', 'google_maps', 'article', 'social_link', 'place_file']);
export const inspirationItemStatusSchema = z.enum(['candidate', 'confirmed', 'dismissed', 'duplicate', 'invalid']);

export const inspirationItemSchema = z.object({
  id: z.string().uuid(),
  importId: z.string().uuid(),
  inputKind: inspirationInputKindSchema,
  title: z.string().min(1).max(240),
  summary: z.string().max(800).optional(),
  destinationName: z.string().max(160).optional(),
  destinationSlug: z.string().max(120).optional(),
  canonicalPlaceId: z.string().max(240).optional(),
  providerPlaceId: z.string().max(240).optional(),
  sourceUrl: z.string().url().optional(),
  category: z.string().max(80).optional(),
  confidence: z.number().min(0).max(1),
  status: inspirationItemStatusSchema,
  createdAt: z.string().datetime(),
});
export type InspirationItem = z.infer<typeof inspirationItemSchema>;

export const inspirationImportSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  tripId: z.string().uuid().optional(),
  status: inspirationImportStatusSchema,
  sourceCount: z.number().int().min(1).max(10),
  confirmedCount: z.number().int().nonnegative(),
  failureCode: z.string().max(80).optional(),
  items: z.array(inspirationItemSchema).max(50).default([]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});
export type InspirationImport = z.infer<typeof inspirationImportSchema>;

export const todaySituationSchema = z.enum(['closed', 'tired', 'raining', 'hungry', 'crowded', 'changed_mood']);
export type TodaySituation = z.infer<typeof todaySituationSchema>;

const todayPlaceSchema = z.object({
  itemId: z.string().min(1).max(240),
  placeId: z.string().min(1).max(240),
  title: z.string().min(1).max(240),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reservationSummary: z.string().max(400).optional(),
  routeMinutes: z.number().int().nonnegative().optional(),
});

export const todaySnapshotSchema = z.object({
  version: z.literal('v1'),
  tripId: z.string().uuid(),
  localDate: z.string().date(),
  timezone: z.string().min(1).max(100),
  current: todayPlaceSchema.optional(),
  next: todayPlaceSchema.optional(),
  leaveBy: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weather: z.object({
    summary: z.string().max(240),
    temperatureC: z.number().min(-80).max(70).optional(),
    precipitationChance: z.number().min(0).max(1).optional(),
    source: z.string().max(120),
  }).optional(),
  nearbySavedPlaceIds: z.array(z.string().min(1).max(240)).max(12),
  nearbySavedPlaces: z.array(z.object({
    placeId: z.string().min(1).max(240),
    title: z.string().min(1).max(240),
    distanceMeters: z.number().int().nonnegative().optional(),
    routeMinutes: z.number().int().nonnegative().optional(),
    source: z.enum(['itinerary', 'outing_catalog', 'google_places']),
  })).max(12).default([]),
  freeWindowItemIds: z.array(z.string().min(1).max(240)).max(12),
  generatedAt: z.string().datetime(),
  providerFreshness: z.enum(['live', 'recent', 'cached', 'stale', 'limited']),
  offline: z.boolean(),
});
export type TodaySnapshot = z.infer<typeof todaySnapshotSchema>;

export const todayAlternativeSchema = z.object({
  id: z.string().min(1).max(240),
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(600),
  situation: todaySituationSchema,
  source: z.string().min(1).max(120),
  confidence: z.number().min(0).max(1),
  reviewAction: z.object({
    type: z.literal('review_proposal'),
    value: z.string().min(1).max(1_000),
  }),
});
export type TodayAlternative = z.infer<typeof todayAlternativeSchema>;

export const tripAwarenessSettingsSchema = z.object({
  tripId: z.string().uuid(),
  ownerId: z.string().uuid(),
  enabled: z.boolean(),
  backgroundLocationEnabled: z.boolean(),
  itineraryRemindersEnabled: z.boolean(),
  consentedAt: z.string().datetime().optional(),
  monitoringEndsAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
});
export type TripAwarenessSettings = z.infer<typeof tripAwarenessSettingsSchema>;

export const tripVisitEventSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  ownerId: z.string().uuid(),
  itemId: z.string().max(240).optional(),
  placeId: z.string().max(240).optional(),
  event: z.enum(['arrived', 'departed', 'skipped', 'manually_visited']),
  occurredAt: z.string().datetime(),
  source: z.enum(['device_geofence', 'manual']),
});
export type TripVisitEvent = z.infer<typeof tripVisitEventSchema>;

export const notificationPreferencesSchema = z.object({
  discoveryDigestEnabled: z.boolean(),
  activeTripRemindersEnabled: z.boolean(),
  digestWeekday: z.number().int().min(0).max(6).default(3),
  digestLocalHour: z.number().int().min(0).max(23).default(18),
  quietHoursStart: z.number().int().min(0).max(23).default(21),
  quietHoursEnd: z.number().int().min(0).max(23).default(8),
  timezone: z.string().min(1).max(100),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
