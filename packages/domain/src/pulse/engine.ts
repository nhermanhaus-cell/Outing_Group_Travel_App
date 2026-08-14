import type {
  CatalogPulseInputs,
  PulseComponentBreakdown,
  PulseInputs,
  PulseLabel,
  PulseResult,
} from '../types';

// ─── Minimum aggregation thresholds (k-anonymity protection) ─────────────────

const THRESHOLDS = {
  /** Minimum event count before it contributes meaningfully to score */
  events: 3,
  /** Minimum number of verified venues */
  venues: 5,
  /** Minimum active contributors */
  contributors: 3,
  /** Minimum aggregate checkins */
  checkins: 10,
  /** Minimum public trips */
  publicTrips: 2,
} as const;

// ─── Component weights (sum = 1.0) ────────────────────────────────────────────

const COMPONENT_WEIGHTS: Record<keyof PulseComponentBreakdown, number> = {
  venues: 0.25,
  events: 0.20,
  contributors: 0.15,
  checkins: 0.12,
  publicTrips: 0.10,
  responseRate: 0.10,
  pride: 0.08,
};

// ─── Saturation curves ────────────────────────────────────────────────────────

/** Log-scaled saturation: returns 0–100, saturating around `satPoint`. */
function saturate(value: number, satPoint: number): number {
  if (value <= 0) return 0;
  return Math.min(100, Math.round((Math.log1p(value) / Math.log1p(satPoint)) * 100));
}

// ─── Label thresholds ─────────────────────────────────────────────────────────

function labelFromScore(score: number): PulseLabel {
  if (score >= 85) return 'Major queer hub';
  if (score >= 66) return 'Very active';
  if (score >= 41) return 'Connected';
  if (score >= 21) return 'Emerging';
  return 'Quiet';
}

function catalogLabelFromScore(score: number): PulseLabel {
  if (score >= 85) return 'Deep community footprint';
  if (score >= 66) return 'Strong community footprint';
  if (score >= 41) return 'Visible community footprint';
  if (score >= 21) return 'Some community signals';
  return 'Limited verified data';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the community pulse score for a destination.
 *
 * Inputs that fall below minimum aggregation thresholds are treated as zero
 * to avoid exposing exact low counts.
 */
export function computePulse(inputs: PulseInputs): PulseResult {
  // Apply thresholds — zero out sub-threshold values
  const safeEvents = inputs.eventCount30d >= THRESHOLDS.events ? inputs.eventCount30d : 0;
  const safeVenues =
    inputs.verifiedVenueCount >= THRESHOLDS.venues ? inputs.verifiedVenueCount : 0;
  const safeContributors =
    inputs.activeContributors30d >= THRESHOLDS.contributors
      ? inputs.activeContributors30d
      : 0;
  const safeCheckins =
    inputs.aggregateCheckins30d >= THRESHOLDS.checkins ? inputs.aggregateCheckins30d : 0;
  const safePublicTrips =
    inputs.publicTripsCount >= THRESHOLDS.publicTrips ? inputs.publicTripsCount : 0;

  // Track how many inputs were suppressed for confidence calculation
  const suppressedCount = [
    inputs.eventCount30d < THRESHOLDS.events,
    inputs.verifiedVenueCount < THRESHOLDS.venues,
    inputs.activeContributors30d < THRESHOLDS.contributors,
    inputs.aggregateCheckins30d < THRESHOLDS.checkins,
    inputs.publicTripsCount < THRESHOLDS.publicTrips,
  ].filter(Boolean).length;

  // Component scores 0–100
  const components: PulseComponentBreakdown = {
    events: saturate(safeEvents, 30),
    venues: saturate(safeVenues * inputs.venueDensityPer100k, 50),
    contributors: saturate(safeContributors, 50),
    checkins: saturate(safeCheckins, 200),
    publicTrips: saturate(safePublicTrips, 40),
    responseRate: Math.round(inputs.responseRate * 100),
    pride: inputs.prideEventThisYear ? 100 : 0,
  };

  // Weighted sum
  let weightedSum = 0;
  for (const key of Object.keys(components) as (keyof PulseComponentBreakdown)[]) {
    weightedSum += components[key] * (COMPONENT_WEIGHTS[key] ?? 0);
  }
  const score = Math.min(100, Math.round(weightedSum));

  // Confidence: high when data is above thresholds and reviews exist
  const dataPoints = 7; // total possible
  const dataPresent =
    dataPoints -
    suppressedCount -
    (inputs.reviewCount < 5 ? 1 : 0) -
    (inputs.venueDensityPer100k === 0 ? 1 : 0);
  const confidence = Math.max(0.1, Math.round((dataPresent / dataPoints) * 100) / 100);

  return {
    score,
    label: labelFromScore(score),
    componentBreakdown: components,
    confidence,
    dataBasis: 'outing_activity',
    explanation:
      'This score is a platform estimate based on aggregated community activity. ' +
      'Individual data points below minimum thresholds are not disclosed. ' +
      'The score reflects relative LGBTQ+ community presence on Outing and may not represent the full in-person scene.',
  };
}

/**
 * Build a destination-level pulse from public, sourced catalog evidence.
 *
 * Unlike `computePulse`, these inputs contain no Outing-user activity and do
 * not need privacy suppression. This fallback keeps newer catalog entries
 * useful while being explicit that visible infrastructure is not a safety
 * rating or a claim about how busy a destination feels right now.
 */
export function computeCatalogPulse(inputs: CatalogPulseInputs): PulseResult {
  const communityPlaceCount = Math.max(0, Math.floor(inputs.communityPlaceCount));
  const communityEventCount = Math.max(0, Math.floor(inputs.communityEventCount));
  const communitySourceCount = Math.max(0, Math.floor(inputs.communitySourceCount));

  const components: PulseComponentBreakdown = {
    venues: saturate(communityPlaceCount, 6),
    events: saturate(communityEventCount, 4),
    contributors: 0,
    checkins: 0,
    publicTrips: 0,
    responseRate: inputs.editoriallyReviewed ? 100 : 50,
    pride: communityEventCount > 0 ? 100 : 0,
  };
  const score = Math.min(100, Math.round(
    components.venues * 0.48
      + components.events * 0.27
      + saturate(communitySourceCount, 4) * 0.15
      + components.responseRate * 0.10,
  ));
  const evidenceKindsPresent = [communityPlaceCount, communityEventCount, communitySourceCount]
    .filter((value) => value > 0).length;
  const confidence = Math.min(0.95, Math.max(
    0.2,
    Math.round((evidenceKindsPresent / 3 * 0.7 + (inputs.editoriallyReviewed ? 0.25 : 0.1)) * 100) / 100,
  ));

  return {
    score,
    label: catalogLabelFromScore(score),
    componentBreakdown: components,
    confidence,
    dataBasis: 'catalog_evidence',
    evidence: [
      { key: 'places', label: 'community places', count: communityPlaceCount },
      { key: 'events', label: 'community events', count: communityEventCount },
      { key: 'sources', label: 'context sources', count: communitySourceCount },
    ],
    explanation:
      'This early read uses sourced LGBTQ+ places, events, and community context. ' +
      'It is not a safety rating or a measure of Outing-user activity, and local experiences can vary.',
  };
}

export { THRESHOLDS as PULSE_MIN_THRESHOLDS };
