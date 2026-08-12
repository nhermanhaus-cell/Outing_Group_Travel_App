// ─── Domain types ─────────────────────────────────────────────────────────────
export type {
  BudgetCategories,
  BudgetCategoryKey,
  BudgetLineItem,
  BudgetResult,
  CatalogPulseInputs,
  CategoryOverrides,
  ComponentScores,
  CostRange,
  FlightPriceGuidance,
  FreeWindowSuggestion,
  ItineraryItem,
  ItineraryTravelLeg,
  PersonBudget,
  PulseComponentBreakdown,
  PulseDataBasis,
  PulseEvidenceItem,
  PulseInputs,
  PulseLabel,
  PulseResult,
  RecommendationResult,
  TravelWindow,
  TripPlan,
  TripPlanBookingAction,
  TripPlanDay,
  TripPlanFeedback,
  TripPlanDayReworkAction,
  TripPlanPreviewProposal,
  TripPlanReaction,
  TripPublicPayload,
  WeightConfig,
  WeightKey,
} from './types';

// ─── Recommendation ───────────────────────────────────────────────────────────
export { DEFAULT_WEIGHTS, scoreDestinations } from './recommendation/engine';

export {
  findOptimalTravelWindow,
  formatMonthList,
  formatTravelWindow,
  getSeason,
  monthName,
  monthShort,
  overlapScore,
  seasonMonths,
  tempBand,
  weatherMatchScore,
  WEATHER_PREF_RANGES,
} from './recommendation/seasons';

export {
  excludeHomeDestinations,
  partitionRecommendations,
  resolveOriginHub,
} from './recommendation/origin';
export type {
  OriginHub,
  PartitionedRecommendations,
} from './recommendation/origin';

export { blendGroupPreferences } from './recommendation/groupBlend';

export {
  distanceKm,
  rankPlacesNearLodging,
  suggestQueerNeighborhoods,
} from './recommendation/nearby';
export type {
  Coords,
  RankablePlace,
  RankedPlace,
  SuggestableNeighborhood,
  SuggestedNeighborhood,
} from './recommendation/nearby';

// ─── Community Pulse ──────────────────────────────────────────────────────────
export { computeCatalogPulse, computePulse, PULSE_MIN_THRESHOLDS } from './pulse/engine';

// ─── Glamour Budget ───────────────────────────────────────────────────────────
export { estimateBudget } from './budget/engine';
export type { BudgetEngineInput } from './budget/engine';

// ─── Itinerary ────────────────────────────────────────────────────────────────
export { generateItinerary } from './itinerary/engine';
export type { ItineraryInput } from './itinerary/engine';
export type { ItineraryRouteEstimate } from './itinerary/engine';
export {
  createLegacyTripPlan,
  buildActivityPreferenceSignals,
  isActivityPreferenceSessionComplete,
  normalizeActivityPreferenceChoice,
  generateTripPlan,
  refineTripPlan,
  replaceTripPlanItems,
  createTripPlanReworkPreview,
  decodeTripPlan,
} from './itinerary/tripPlan';

export { deriveHomeJourney } from './journey/homeJourney';
export type { HomeJourneyResult, HomeJourneyTripInput } from './journey/homeJourney';
export type {
  ActivityPreferenceSignals,
  PlannerTraveler,
  TripPlanFlightPriceContext,
  TripPlanInput,
} from './itinerary/tripPlan';

// ─── Privacy ─────────────────────────────────────────────────────────────────
export { isSafePublicPayload, toTripPublicPayload } from './privacy/tripPublicPayload';

// ─── Invite tokens ────────────────────────────────────────────────────────────
export {
  generateInviteToken,
  generateSignedInviteToken,
  validateInviteToken,
  verifySignedInviteToken,
} from './invites/tokens';
export type { SignedToken } from './invites/tokens';
