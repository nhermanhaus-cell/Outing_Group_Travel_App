import type { Destination, LgbtqLegalStatus, TravelPreferences } from '@gayi/shared';
import { GLAMOUR_DAILY_BUDGET_USD } from '@gayi/shared';
import type {
  ComponentScores,
  RecommendationResult,
  WeightConfig,
  WeightKey,
} from '../types';
import {
  findOptimalTravelWindow,
  overlapScore,
  weatherMatchScore,
} from './seasons';

// ─── Default weights (sum = 1.0) ─────────────────────────────────────────────

export const DEFAULT_WEIGHTS: WeightConfig = {
  budgetFit: 0.10,
  seasonalFit: 0.07,
  flightConvenience: 0.05,
  lgbtqLegal: 0.09,
  publicAttitude: 0.09,
  communityActivity: 0.07,
  nightlifeMatch: 0.05,
  interestMatch: 0.08,
  weatherMatch: 0.05,
  tripDurationFit: 0.04,
  eventAlignment: 0.04,
  accessibilityMatch: 0.05,
  socialFit: 0.03,
  accommodationFit: 0.06,
  userReviewFit: 0.06,
  dataConfidence: 0.07,
};

// ─── Scoring tables ───────────────────────────────────────────────────────────

const LEGAL_STATUS_SCORES: Record<LgbtqLegalStatus, number> = {
  marriage_equality: 100,
  civil_union: 75,
  limited_protections: 45,
  no_recognition: 25,
  criminalized: 5,
  heavily_criminalized: 0,
};

// ─── Component scorers ────────────────────────────────────────────────────────

function scoreBudgetFit(dest: Destination, prefs: TravelPreferences): number {
  const range = GLAMOUR_DAILY_BUDGET_USD[prefs.budgetLevel];
  if (!range) return 50;
  if (range.max === Infinity) return 100;
  const mid = dest.costPerDay.mid;
  if (mid >= range.min && mid <= range.max) return 100;
  if (mid < range.min) return Math.min(100, Math.round(80 + ((range.min - mid) / range.min) * 20));
  const pctOver = (mid - range.max) / range.max;
  return Math.max(0, Math.round(100 - pctOver * 100));
}

function scoreSeasonalFit(dest: Destination, prefs: TravelPreferences): number {
  return overlapScore(prefs.travelMonths, dest.bestMonths);
}

function scoreFlightConvenience(dest: Destination, prefs: TravelPreferences): number {
  if (prefs.departureAirports.length === 0) return 50;
  const sameCity = prefs.departureAirports.some((a) => dest.nearestAirportCodes.includes(a));
  if (sameCity) return 100;
  // Without real routing data, we give a moderate score reflecting unknown convenience
  return 58;
}

function scoreLgbtqLegal(dest: Destination, prefs: TravelPreferences): number {
  const base = LEGAL_STATUS_SCORES[dest.legalStatus];
  // Blend toward neutral (60) when safety priority is low
  const neutral = 60;
  return Math.round(base * prefs.lgbtqSafetyPriority + neutral * (1 - prefs.lgbtqSafetyPriority));
}

function scorePublicAttitude(dest: Destination): number {
  return dest.safetyScore;
}

function scoreCommunityActivity(dest: Destination): number {
  return dest.communityScore;
}

function scoreNightlifeMatch(dest: Destination, prefs: TravelPreferences): number {
  if (prefs.nightlifeImportance < 0.1) return 75;
  // Blend: dest score weighted by user desire, balanced with neutral 75
  return Math.round(
    dest.nightlifeScore * prefs.nightlifeImportance +
      75 * (1 - prefs.nightlifeImportance),
  );
}

function scoreInterestMatch(dest: Destination, prefs: TravelPreferences): number {
  if (prefs.interests.length === 0) return 60;
  const hits = prefs.interests.filter((i) => dest.interests.includes(i)).length;
  return Math.min(100, Math.round((hits / prefs.interests.length) * 110));
}

function scoreWeatherMatch(dest: Destination, prefs: TravelPreferences): number {
  return weatherMatchScore(dest.avgTempCByMonth, prefs.travelMonths, prefs.weatherPreference);
}

function scoreTripDurationFit(dest: Destination, prefs: TravelPreferences): number {
  const stay = dest.typicalStayDays;
  if (!stay) return 50;
  const d = prefs.tripDurationDays;
  if (d >= stay.min && d <= stay.max) return 100;
  if (d < stay.min) {
    const pct = d / stay.min;
    return Math.max(20, Math.round(pct * 100));
  }
  const pctOver = (d - stay.max) / stay.max;
  return Math.max(30, Math.round(100 - pctOver * 50));
}

function scoreEventAlignment(dest: Destination, prefs: TravelPreferences): number {
  if (dest.upcomingEvents.length === 0) return 50;
  const matching = dest.upcomingEvents.filter((e) => prefs.travelMonths.includes(e.month));
  if (matching.length === 0) return 38;
  if (matching.some((e) => e.type === 'pride')) return 100;
  return 72;
}

function scoreAccessibilityMatch(dest: Destination, prefs: TravelPreferences): number {
  if (prefs.accessibilityNeeds.length === 0) return 90;
  const needsWheelchair = prefs.accessibilityNeeds.some((n) =>
    n.toLowerCase().includes('wheelchair'),
  );
  if (needsWheelchair) {
    return dest.accessibility.wheelchairFriendly ? 100 : 15;
  }
  return 65;
}

function scoreSocialFit(dest: Destination, prefs: TravelPreferences): number {
  if (prefs.soloTravel) {
    return Math.round(40 + dest.communityScore * 0.6);
  }
  if (prefs.groupSize > 6) {
    return Math.round(35 + dest.communityScore * 0.5);
  }
  return 78;
}

function scoreAccommodationFit(dest: Destination, prefs: TravelPreferences): number {
  const lodgingPerNight = dest.costPerDay.mid * 0.38;
  const ranges: Record<string, { min: number; max: number }> = {
    shoestring_slay: { min: 10, max: 40 },
    cute_but_controlled: { min: 30, max: 80 },
    comfortably_fabulous: { min: 60, max: 200 },
    luxury_gaycation: { min: 150, max: 800 },
    no_budget_just_vibes: { min: 0, max: Infinity },
  };
  const range = ranges[prefs.budgetLevel];
  if (!range || range.max === Infinity) return 100;
  if (lodgingPerNight >= range.min && lodgingPerNight <= range.max) return 100;
  if (lodgingPerNight < range.min) return 82;
  const pctOver = (lodgingPerNight - range.max) / range.max;
  return Math.max(0, Math.round(100 - pctOver * 100));
}

function scoreUserReviewFit(dest: Destination): number {
  if (dest.reviewScore === undefined || !dest.reviewCount || dest.reviewCount < 10) return 50;
  return Math.round((dest.reviewScore / 5) * 100);
}

function scoreDataConfidence(dest: Destination): number {
  const lastUpdated = new Date(dest.lastUpdated);
  const monthsAgo =
    (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  let score = 100;
  if (monthsAgo > 18) score -= 45;
  else if (monthsAgo > 12) score -= 30;
  else if (monthsAgo > 6) score -= 15;
  else if (monthsAgo > 3) score -= 5;

  if (!dest.reviewCount || dest.reviewCount < 5) score -= 15;
  const tempDataMonths = Object.keys(dest.avgTempCByMonth).length;
  if (tempDataMonths < 6) score -= 10;

  return Math.max(0, score);
}

// ─── Reason/tradeoff templates ────────────────────────────────────────────────

const REASON_LABELS: Record<WeightKey, { positive: string; negative: string }> = {
  budgetFit: {
    positive: 'Great value for your budget',
    negative: 'Costs may stretch your budget',
  },
  seasonalFit: {
    positive: 'Peak season aligns with your travel dates',
    negative: 'Your dates fall outside peak season',
  },
  flightConvenience: {
    positive: 'Convenient flight connections',
    negative: 'Flight routing may require layovers',
  },
  lgbtqLegal: {
    positive: 'Strong LGBTQ+ legal protections',
    negative: 'Limited legal recognition for LGBTQ+ people',
  },
  publicAttitude: {
    positive: 'Welcoming public attitude toward LGBTQ+ visitors',
    negative: 'Public acceptance varies; research local norms',
  },
  communityActivity: {
    positive: 'Vibrant local queer community',
    negative: 'Smaller LGBTQ+ community presence',
  },
  nightlifeMatch: {
    positive: 'Excellent nightlife scene',
    negative: 'Limited nightlife options',
  },
  interestMatch: {
    positive: "Strong match with your interests",
    negative: "Fewer activities aligned with your interests",
  },
  weatherMatch: {
    positive: 'Weather during your dates suits your preference',
    negative: 'Weather may not match your preference',
  },
  tripDurationFit: {
    positive: 'Destination suits your trip length',
    negative: 'Trip length is a looser match for this destination',
  },
  eventAlignment: {
    positive: 'Major LGBTQ+ events happening during your visit',
    negative: 'No major queer events scheduled during your dates',
  },
  accessibilityMatch: {
    positive: 'Good accessibility infrastructure',
    negative: 'Accessibility provisions may be limited',
  },
  socialFit: {
    positive: 'Great for your travel style and group size',
    negative: 'Destination may be better suited to different group sizes',
  },
  accommodationFit: {
    positive: 'Accommodation options align with your budget',
    negative: 'Limited lodging at your price point',
  },
  userReviewFit: {
    positive: 'Highly rated by LGBTQ+ travellers',
    negative: 'Limited community reviews available',
  },
  dataConfidence: {
    positive: 'Up-to-date destination data',
    negative: 'Destination data may be outdated',
  },
};

// ─── Weighted scoring ─────────────────────────────────────────────────────────

function computeOverallMatch(scores: ComponentScores, weights: WeightConfig): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of Object.keys(scores) as WeightKey[]) {
    const s = scores[key];
    const w = weights[key] ?? 0;
    weightedSum += s * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 50;
  return Math.min(100, Math.round(weightedSum / totalWeight));
}

// ─── Data freshness label ─────────────────────────────────────────────────────

function freshnessLabel(lastUpdated: string): string {
  const monthsAgo =
    (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsAgo < 1) return 'Updated this month';
  if (monthsAgo < 3) return 'Updated recently';
  if (monthsAgo < 6) return 'Updated within 6 months';
  if (monthsAgo < 12) return 'Updated within a year';
  return 'Data may be outdated';
}

// ─── Cost range estimate ──────────────────────────────────────────────────────

function estimateCostRange(
  dest: Destination,
  prefs: TravelPreferences,
): RecommendationResult['estimatedCostRange'] {
  const days = prefs.tripDurationDays;

  // Select daily cost tier by glamour level
  const dailyCosts: Record<string, number> = {
    shoestring_slay: dest.costPerDay.budget,
    cute_but_controlled: (dest.costPerDay.budget + dest.costPerDay.mid) / 2,
    comfortably_fabulous: dest.costPerDay.mid,
    luxury_gaycation: (dest.costPerDay.mid + dest.costPerDay.luxury) / 2,
    no_budget_just_vibes: dest.costPerDay.luxury * 1.4,
  };
  const base = dailyCosts[prefs.budgetLevel] ?? dest.costPerDay.mid;

  // Add rough round-trip flight estimate
  const flightEstimateRange = { low: 250, high: 1200 };

  return {
    low: Math.round(base * days * 0.85 + flightEstimateRange.low),
    high: Math.round(base * days * 1.25 + flightEstimateRange.high),
    currency: 'USD',
    perPerson: true,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score and rank destinations against a set of travel preferences.
 *
 * Results are ordered by overallMatch descending. Ties are broken by slug
 * ascending (alphabetical) for determinism.
 */
export function scoreDestinations(
  preferences: TravelPreferences,
  destinations: Destination[],
  weights: WeightConfig = DEFAULT_WEIGHTS,
): RecommendationResult[] {
  const eligibleDestinations = destinations.filter((destination) => {
    if (preferences.lgbtqSafetyPriority < 0.8) return true;
    return destination.legalStatus !== 'criminalized' && destination.legalStatus !== 'heavily_criminalized';
  });

  const results: RecommendationResult[] = eligibleDestinations.map((dest) => {
    const scores: ComponentScores = {
      budgetFit: scoreBudgetFit(dest, preferences),
      seasonalFit: scoreSeasonalFit(dest, preferences),
      flightConvenience: scoreFlightConvenience(dest, preferences),
      lgbtqLegal: scoreLgbtqLegal(dest, preferences),
      publicAttitude: scorePublicAttitude(dest),
      communityActivity: scoreCommunityActivity(dest),
      nightlifeMatch: scoreNightlifeMatch(dest, preferences),
      interestMatch: scoreInterestMatch(dest, preferences),
      weatherMatch: scoreWeatherMatch(dest, preferences),
      tripDurationFit: scoreTripDurationFit(dest, preferences),
      eventAlignment: scoreEventAlignment(dest, preferences),
      accessibilityMatch: scoreAccessibilityMatch(dest, preferences),
      socialFit: scoreSocialFit(dest, preferences),
      accommodationFit: scoreAccommodationFit(dest, preferences),
      userReviewFit: scoreUserReviewFit(dest),
      dataConfidence: scoreDataConfidence(dest),
    };

    const overallMatch = computeOverallMatch(scores, weights);

    // Sort keys by score desc to produce reasons / tradeoffs
    const ranked = (Object.keys(scores) as WeightKey[]).sort(
      (a, b) => scores[b] - scores[a],
    );

    const topThreeReasons = ranked
      .slice(0, 3)
      .map((k) => REASON_LABELS[k].positive);

    const twoTradeoffs = ranked
      .filter((key) => key !== 'tripDurationFit')
      .slice(-2)
      .map((k) => REASON_LABELS[k].negative);

    const dataConfidence = Math.max(0, Math.min(1, scoreDataConfidence(dest) / 100));

    const travelWindow =
      findOptimalTravelWindow(preferences.travelMonths, dest.bestMonths) ??
      (preferences.travelMonths.length > 0
        ? {
            startMonth: Math.min(...preferences.travelMonths),
            endMonth: Math.max(...preferences.travelMonths),
          }
        : { startMonth: 1, endMonth: 12 });

    return {
      slug: dest.slug,
      destinationName: dest.name,
      overallMatch,
      componentScores: scores,
      topThreeReasons,
      twoTradeoffs,
      dataConfidence,
      dataFreshness: freshnessLabel(dest.lastUpdated),
      recommendedTravelWindow: travelWindow,
      estimatedCostRange: estimateCostRange(dest, preferences),
    };
  });

  // Deterministic sort: overall match desc, then slug asc
  return results.sort((a, b) => {
    if (b.overallMatch !== a.overallMatch) return b.overallMatch - a.overallMatch;
    return a.slug.localeCompare(b.slug);
  });
}
