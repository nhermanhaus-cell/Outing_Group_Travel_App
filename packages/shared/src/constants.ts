// ─── Analytics event names ────────────────────────────────────────────────────

export const ANALYTICS_EVENTS = {
  APP_SESSION_STARTED: 'app_session_started',
  APP_SESSION_ENDED: 'app_session_ended',
  SCREEN_VIEW_STARTED: 'screen_view_started',
  SCREEN_VIEW_ENDED: 'screen_view_ended',
  DEEP_LINK_OPENED: 'deep_link_opened',
  DESTINATION_IMPRESSION: 'destination_impression',
  DESTINATION_VIEWED: 'destination_viewed',
  DESTINATION_ADVISORY_OPENED: 'destination_advisory_opened',
  DESTINATION_SAVED: 'destination_saved',
  COLLECTION_VIEWED: 'collection_viewed',
  RECOMMENDATION_GENERATED: 'recommendation_generated',
  RECOMMENDATION_DISMISSED: 'recommendation_dismissed',
  ASSISTANT_INSIGHT_VIEWED: 'assistant_insight_viewed',
  ASSISTANT_RECOMMENDATION_SELECTED: 'assistant_recommendation_selected',
  ASSISTANT_DECISION_VIEWED: 'assistant_decision_viewed',
  ASSISTANT_DECISION_ACTIONED: 'assistant_decision_actioned',
  ASSISTANT_COMPARISON_COMPLETED: 'assistant_comparison_completed',
  ASSISTANT_AUDIT_VIEWED: 'assistant_audit_viewed',
  ASSISTANT_RELAXATION_SELECTED: 'assistant_relaxation_selected',
  DESTINATION_CANDIDATE_VIEWED: 'destination_candidate_viewed',
  DESTINATION_GENERATION_LIFECYCLE: 'destination_generation_lifecycle',
  QUESTIONNAIRE_STARTED: 'questionnaire_started',
  QUESTIONNAIRE_STEP_VIEWED: 'questionnaire_step_viewed',
  QUESTIONNAIRE_STEP_COMPLETED: 'questionnaire_step_completed',
  QUESTIONNAIRE_COMPLETED: 'questionnaire_completed',
  QUESTIONNAIRE_ABANDONED: 'questionnaire_abandoned',
  TRIP_CREATION_PATH_SELECTED: 'trip_creation_path_selected',
  TRIP_CREATED: 'trip_created',
  TRIP_PUBLISHED: 'trip_published',
  TRIP_SHARED: 'trip_shared',
  ITINERARY_GENERATED: 'itinerary_generated',
  ITINERARY_REGENERATED: 'itinerary_regenerated',
  ITINERARY_ITEM_ADDED: 'itinerary_item_added',
  ITINERARY_ITEM_REMOVED: 'itinerary_item_removed',
  ITINERARY_ITEM_MOVED: 'itinerary_item_moved',
  ITINERARY_ITEM_LOCKED: 'itinerary_item_locked',
  ITINERARY_FEEDBACK_SUBMITTED: 'itinerary_feedback_submitted',
  ACTIVITY_CANDIDATE_RATED: 'activity_candidate_rated',
  ACTIVITY_DECK_COMPLETED: 'activity_deck_completed',
  FREE_WINDOW_SUGGESTION_VIEWED: 'free_window_suggestion_viewed',
  FREE_WINDOW_SUGGESTION_ACCEPTED: 'free_window_suggestion_accepted',
  TRIP_SECTION_VIEWED: 'trip_section_viewed',
  POLL_CREATED: 'poll_created',
  POLL_VOTE_SUBMITTED: 'poll_vote_submitted',
  BUDGET_ESTIMATED: 'budget_estimated',
  PULSE_VIEWED: 'pulse_viewed',
  INVITE_SENT: 'invite_sent',
  INVITE_ACCEPTED: 'invite_accepted',
  VENUE_CHECKIN: 'venue_checkin',
  VENUE_REVIEWED: 'venue_reviewed',
  PRIDE_EVENT_RSVP: 'pride_event_rsvp',
  PROFILE_VISIBILITY_CHANGED: 'profile_visibility_changed',
  SEARCH_PERFORMED: 'search_performed',
  FILTER_APPLIED: 'filter_applied',
  EXTERNAL_LINK_OPENED: 'external_link_opened',
  AFFILIATE_OFFER_IMPRESSION: 'affiliate_offer_impression',
  AFFILIATE_CLICKED: 'affiliate_clicked',
  BOOKING_HANDOFF: 'booking_handoff',
  PROVIDER_REQUEST_COMPLETED: 'provider_request_completed',
  OPERATION_FAILED: 'operation_failed',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// ─── Glamour level metadata ───────────────────────────────────────────────────

export const GLAMOUR_LEVEL_LABELS: Record<string, string> = {
  shoestring_slay: 'Shoestring Slay',
  cute_but_controlled: 'Cute But Controlled',
  comfortably_fabulous: 'Comfortably Fabulous',
  luxury_gaycation: 'Luxury Gaycation',
  no_budget_just_vibes: 'No Budget, Just Vibes',
};

export const GLAMOUR_LEVEL_EMOJI: Record<string, string> = {
  shoestring_slay: '👟',
  cute_but_controlled: '💅',
  comfortably_fabulous: '✨',
  luxury_gaycation: '👑',
  no_budget_just_vibes: '💸',
};

/** Approximate USD per-person per-day inclusive of lodging, meals, transport */
export const GLAMOUR_DAILY_BUDGET_USD: Record<
  string,
  { min: number; max: number }
> = {
  shoestring_slay: { min: 30, max: 70 },
  cute_but_controlled: { min: 60, max: 120 },
  comfortably_fabulous: { min: 100, max: 220 },
  luxury_gaycation: { min: 200, max: 600 },
  no_budget_just_vibes: { min: 0, max: Infinity },
};

// ─── Legal status labels ──────────────────────────────────────────────────────

export const LEGAL_STATUS_LABELS: Record<string, string> = {
  marriage_equality: 'Marriage Equality',
  civil_union: 'Civil Union / Partnership',
  limited_protections: 'Limited Protections',
  no_recognition: 'No Legal Recognition',
  criminalized: 'Criminalized',
  heavily_criminalized: 'Heavily Criminalized',
};

// ─── Month utilities ──────────────────────────────────────────────────────────

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
