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
} from './types.js';

// ─── Recommendation ───────────────────────────────────────────────────────────
export { DEFAULT_WEIGHTS, scoreDestinations } from './recommendation/engine.js';

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
} from './recommendation/seasons.js';

// ─── Community Pulse ──────────────────────────────────────────────────────────
export { computePulse, PULSE_MIN_THRESHOLDS } from './pulse/engine.js';

// ─── Glamour Budget ───────────────────────────────────────────────────────────
export { estimateBudget } from './budget/engine.js';
export type { BudgetEngineInput } from './budget/engine.js';

// ─── Itinerary ────────────────────────────────────────────────────────────────
export { generateItinerary } from './itinerary/engine.js';
export type { ItineraryInput } from './itinerary/engine.js';

// ─── Privacy ─────────────────────────────────────────────────────────────────
export { isSafePublicPayload, toTripPublicPayload } from './privacy/tripPublicPayload.js';

// ─── Invite tokens ────────────────────────────────────────────────────────────
export {
  generateInviteToken,
  generateSignedInviteToken,
  validateInviteToken,
  verifySignedInviteToken,
} from './invites/tokens.js';
export type { SignedToken } from './invites/tokens.js';
