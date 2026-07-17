import type { GlamourLevel } from '@gayi/shared';

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
  | 'Major queer hub';

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
  day: number;
  /** HH:MM 24h format */
  time: string;
  title: string;
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
