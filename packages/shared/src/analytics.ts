import { z } from 'zod';
import { ANALYTICS_EVENTS, type AnalyticsEventName } from './constants';

export const ANALYTICS_SCHEMA_VERSION = 1;

export type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsPrimitive>;

export interface AnalyticsEventPropertyMap {
  [ANALYTICS_EVENTS.APP_SESSION_STARTED]: { launchType?: string };
  [ANALYTICS_EVENTS.APP_SESSION_ENDED]: { activeDurationMs?: number; exitReason?: string };
  [ANALYTICS_EVENTS.SCREEN_VIEW_STARTED]: {
    screenName: string;
    previousScreen?: string;
    entryPoint?: string;
  };
  [ANALYTICS_EVENTS.SCREEN_VIEW_ENDED]: {
    screenName: string;
    nextScreen?: string;
    activeDurationMs: number;
    idleDurationMs: number;
    exitReason: string;
  };
  [ANALYTICS_EVENTS.DEEP_LINK_OPENED]: { route: string };
  [ANALYTICS_EVENTS.DESTINATION_IMPRESSION]: {
    destinationSlug?: string;
    source: string;
    rank?: number;
  };
  [ANALYTICS_EVENTS.DESTINATION_VIEWED]: {
    destinationSlug?: string;
    source?: string;
    catalogCohort?: string;
    advisoryLevel?: string;
  };
  [ANALYTICS_EVENTS.DESTINATION_ADVISORY_OPENED]: {
    destinationSlug: string;
    advisoryLevel: string;
  };
  [ANALYTICS_EVENTS.DESTINATION_SAVED]: {
    destinationSlug?: string;
    saved: boolean;
    source?: string;
  };
  [ANALYTICS_EVENTS.COLLECTION_VIEWED]: { collectionId: string; source?: string };
  [ANALYTICS_EVENTS.RECOMMENDATION_GENERATED]: {
    recommendationType: string;
    resultCount?: number;
    algorithmVersion?: string;
  };
  [ANALYTICS_EVENTS.RECOMMENDATION_DISMISSED]: {
    recommendationType: string;
    category?: string;
    reasonCode?: string;
  };
  [ANALYTICS_EVENTS.ASSISTANT_INSIGHT_VIEWED]: {
    surface: string;
    insightKind: string;
    resultCountBucket: string;
  };
  [ANALYTICS_EVENTS.ASSISTANT_RECOMMENDATION_SELECTED]: {
    recommendationKind: string;
    sourceProvider: string;
    fitScoreBucket?: string;
    provisional: boolean;
    bookable: boolean;
  };
  [ANALYTICS_EVENTS.ASSISTANT_DECISION_VIEWED]: {
    surface: string;
    decisionKind: string;
    freshness: string;
    confidenceBucket: string;
  };
  [ANALYTICS_EVENTS.ASSISTANT_DECISION_ACTIONED]: {
    surface: string;
    decisionKind: string;
    actionType: string;
  };
  [ANALYTICS_EVENTS.ASSISTANT_COMPARISON_COMPLETED]: {
    entityKind: string;
    optionCount: number;
  };
  [ANALYTICS_EVENTS.ASSISTANT_AUDIT_VIEWED]: {
    scoreBucket: string;
    issueCountBucket: string;
    blockingIssue: boolean;
  };
  [ANALYTICS_EVENTS.ASSISTANT_RELAXATION_SELECTED]: {
    dimension: string;
    resultCountBucket: string;
  };
  [ANALYTICS_EVENTS.DESTINATION_CANDIDATE_VIEWED]: {
    candidateStatus: string;
    sourceCountBucket: string;
  };
  [ANALYTICS_EVENTS.DESTINATION_GENERATION_LIFECYCLE]: {
    status: string;
    stage?: string;
    entryPoint?: string;
    reused?: boolean;
    resultCountBucket?: string;
    latencyBucket?: string;
    errorCategory?: string;
  };
  [ANALYTICS_EVENTS.QUESTIONNAIRE_STARTED]: {
    entryPoint?: string;
    destinationPrefilled: boolean;
  };
  [ANALYTICS_EVENTS.QUESTIONNAIRE_STEP_VIEWED]: { stepId: string; stepIndex: number };
  [ANALYTICS_EVENTS.QUESTIONNAIRE_STEP_COMPLETED]: {
    stepId: string;
    stepIndex: number;
    selectionCount?: number;
    skipped?: boolean;
  };
  [ANALYTICS_EVENTS.QUESTIONNAIRE_COMPLETED]: {
    stepCount: number;
    activeDurationMs?: number;
    destinationPrefilled: boolean;
  };
  [ANALYTICS_EVENTS.QUESTIONNAIRE_ABANDONED]: {
    stepId: string;
    stepIndex: number;
    activeDurationMs?: number;
  };
  [ANALYTICS_EVENTS.TRIP_CREATION_PATH_SELECTED]: {
    path: 'recommendations' | 'manual';
    entryPoint?: string;
  };
  [ANALYTICS_EVENTS.TRIP_CREATED]: {
    creationPath: string;
    groupType: string;
    travelerCountBucket: string;
    durationBucket?: string;
    destinationPrefilled: boolean;
  };
  [ANALYTICS_EVENTS.TRIP_PUBLISHED]: { visibility?: string };
  [ANALYTICS_EVENTS.TRIP_SHARED]: { channel?: string };
  [ANALYTICS_EVENTS.ITINERARY_GENERATED]: {
    itemCount: number;
    dayCount: number;
    algorithmVersion?: string;
  };
  [ANALYTICS_EVENTS.ITINERARY_REGENERATED]: {
    itemCount: number;
    dayCount: number;
    reasonCode?: string;
  };
  [ANALYTICS_EVENTS.ITINERARY_ITEM_ADDED]: {
    category?: string;
    source?: string;
    attendance?: string;
  };
  [ANALYTICS_EVENTS.ITINERARY_ITEM_REMOVED]: {
    category?: string;
    source?: string;
    attendance?: string;
  };
  [ANALYTICS_EVENTS.ITINERARY_ITEM_MOVED]: { category?: string; dayDelta?: number };
  [ANALYTICS_EVENTS.ITINERARY_ITEM_LOCKED]: {
    category?: string;
    locked: boolean;
  };
  [ANALYTICS_EVENTS.ITINERARY_FEEDBACK_SUBMITTED]: {
    category?: string;
    reaction: string;
    reasonCode?: string;
  };
  [ANALYTICS_EVENTS.ACTIVITY_CANDIDATE_RATED]: {
    category: string;
    choice: string;
    source: string;
  };
  [ANALYTICS_EVENTS.ACTIVITY_DECK_COMPLETED]: {
    ratedCount: number;
    candidateCount: number;
    groupSize: number;
  };
  [ANALYTICS_EVENTS.FREE_WINDOW_SUGGESTION_VIEWED]: {
    category?: string;
    attendance: string;
  };
  [ANALYTICS_EVENTS.FREE_WINDOW_SUGGESTION_ACCEPTED]: {
    category?: string;
    attendance: string;
  };
  [ANALYTICS_EVENTS.TRIP_SECTION_VIEWED]: { section: string };
  [ANALYTICS_EVENTS.POLL_CREATED]: { optionCount: number };
  [ANALYTICS_EVENTS.POLL_VOTE_SUBMITTED]: { optionCount: number; changedVote: boolean };
  [ANALYTICS_EVENTS.BUDGET_ESTIMATED]: { budgetBand?: string; travelerCountBucket?: string };
  [ANALYTICS_EVENTS.PULSE_VIEWED]: { destinationSlug?: string };
  [ANALYTICS_EVENTS.INVITE_SENT]: { channel?: string };
  [ANALYTICS_EVENTS.INVITE_ACCEPTED]: { source?: string };
  [ANALYTICS_EVENTS.VENUE_CHECKIN]: { category?: string };
  [ANALYTICS_EVENTS.VENUE_REVIEWED]: { category?: string; rating?: number };
  [ANALYTICS_EVENTS.PRIDE_EVENT_RSVP]: { source?: string };
  [ANALYTICS_EVENTS.PROFILE_VISIBILITY_CHANGED]: { visibility: string };
  [ANALYTICS_EVENTS.SEARCH_PERFORMED]: {
    searchContext: string;
    queryLengthBucket: string;
    resultCountBucket?: string;
  };
  [ANALYTICS_EVENTS.FILTER_APPLIED]: { filterName: string; valueCategory?: string };
  [ANALYTICS_EVENTS.EXTERNAL_LINK_OPENED]: {
    linkType: string;
    provider?: string;
    sourceScreen?: string;
  };
  [ANALYTICS_EVENTS.AFFILIATE_OFFER_IMPRESSION]: {
    provider: string;
    productCategory: string;
    rank?: number;
    priceBand?: string;
  };
  [ANALYTICS_EVENTS.AFFILIATE_CLICKED]: {
    provider: string;
    productCategory: string;
    rank?: number;
    priceBand?: string;
  };
  [ANALYTICS_EVENTS.BOOKING_HANDOFF]: {
    provider: string;
    productCategory: string;
    priceBand?: string;
  };
  [ANALYTICS_EVENTS.PROVIDER_REQUEST_COMPLETED]: {
    provider: string;
    operation: string;
    status: 'success' | 'failure';
    latencyBucket: string;
    resultCountBucket?: string;
  };
  [ANALYTICS_EVENTS.OPERATION_FAILED]: {
    operation: string;
    errorCategory: string;
    sourceScreen?: string;
  };
}

export type AnalyticsPropertiesFor<N extends AnalyticsEventName> =
  AnalyticsEventPropertyMap[N] & AnalyticsProperties;

export interface AnalyticsEventEnvelope<N extends AnalyticsEventName = AnalyticsEventName> {
  eventId: string;
  eventName: N;
  schemaVersion: number;
  occurredAt: string;
  subjectId: string;
  sessionId: string;
  screenName?: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  appVersion?: string;
  properties: AnalyticsEventPropertyMap[N];
}

export interface AnalyticsBatchRequest {
  events: AnalyticsEventEnvelope[];
}

export interface AnalyticsEventRejection {
  eventId?: string;
  reason: string;
}

export interface AnalyticsBatchResponse {
  acceptedEventIds: string[];
  rejected: AnalyticsEventRejection[];
  policy?: AnalyticsPolicy;
}

export interface AnalyticsPolicy {
  semanticAnalyticsEnabled: boolean;
  personalizationEnabled: boolean;
  sessionReplayEnabled: boolean;
  sessionReplaySampleRate: number;
  policyVersion: string;
}

export type PreferenceSubjectType =
  | 'destination'
  | 'destination_region'
  | 'activity_category'
  | 'pace'
  | 'provider';

export type PreferenceSignalSource =
  | 'passive_view'
  | 'save'
  | 'accept'
  | 'affiliate_handoff'
  | 'like'
  | 'dislike'
  | 'veto'
  | 'dismiss'
  | 'remove'
  | 'activity_deck';

export interface PreferenceObservation {
  subjectType: PreferenceSubjectType;
  subjectKey: string;
  value: number;
  weight: number;
  source: PreferenceSignalSource;
  observedAt: string;
}

export interface PreferenceAggregate {
  subjectType: PreferenceSubjectType;
  subjectKey: string;
  score: number;
  evidenceWeight: number;
  confidence: number;
  lastObservedAt: string;
  lastSource: PreferenceSignalSource;
}

const analyticsPrimitiveSchema = z.union([
  z.string().max(120),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const AnalyticsEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.enum(Object.values(ANALYTICS_EVENTS) as [AnalyticsEventName, ...AnalyticsEventName[]]),
  schemaVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  subjectId: z.string().uuid(),
  sessionId: z.string().uuid(),
  screenName: z.string().max(120).optional(),
  platform: z.enum(['ios', 'android', 'web', 'unknown']),
  appVersion: z.string().max(40).optional(),
  properties: z.record(analyticsPrimitiveSchema),
});

export const AnalyticsBatchRequestSchema = z.object({
  events: z.array(AnalyticsEventEnvelopeSchema).min(1).max(25),
});

const COMMON_PROPERTY_KEYS = new Set([
  'source',
  'sourceScreen',
  'entryPoint',
]);

const PROPERTY_KEYS: Record<AnalyticsEventName, ReadonlySet<string>> = {
  app_session_started: new Set(['launchType']),
  app_session_ended: new Set(['activeDurationMs', 'exitReason']),
  screen_view_started: new Set(['screenName', 'previousScreen', 'entryPoint']),
  screen_view_ended: new Set([
    'screenName',
    'nextScreen',
    'activeDurationMs',
    'idleDurationMs',
    'exitReason',
  ]),
  deep_link_opened: new Set(['route']),
  destination_impression: new Set(['destinationSlug', 'source', 'rank']),
  destination_viewed: new Set(['destinationSlug', 'source', 'catalogCohort', 'advisoryLevel']),
  destination_advisory_opened: new Set(['destinationSlug', 'advisoryLevel']),
  destination_saved: new Set(['destinationSlug', 'saved', 'source']),
  collection_viewed: new Set(['collectionId', 'source']),
  recommendation_generated: new Set(['recommendationType', 'resultCount', 'algorithmVersion']),
  recommendation_dismissed: new Set(['recommendationType', 'category', 'reasonCode']),
  assistant_insight_viewed: new Set(['surface', 'insightKind', 'resultCountBucket']),
  assistant_recommendation_selected: new Set([
    'recommendationKind',
    'sourceProvider',
    'fitScoreBucket',
    'provisional',
    'bookable',
  ]),
  assistant_decision_viewed: new Set(['surface', 'decisionKind', 'freshness', 'confidenceBucket']),
  assistant_decision_actioned: new Set(['surface', 'decisionKind', 'actionType']),
  assistant_comparison_completed: new Set(['entityKind', 'optionCount']),
  assistant_audit_viewed: new Set(['scoreBucket', 'issueCountBucket', 'blockingIssue']),
  assistant_relaxation_selected: new Set(['dimension', 'resultCountBucket']),
  destination_candidate_viewed: new Set(['candidateStatus', 'sourceCountBucket']),
  destination_generation_lifecycle: new Set(['status', 'stage', 'entryPoint', 'reused', 'resultCountBucket', 'latencyBucket', 'errorCategory']),
  questionnaire_started: new Set(['entryPoint', 'destinationPrefilled']),
  questionnaire_step_viewed: new Set(['stepId', 'stepIndex']),
  questionnaire_step_completed: new Set(['stepId', 'stepIndex', 'selectionCount', 'skipped']),
  questionnaire_completed: new Set(['stepCount', 'activeDurationMs', 'destinationPrefilled']),
  questionnaire_abandoned: new Set(['stepId', 'stepIndex', 'activeDurationMs']),
  trip_creation_path_selected: new Set(['path', 'entryPoint']),
  trip_created: new Set([
    'creationPath',
    'groupType',
    'travelerCountBucket',
    'durationBucket',
    'destinationPrefilled',
  ]),
  trip_published: new Set(['visibility']),
  trip_shared: new Set(['channel']),
  itinerary_generated: new Set(['itemCount', 'dayCount', 'algorithmVersion']),
  itinerary_regenerated: new Set(['itemCount', 'dayCount', 'reasonCode']),
  itinerary_item_added: new Set(['category', 'source', 'attendance']),
  itinerary_item_removed: new Set(['category', 'source', 'attendance']),
  itinerary_item_moved: new Set(['category', 'dayDelta']),
  itinerary_item_locked: new Set(['category', 'locked']),
  itinerary_feedback_submitted: new Set(['category', 'reaction', 'reasonCode']),
  activity_candidate_rated: new Set(['category', 'choice', 'source']),
  activity_deck_completed: new Set(['ratedCount', 'candidateCount', 'groupSize']),
  free_window_suggestion_viewed: new Set(['category', 'attendance']),
  free_window_suggestion_accepted: new Set(['category', 'attendance']),
  trip_section_viewed: new Set(['section']),
  poll_created: new Set(['optionCount']),
  poll_vote_submitted: new Set(['optionCount', 'changedVote']),
  budget_estimated: new Set(['budgetBand', 'travelerCountBucket']),
  pulse_viewed: new Set(['destinationSlug']),
  invite_sent: new Set(['channel']),
  invite_accepted: new Set(['source']),
  venue_checkin: new Set(['category']),
  venue_reviewed: new Set(['category', 'rating']),
  pride_event_rsvp: new Set(['source']),
  profile_visibility_changed: new Set(['visibility']),
  search_performed: new Set(['searchContext', 'queryLengthBucket', 'resultCountBucket']),
  filter_applied: new Set(['filterName', 'valueCategory']),
  external_link_opened: new Set(['linkType', 'provider', 'sourceScreen']),
  affiliate_offer_impression: new Set(['provider', 'productCategory', 'rank', 'priceBand']),
  affiliate_clicked: new Set(['provider', 'productCategory', 'rank', 'priceBand']),
  booking_handoff: new Set(['provider', 'productCategory', 'priceBand']),
  provider_request_completed: new Set([
    'provider',
    'operation',
    'status',
    'latencyBucket',
    'resultCountBucket',
  ]),
  operation_failed: new Set(['operation', 'errorCategory', 'sourceScreen']),
};

export function sanitizeAnalyticsProperties(
  eventName: AnalyticsEventName,
  properties: Record<string, unknown>,
): AnalyticsProperties {
  const allowed = PROPERTY_KEYS[eventName];
  const sanitized: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key) && !COMMON_PROPERTY_KEYS.has(key)) continue;
    const parsed = analyticsPrimitiveSchema.safeParse(value);
    if (!parsed.success) continue;
    sanitized[key] = typeof parsed.data === 'string' ? parsed.data.trim() : parsed.data;
  }
  return sanitized;
}

export function normalizeAnalyticsRoute(pathname: string): string {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'destinations' && segments[1] === 'provisional' && segments[2]) return '/destinations/provisional/[id]';
  if (segments[0] === 'destinations' && segments[1]) return '/destinations/[slug]';
  if (segments[0] === 'collections' && segments[1]) return '/collections/[id]';
  if (segments[0] === 'experiences' && segments[1]) return '/experiences/[productCode]';
  if (segments[0] === 'trips' && segments[1] && segments[1] !== 'new') {
    if (segments[2] === 'invite') return '/trips/[tripId]/invite';
    if (segments[2] === 'ask') return '/trips/[tripId]/ask';
    if (segments[2] === 'today') return '/trips/[tripId]/today';
    return '/trips/[tripId]';
  }
  if (segments[0] === 'share' && segments[1]) return '/share/[tripId]';
  if (segments[0] === 'inspiration' && segments[1]) return '/inspiration/[importId]';
  return path;
}

export function applyPreferenceObservation(
  current: PreferenceAggregate | undefined,
  observation: PreferenceObservation,
): PreferenceAggregate {
  const weight = Math.max(0, Math.min(2, observation.weight));
  const value = Math.max(-1, Math.min(1, observation.value));
  const existingWeight = Math.max(0, Math.min(20, current?.evidenceWeight ?? 0));
  const totalForAverage = existingWeight + weight;
  const score = totalForAverage === 0
    ? 0
    : (((current?.score ?? 0) * existingWeight) + (value * weight)) / totalForAverage;
  const evidenceWeight = Math.min(20, totalForAverage);
  return {
    subjectType: observation.subjectType,
    subjectKey: observation.subjectKey,
    score: Math.max(-1, Math.min(1, score)),
    evidenceWeight,
    confidence: Math.min(1, evidenceWeight / 5),
    lastObservedAt: observation.observedAt,
    lastSource: observation.source,
  };
}

export function bucketCount(value: number): string {
  if (value <= 0) return '0';
  if (value === 1) return '1';
  if (value <= 3) return '2-3';
  if (value <= 6) return '4-6';
  if (value <= 10) return '7-10';
  return '11+';
}

export function bucketDurationDays(value: number): string {
  if (value <= 2) return '1-2';
  if (value <= 4) return '3-4';
  if (value <= 7) return '5-7';
  if (value <= 14) return '8-14';
  return '15+';
}

export function bucketQueryLength(value: number): string {
  if (value <= 0) return '0';
  if (value <= 3) return '1-3';
  if (value <= 10) return '4-10';
  if (value <= 25) return '11-25';
  return '26+';
}
