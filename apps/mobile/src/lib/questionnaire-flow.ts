import type { Interest, TravelPreferences, TripGoal, WeatherPreference } from '@gayi/shared';

export type QuestionnaireStepPhase =
  | 'foundation'
  | 'discovery'
  | 'intent'
  | 'interest'
  | 'personalization';

interface QuestionnaireFlowState {
  hasDestination: boolean;
  resumedAfterDestinationChoice: boolean;
}

export function shouldIncludeQuestionnaireStep(
  phase: QuestionnaireStepPhase,
  state: QuestionnaireFlowState,
): boolean {
  if (state.resumedAfterDestinationChoice) return phase === 'personalization';
  if (state.hasDestination) return phase !== 'discovery';
  return phase !== 'personalization';
}

type NightlifePreferenceInput = {
  /** Kept only so saved questionnaire links from older app versions still work. */
  legacyNightlifeScore?: number;
  interests?: string[];
  socialPrefs?: string[];
  tripGoals?: string[];
  dayRhythm?: string;
  avoidances?: string[];
  freeformWish?: string;
};

/**
 * Derive a modest itinerary signal from choices the traveler already made,
 * instead of asking for a separate nightlife-importance score.
 */
export function deriveNightlifeImportance(input: NightlifePreferenceInput): number {
  if (input.avoidances?.includes('late_nights') || /\b(no|avoid|skip) nightlife\b/i.test(input.freeformWish ?? '')) {
    return 0.1;
  }
  if (Number.isFinite(input.legacyNightlifeScore)) {
    return Math.max(0, Math.min(1, Number(input.legacyNightlifeScore) / 5));
  }

  let importance = 0.3;
  if (input.interests?.includes('nightlife')) importance += 0.3;
  if (input.socialPrefs?.includes('dancing')) importance += 0.15;
  if (input.tripGoals?.includes('celebrate')) importance += 0.1;
  if (input.dayRhythm === 'late') importance += 0.1;
  if (/\b(nightlife|clubs?|bars?|dancing|late nights?)\b/i.test(input.freeformWish ?? '')) importance += 0.15;
  return Math.max(0, Math.min(1, Math.round(importance * 100) / 100));
}

const INTEREST_TERMS: Array<{ interest: Interest; terms: RegExp }> = [
  { interest: 'beach', terms: /\b(beach|beaches|coast|coastal|ocean|seaside)\b/i },
  { interest: 'hiking', terms: /\b(hike|hiking|trail|trails|mountain|mountains|outdoors|nature)\b/i },
  { interest: 'culture', terms: /\b(culture|cultural|architecture|museum|museums)\b/i },
  { interest: 'nightlife', terms: /\b(nightlife|night out|club|clubs|bar|bars|dancing)\b/i },
  { interest: 'food', terms: /\b(food|restaurant|restaurants|culinary|cuisine|dining|wine)\b/i },
  { interest: 'art', terms: /\b(art|arts|gallery|galleries|museum|museums|design)\b/i },
  { interest: 'history', terms: /\b(history|historic|historical|heritage|architecture)\b/i },
  { interest: 'shopping', terms: /\b(shop|shopping|boutique|boutiques|fashion)\b/i },
  { interest: 'wellness', terms: /\b(wellness|spa|relax|relaxing|rest|recharge)\b/i },
  { interest: 'adventure', terms: /\b(adventure|adventurous|rafting|diving|surfing)\b/i },
  { interest: 'pride', terms: /\b(pride|queer festival|lgbtq festival)\b/i },
  { interest: 'music', terms: /\b(music|concert|concerts|jazz|festival)\b/i },
  { interest: 'sports', terms: /\b(sport|sports|game|games)\b/i },
  { interest: 'lgbtq_venues', terms: /\b(queer|lgbtq|gay neighborhood|gay nightlife)\b/i },
  { interest: 'drag', terms: /\b(drag|drag show|drag brunch)\b/i },
];

const GOAL_INTERESTS: Partial<Record<TripGoal, Interest[]>> = {
  recharge: ['wellness'],
  celebrate: ['nightlife'],
  learn: ['culture', 'history'],
  indulge: ['food', 'shopping'],
};

function weatherFromWish(wish: string): WeatherPreference | undefined {
  if (/\b(hot|tropical|heat)\b/i.test(wish)) return 'hot';
  if (/\b(warm|sunny|sunshine)\b/i.test(wish)) return 'warm';
  if (/\b(cool|cold|snow|ski|winter weather)\b/i.test(wish)) return 'cool';
  if (/\b(mild|temperate)\b/i.test(wish)) return 'mild';
  return undefined;
}

export function applyWrittenTravelIntent(
  preferences: TravelPreferences,
  tripGoals: TripGoal[],
  freeformWish: string,
): TravelPreferences {
  const interests = new Set<Interest>(preferences.interests);
  tripGoals.forEach((goal) => GOAL_INTERESTS[goal]?.forEach((interest) => interests.add(interest)));
  INTEREST_TERMS.forEach(({ interest, terms }) => {
    if (terms.test(freeformWish)) interests.add(interest);
  });

  const writtenWeather = weatherFromWish(freeformWish);
  return {
    ...preferences,
    interests: [...interests],
    weatherPreference: writtenWeather ?? preferences.weatherPreference,
  };
}
