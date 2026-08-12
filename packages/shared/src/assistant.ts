import { z } from 'zod';
import { assistantFocusSchema } from './fullExperience';

export const assistantScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('general') }),
  z.object({ kind: z.literal('destination'), destinationSlug: z.string().min(1).max(120) }),
  z.object({ kind: z.literal('trip'), tripId: z.string().uuid() }),
]);

export type AssistantScope = z.infer<typeof assistantScopeSchema>;

export const conversationVisibilitySchema = z.enum(['private', 'trip_shared']);
export type ConversationVisibility = z.infer<typeof conversationVisibilitySchema>;

export const assistantSourceSchema = z.object({
  id: z.string().min(1),
  provider: z.enum([
    'outing',
    'google_places',
    'ticketmaster',
    'open_meteo',
    'skyscanner',
    'viator',
    'mistral_web',
  ]),
  label: z.string().min(1).max(240),
  url: z.string().url().optional(),
  retrievedAt: z.string().datetime(),
});

export type AssistantSource = z.infer<typeof assistantSourceSchema>;

export const assistantPersonalizationContextSchema = z.object({
  version: z.literal('v1'),
  explicit: z.object({
    interests: z.array(z.string()).max(16),
    tripGoals: z.array(z.string()).max(12),
    vacationStyles: z.array(z.string()).max(12),
    preferredMonths: z.array(z.number().int().min(1).max(12)).max(12),
    departureAirports: z.array(z.string().regex(/^[A-Z]{3}$/)).max(6),
    homeCountryCodes: z.array(z.string().length(2)).max(6),
    preferredTravelRanges: z.array(z.string()).max(8),
    transportModes: z.array(z.string()).max(6),
    maxTravelTimeHours: z.number().positive().max(48).optional(),
    travelScope: z.enum(['domestic', 'international', 'either']).optional(),
    budgetLevel: z.string().optional(),
    tripLengthDays: z.number().int().min(1).max(90).optional(),
    groupSize: z.number().int().min(1).max(50).optional(),
    dayRhythm: z.string().optional(),
    activityPace: z.string().optional(),
    mealPreferences: z.array(z.string()).max(16),
    avoidances: z.array(z.string()).max(16),
    accessibilityNeeds: z.array(z.string()).max(16),
    lgbtqSafetyPriority: z.number().min(0).max(1).optional(),
    nightlifeImportance: z.number().min(0).max(1).optional(),
  }),
  inferred: z.array(z.object({
    subjectType: z.enum(['destination', 'destination_region', 'activity_category', 'pace', 'provider']),
    subjectKey: z.string().min(1).max(160),
    score: z.number().min(-1).max(1),
    confidence: z.number().min(0).max(1),
  })).max(30),
  savedDestinationSlugs: z.array(z.string()).max(30),
  trip: z.object({
    tripId: z.string().uuid(),
    destinationSlug: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    travelerCount: z.number().int().positive(),
    interests: z.array(z.string()).max(16),
    activityPace: z.string().optional(),
    groupPreferenceSummary: z.object({
      sharedInterests: z.array(z.string()).max(16),
      popularInterests: z.array(z.string()).max(16),
      pace: z.string().optional(),
      nightlifeImportance: z.number().min(0).max(1).optional(),
    }).optional(),
  }).optional(),
  explanationSignals: z.array(z.string().min(1).max(160)).max(8),
  contextFingerprint: z.string().min(8).max(128),
});

export type AssistantPersonalizationContext = z.infer<typeof assistantPersonalizationContextSchema>;

export const assistantRecommendationKindSchema = z.enum([
  'destination',
  'date_window',
  'place',
  'event',
  'experience',
  'itinerary_option',
]);

export const assistantRecommendationSchema = z.object({
  id: z.string().min(1).max(200),
  kind: assistantRecommendationKindSchema,
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(800),
  fitScore: z.number().min(0).max(100).optional(),
  fitReasons: z.array(z.string().min(1).max(240)).max(4),
  tradeoffs: z.array(z.string().min(1).max(240)).max(3),
  sourceIds: z.array(z.string()).max(12),
  confidence: z.number().min(0).max(1),
  destinationSlug: z.string().max(120).optional(),
  provisional: z.boolean().default(false),
  bookable: z.boolean().default(false),
  affiliateDisclosure: z.string().max(240).optional(),
  action: z.object({
    type: z.enum([
      'open_destination', 'ask_follow_up', 'review_proposal', 'open_url',
      'open_today', 'start_taste_deck', 'rework_day', 'review_import',
    ]),
    value: z.string().min(1).max(1000),
  }).optional(),
});

export type AssistantRecommendation = z.infer<typeof assistantRecommendationSchema>;

export const assistantDecisionActionSchema = z.object({
  type: z.enum([
    'open_destination',
    'open_compare',
    'open_trip',
    'ask_follow_up',
    'review_proposal',
    'apply_filters',
    'open_url',
    'open_today',
    'start_taste_deck',
    'rework_day',
    'review_import',
  ]),
  value: z.string().min(1).max(1_000),
  label: z.string().min(1).max(120),
});

export const assistantDecisionCardSchema = z.object({
  version: z.literal('v1'),
  id: z.string().min(1).max(200),
  kind: z.enum(['decision_brief', 'comparison', 'trip_audit', 'search_relaxation', 'group_brief']),
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(1_000),
  fitReasons: z.array(z.string().min(1).max(240)).max(4).default([]),
  tradeoffs: z.array(z.string().min(1).max(240)).max(4).default([]),
  sourceIds: z.array(z.string().min(1).max(240)).max(16).default([]),
  confidence: z.number().min(0).max(1),
  sourceFreshness: z.enum(['live', 'recent', 'cached', 'stale', 'limited']),
  generatedAt: z.string().datetime(),
  action: assistantDecisionActionSchema.optional(),
});

export type AssistantDecisionCard = z.infer<typeof assistantDecisionCardSchema>;

export const assistantComparisonSchema = z.object({
  version: z.literal('v1'),
  entityKind: z.enum(['destination', 'date_window', 'activity', 'neighborhood']),
  options: z.array(assistantRecommendationSchema).min(2).max(4),
  dimensions: z.array(z.object({
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    values: z.array(z.object({
      optionId: z.string().min(1).max(200),
      value: z.string().min(1).max(400),
      evidence: z.string().max(400).optional(),
      sourceIds: z.array(z.string().min(1).max(240)).max(8).default([]),
    })).min(2).max(4),
  })).min(1).max(12),
  recommendation: z.string().min(1).max(800),
  tradeoffs: z.array(z.string().min(1).max(240)).max(6).default([]),
  sourceIds: z.array(z.string().min(1).max(240)).max(20).default([]),
  confidence: z.number().min(0).max(1),
  generatedAt: z.string().datetime(),
});

export type AssistantComparison = z.infer<typeof assistantComparisonSchema>;

export const assistantAuditIssueSchema = z.object({
  id: z.string().min(1).max(200),
  severity: z.enum(['info', 'warning', 'blocking']),
  category: z.enum([
    'route', 'hours', 'weather', 'budget', 'pace', 'avoidance', 'accessibility',
    'repetition', 'reservation', 'group_conflict', 'data_freshness',
  ]),
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(800),
  dayId: z.string().max(120).optional(),
  itemId: z.string().max(120).optional(),
  sourceIds: z.array(z.string().min(1).max(240)).max(8).default([]),
  suggestedAction: assistantDecisionActionSchema.optional(),
});

export type AssistantAuditIssue = z.infer<typeof assistantAuditIssueSchema>;

export const assistantTripAuditSchema = z.object({
  version: z.literal('v1'),
  tripId: z.string().uuid(),
  score: z.number().min(0).max(100),
  summary: z.string().min(1).max(800),
  issues: z.array(assistantAuditIssueSchema).max(20),
  sourceIds: z.array(z.string().min(1).max(240)).max(20).default([]),
  generatedAt: z.string().datetime(),
});

export type AssistantTripAudit = z.infer<typeof assistantTripAuditSchema>;

export const assistantConstraintRelaxationSchema = z.object({
  id: z.string().min(1).max(160),
  dimension: z.enum(['dates', 'nearby_destination', 'budget', 'duration', 'transport']),
  title: z.string().min(1).max(240),
  explanation: z.string().min(1).max(600),
  originalValue: z.string().max(240).optional(),
  proposedValue: z.string().min(1).max(240),
  resultCount: z.number().int().nonnegative(),
  requiresConsent: z.literal(true),
});

export type AssistantConstraintRelaxation = z.infer<typeof assistantConstraintRelaxationSchema>;

export const assistantSearchIntentSchema = z.object({
  query: z.string().trim().min(2).max(400),
  interests: z.array(z.string().min(1).max(80)).max(12).default([]),
  month: z.number().int().min(1).max(12).optional(),
  budgetLevel: z.string().max(80).optional(),
  climate: z.enum(['warm', 'cool', 'mild', 'any']).optional(),
  destinationHint: z.string().max(160).optional(),
  hardConstraints: z.array(z.string().min(1).max(160)).max(12).default([]),
});

export type AssistantSearchIntent = z.infer<typeof assistantSearchIntentSchema>;

export const assistantInsightIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('screen') }),
  z.object({
    kind: z.literal('compare'),
    entityKind: z.enum(['destination', 'date_window', 'activity', 'neighborhood']),
    optionIds: z.array(z.string().min(1).max(200)).min(2).max(4),
  }),
  z.object({ kind: z.literal('search'), search: assistantSearchIntentSchema }),
  z.object({ kind: z.literal('audit') }),
  z.object({ kind: z.literal('group') }),
]);

export type AssistantInsightIntent = z.infer<typeof assistantInsightIntentSchema>;

export const assistantInsightSchema = z.object({
  id: z.string().uuid(),
  surface: z.enum(['home', 'destination', 'trip', 'ask']),
  kind: z.enum([
    'destination_matches', 'timing', 'trip_decision', 'activity_options', 'starter_prompts',
    'decision_brief', 'comparison', 'trip_audit', 'search_relaxation', 'group_brief',
  ]),
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(800),
  recommendations: z.array(assistantRecommendationSchema).max(6),
  prompts: z.array(z.string().min(1).max(240)).max(6).default([]),
  decisionCard: assistantDecisionCardSchema.optional(),
  comparison: assistantComparisonSchema.optional(),
  audit: assistantTripAuditSchema.optional(),
  relaxations: z.array(assistantConstraintRelaxationSchema).max(6).default([]),
  contextFingerprint: z.string().min(8).max(128),
  generatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type AssistantInsight = z.infer<typeof assistantInsightSchema>;

export const assistantInsightRequestSchema = z.object({
  surface: z.enum(['home', 'destination', 'trip', 'ask']),
  destinationSlug: z.string().max(120).optional(),
  tripId: z.string().uuid().optional(),
  trigger: z.enum([
    'screen',
    'quiz_completed',
    'profile_changed',
    'destination_saved',
    'trip_changed',
    'feedback_submitted',
    'vote_resolved',
    'manual_refresh',
  ]).default('screen'),
  intent: assistantInsightIntentSchema.default({ kind: 'screen' }),
  force: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.surface === 'destination' && !value.destinationSlug) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destinationSlug'], message: 'Destination insights require a destination.' });
  }
  if (value.surface === 'trip' && !value.tripId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tripId'], message: 'Trip insights require a trip.' });
  }
  if ((value.intent.kind === 'audit' || value.intent.kind === 'group') && !value.tripId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['intent'], message: 'Trip decision intelligence requires a trip.' });
  }
});

export type AssistantInsightRequest = z.input<typeof assistantInsightRequestSchema>;

export const assistantConversationSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  scope: assistantScopeSchema,
  visibility: conversationVisibilitySchema,
  updatedAt: z.string().datetime(),
});

export type AssistantConversationSummary = z.infer<typeof assistantConversationSummarySchema>;

export const destinationCandidateSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  canonicalPlaceId: z.string().min(1).max(240),
  name: z.string().min(1).max(160),
  country: z.string().min(1).max(160),
  countryCode: z.string().length(2).optional(),
  status: z.enum(['researching', 'provisional', 'in_review', 'published', 'rejected', 'stale']),
  summary: z.string().max(1200).optional(),
  sources: z.array(assistantSourceSchema).max(24),
  demandCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  researchedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  generationStatus: z.enum(['queued', 'generating', 'ready', 'failed']).default('ready'),
  generationStage: z.enum([
    'identity',
    'places',
    'experiences',
    'timing',
    'context',
    'finalizing',
    'complete',
  ]).default('complete'),
  completedSections: z.array(z.string().min(1).max(80)).max(24).default([]),
  generationVersion: z.string().min(1).max(40).default('legacy'),
  isDiscoverable: z.boolean().default(false),
  lastGeneratedAt: z.string().datetime().optional(),
  refreshAfter: z.string().datetime().optional(),
  failureCategory: z.string().min(1).max(80).optional(),
  publishedDestinationSlug: z.string().min(1).max(120).optional(),
  payload: z.object({
    editorialSummary: z.string().max(2_400).optional(),
    heroImageUrl: z.string().url().optional(),
    heroImageAttribution: z.string().max(240).optional(),
    heroImageSourceUrl: z.string().url().optional(),
    galleryImageUrls: z.array(z.string().url()).max(8).default([]),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    timezone: z.string().max(100).optional(),
    currency: z.string().max(8).optional(),
    bestMonths: z.array(z.number().int().min(1).max(12)).max(12).default([]),
    interests: z.array(z.string().min(1).max(80)).max(16).default([]),
    neighborhoods: z.array(z.object({
      name: z.string().min(1).max(160),
      summary: z.string().min(1).max(600),
    })).max(8).default([]),
    places: z.array(z.object({
      id: z.string().min(1).max(240),
      name: z.string().min(1).max(200),
      category: z.string().min(1).max(80),
      summary: z.string().max(600).optional(),
      rating: z.number().min(0).max(5).optional(),
      address: z.string().max(300).optional(),
      imageUrl: z.string().url().optional(),
      sourceUrl: z.string().url().optional(),
    })).max(16).default([]),
    events: z.array(z.object({
      id: z.string().min(1).max(240),
      name: z.string().min(1).max(240),
      startDate: z.string().optional(),
      venueName: z.string().max(240).optional(),
      imageUrl: z.string().url().optional(),
      sourceUrl: z.string().url().optional(),
    })).max(12).default([]),
    experiences: z.array(z.object({
      id: z.string().min(1).max(240),
      title: z.string().min(1).max(240),
      summary: z.string().max(600).optional(),
      imageUrl: z.string().url().optional(),
      priceFrom: z.number().nonnegative().optional(),
      currency: z.string().max(8).optional(),
      sourceUrl: z.string().url().optional(),
    })).max(12).default([]),
    practical: z.object({
      gettingAround: z.string().max(800).optional(),
      typicalStay: z.string().max(240).optional(),
      costContext: z.string().max(600).optional(),
    }).default({}),
    verification: z.record(z.enum(['verified', 'limited', 'not_verified'])).default({}),
  }).optional(),
});

export type DestinationCandidate = z.infer<typeof destinationCandidateSchema>;

export const destinationIdentitySchema = z.object({
  canonicalPlaceId: z.string().min(1).max(240),
  name: z.string().min(1).max(160),
  country: z.string().min(1).max(160),
  countryCode: z.string().length(2).optional(),
  formattedAddress: z.string().max(300).optional(),
  existingCandidateId: z.string().uuid().optional(),
  existingDestinationSlug: z.string().max(120).optional(),
});

export type DestinationIdentity = z.infer<typeof destinationIdentitySchema>;

export const destinationDiscoveryRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lookup'), query: z.string().trim().min(2).max(120), installationId: z.string().min(8).max(120).optional() }),
  z.object({ action: z.literal('claim'), canonicalPlaceId: z.string().min(1).max(240), originalQuery: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal('get'), candidateId: z.string().uuid() }),
  z.object({ action: z.literal('generate'), candidateId: z.string().uuid() }),
  z.object({ action: z.literal('refresh'), candidateId: z.string().uuid() }),
]);

export type DestinationDiscoveryRequest = z.infer<typeof destinationDiscoveryRequestSchema>;

export const destinationDiscoveryResponseSchema = z.object({
  matches: z.array(destinationIdentitySchema).max(5).optional(),
  candidate: destinationCandidateSchema.optional(),
  publishedDestinationSlug: z.string().max(120).optional(),
  reused: z.boolean().optional(),
});

export type DestinationDiscoveryResponse = z.infer<typeof destinationDiscoveryResponseSchema>;

export const proposalKindSchema = z.enum([
  'add_itinerary_item',
  'replace_itinerary_item',
  'remove_itinerary_item',
  'change_dates',
  'save_destination',
]);

export type AssistantProposalKind = z.infer<typeof proposalKindSchema>;

export const assistantProposalPayloadSchema = z.object({
  dayId: z.string().max(120).optional(),
  itemId: z.string().max(120).optional(),
  title: z.string().max(240).optional(),
  placeId: z.string().max(240).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  destinationSlug: z.string().max(120).optional(),
  notes: z.string().max(800).optional(),
}).strict();

export type AssistantProposalPayload = z.infer<typeof assistantProposalPayloadSchema>;

export const assistantProposalSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  tripId: z.string().uuid().nullable(),
  kind: proposalKindSchema,
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(800),
  payload: assistantProposalPayloadSchema,
  status: z.enum(['proposed', 'polling', 'applied', 'dismissed']),
  sources: z.array(assistantSourceSchema).max(12),
  createdAt: z.string().datetime(),
});

export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

export const assistantStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), conversationId: z.string().uuid(), messageId: z.string().uuid() }),
  z.object({ type: z.literal('status'), message: z.string().min(1).max(160) }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('sources'), sources: z.array(assistantSourceSchema) }),
  z.object({ type: z.literal('recommendations'), recommendations: z.array(assistantRecommendationSchema).max(8) }),
  z.object({ type: z.literal('decision'), card: assistantDecisionCardSchema }),
  z.object({ type: z.literal('comparison'), comparison: assistantComparisonSchema }),
  z.object({ type: z.literal('audit'), audit: assistantTripAuditSchema }),
  z.object({ type: z.literal('relaxations'), relaxations: z.array(assistantConstraintRelaxationSchema).max(6) }),
  z.object({ type: z.literal('insight'), insight: assistantInsightSchema }),
  z.object({ type: z.literal('provisional_destination'), destination: destinationCandidateSchema }),
  z.object({ type: z.literal('proposal'), proposal: assistantProposalSchema }),
  z.object({ type: z.literal('done'), durationMs: z.number().nonnegative() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);

export type AssistantStreamEvent = z.infer<typeof assistantStreamEventSchema>;

export const assistantRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  scope: assistantScopeSchema,
  visibility: conversationVisibilitySchema,
  message: z.string().trim().min(1).max(4_000),
  evaluationProvider: z.enum(['mistral', 'qwen']).optional(),
  agentRollout: z.boolean().optional(),
  globalDiscoveryRollout: z.boolean().optional(),
  /** IDs and action only. The Edge Function derives and redacts all entity context. */
  focus: assistantFocusSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.visibility === 'trip_shared' && value.scope.kind !== 'trip') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['visibility'],
      message: 'Shared conversations must belong to a trip.',
    });
  }
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export interface ProposalVote {
  userId: string;
  choice: 'accept' | 'dismiss';
}

export interface ProposalDecision {
  result: 'accepted' | 'dismissed' | 'pending' | 'tie';
  accepts: number;
  dismisses: number;
  remaining: number;
}

export function decideProposalVote(input: {
  memberIds: string[];
  votes: ProposalVote[];
  organizerChoice?: 'accept' | 'dismiss';
}): ProposalDecision {
  const members = new Set(input.memberIds);
  const latest = new Map<string, ProposalVote['choice']>();
  for (const vote of input.votes) {
    if (members.has(vote.userId)) latest.set(vote.userId, vote.choice);
  }
  const accepts = [...latest.values()].filter((choice) => choice === 'accept').length;
  const dismisses = [...latest.values()].filter((choice) => choice === 'dismiss').length;
  const remaining = Math.max(0, members.size - latest.size);
  const majority = Math.floor(members.size / 2) + 1;

  if (accepts >= majority) return { result: 'accepted', accepts, dismisses, remaining };
  if (dismisses >= majority) return { result: 'dismissed', accepts, dismisses, remaining };
  if (remaining > 0) return { result: 'pending', accepts, dismisses, remaining };
  if (accepts === dismisses) {
    return {
      result: input.organizerChoice
        ? input.organizerChoice === 'accept' ? 'accepted' : 'dismissed'
        : 'tie',
      accepts,
      dismisses,
      remaining,
    };
  }
  return { result: accepts > dismisses ? 'accepted' : 'dismissed', accepts, dismisses, remaining };
}

export function canAccessAssistantConversation(input: {
  userId: string;
  ownerId: string;
  visibility: ConversationVisibility;
  isTripMember: boolean;
}): boolean {
  return input.userId === input.ownerId ||
    (input.visibility === 'trip_shared' && input.isTripMember);
}
