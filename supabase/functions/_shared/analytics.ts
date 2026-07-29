export type JsonRecord = Record<string, unknown>;

export interface AnalyticsPolicyRow {
  semantic_analytics_enabled: boolean;
  personalization_enabled: boolean;
  session_replay_enabled: boolean;
  session_replay_sample_rate: number | string;
  policy_version: string;
}

export interface AnalyticsRow {
  event_id: string;
  user_id?: string | null;
  subject_id: string;
  session_id: string;
  event_name: string;
  schema_version: number;
  occurred_at: string;
  screen_name?: string | null;
  platform: string;
  app_version?: string | null;
  properties: JsonRecord;
}

export const DEFAULT_ANALYTICS_POLICY: AnalyticsPolicyRow = {
  semantic_analytics_enabled: true,
  personalization_enabled: true,
  session_replay_enabled: false,
  session_replay_sample_rate: 0.1,
  policy_version: 'v1-global-default-on',
};

const EVENT_PROPERTY_KEYS: Record<string, ReadonlySet<string>> = {
  app_session_started: new Set(['launchType']),
  app_session_ended: new Set(['activeDurationMs', 'exitReason']),
  screen_view_started: new Set(['screenName', 'previousScreen', 'entryPoint']),
  screen_view_ended: new Set(['screenName', 'nextScreen', 'activeDurationMs', 'idleDurationMs', 'exitReason']),
  deep_link_opened: new Set(['route']),
  destination_impression: new Set(['destinationSlug', 'source', 'rank']),
  destination_viewed: new Set(['destinationSlug', 'source']),
  destination_saved: new Set(['destinationSlug', 'saved', 'source']),
  collection_viewed: new Set(['collectionId', 'source']),
  recommendation_generated: new Set(['recommendationType', 'resultCount', 'algorithmVersion']),
  recommendation_dismissed: new Set(['recommendationType', 'category', 'reasonCode']),
  questionnaire_started: new Set(['entryPoint', 'destinationPrefilled']),
  questionnaire_step_viewed: new Set(['stepId', 'stepIndex']),
  questionnaire_step_completed: new Set(['stepId', 'stepIndex', 'selectionCount', 'skipped']),
  questionnaire_completed: new Set(['stepCount', 'activeDurationMs', 'destinationPrefilled']),
  questionnaire_abandoned: new Set(['stepId', 'stepIndex', 'activeDurationMs']),
  trip_creation_path_selected: new Set(['path', 'entryPoint']),
  trip_created: new Set(['creationPath', 'groupType', 'travelerCountBucket', 'durationBucket', 'destinationPrefilled']),
  trip_published: new Set(['visibility']),
  trip_shared: new Set(['channel']),
  itinerary_generated: new Set(['itemCount', 'dayCount', 'algorithmVersion']),
  itinerary_regenerated: new Set(['itemCount', 'dayCount', 'reasonCode']),
  itinerary_item_added: new Set(['category', 'source', 'attendance']),
  itinerary_item_removed: new Set(['category', 'source', 'attendance']),
  itinerary_item_moved: new Set(['category', 'dayDelta']),
  itinerary_item_locked: new Set(['category', 'locked']),
  itinerary_feedback_submitted: new Set(['category', 'reaction', 'reasonCode']),
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
  provider_request_completed: new Set(['provider', 'operation', 'status', 'latencyBucket', 'resultCountBucket']),
  operation_failed: new Set(['operation', 'errorCategory', 'sourceScreen']),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM = new Set(['ios', 'android', 'web', 'unknown']);

function primitive(value: unknown): string | number | boolean | null | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value.trim().slice(0, 120);
  return undefined;
}

function normalizedRoute(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const path = value.split('?')[0]?.replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'destinations' && segments[1]) return '/destinations/[slug]';
  if (segments[0] === 'collections' && segments[1]) return '/collections/[id]';
  if (segments[0] === 'experiences' && segments[1]) return '/experiences/[productCode]';
  if (segments[0] === 'trips' && segments[1] && segments[1] !== 'new') {
    return segments[2] === 'invite' ? '/trips/[tripId]/invite' : '/trips/[tripId]';
  }
  if (segments[0] === 'share' && segments[1]) return '/share/[tripId]';
  return path.slice(0, 120);
}

export function validateAnalyticsEvent(
  value: unknown,
  userId?: string,
): { row?: AnalyticsRow; eventId?: string; reason?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { reason: 'event_must_be_an_object' };
  }
  const event = value as JsonRecord;
  const eventId = typeof event.eventId === 'string' ? event.eventId : undefined;
  const eventName = typeof event.eventName === 'string' ? event.eventName : '';
  const allowedKeys = EVENT_PROPERTY_KEYS[eventName];
  if (!eventId || !UUID.test(eventId)) return { eventId, reason: 'invalid_event_id' };
  if (!allowedKeys) return { eventId, reason: 'unknown_event_name' };
  if (event.schemaVersion !== 1) return { eventId, reason: 'unsupported_schema_version' };
  if (typeof event.subjectId !== 'string' || !UUID.test(event.subjectId)) {
    return { eventId, reason: 'invalid_subject_id' };
  }
  if (typeof event.sessionId !== 'string' || !UUID.test(event.sessionId)) {
    return { eventId, reason: 'invalid_session_id' };
  }
  if (typeof event.platform !== 'string' || !PLATFORM.has(event.platform)) {
    return { eventId, reason: 'invalid_platform' };
  }
  if (typeof event.occurredAt !== 'string') return { eventId, reason: 'invalid_occurred_at' };
  const occurredAt = new Date(event.occurredAt);
  if (
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000 ||
    occurredAt.getTime() > Date.now() + 10 * 60 * 1000
  ) {
    return { eventId, reason: 'occurred_at_out_of_range' };
  }

  const inputProperties =
    event.properties && typeof event.properties === 'object' && !Array.isArray(event.properties)
      ? event.properties as JsonRecord
      : {};
  const properties: JsonRecord = {};
  for (const [key, raw] of Object.entries(inputProperties)) {
    if (!allowedKeys.has(key)) continue;
    const safe = primitive(raw);
    if (safe !== undefined) properties[key] = safe;
  }

  return {
    eventId,
    row: {
      event_id: eventId,
      ...(userId ? { user_id: userId } : {}),
      subject_id: event.subjectId,
      session_id: event.sessionId,
      event_name: eventName,
      schema_version: 1,
      occurred_at: occurredAt.toISOString(),
      screen_name: normalizedRoute(event.screenName),
      platform: event.platform,
      app_version: typeof event.appVersion === 'string' ? event.appVersion.slice(0, 40) : null,
      properties,
    },
  };
}

export function publicPolicy(row: AnalyticsPolicyRow) {
  return {
    semanticAnalyticsEnabled: row.semantic_analytics_enabled,
    personalizationEnabled: row.personalization_enabled,
    sessionReplayEnabled: row.session_replay_enabled,
    sessionReplaySampleRate: Number(row.session_replay_sample_rate),
    policyVersion: row.policy_version,
  };
}

export async function forwardRowsToPostHog(rows: AnalyticsRow[]): Promise<boolean> {
  const token = Deno.env.get('POSTHOG_PROJECT_TOKEN')?.trim();
  if (!token || rows.length === 0) return false;
  const host = (Deno.env.get('POSTHOG_HOST')?.trim() || 'https://us.i.posthog.com').replace(/\/$/, '');
  const firstPartyOnly = new Set(['destinationSlug', 'collectionId']);
  const batch = rows.map((row) => {
    const properties = Object.fromEntries(
      Object.entries(row.properties ?? {}).filter(([key]) => !firstPartyOnly.has(key)),
    );
    return {
      event: row.event_name,
      timestamp: row.occurred_at,
      properties: {
        ...properties,
        distinct_id: row.subject_id,
        $session_id: row.session_id,
        $geoip_disable: true,
        screen_name: row.screen_name ?? undefined,
        platform: row.platform,
        app_version: row.app_version ?? undefined,
        schema_version: row.schema_version,
      },
    };
  });
  const response = await fetch(`${host}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: token, batch }),
  });
  if (!response.ok) throw new Error(`PostHog HTTP ${response.status}`);
  return true;
}
