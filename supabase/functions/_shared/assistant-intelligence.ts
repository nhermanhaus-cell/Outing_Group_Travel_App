export type Json = Record<string, unknown>;

export type PreferenceSignal = {
  subjectType: 'destination' | 'destination_region' | 'activity_category' | 'pace' | 'provider';
  subjectKey: string;
  score: number;
  confidence: number;
};

export const PREFERENCE_SIGNAL_MAX_AGE_DAYS = 180;

export function filterFreshPreferenceSignals<T extends { lastObservedAt: string }>(
  signals: T[],
  now = Date.now(),
): T[] {
  const cutoff = now - PREFERENCE_SIGNAL_MAX_AGE_DAYS * 24 * 60 * 60_000;
  return signals.filter((signal) => {
    const observedAt = new Date(signal.lastObservedAt).getTime();
    return Number.isFinite(observedAt) && observedAt >= cutoff && observedAt <= now;
  });
}

export type PersonalizationContext = {
  version: 'v1';
  explicit: {
    interests: string[];
    tripGoals: string[];
    vacationStyles: string[];
    preferredMonths: number[];
    departureAirports: string[];
    homeCountryCodes: string[];
    preferredTravelRanges: string[];
    transportModes: string[];
    maxTravelTimeHours?: number;
    travelScope?: 'domestic' | 'international' | 'either';
    budgetLevel?: string;
    tripLengthDays?: number;
    groupSize?: number;
    dayRhythm?: string;
    activityPace?: string;
    mealPreferences: string[];
    avoidances: string[];
    accessibilityNeeds: string[];
    lgbtqSafetyPriority?: number;
    nightlifeImportance?: number;
  };
  inferred: PreferenceSignal[];
  savedDestinationSlugs: string[];
  trip?: {
    tripId: string;
    destinationSlug?: string;
    startDate?: string;
    endDate?: string;
    travelerCount: number;
    interests: string[];
    activityPace?: string;
    groupPreferenceSummary?: {
      sharedInterests: string[];
      popularInterests: string[];
      pace?: string;
      nightlifeImportance?: number;
    };
  };
  explanationSignals: string[];
  contextFingerprint: string;
};

export type RankedDestination = {
  id: string;
  kind: 'destination';
  title: string;
  summary: string;
  destinationSlug: string;
  fitScore: number;
  fitReasons: string[];
  tradeoffs: string[];
  sourceIds: string[];
  confidence: number;
  provisional: false;
  bookable: false;
  action: { type: 'open_destination'; value: string };
};

export type CommunitySignal = {
  subjectType: 'destination' | 'activity_category' | 'provider';
  subjectKey: string;
  distinctUsers: number;
  score: number;
};

export const COMMUNITY_SIGNAL_MIN_USERS = 25;
export const COMMUNITY_SIGNAL_MAX_ADJUSTMENT = 5;

export function communitySignalAdjustment(
  signals: CommunitySignal[],
  subjectType: CommunitySignal['subjectType'],
  subjectKey: string,
): number {
  const signal = signals.find((item) =>
    item.subjectType === subjectType && item.subjectKey === subjectKey && item.distinctUsers >= COMMUNITY_SIGNAL_MIN_USERS);
  if (!signal) return 0;
  return Math.max(-COMMUNITY_SIGNAL_MAX_ADJUSTMENT, Math.min(
    COMMUNITY_SIGNAL_MAX_ADJUSTMENT,
    signal.score * COMMUNITY_SIGNAL_MAX_ADJUSTMENT,
  ));
}

const MODEL_REDACTED_KEYS = new Set([
  'lat', 'lng', 'latitude', 'longitude', 'coordinates', 'comments',
  'contact', 'contacts', 'email', 'phone', 'lodgingaddress', 'lodging_address',
]);

export function redactAssistantModelValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth capped]';
  if (typeof value === 'string') {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .slice(0, 10_000);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactAssistantModelValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Json)
      .filter(([key]) => !MODEL_REDACTED_KEYS.has(key.toLowerCase()))
      .slice(0, 50)
      .map(([key, item]) => [key, redactAssistantModelValue(item, depth + 1)]),
  );
}

const BUDGET_RANGES: Record<string, { min: number; max: number }> = {
  shoestring_slay: { min: 30, max: 70 },
  cute_but_controlled: { min: 60, max: 120 },
  comfortably_fabulous: { min: 100, max: 220 },
  luxury_gaycation: { min: 200, max: 600 },
  no_budget_just_vibes: { min: 0, max: Number.POSITIVE_INFINITY },
};

const INTEREST_ALIASES: Record<string, string[]> = {
  art_culture: ['art', 'culture', 'history', 'architecture'],
  outdoors: ['outdoors', 'hiking', 'beach', 'nature'],
  food: ['food', 'restaurants', 'cafe', 'markets'],
  wellness: ['wellness', 'spa', 'recharge'],
  nightlife: ['nightlife', 'bars', 'clubs', 'dancing', 'drag'],
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 30)
    : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizedInterests(values: string[]): Set<string> {
  const output = new Set(values.map((value) => value.toLowerCase()));
  for (const value of [...output]) {
    for (const alias of INTEREST_ALIASES[value] ?? []) output.add(alias);
    for (const [parent, aliases] of Object.entries(INTEREST_ALIASES)) {
      if (aliases.includes(value)) output.add(parent);
    }
  }
  return output;
}

function scoringPayload(row: Json): Json {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload as Json : {};
  if (payload.scoring && typeof payload.scoring === 'object') return payload.scoring as Json;
  if (payload.catalog && typeof payload.catalog === 'object') return payload;
  return payload;
}

function destinationSignal(context: PersonalizationContext, slug: string): number {
  const signal = context.inferred.find((item) => item.subjectType === 'destination' && item.subjectKey === slug);
  return signal ? Math.max(-10, Math.min(10, signal.score * signal.confidence * 10)) : 0;
}

function categorySignal(context: PersonalizationContext, interests: Set<string>): number {
  const relevant = context.inferred.filter((item) =>
    item.subjectType === 'activity_category' && interests.has(item.subjectKey.toLowerCase()));
  if (!relevant.length) return 0;
  return Math.max(-10, Math.min(10,
    relevant.reduce((sum, item) => sum + item.score * item.confidence * 3, 0),
  ));
}

function budgetScore(costPerDay: Json, budgetLevel?: string): number {
  if (!budgetLevel || !BUDGET_RANGES[budgetLevel]) return 65;
  const cost = numberValue(costPerDay.mid, 150);
  const range = BUDGET_RANGES[budgetLevel]!;
  if (cost >= range.min && cost <= range.max) return 100;
  if (cost < range.min) return Math.min(100, Math.round(80 + ((range.min - cost) / range.min) * 20));
  return Math.max(10, Math.round(100 - ((cost - range.max) / Math.max(range.max, 1)) * 100));
}

const OUTING_WEIGHTS = {
  budgetFit: 0.10, seasonalFit: 0.07, flightConvenience: 0.05, lgbtqLegal: 0.09,
  publicAttitude: 0.09, communityActivity: 0.07, nightlifeMatch: 0.05,
  interestMatch: 0.08, weatherMatch: 0.05, tripDurationFit: 0.04,
  eventAlignment: 0.04, accessibilityMatch: 0.05, socialFit: 0.03,
  accommodationFit: 0.06, userReviewFit: 0.06, dataConfidence: 0.07,
} as const;

const LEGAL_STATUS_SCORES: Record<string, number> = {
  marriage_equality: 100,
  civil_union: 75,
  limited_protections: 45,
  no_recognition: 25,
  criminalized: 5,
  heavily_criminalized: 0,
};

function outingDeterministicScore(
  scoring: Json,
  context: PersonalizationContext,
  requestedInterests: string[],
  months: number[],
): number {
  const costs = recordValue(scoring.costPerDay);
  const stay = recordValue(scoring.typicalStayDays);
  const bestMonths = Array.isArray(scoring.bestMonths)
    ? scoring.bestMonths.filter((item): item is number => typeof item === 'number')
    : [];
  const seasonalFit = months.length && bestMonths.length
    ? Math.round((months.filter((month) => bestMonths.includes(month)).length / months.length) * 100)
    : 50;
  const nearestAirports = new Set(strings(scoring.nearestAirportCodes).map((code) => code.toUpperCase()));
  const flightConvenience = context.explicit.departureAirports.length
    ? context.explicit.departureAirports.some((code) => nearestAirports.has(code)) ? 100 : 58
    : 50;
  const safetyPriority = context.explicit.lgbtqSafetyPriority ?? 0.8;
  const legalBase = LEGAL_STATUS_SCORES[String(scoring.legalStatus)] ?? 45;
  const lgbtqLegal = Math.round(legalBase * safetyPriority + 60 * (1 - safetyPriority));
  const nightlifeImportance = context.explicit.nightlifeImportance ?? 0;
  const nightlifeMatch = nightlifeImportance < 0.1
    ? 75
    : Math.round(numberValue(scoring.nightlifeScore, 60) * nightlifeImportance + 75 * (1 - nightlifeImportance));
  const destinationInterests = new Set(strings(scoring.interests).map((interest) => interest.toLowerCase()));
  const normalizedRequested = [...new Set(requestedInterests.map((interest) => interest.toLowerCase()))];
  const interestMatch = normalizedRequested.length
    ? Math.min(100, Math.round((normalizedRequested.filter((interest) => destinationInterests.has(interest)).length / normalizedRequested.length) * 110))
    : 60;
  const events = Array.isArray(scoring.upcomingEvents) ? scoring.upcomingEvents.map(recordValue) : [];
  const matchingEvents = events.filter((event) => typeof event.month === 'number' && months.includes(event.month));
  const eventAlignment = !events.length ? 50 : !matchingEvents.length ? 38 : matchingEvents.some((event) => event.type === 'pride') ? 100 : 72;
  const accessibility = recordValue(scoring.accessibility);
  const needsWheelchair = context.explicit.accessibilityNeeds.some((need) => need.toLowerCase().includes('wheelchair'));
  const accessibilityMatch = !context.explicit.accessibilityNeeds.length
    ? 90
    : needsWheelchair ? accessibility.wheelchairFriendly === true ? 100 : 15 : 65;
  const groupSize = context.explicit.groupSize ?? 1;
  const communityScore = numberValue(scoring.communityScore, 60);
  const socialFit = groupSize === 1
    ? Math.round(40 + communityScore * 0.6)
    : groupSize > 6 ? Math.round(35 + communityScore * 0.5) : 78;
  const budgetLevel = context.explicit.budgetLevel ?? 'comfortably_fabulous';
  const budgetFit = budgetScore(costs, budgetLevel);
  const lodgingPerNight = numberValue(costs.mid, 150) * 0.38;
  const lodgingRanges: Record<string, { min: number; max: number }> = {
    shoestring_slay: { min: 10, max: 40 },
    cute_but_controlled: { min: 30, max: 80 },
    comfortably_fabulous: { min: 60, max: 200 },
    luxury_gaycation: { min: 150, max: 800 },
    no_budget_just_vibes: { min: 0, max: Number.POSITIVE_INFINITY },
  };
  const lodgingRange = lodgingRanges[budgetLevel] ?? lodgingRanges.comfortably_fabulous!;
  const accommodationFit = lodgingRange.max === Number.POSITIVE_INFINITY
    ? 100
    : lodgingPerNight >= lodgingRange.min && lodgingPerNight <= lodgingRange.max
      ? 100
      : lodgingPerNight < lodgingRange.min
        ? 82
        : Math.max(0, Math.round(100 - ((lodgingPerNight - lodgingRange.max) / lodgingRange.max) * 100));
  const reviewCount = numberValue(scoring.reviewCount, 0);
  const userReviewFit = reviewCount < 10 ? 50 : Math.round((numberValue(scoring.reviewScore, 0) / 5) * 100);
  const monthsAgo = typeof scoring.lastUpdated === 'string'
    ? (Date.now() - new Date(scoring.lastUpdated).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : Number.POSITIVE_INFINITY;
  let dataConfidence = 100;
  if (monthsAgo > 18) dataConfidence -= 45;
  else if (monthsAgo > 12) dataConfidence -= 30;
  else if (monthsAgo > 6) dataConfidence -= 15;
  else if (monthsAgo > 3) dataConfidence -= 5;
  if (reviewCount < 5) dataConfidence -= 15;
  if (Object.keys(recordValue(scoring.avgTempCByMonth)).length < 6) dataConfidence -= 10;
  dataConfidence = Math.max(0, dataConfidence);
  const scores = {
    budgetFit,
    seasonalFit,
    flightConvenience,
    lgbtqLegal,
    publicAttitude: numberValue(scoring.safetyScore, 60),
    communityActivity: communityScore,
    nightlifeMatch,
    interestMatch,
    weatherMatch: 80,
    tripDurationFit: durationScore(stay, context.explicit.tripLengthDays),
    eventAlignment,
    accessibilityMatch,
    socialFit,
    accommodationFit,
    userReviewFit,
    dataConfidence,
  };
  return Math.min(100, Math.round(Object.entries(scores).reduce((sum, [key, score]) =>
    sum + score * OUTING_WEIGHTS[key as keyof typeof OUTING_WEIGHTS], 0)));
}

function durationScore(stay: Json, duration?: number): number {
  if (!duration) return 65;
  const min = numberValue(stay.min, 1);
  const max = numberValue(stay.max, 14);
  if (duration >= min && duration <= max) return 100;
  return duration < min
    ? Math.max(25, Math.round((duration / min) * 100))
    : Math.max(35, Math.round(100 - ((duration - max) / max) * 50));
}

export function rankDestinationRows(
  rows: Json[],
  context: PersonalizationContext,
  options: { interests?: string[]; month?: number; limit?: number; communitySignals?: CommunitySignal[] } = {},
): RankedDestination[] {
  const requested = normalizedInterests([
    ...context.explicit.interests,
    ...(context.trip?.interests ?? []),
    ...(options.interests ?? []),
  ]);
  const requestedRaw = [...new Set([
    ...context.explicit.interests,
    ...(context.trip?.interests ?? []),
    ...(options.interests ?? []),
  ])];
  const months = options.month ? [options.month] : context.explicit.preferredMonths;
  const safetyIsHardConstraint = (context.explicit.lgbtqSafetyPriority ?? 0) >= 0.8;
  const eligibleRows = safetyIsHardConstraint
    ? rows.filter((row) => {
        const legalStatus = String(scoringPayload(row).legalStatus ?? '');
        return !['criminalized', 'heavily_criminalized'].includes(legalStatus);
      })
    : rows;

  return eligibleRows.map((row) => {
    const scoring = scoringPayload(row);
    const slug = String(row.slug ?? scoring.slug ?? '');
    const name = String(row.name ?? scoring.name ?? slug);
    const destinationInterests = normalizedInterests(strings(scoring.interests));
    const interestHits = [...requested].filter((interest) => destinationInterests.has(interest));
    const bestMonths = Array.isArray(scoring.bestMonths)
      ? scoring.bestMonths.filter((item): item is number => typeof item === 'number')
      : [];
    const monthHits = months.filter((month) => bestMonths.includes(month)).length;
    const seasonalScore = months.length ? Math.round((monthHits / months.length) * 100) : 65;
    const cost = scoring.costPerDay && typeof scoring.costPerDay === 'object' ? scoring.costPerDay as Json : {};
    const stay = scoring.typicalStayDays && typeof scoring.typicalStayDays === 'object' ? scoring.typicalStayDays as Json : {};
    const communityScore = numberValue(scoring.communityScore, 60);
    const safetyScore = numberValue(scoring.safetyScore, 60);
    const base = outingDeterministicScore(scoring, context, requestedRaw, months);
    const inferredAdjustment = Math.max(-10, Math.min(10,
      destinationSignal(context, slug) + categorySignal(context, destinationInterests),
    ));
    const communityAdjustment = communitySignalAdjustment(
      options.communitySignals ?? [],
      'destination',
      slug,
    );
    const destinationCountryCode = String(scoring.countryCode ?? recordValue(scoring.catalog).countryCode ?? '').toUpperCase();
    const accessibility = recordValue(scoring.accessibility);
    const avoided = context.explicit.avoidances.find((avoidance) => {
      const normalized = avoidance.toLowerCase();
      return normalized.length > 2 && (
        destinationInterests.has(normalized) ||
        `${name} ${String(row.editorial_summary ?? scoring.editorialSummary ?? '')}`.toLowerCase().includes(normalized)
      );
    });
    const needsWheelchair = context.explicit.accessibilityNeeds.some((need) => need.toLowerCase().includes('wheelchair'));
    const wrongScope = context.explicit.travelScope && context.explicit.travelScope !== 'either' && destinationCountryCode && context.explicit.homeCountryCodes.length
      ? context.explicit.travelScope === 'domestic'
        ? !context.explicit.homeCountryCodes.includes(destinationCountryCode)
        : context.explicit.homeCountryCodes.includes(destinationCountryCode)
      : false;
    let fitScore = Math.max(0, Math.min(100, Math.round(base + inferredAdjustment + communityAdjustment)));
    if (budgetScore(cost, context.explicit.budgetLevel) < 25) fitScore = Math.min(fitScore, 45);
    if (avoided) fitScore = Math.min(fitScore, 25);
    if (needsWheelchair && accessibility.wheelchairFriendly !== true) fitScore = Math.min(fitScore, 20);
    if (wrongScope) fitScore = Math.min(fitScore, 15);
    const reasons = [
      ...(interestHits.length ? [`Matches ${interestHits.slice(0, 3).join(', ')}`] : []),
      ...(seasonalScore >= 70 ? ['Your timing overlaps a stronger season'] : []),
      ...(communityScore >= 75 ? ['Strong community activity'] : []),
      ...(safetyScore >= 80 ? ['Stronger reviewed LGBTQ+ context'] : []),
      ...(inferredAdjustment >= 3 ? ['Reflects places and activities you have engaged with'] : []),
      ...(communityAdjustment >= 2 ? ['Travelers with similar planning intent often keep this option'] : []),
    ].slice(0, 3);
    const tradeoffs = [
      ...(avoided ? [`Conflicts with your preference to avoid ${avoided}`] : []),
      ...(needsWheelchair && accessibility.wheelchairFriendly !== true ? ['Does not meet your stated wheelchair-accessibility requirement'] : []),
      ...(wrongScope ? [`Outside your ${context.explicit.travelScope} travel scope`] : []),
      ...(seasonalScore < 50 ? ['Your preferred timing is outside the strongest season'] : []),
      ...(budgetScore(cost, context.explicit.budgetLevel) < 60 ? ['Typical daily costs may stretch your budget'] : []),
      ...(safetyScore < 55 ? ['Local LGBTQ+ context needs extra review'] : []),
      ...(reasons.length < 2 ? ['Outing has limited matching evidence for this destination'] : []),
    ].slice(0, 2);
    return {
      id: `destination-${slug}`,
      kind: 'destination' as const,
      title: name,
      summary: String(row.editorial_summary ?? scoring.editorialSummary ?? `A potential match in ${String(row.country ?? '')}.`),
      destinationSlug: slug,
      fitScore,
      fitReasons: reasons.length ? reasons : ['A balanced match across your current preferences'],
      tradeoffs,
      sourceIds: ['outing-catalog'],
      confidence: Math.max(0.35, Math.min(1, numberValue(scoring.reviewCount, 0) / 100)),
      provisional: false as const,
      bookable: false as const,
      action: { type: 'open_destination' as const, value: slug },
    };
  }).sort((left, right) => right.fitScore - left.fitScore || left.destinationSlug.localeCompare(right.destinationSlug))
    .slice(0, Math.max(1, Math.min(options.limit ?? 5, 8)));
}

export type DecisionComparison = {
  version: 'v1';
  entityKind: 'destination';
  options: RankedDestination[];
  dimensions: Array<{
    key: string;
    label: string;
    values: Array<{ optionId: string; value: string; evidence?: string; sourceIds: string[] }>;
  }>;
  recommendation: string;
  tradeoffs: string[];
  sourceIds: string[];
  confidence: number;
  generatedAt: string;
};

export function compareDestinationRows(
  rows: Json[],
  context: PersonalizationContext,
  destinationSlugs: string[],
  generatedAt = new Date().toISOString(),
  communitySignals: CommunitySignal[] = [],
): DecisionComparison | undefined {
  const selected = rows.filter((row) => destinationSlugs.includes(String(row.slug ?? '')));
  if (selected.length < 2) return undefined;
  const ranked = rankDestinationRows(selected, context, {
    limit: Math.min(4, selected.length),
    communitySignals,
  });
  // The offline scoring payload intentionally stays compact. Reattach the
  // destination detail only in memory while building a comparison so callers
  // retain bookability context without duplicating the catalog on disk.
  const bySlug = new Map(selected.map((row) => {
    const scoring = scoringPayload(row);
    return [String(row.slug ?? ''), { ...scoring, catalog: recordValue(row.payload) }];
  }));
  const dimension = (
    key: string,
    label: string,
    formatter: (scoring: Json) => { value: string; evidence?: string },
  ) => ({
    key,
    label,
    values: ranked.map((option) => {
      const formatted = formatter(bySlug.get(option.destinationSlug) ?? {});
      return {
        optionId: option.id,
        ...formatted,
        sourceIds: ['outing-catalog'],
      };
    }),
  });
  const dimensions = [
    dimension('fit', 'Your fit', (scoring) => {
      const option = ranked.find((item) => item.destinationSlug === String(scoring.slug ?? ''));
      return { value: `${option?.fitScore ?? 0}%`, evidence: option?.fitReasons.join(' · ') };
    }),
    dimension('budget', 'Typical daily cost', (scoring) => {
      const cost = recordValue(scoring.costPerDay);
      const currency = typeof cost.currency === 'string' ? cost.currency : 'USD';
      const mid = numberValue(cost.mid, 0);
      return { value: mid ? `${currency} ${Math.round(mid)} per person` : 'Not verified' };
    }),
    dimension('timing', 'Timing', (scoring) => {
      const best = Array.isArray(scoring.bestMonths)
        ? scoring.bestMonths.filter((value): value is number => typeof value === 'number').slice(0, 5)
        : [];
      const preferred = context.explicit.preferredMonths.filter((month) => best.includes(month));
      return { value: preferred.length ? `Strong in month ${preferred.join(', ')}` : best.length ? `Best months ${best.join(', ')}` : 'Not verified' };
    }),
    dimension('pace', 'Trip shape', (scoring) => {
      const stay = recordValue(scoring.typicalStayDays);
      return {
        value: typeof stay.min === 'number' && typeof stay.max === 'number'
          ? `${stay.min}–${stay.max} days`
          : 'Flexible',
        evidence: context.explicit.activityPace ? `Compared with your ${context.explicit.activityPace} pace` : undefined,
      };
    }),
    dimension('community', 'Community context', (scoring) => ({
      value: `${Math.round(numberValue(scoring.communityScore, 0))}/100 activity`,
      evidence: String(scoring.legalStatus ?? 'Legal context not verified').replaceAll('_', ' '),
    })),
    dimension('accessibility', 'Accessibility', (scoring) => {
      const accessibility = recordValue(scoring.accessibility);
      return {
        value: accessibility.wheelchairFriendly === true
          ? 'Wheelchair-friendly context recorded'
          : context.explicit.accessibilityNeeds.length ? 'Needs additional verification' : 'No stated requirement',
      };
    }),
    dimension('bookability', 'Bookable inventory', (scoring) => {
      const catalog = recordValue(scoring.catalog);
      const places = Array.isArray(catalog.places) ? catalog.places.length : 0;
      const experiences = Array.isArray(catalog.experiences) ? catalog.experiences.length : 0;
      return { value: `${places + experiences} current catalog options` };
    }),
  ];
  const top = ranked[0]!;
  return {
    version: 'v1',
    entityKind: 'destination',
    options: ranked,
    dimensions,
    recommendation: `${top.title} is the strongest current fit at ${top.fitScore}%, based on your explicit preferences and current Outing data.`,
    tradeoffs: ranked.flatMap((item) => item.tradeoffs.map((tradeoff) => `${item.title}: ${tradeoff}`)).slice(0, 6),
    sourceIds: ['outing-catalog'],
    confidence: Math.min(...ranked.map((item) => item.confidence)),
    generatedAt,
  };
}

export type TripAuditIssue = {
  id: string;
  severity: 'info' | 'warning' | 'blocking';
  category: 'route' | 'hours' | 'weather' | 'budget' | 'pace' | 'avoidance' | 'accessibility' | 'repetition' | 'reservation' | 'group_conflict' | 'data_freshness';
  title: string;
  summary: string;
  dayId?: string;
  itemId?: string;
  sourceIds: string[];
};

export type TripAudit = {
  version: 'v1';
  tripId: string;
  score: number;
  summary: string;
  issues: TripAuditIssue[];
  sourceIds: string[];
  generatedAt: string;
};

function minutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/(?:T|^)(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function distanceKm(left: Json, right: Json): number | undefined {
  const leftCoords = recordValue(left.coords);
  const rightCoords = recordValue(right.coords);
  const lat1 = numberValue(leftCoords.lat, Number.NaN);
  const lng1 = numberValue(leftCoords.lng, Number.NaN);
  const lat2 = numberValue(rightCoords.lat, Number.NaN);
  const lng2 = numberValue(rightCoords.lng, Number.NaN);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return undefined;
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function auditTripRow(tripRow: Json, generatedAt = new Date().toISOString()): TripAudit {
  const payload = recordValue(tripRow.payload);
  const plan = recordValue(payload.tripPlan);
  const allItems = Array.isArray(plan.items) ? plan.items.map(recordValue) : [];
  const days = Array.isArray(plan.days) ? plan.days.map((value, index) => {
    const day = recordValue(value);
    const itemIds = strings(day.itemIds);
    const items = Array.isArray(day.items)
      ? day.items.map(recordValue)
      : allItems.filter((item) => itemIds.includes(String(item.itemId ?? item.id)) || Number(item.day) === Number(day.day ?? index + 1));
    return { ...day, items } as Json;
  }) : [];
  const planning = recordValue(payload.planningPreferences);
  const avoidances = strings(planning.avoidances).map((value) => value.toLowerCase());
  const accessibilityNeeds = strings(planning.accessibilityNeeds);
  const issues: TripAuditIssue[] = [];
  const add = (issue: Omit<TripAuditIssue, 'id' | 'sourceIds'>) => issues.push({
    ...issue,
    id: `${issue.category}-${issues.length + 1}`,
    sourceIds: ['outing-trip'],
  });

  if (!days.length) add({
    severity: 'blocking', category: 'data_freshness', title: 'The itinerary is not ready to audit',
    summary: 'Generate a trip plan before checking its timing, route, and balance.',
  });
  for (const [dayIndex, day] of days.entries()) {
    const dayId = String(day.dayId ?? day.id ?? dayIndex + 1);
    const items = Array.isArray(day.items) ? day.items.map(recordValue) : [];
    if (items.length > 6) add({
      severity: 'warning', category: 'pace', title: `Day ${dayIndex + 1} may feel overpacked`,
      summary: `${items.length} scheduled stops can leave little room for delays or spontaneous time.`, dayId,
    });
    const categories = items.map((item) => String(item.category ?? '').toLowerCase()).filter(Boolean);
    const repeated = [...new Set(categories)].find((category) => categories.filter((value) => value === category).length >= 3);
    if (repeated) add({
      severity: 'info', category: 'repetition', title: `Day ${dayIndex + 1} repeats the same kind of activity`,
      summary: `Three or more ${repeated.replaceAll('_', ' ')} stops may be intentional, but Outing can add contrast.`, dayId,
    });
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      const itemId = String(item.itemId ?? item.id ?? `${dayId}-${index}`);
      const text = `${String(item.title ?? '')} ${String(item.category ?? '')}`.toLowerCase();
      const conflict = avoidances.find((avoidance) => avoidance.length > 2 && text.includes(avoidance));
      if (conflict) add({
        severity: 'blocking', category: 'avoidance', title: 'An activity conflicts with things to avoid',
        summary: `${String(item.title ?? 'This activity')} appears to match “${conflict}.” Review it before keeping the plan.`, dayId, itemId,
      });
      if (accessibilityNeeds.length && item.accessibilityVerified !== true && typeof item.accessibilityNotes !== 'string') add({
        severity: 'warning', category: 'accessibility', title: 'Accessibility needs additional confirmation',
        summary: `${String(item.title ?? 'This stop')} does not have verified accessibility information for the group’s stated needs.`, dayId, itemId,
      });
      if ((item.requiresBooking === true || item.bookingRequired === true) && !['booked', 'reserved', 'completed'].includes(String(item.bookingStatus ?? '').toLowerCase())) add({
        severity: 'warning', category: 'reservation', title: 'A reservation may still be needed',
        summary: `${String(item.title ?? 'This activity')} is marked as requiring a booking, but no confirmed reservation is recorded.`, dayId, itemId,
      });
      const next = items[index + 1];
      if (next) {
        const startCurrent = minutes(item.startsAt ?? item.startAt ?? item.startTime ?? item.time);
        const end = minutes(item.endsAt ?? item.endAt ?? item.endTime) ??
          (startCurrent !== undefined && typeof item.duration === 'number' ? startCurrent + item.duration : undefined);
        const start = minutes(next.startsAt ?? next.startAt ?? next.startTime ?? next.time);
        if (end !== undefined && start !== undefined && start < end) add({
          severity: 'blocking', category: 'hours', title: 'Two itinerary items overlap',
          summary: `${String(item.title ?? 'One stop')} runs past the start of ${String(next.title ?? 'the next stop')}.`, dayId, itemId,
        });
        const travelMinutes = numberValue(recordValue(next.travelFromPrevious).durationMinutes, Number.NaN);
        const travelDistanceKm = distanceKm(item, next);
        if ((Number.isFinite(travelMinutes) && travelMinutes > 90) || (travelDistanceKm !== undefined && travelDistanceKm > 40)) add({
          severity: 'warning', category: 'route', title: 'A route leg may dominate the day',
          summary: `${String(item.title ?? 'One stop')} to ${String(next.title ?? 'the next stop')} needs ${Number.isFinite(travelMinutes) ? `${Math.round(travelMinutes)} minutes` : `about ${Math.round(travelDistanceKm!)} km`} of travel.`, dayId, itemId,
        });
      }
    }
  }
  const pricedItems = allItems.filter((item) => typeof item.estimatedCost === 'number');
  const estimatedActivityCost = pricedItems.reduce((sum, item) => sum + numberValue(item.estimatedCost, 0), 0);
  const planBudget = recordValue(plan.budget);
  const budgetHigh = numberValue(recordValue(recordValue(planBudget.perPerson).total).high, Number.NaN);
  if (Number.isFinite(budgetHigh) && estimatedActivityCost > budgetHigh) add({
    severity: 'warning', category: 'budget', title: 'Planned activities may exceed the current budget',
    summary: `Recorded activity costs total about ${Math.round(estimatedActivityCost)}, above the plan’s per-person high estimate of ${Math.round(budgetHigh)}.`,
  });
  const bookingTimeline = Array.isArray(plan.bookingTimeline) ? plan.bookingTimeline.map(recordValue) : [];
  const overdueBookings = bookingTimeline.filter((item) => item.status === 'open' && item.timing === 'book_soon');
  if (overdueBookings.length) add({
    severity: 'warning', category: 'reservation', title: `${overdueBookings.length} booking ${overdueBookings.length === 1 ? 'step is' : 'steps are'} still open`,
    summary: 'The trip plan marks these as book-soon actions. Outing will still require you to complete each provider handoff.',
  });
  const memberPrefs = Array.isArray(payload.memberPrefs) ? payload.memberPrefs.map(recordValue) : [];
  const paceValues = new Set(memberPrefs.map((item) => String(item.activityPace ?? '')).filter(Boolean));
  if (paceValues.size > 1 && days.some((day) => (Array.isArray(day.items) ? day.items.length : 0) > 5)) add({
    severity: 'warning', category: 'group_conflict', title: 'The busiest day may not fit everyone’s pace',
    summary: 'Group preferences include different activity paces. Keep one shared anchor and preserve a free window around it.',
  });
  const outdoorItems = allItems.filter((item) => /beach|park|hike|outdoor|walking|tour/i.test(`${String(item.category ?? '')} ${String(item.title ?? '')}`));
  const startDelta = typeof tripRow.start_date === 'string'
    ? new Date(tripRow.start_date).getTime() - Date.now()
    : Number.NaN;
  const startsSoon = Number.isFinite(startDelta) && startDelta >= -24 * 60 * 60_000 && startDelta <= 8 * 24 * 60 * 60_000;
  if (outdoorItems.length && startsSoon && !payload.weatherSnapshot) add({
    severity: 'info', category: 'weather', title: 'Outdoor plans need a current forecast check',
    summary: 'The trip starts within the forecast window, but no current weather result was included in this audit.',
  });
  const staleItem = allItems.find((item) => {
    const verifiedAt = typeof item.verifiedAt === 'string' ? new Date(item.verifiedAt).getTime() : Number.NaN;
    return Number.isFinite(verifiedAt) && Date.now() - verifiedAt > 30 * 24 * 60 * 60_000;
  });
  if (staleItem) add({
    severity: 'info', category: 'data_freshness', title: 'One or more place details may be stale',
    summary: 'Recheck current hours and availability before treating the itinerary as final.',
    itemId: String(staleItem.itemId ?? staleItem.id ?? ''),
  });
  const blocking = issues.filter((issue) => issue.severity === 'blocking').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const score = Math.max(0, 100 - blocking * 20 - warnings * 8 - issues.filter((issue) => issue.severity === 'info').length * 2);
  return {
    version: 'v1',
    tripId: String(tripRow.id ?? ''),
    score,
    summary: !issues.length
      ? 'The current plan is balanced against the information Outing can verify.'
      : `${issues.length} planning ${issues.length === 1 ? 'check needs' : 'checks need'} attention before the trip is locked.`,
    issues: issues.slice(0, 20),
    sourceIds: ['outing-trip'],
    generatedAt,
  };
}

export function safeConstraintRelaxations(input: {
  query: string;
  resultCount: number;
  hasDates?: boolean;
  hasBudget?: boolean;
  hasDestinationHint?: boolean;
}): Array<{
  id: string;
  dimension: 'dates' | 'nearby_destination' | 'budget';
  title: string;
  explanation: string;
  proposedValue: string;
  resultCount: number;
  requiresConsent: true;
}> {
  if (input.resultCount > 2) return [];
  return [
    ...(input.hasDates ? [{
      id: 'flex-dates', dimension: 'dates' as const, title: 'Try nearby dates',
      explanation: 'Shift the travel window by up to two weeks while keeping every destination and traveler requirement.',
      proposedValue: 'Dates ± 14 days', resultCount: input.resultCount, requiresConsent: true as const,
    }] : []),
    ...(input.hasDestinationHint ? [{
      id: 'nearby-destination', dimension: 'nearby_destination' as const, title: 'Include nearby destinations',
      explanation: 'Look just outside the named city or region without changing accessibility, safety, or avoidance requirements.',
      proposedValue: 'Nearby destinations', resultCount: input.resultCount, requiresConsent: true as const,
    }] : []),
    ...(input.hasBudget ? [{
      id: 'budget-band', dimension: 'budget' as const, title: 'Show the next budget band',
      explanation: 'Include slightly higher typical costs while keeping all non-price requirements fixed.',
      proposedValue: 'One budget band higher', resultCount: input.resultCount, requiresConsent: true as const,
    }] : []),
  ].slice(0, 3);
}

function recordValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

export function dynamicStarterPrompts(context: PersonalizationContext, scopeKind: string): string[] {
  const topInterests = context.explicit.interests.slice(0, 2);
  const saved = context.savedDestinationSlugs.slice(0, 2);
  const prompts = scopeKind === 'trip'
    ? [
        ...(!context.trip?.startDate ? ['Help us choose dates using seasonality, events, and any available fare observations'] : []),
        ...(!context.trip?.destinationSlug ? ['Which destination best fits this group’s shared preferences?'] : []),
        'Give us three anchor activity options for our biggest open window',
        'Where should we split up for optional activities without disrupting the group plan?',
        'What should we change to better balance energy and downtime?',
      ]
    : [
        topInterests.length ? `Where should I go for ${topInterests.join(' and ')}?` : 'Where should I go based on my travel style?',
        saved.length === 2
          ? `Compare ${saved[0]} and ${saved[1]} for me`
          : saved.length === 1 ? `Compare ${saved[0]} with a stronger alternative for me` : 'Compare two destinations that fit my budget',
        ...(context.explicit.preferredMonths[0]
          ? [`Where fits me best in month ${context.explicit.preferredMonths[0]}?`]
          : []),
        'Which upcoming travel window gives me the best combination of value and things to do?',
      ];
  return [...new Set(prompts)].slice(0, 4);
}

/**
 * Preserve user-fit ordering. A bookable option can only win a close tie of
 * two points or less, which prevents commission eligibility from outranking a
 * materially better organic choice.
 */
export function sortFitFirst<T extends { fitScore: number; bookable: boolean; id: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => {
    const delta = right.fitScore - left.fitScore;
    if (Math.abs(delta) > 2) return delta;
    if (left.bookable !== right.bookable) return left.bookable ? -1 : 1;
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });
}

export function groupPreferenceSummary(memberPrefs: unknown): NonNullable<PersonalizationContext['trip']>['groupPreferenceSummary'] | undefined {
  if (!Array.isArray(memberPrefs) || memberPrefs.length === 0) return undefined;
  const interestLists = memberPrefs.map((value) => {
    const row = value && typeof value === 'object' ? value as Json : {};
    return strings(row.interests);
  }).filter((values) => values.length > 0);
  const counts = new Map<string, number>();
  for (const values of interestLists) {
    for (const value of new Set(values)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const sharedInterests = [...counts.entries()].filter(([, count]) => count === interestLists.length).map(([value]) => value);
  const popularInterests = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([value]) => value);
  const rows = memberPrefs.map((value) => value && typeof value === 'object' ? value as Json : {});
  const paces = rows.map((row) => typeof row.activityPace === 'string' ? row.activityPace : undefined).filter(Boolean) as string[];
  const nightlife = rows.map((row) => typeof row.nightlifeImportance === 'number' ? row.nightlifeImportance : undefined).filter((value): value is number => value !== undefined);
  return {
    sharedInterests,
    popularInterests,
    ...(paces.length ? { pace: paces.sort()[Math.floor(paces.length / 2)] } : {}),
    ...(nightlife.length ? { nightlifeImportance: nightlife.reduce((sum, value) => sum + value, 0) / nightlife.length } : {}),
  };
}
