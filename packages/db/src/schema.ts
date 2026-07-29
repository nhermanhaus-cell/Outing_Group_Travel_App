import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const tripVisibilityEnum = pgEnum('trip_visibility', [
  'private',
  'link_only',
  'friends',
  'public',
]);

export const tripMemberRoleEnum = pgEnum('trip_member_role', [
  'owner',
  'organizer',
  'member',
  'viewer',
]);

export const glamourLevelEnum = pgEnum('glamour_level', [
  'shoestring_slay',
  'cute_but_controlled',
  'comfortably_fabulous',
  'luxury_gaycation',
  'no_budget_just_vibes',
]);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  username: text('username').unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  preferences: jsonb('preferences').notNull().default({}),
  ...timestamps,
});

export const userPrivacySettings = pgTable('user_privacy_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  profileVisibility: text('profile_visibility').notNull().default('friends'),
  showPastTrips: boolean('show_past_trips').notNull().default(false),
  ...timestamps,
});

export const analyticsPolicy = pgTable('analytics_policy', {
  policyKey: text('policy_key').primaryKey().default('global'),
  semanticAnalyticsEnabled: boolean('semantic_analytics_enabled').notNull().default(true),
  personalizationEnabled: boolean('personalization_enabled').notNull().default(true),
  sessionReplayEnabled: boolean('session_replay_enabled').notNull().default(false),
  sessionReplaySampleRate: numeric('session_replay_sample_rate', {
    precision: 4,
    scale: 3,
  }).notNull().default('0.100'),
  policyVersion: text('policy_version').notNull().default('v1-global-default-on'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    eventId: uuid('event_id').primaryKey(),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    eventName: text('event_name').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    screenName: text('screen_name'),
    platform: text('platform').notNull(),
    appVersion: text('app_version'),
    properties: jsonb('properties').notNull().default({}),
    forwardAttempts: integer('forward_attempts').notNull().default(0),
    forwardedAt: timestamp('forwarded_at', { withTimezone: true }),
    lastForwardError: text('last_forward_error'),
  },
  (table) => [
    index('analytics_events_received_idx').on(table.receivedAt),
    index('analytics_events_name_idx').on(table.eventName, table.occurredAt),
    index('analytics_events_session_idx').on(table.sessionId, table.occurredAt),
  ],
);

export const userPreferenceSignals = pgTable(
  'user_preference_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type').notNull(),
    subjectKey: text('subject_key').notNull(),
    score: numeric('score', { precision: 6, scale: 5 }).notNull().default('0'),
    evidenceWeight: numeric('evidence_weight', { precision: 7, scale: 3 }).notNull().default('0'),
    confidence: numeric('confidence', { precision: 6, scale: 5 }).notNull().default('0'),
    lastSource: text('last_source').notNull(),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('user_preference_signals_subject_idx').on(
      table.userId,
      table.subjectType,
      table.subjectKey,
    ),
    index('user_preference_signals_user_idx').on(table.userId, table.lastObservedAt),
  ],
);

export const destinations = pgTable(
  'destinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    country: text('country').notNull(),
    countryCode: text('country_code').notNull(),
    lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
    timezone: text('timezone').notNull(),
    currency: text('currency').notNull(),
    editorialSummary: text('editorial_summary'),
    heroImageUrl: text('hero_image_url'),
    payload: jsonb('payload').notNull().default({}),
    published: boolean('published').notNull().default(true),
    dataFreshness: timestamp('data_freshness', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('destinations_slug_idx').on(t.slug)],
);

export const destinationSeasons = pgTable('destination_seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  month: integer('month').notNull(),
  score: integer('score').notNull().default(50),
  notes: text('notes'),
  ...timestamps,
});

export const destinationContext = pgTable('destination_context', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  dataLabel: text('data_label').notNull().default('editorial_demo'),
  ...timestamps,
});

export const destinationSources = pgTable('destination_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url'),
  accessedAt: timestamp('accessed_at', { withTimezone: true }),
  ...timestamps,
});

export const neighborhoods = pgTable('neighborhoods', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  summary: text('summary'),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
});

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  address: text('address'),
  lat: numeric('lat', { precision: 9, scale: 6 }),
  lng: numeric('lng', { precision: 9, scale: 6 }),
  summary: text('summary'),
  payload: jsonb('payload').notNull().default({}),
  published: boolean('published').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  category: text('category'),
  summary: text('summary'),
  payload: jsonb('payload').notNull().default({}),
  published: boolean('published').notNull().default(true),
  ...timestamps,
});

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => profiles.id),
  name: text('name').notNull(),
  destinationSlug: text('destination_slug'),
  visibility: tripVisibilityEnum('visibility').notNull().default('private'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  origin: text('origin'),
  travelerCount: integer('traveler_count').notNull().default(1),
  glamourLevel: glamourLevelEnum('glamour_level').default('comfortably_fabulous'),
  payload: jsonb('payload').notNull().default({}),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const tripMembers = pgTable(
  'trip_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: tripMemberRoleEnum('role').notNull().default('member'),
    ...timestamps,
  },
  (t) => [uniqueIndex('trip_members_unique').on(t.tripId, t.userId)],
);

export const tripInvites = pgTable('trip_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdBy: uuid('created_by').references(() => profiles.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  ...timestamps,
});

export const tripPreferences = pgTable('trip_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  preferences: jsonb('preferences').notNull().default({}),
  ...timestamps,
});

export const tripPolls = pgTable('trip_polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  pollType: text('poll_type').notNull().default('custom'),
  deadline: timestamp('deadline', { withTimezone: true }),
  anonymous: boolean('anonymous').notNull().default(false),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
});

export const tripPollOptions = pgTable('trip_poll_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id')
    .notNull()
    .references(() => tripPolls.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  payload: jsonb('payload').notNull().default({}),
});

export const tripVotes = pgTable(
  'trip_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => tripPolls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => tripPollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    rank: integer('rank'),
    ...timestamps,
  },
  (t) => [uniqueIndex('trip_votes_unique').on(t.pollId, t.userId, t.optionId)],
);

export const tripItineraryDays = pgTable('trip_itinerary_days', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  dayIndex: integer('day_index').notNull(),
  title: text('title'),
  ...timestamps,
});

export const tripItineraryItems = pgTable('trip_itinerary_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  dayId: uuid('day_id')
    .notNull()
    .references(() => tripItineraryDays.id, { onDelete: 'cascade' }),
  placeId: uuid('place_id').references(() => places.id),
  title: text('title').notNull(),
  category: text('category'),
  startsAt: text('starts_at'),
  durationMinutes: integer('duration_minutes'),
  estimatedCost: numeric('estimated_cost'),
  locked: boolean('locked').notNull().default(false),
  payload: jsonb('payload').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const tripPlanVersions = pgTable(
  'trip_plan_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    planId: text('plan_id').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    inputHash: text('input_hash').notNull(),
    plan: jsonb('plan').notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    isCurrent: boolean('is_current').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('trip_plan_versions_trip_revision_unique').on(t.tripId, t.revision),
    index('trip_plan_versions_current_idx').on(t.tripId, t.isCurrent, t.revision),
  ],
);

export const tripItemFeedback = pgTable(
  'trip_item_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    planId: text('plan_id'),
    itemId: text('item_id').notNull(),
    placeId: text('place_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
    reason: text('reason'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('trip_item_feedback_trip_item_user_unique').on(
      t.tripId,
      t.itemId,
      t.userId,
    ),
    index('trip_item_feedback_trip_idx').on(t.tripId, t.itemId),
  ],
);

export const tripSavedPlaces = pgTable(
  'trip_saved_places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id').references(() => places.id),
    label: text('label'),
    payload: jsonb('payload').notNull().default({}),
    ...timestamps,
  },
  (t) => [index('trip_saved_places_trip_idx').on(t.tripId)],
);

export const tripComments = pgTable('trip_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  body: text('body').notNull(),
  parentId: uuid('parent_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const tripActivity = pgTable('trip_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => profiles.id),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tripExternalLinks = pgTable('trip_external_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  url: text('url').notNull(),
  label: text('label'),
  ...timestamps,
});

export const tripBudgets = pgTable('trip_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  currency: text('currency').notNull().default('USD'),
  ...timestamps,
});

export const tripBudgetScenarios = pgTable('trip_budget_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetId: uuid('budget_id')
    .notNull()
    .references(() => tripBudgets.id, { onDelete: 'cascade' }),
  glamourLevel: glamourLevelEnum('glamour_level').notNull(),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
});

export const tripBudgetItems = pgTable('trip_budget_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  scenarioId: uuid('scenario_id')
    .notNull()
    .references(() => tripBudgetScenarios.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  amountLow: numeric('amount_low'),
  amountHigh: numeric('amount_high'),
  isLive: boolean('is_live').notNull().default(false),
  assumptions: text('assumptions'),
  ...timestamps,
});

export const communitySignalAggregates = pgTable('community_signal_aggregates', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
});

export const guides = pgTable('guides', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  authorId: uuid('author_id').references(() => profiles.id),
  published: boolean('published').notNull().default(false),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => profiles.id),
  ratings: jsonb('ratings').notNull().default({}),
  body: text('body'),
  published: boolean('published').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').references(() => profiles.id),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  ...timestamps,
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  preferences: jsonb('preferences').notNull().default({}),
  ...timestamps,
});
