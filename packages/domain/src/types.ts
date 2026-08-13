import type { BookableOffer, GlamourLevel } from '@gayi/shared';

// ─── Recommendation ───────────────────────────────────────────────────────────

export interface ComponentScores {
  budgetFit: number;
  seasonalFit: number;
  flightConvenience: number;
  lgbtqLegal: number;
  publicAttitude: number;
  communityActivity: number;
  nightlifeMatch: number;
  interestMatch: number;
  weatherMatch: number;
  tripDurationFit: number;
  eventAlignment: number;
  accessibilityMatch: number;
  socialFit: number;
  accommodationFit: number;
  userReviewFit: number;
  dataConfidence: number;
}

export type WeightKey = keyof ComponentScores;
export type WeightConfig = Record<WeightKey, number>;

export interface TravelWindow {
  startMonth: number;
  endMonth: number;
}

export interface CostRange {
  low: number;
  high: number;
  currency: string;
  perPerson: boolean;
}

export interface RecommendationResult {
  slug: string;
  destinationName: string;
  overallMatch: number;
  componentScores: ComponentScores;
  topThreeReasons: string[];
  twoTradeoffs: string[];
  /** 0–1 */
  dataConfidence: number;
  /** Human-readable freshness label */
  dataFreshness: string;
  recommendedTravelWindow: TravelWindow;
  estimatedCostRange: CostRange;
}

// ─── Community Pulse ──────────────────────────────────────────────────────────

export type PulseLabel =
  | 'Quiet'
  | 'Emerging'
  | 'Connected'
  | 'Very active'
  | 'Major queer hub'
  | 'Limited verified data'
  | 'Some community signals'
  | 'Visible community footprint'
  | 'Strong community footprint'
  | 'Deep community footprint';

export type PulseDataBasis = 'outing_activity' | 'catalog_evidence';

export interface CatalogPulseInputs {
  communityPlaceCount: number;
  communityEventCount: number;
  communitySourceCount: number;
  editoriallyReviewed: boolean;
}

export interface PulseEvidenceItem {
  key: 'places' | 'events' | 'sources';
  label: string;
  count: number;
}

export interface PulseInputs {
  eventCount30d: number;
  venueDensityPer100k: number;
  reviewCount: number;
  activeContributors30d: number;
  publicTripsCount: number;
  aggregateCheckins30d: number;
  /** 0–1 */
  responseRate: number;
  verifiedVenueCount: number;
  prideEventThisYear: boolean;
}

export interface PulseComponentBreakdown {
  events: number;
  venues: number;
  contributors: number;
  publicTrips: number;
  checkins: number;
  responseRate: number;
  pride: number;
}

export interface PulseResult {
  /** 0–100 */
  score: number;
  label: PulseLabel;
  componentBreakdown: PulseComponentBreakdown;
  /** 0–1 */
  confidence: number;
  explanation: string;
  /** Distinguishes private, thresholded Outing activity from public catalog evidence. */
  dataBasis?: PulseDataBasis;
  /** Raw public evidence counts suitable for display. Never contains user activity. */
  evidence?: PulseEvidenceItem[];
}

// ─── Glamour Budget ───────────────────────────────────────────────────────────

export interface BudgetLineItem {
  /** USD low estimate */
  low: number;
  /** USD high estimate */
  high: number;
  assumption: string;
}

export interface BudgetCategories {
  flights: BudgetLineItem;
  lodging: BudgetLineItem;
  taxesFees: BudgetLineItem;
  localTransport: BudgetLineItem;
  meals: BudgetLineItem;
  drinksNightlife: BudgetLineItem;
  activities: BudgetLineItem;
  events: BudgetLineItem;
  wellness: BudgetLineItem;
  shopping: BudgetLineItem;
  insurance: BudgetLineItem;
  contingency: BudgetLineItem;
}

export type BudgetCategoryKey = keyof BudgetCategories;
export type CategoryOverrides = Partial<BudgetCategories>;

export interface PersonBudget {
  categories: BudgetCategories;
  total: { low: number; high: number };
}

export interface BudgetResult {
  level: GlamourLevel;
  perPerson: PersonBudget;
  groupTotal: PersonBudget;
  assumptions: string[];
  /** 0–1 */
  confidence: number;
  exclusions: string[];
}

// ─── Itinerary ────────────────────────────────────────────────────────────────

export interface ItineraryItem {
  /** Stable within a plan version; legacy callers may omit it. */
  itemId?: string;
  day: number;
  /** HH:MM 24h format */
  time: string;
  title: string;
  summary?: string;
  category: string;
  placeId: string;
  /** Duration in minutes */
  duration: number;
  estimatedCost: number;
  bookingRequired: boolean;
  source: string;
  /** 0–1 */
  confidence: number;
  coords: { lat: number; lng: number };
  accessibilityNotes?: string;
  lgbtqRelevance?: string;
  whySelected: string;
  /** Local ISO timestamp when exact dates are available. */
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  locked?: boolean;
  kind?: 'place' | 'experience' | 'downtime' | 'meal';
  arrivalBufferMinutes?: number;
  scheduleStatus?: 'verified' | 'estimated' | 'fallback';
  travelFromPrevious?: ItineraryTravelLeg;
  /** Canonical items are shared; solo/subgroup ideas live in free-window suggestions. */
  attendance?: 'group' | 'solo' | 'subgroup';
  participantIds?: string[];
  anchor?: boolean;
  timeFlexibility?: 'fixed' | 'window';
  windowEndTime?: string;
  bookingOffer?: BookableOffer;
}

export interface ItineraryTravelLeg {
  fromPlaceId: string;
  toPlaceId: string;
  mode: 'walking' | 'transit' | 'driving';
  durationMinutes: number;
  distanceMeters?: number;
  encodedPolyline?: string;
  estimated?: boolean;
}

export type TripPlanReaction = 'like' | 'dislike' | 'veto';

export interface TripPlanFeedback {
  itemId: string;
  placeId: string;
  day: number;
  memberId: string;
  reaction: TripPlanReaction;
  reason?: string;
  createdAt: string;
}

export interface FreeWindowSuggestion {
  suggestionId: string;
  day: number;
  windowItemId: string;
  title: string;
  placeId: string;
  category: string;
  attendance: 'solo' | 'subgroup';
  suggestedFor: Array<{ memberId: string; displayName?: string }>;
  acceptedByMemberIds: string[];
  suggestedStartTime: string;
  returnBy: string;
  durationMinutes: number;
  outboundTravelMinutes: number;
  returnTravelMinutes: number;
  estimatedCost: number;
  source: string;
  whySuggested: string;
  bookingOffer?: BookableOffer;
}

export interface TripPlanDay {
  day: number;
  date?: string;
  title: string;
  summary: string;
  itemIds: string[];
  sharedAnchorItemIds: string[];
  freeWindowSuggestions: FreeWindowSuggestion[];
  /** Schema-v2 explanation fields. Omitted on decoded schema-v1 plans. */
  rationale?: string;
  pace?: 'packed' | 'balanced' | 'light';
  estimatedTravelMinutes?: number;
  fitReasons?: string[];
  tradeoffs?: string[];
  backups?: Array<{
    placeId: string;
    title: string;
    reason: string;
    source: string;
  }>;
  reservationRisk?: 'low' | 'medium' | 'high';
  freshness?: 'live' | 'recent' | 'cached' | 'stale' | 'limited';
}

export type TripPlanDayReworkAction =
  | 'less_walking'
  | 'cheaper'
  | 'more_spontaneous'
  | 'rainy_day'
  | 'later_start'
  | 'lighter_pace';

export interface TripPlanPreviewProposal {
  proposalId: string;
  tripId?: string;
  action: TripPlanDayReworkAction;
  day: number;
  priorPlanId: string;
  priorRevision: number;
  preview: TripPlan;
  summary: string;
  createdAt: string;
  status: 'preview' | 'polling' | 'accepted' | 'dismissed';
}

export interface TripPlanBookingAction {
  actionId: string;
  category: 'flight' | 'lodging' | 'experience' | 'dining' | 'transport' | 'reminder';
  timing: 'book_soon' | 'watch' | 'before_trip' | 'optional';
  title: string;
  reason: string;
  itemId?: string;
  provider?: string;
  url?: string;
  affiliate: boolean;
  disclosure?: string;
  status: 'open' | 'completed' | 'dismissed';
}

export interface FlightPriceGuidance {
  status: 'below_recent_observations' | 'indicative' | 'insufficient_history';
  currentPrice?: number;
  priceRange?: { low: number; high: number };
  baselinePrice?: number;
  currency?: string;
  savingsPercent?: number;
  observationCount: number;
  observedAt?: string;
  message: string;
  trackingUrl?: string;
  confidence: number;
  source?: 'scrappa_google_flights' | 'skyscanner_indicative';
  returnSelectionRequired?: boolean;
}

export interface TripPlan {
  planId: string;
  revision: number;
  schemaVersion: 1 | 2;
  algorithmVersion: string;
  generatedAt: string;
  inputHash: string;
  destinationName: string;
  durationDays: number;
  summary: string;
  items: ItineraryItem[];
  days: TripPlanDay[];
  bookingTimeline: TripPlanBookingAction[];
  flightPriceGuidance?: FlightPriceGuidance;
  feedback: TripPlanFeedback[];
  sources: string[];
  budget?: BudgetResult;
}

// ─── Privacy / Trips ──────────────────────────────────────────────────────────

export interface TripPublicPayload {
  tripId: string;
  destinationSlug: string;
  destinationName: string;
  travelMonth: number;
  travelYear: number;
  durationDays: number;
  groupSize: number;
  highlights: string[];
  photoCount: number;
}
