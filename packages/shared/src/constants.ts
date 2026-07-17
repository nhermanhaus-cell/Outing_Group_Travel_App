// ─── Analytics event names ────────────────────────────────────────────────────

export const ANALYTICS_EVENTS = {
  DESTINATION_VIEWED: 'destination_viewed',
  DESTINATION_SAVED: 'destination_saved',
  RECOMMENDATION_GENERATED: 'recommendation_generated',
  RECOMMENDATION_DISMISSED: 'recommendation_dismissed',
  TRIP_CREATED: 'trip_created',
  TRIP_PUBLISHED: 'trip_published',
  TRIP_SHARED: 'trip_shared',
  ITINERARY_GENERATED: 'itinerary_generated',
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
