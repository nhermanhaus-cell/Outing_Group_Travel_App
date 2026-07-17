// ─── Domain types ─────────────────────────────────────────────────────────────
export type {
  BudgetCategories,
  BudgetCategoryKey,
  BudgetLineItem,
  BudgetResult,
  CategoryOverrides,
  ComponentScores,
  CostRange,
  ItineraryItem,
  PersonBudget,
  PulseComponentBreakdown,
  PulseInputs,
  PulseLabel,
  PulseResult,
  RecommendationResult,
  TravelWindow,
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

// ─── Community Pulse ──────────────────────────────────────────────────────────
export { computePulse, PULSE_MIN_THRESHOLDS } from './pulse/engine';

// ─── Glamour Budget ───────────────────────────────────────────────────────────
export { estimateBudget } from './budget/engine';
export type { BudgetEngineInput } from './budget/engine';

// ─── Itinerary ────────────────────────────────────────────────────────────────
export { generateItinerary } from './itinerary/engine';
export type { ItineraryInput } from './itinerary/engine';

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
