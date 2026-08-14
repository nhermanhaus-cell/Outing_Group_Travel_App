import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme/ThemeProvider';
import { featureFlags } from '../../src/lib/featureFlags';
import { loadAssistantInsights } from '../../src/lib/assistant-api';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import {
  ANALYTICS_EVENTS,
  type DayRhythm,
  type GlamourLevel,
  type LongDistanceTransportMode,
  type TripGoal,
  type TravelRange,
  type TravelScope,
  type VacationStyle,
  type TripEssential,
} from '@gayi/shared';
import { useDestinations, useTravelProfile } from '../../src/providers/AppProviders';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { posthog } from '../../src/config/posthog';
import { airportDataAttribution, airports, nearestAirports, type AirportRecord } from '../../src/content/airports';
import { TravelerSelector, type GroupType } from '../../components/trip-wizard/TravelerSelector';
import { AirportAutocomplete } from '../../components/trip-wizard/airport-autocomplete';
import { QUIZ_BUDDY_DRAFT_KEY, TravelBuddyPicker } from '../../components/trip-wizard/travel-buddy-picker';
import { PlanningExitButton } from '../../components/trip-wizard/planning-exit-button';
import {
  questionnaireCompletionHref,
  selectedDestinationFromParams,
} from '../../src/lib/tripPlanningFlow';
import {
  getDestinationHallmarks,
  getDestinationInterestOptions,
  mergeDestinationHallmarkMedia,
} from '../../src/lib/destinationQuestionnaire';
import { shouldIncludeQuestionnaireStep } from '../../src/lib/questionnaire-flow';
import { lookupPlaceByName, resolveTripEssentials } from '../../src/lib/googlePlaces';

// ─── Quiz state ───────────────────────────────────────────────────────────────

export interface QuizAnswers {
  originAirport: string;
  travelRanges: TravelRange[];
  maxTravelTimeHours?: number;
  travelScope: TravelScope;
  transportModes: LongDistanceTransportMode[];
  months: number[];
  duration: number;
  groupType: string;
  groupSize: number;
  glamourLevel: GlamourLevel;
  interests: string[];
  nightlife: number; // 0-5
  socialPrefs: string[];
  collaboratorChoice?: 'now' | 'later';
  activityPace: 'packed' | 'balanced' | 'downtime';
  dayRhythm: DayRhythm;
  tripGoals: TripGoal[];
  vacationStyles: VacationStyle[];
  mealPreferences: string[];
  avoidances: string[];
  hallmarkIds: string[];
  hallmarkNames: string[];
  customEssentials: TripEssential[];
  freeformWish: string;
  lodgingStatus: 'none' | 'booked';
  lodgingAddress: string;
}

function analyticsStepId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

const DEFAULT_ANSWERS: QuizAnswers = {
  originAirport: '',
  travelRanges: ['short_flight', 'international'],
  maxTravelTimeHours: 4,
  travelScope: 'either',
  transportModes: ['plane'],
  months: [],
  duration: 7,
  groupType: 'couple',
  groupSize: 2,
  glamourLevel: 'comfortably_fabulous',
  interests: [],
  nightlife: 3,
  socialPrefs: [],
  activityPace: 'balanced',
  dayRhythm: 'flexible',
  tripGoals: [],
  vacationStyles: [],
  mealPreferences: [],
  avoidances: [],
  hallmarkIds: [],
  hallmarkNames: [],
  customEssentials: [],
  freeformWish: '',
  lodgingStatus: 'none',
  lodgingAddress: '',
};

const MONTHS = [
  { n: 1, label: 'Jan' }, { n: 2, label: 'Feb' }, { n: 3, label: 'Mar' },
  { n: 4, label: 'Apr' }, { n: 5, label: 'May' }, { n: 6, label: 'Jun' },
  { n: 7, label: 'Jul' }, { n: 8, label: 'Aug' }, { n: 9, label: 'Sep' },
  { n: 10, label: 'Oct' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dec' },
];

const GLAMOUR_LEVELS: Array<{ key: GlamourLevel; label: string }> = [
  { key: 'shoestring_slay', label: 'Budget — Shoestring Slay' },
  { key: 'cute_but_controlled', label: 'Mid — Cute but Controlled' },
  { key: 'comfortably_fabulous', label: 'Comfort — Comfortably Fabulous' },
  { key: 'luxury_gaycation', label: 'Luxury — Gaycation' },
  { key: 'no_budget_just_vibes', label: 'Unlimited — Just Vibes' },
];

const SOCIAL_PREFS = [
  { key: 'community', label: 'Find community' },
  { key: 'romance', label: 'Romance' },
  { key: 'dancing', label: 'Dancing' },
  { key: 'relaxation', label: 'Relaxation' },
  { key: 'exploration', label: 'Exploration' },
];

const TRIP_GOALS: Array<{ key: TripGoal; label: string }> = [
  { key: 'explore', label: 'See somewhere deeply' },
  { key: 'recharge', label: 'Come home restored' },
  { key: 'celebrate', label: 'Celebrate something' },
  { key: 'connect', label: 'Meet people & feel community' },
  { key: 'romance', label: 'Make it romantic' },
  { key: 'learn', label: 'Learn & understand' },
  { key: 'indulge', label: 'Treat myself' },
];

const MEAL_PREFERENCES = [
  { key: 'local_specialties', label: 'Local specialties' },
  { key: 'casual_gems', label: 'Casual neighborhood gems' },
  { key: 'fine_dining', label: 'Destination dining' },
  { key: 'markets_cafes', label: 'Markets & cafés' },
  { key: 'dietary_friendly', label: 'Dietary-friendly options' },
  { key: 'food_low_priority', label: 'Food is not a focus' },
];

const AVOIDANCES = [
  { key: 'early_mornings', label: 'Early mornings' },
  { key: 'late_nights', label: 'Late nights' },
  { key: 'crowds', label: 'Big crowds' },
  { key: 'long_walks', label: 'Long walks' },
  { key: 'long_lines', label: 'Long lines' },
  { key: 'too_many_reservations', label: 'Too many reservations' },
  { key: 'expensive_surprises', label: 'Expensive surprises' },
];

const JOURNEY_TIMES = [
  { hours: 2, label: 'Up to 2 hours' },
  { hours: 4, label: 'Up to 4 hours' },
  { hours: 6, label: 'Up to 6 hours' },
  { hours: 10, label: 'Up to 10 hours' },
  { hours: undefined, label: 'No time limit' },
] as const;

function deriveTravelRanges(hours: number | undefined, scope: TravelScope, modes: LongDistanceTransportMode[]): TravelRange[] {
  const ranges = new Set<TravelRange>();
  if (modes.includes('car') && (hours === undefined || hours <= 6)) ranges.add('road_trip');
  if ((modes.includes('plane') || modes.includes('train')) && hours !== undefined && hours <= 4) ranges.add('short_flight');
  if (scope !== 'international') ranges.add('long_domestic');
  if (scope !== 'domestic') ranges.add('international');
  return [...ranges];
}

// ─── Step components ──────────────────────────────────────────────────────────

function ChipSelect<T extends string>({
  options,
  selected,
  onChange,
  multi = true,
}: {
  options: Array<{ key: T; label: string }>;
  selected: T[];
  onChange: (v: T[]) => void;
  multi?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();

  const toggle = (key: T) => {
    if (multi) {
      onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
    } else {
      onChange([key]);
    }
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((opt) => {
        const active = selected.includes(opt.key);
        return (
          <Pressable
            key={opt.key}
            onPress={() => toggle(opt.key)}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.full,
              borderWidth: 1.5,
              borderColor: active ? colors.accent : colors.border,
              backgroundColor: active ? colors.accentLight : colors.cardBackground,
            }}
          >
            <Text
              variant="labelMd"
              style={{ color: active ? colors.accent : colors.textPrimary }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NightlifeSlider({
  value,
  onChange,
}: { value: number; onChange: (v: number) => void }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: n <= value ? colors.accent : colors.border,
              backgroundColor: n <= value ? colors.accentLight : colors.cardBackground,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              variant="h3"
              style={{ color: n <= value ? colors.accent : colors.textTertiary }}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>
        {value === 0 ? 'Not important' : value <= 2 ? 'Some nightlife' : value <= 4 ? 'Important' : 'Central to the trip'}
      </Text>
    </View>
  );
}

// ─── Main quiz ────────────────────────────────────────────────────────────────

export default function QuizScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile } = useTravelProfile();
  const { getBySlug } = useDestinations();
  const { track, observePreference, initialized: analyticsInitialized } = useAnalytics();
  const params = useLocalSearchParams<{
    destinationSlug?: string;
    destinationName?: string;
    destinationCandidateId?: string;
    quizAnswers?: string;
  }>();
  const selectedDestination = selectedDestinationFromParams(params);
  const destinationPrefilled = Boolean(selectedDestination);
  const resumedAfterDestinationChoice = Boolean(selectedDestination && params.quizAnswers);
  const catalogDestination = selectedDestination
    ? getBySlug(selectedDestination.destinationSlug)
    : undefined;
  const destinationInterestOptions = useMemo(
    () => getDestinationInterestOptions(catalogDestination),
    [catalogDestination],
  );
  const catalogHallmarks = useMemo(
    () => getDestinationHallmarks(catalogDestination),
    [catalogDestination],
  );
  const hallmarkMediaQuery = useQuery({
    queryKey: [
      'quiz-google-hallmark-media-v1',
      catalogDestination?.slug,
      catalogHallmarks.filter((item) => item.kind === 'place').map((item) => `${item.id}:${item.label}`).join('|'),
    ],
    queryFn: async () => {
      if (!catalogDestination) return [];
      const results = await Promise.all(catalogHallmarks
        .filter((item) => item.kind === 'place')
        .map(async (item) => {
          const place = await lookupPlaceByName(item.label, catalogDestination.name, {
            center: { lat: catalogDestination.lat, lng: catalogDestination.lng },
          });
          return place?.imageUrls[0]
            ? {
                hallmarkId: item.id,
                providerPlaceId: place.placeId,
                imageUrl: place.imageUrls[0],
                imageAttribution: place.imageAttributions?.[0],
              }
            : null;
        }));
      return results.filter((item): item is NonNullable<typeof item> => item != null);
    },
    enabled: Boolean(catalogDestination && catalogHallmarks.some((item) => item.kind === 'place')),
    staleTime: 24 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
    retry: 1,
  });
  const destinationHallmarks = useMemo(
    () => mergeDestinationHallmarkMedia(catalogHallmarks, hallmarkMediaQuery.data ?? []),
    [catalogHallmarks, hallmarkMediaQuery.data],
  );

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(() => {
    let prior: Partial<QuizAnswers> = {};
    try {
      prior = params.quizAnswers ? JSON.parse(params.quizAnswers) : {};
    } catch {
      prior = {};
    }
    return {
      ...DEFAULT_ANSWERS,
      ...prior,
      interests: prior.interests ?? [],
      socialPrefs: prior.socialPrefs ?? [],
      tripGoals: prior.tripGoals ?? profile.defaultTripGoals ?? [],
      vacationStyles: prior.vacationStyles ?? profile.defaultVacationStyles ?? [],
      mealPreferences: prior.mealPreferences ?? profile.defaultMealPreferences ?? [],
      avoidances: prior.avoidances ?? profile.defaultAvoidances ?? [],
      hallmarkIds: prior.hallmarkIds ?? [],
      hallmarkNames: prior.hallmarkNames ?? [],
      customEssentials: prior.customEssentials ?? [],
      dayRhythm: prior.dayRhythm ?? profile.defaultDayRhythm ?? 'flexible',
    };
  });
  const [nearbyAirports, setNearbyAirports] = useState<AirportRecord[]>([]);
  const [essentialInput, setEssentialInput] = useState('');
  const [essentialError, setEssentialError] = useState<string | null>(null);
  const [resolvingEssentials, setResolvingEssentials] = useState(false);
  const analyticsStartedAtRef = useRef(Date.now());
  const analyticsCompletedRef = useRef(false);
  const analyticsStartedRef = useRef(false);
  const currentAnalyticsStepRef = useRef({ id: 'unknown', index: 0 });

  useEffect(() => {
    if (!selectedDestination) return;
    const allowedHallmarks = new Map(destinationHallmarks.map((option) => [option.id, option.label]));
    setAnswers((current) => {
      const hallmarkIds = current.hallmarkIds.filter((id) => allowedHallmarks.has(id));
      const hallmarkNames = hallmarkIds.flatMap((id) => {
        const label = allowedHallmarks.get(id);
        return label ? [label] : [];
      });
      if (
        hallmarkIds.length === current.hallmarkIds.length
        && hallmarkNames.length === current.hallmarkNames.length
      ) return current;
      return { ...current, hallmarkIds, hallmarkNames };
    });
  }, [destinationHallmarks, selectedDestination]);

  useEffect(() => {
    const primary = profile.homeAirports.find((airport) => airport.primary) ?? profile.homeAirports[0];
    setAnswers((current) => ({
      ...current,
      originAirport: current.originAirport || primary?.iata || '',
      travelRanges: current.travelRanges.length > 0
        ? current.travelRanges
        : profile.preferredTravelRanges,
    }));
  }, [profile.homeAirports, profile.preferredTravelRanges]);

  const set = useCallback(<K extends keyof QuizAnswers>(key: K, val: QuizAnswers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
  }, []);

  const addCustomEssentials = useCallback(async () => {
    const text = essentialInput.trim();
    if (!text || !selectedDestination) return;
    setResolvingEssentials(true);
    setEssentialError(null);
    let resolved: TripEssential[] = [];
    try {
      resolved = await resolveTripEssentials({
        text,
        destinationName: selectedDestination.destinationName,
        ...(catalogDestination
          ? { center: { lat: catalogDestination.lat, lng: catalogDestination.lng } }
          : {}),
      });
    } catch {
      const fallbackLabels = text.split(/[\n;,]+/).map((value) => value.trim()).filter(Boolean).slice(0, 5);
      resolved = fallbackLabels.map((label, index) => ({
        id: `custom-${Date.now()}-${index}`,
        label,
        kind: 'activity',
        source: 'user',
        category: 'tour',
        summary: `A personal must-do you added for ${selectedDestination.destinationName}.`,
      }));
      setEssentialError('Saved as your own must-do. We’ll match live place details when they’re available.');
    } finally {
      setResolvingEssentials(false);
    }
    if (resolved.length === 0) {
      setEssentialError('Try a named place or an activity such as “a neighborhood food tour.”');
      return;
    }
    setAnswers((current) => {
      const existing = new Set(current.customEssentials.map((item) => item.label.trim().toLowerCase()));
      const additions = resolved.filter((item) => !existing.has(item.label.trim().toLowerCase()));
      return { ...current, customEssentials: [...current.customEssentials, ...additions] };
    });
    setEssentialInput('');
  }, [catalogDestination, essentialInput, selectedDestination]);

  const removeCustomEssential = useCallback((id: string) => {
    setAnswers((current) => ({
      ...current,
      customEssentials: current.customEssentials.filter((item) => item.id !== id),
    }));
  }, []);

  const suggestNearbyAirports = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    setNearbyAirports(nearestAirports(location.coords.latitude, location.coords.longitude).map((result) => result.airport));
  };

  const goNext = (skipped = false) => {
    track(ANALYTICS_EVENTS.QUESTIONNAIRE_STEP_COMPLETED, {
      stepId: analyticsStepId(currentStep.title),
      stepIndex: step,
      skipped,
    });
    if (step < totalSteps - 1) setStep((s) => s + 1);
    else handleComplete();
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else router.back();
  };

  const handleComplete = () => {
    analyticsCompletedRef.current = true;
    const completionDurationMs = Date.now() - analyticsStartedAtRef.current;
    track(ANALYTICS_EVENTS.QUESTIONNAIRE_COMPLETED, {
      stepCount: totalSteps,
      activeDurationMs: completionDurationMs,
      destinationPrefilled,
    });
    posthog.capture('questionnaire_completed', {
      step_count: totalSteps,
      active_duration_ms: completionDurationMs,
      destination_prefilled: destinationPrefilled,
      glamour_level: answers.glamourLevel,
      group_type: answers.groupType,
      travel_scope: answers.travelScope,
      interest_count: answers.interests.length,
      goal_count: answers.tripGoals.length,
      hallmark_count: answers.hallmarkIds.length,
      vacation_style_count: answers.vacationStyles.length,
    });
    const observedAt = new Date().toISOString();
    answers.interests.forEach((interest) => observePreference({
      subjectType: 'activity_category',
      subjectKey: interest,
      value: 0.8,
      weight: 1.5,
      source: 'accept',
      observedAt,
    }));
    answers.tripGoals.forEach((goal) => observePreference({
      subjectType: 'activity_category',
      subjectKey: `trip_goal:${goal}`,
      value: 0.7,
      weight: 1,
      source: 'accept',
      observedAt,
    }));
    observePreference({
      subjectType: 'pace',
      subjectKey: `${answers.activityPace}:${answers.dayRhythm}`,
      value: 0.8,
      weight: 1,
      source: 'accept',
      observedAt,
    });
    const airportCode = answers.originAirport.trim().toUpperCase();
    const airport = airports.find((item) => item.iata === airportCode);
    void updateProfile({
      homeAirports: airportCode
        ? [
            { iata: airportCode, name: airport?.name ?? airportCode, city: airport?.city, countryCode: airport?.countryCode, coords: airport ? { lat: airport.lat, lng: airport.lng } : undefined, primary: true, source: nearbyAirports.some((item) => item.iata === airportCode) ? 'nearby_suggestion' as const : 'manual' as const },
            ...profile.homeAirports.filter((item) => item.iata !== airportCode).map((item) => ({ ...item, primary: false })),
          ]
        : profile.homeAirports,
      preferredTravelRanges: answers.travelRanges,
      ...(answers.maxTravelTimeHours !== undefined ? { maxTravelTimeHours: answers.maxTravelTimeHours } : {}),
      travelScope: answers.travelScope,
      longDistanceTransportModes: answers.transportModes,
      defaultInterests: answers.interests as never[],
      preferredTravelMonths: answers.months,
      defaultGroupSize: answers.groupSize,
      defaultTripLengthDays: answers.duration,
      ...(answers.tripGoals.length > 0 ? { defaultTripGoals: answers.tripGoals } : {}),
      ...(answers.vacationStyles.length > 0 ? { defaultVacationStyles: answers.vacationStyles } : {}),
      defaultDayRhythm: answers.dayRhythm,
      ...(answers.mealPreferences.length > 0 ? { defaultMealPreferences: answers.mealPreferences } : {}),
      ...(answers.avoidances.length > 0 ? { defaultAvoidances: answers.avoidances } : {}),
      coarseHomeRegion: airport?.city,
    }).then(() => {
      if (featureFlags.proactiveInsightsV1) {
        void loadAssistantInsights({
          surface: 'home',
          trigger: 'quiz_completed',
          force: true,
        }).catch(() => undefined);
      }
    });
    router.replace(questionnaireCompletionHref(answers, selectedDestination));
  };

  const allSteps = [
    {
      phase: 'foundation' as const,
      title: 'Where are you starting from?',
      subtitle: 'Enter your city or choose a nearby airport.',
      content: (
        <View style={{ gap: spacing.md }}>
        <AirportAutocomplete value={answers.originAirport} onSelect={(airport) => set('originAirport', airport.iata)} placeholder="Start typing a city or airport" />
        <Button variant="secondary" onPress={suggestNearbyAirports}>Suggest airports near me</Button>
        {nearbyAirports.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            {nearbyAirports.map((airport) => (
              <Pressable key={airport.iata} onPress={() => set('originAirport', airport.iata)} style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: answers.originAirport === airport.iata ? colors.accentLight : colors.backgroundSecondary }}>
                <Text variant="labelLg">{airport.iata} · {airport.name}</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>{airport.city}</Text>
              </Pressable>
            ))}
            <Text variant="caption" style={{ color: colors.textTertiary }}>{airportDataAttribution} Precise location is not stored.</Text>
          </View>
        ) : null}
        </View>
      ),
    },
    {
      phase: 'discovery' as const,
      title: 'How far—and how—do you want to go?',
      subtitle: 'Choose a one-way travel time, where you want to travel, and the ways you would get there.',
      content: (
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}><Text variant="h3">Travel time</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{JOURNEY_TIMES.map((option) => { const active = answers.maxTravelTimeHours === option.hours; return <Pressable key={option.label} onPress={() => setAnswers((current) => ({ ...current, maxTravelTimeHours: option.hours, travelRanges: deriveTravelRanges(option.hours, current.travelScope, current.transportModes) }))} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1.5, borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentLight : colors.cardBackground }}><Text variant="labelMd" style={{ color: active ? colors.accent : colors.textPrimary }}>{option.label}</Text></Pressable>; })}</View></View>
          <View style={{ gap: spacing.sm }}><Text variant="h3">Domestic or international?</Text><ChipSelect options={[{ key: 'domestic', label: 'Domestic' }, { key: 'international', label: 'International' }, { key: 'either', label: 'Either' }]} selected={[answers.travelScope]} multi={false} onChange={([scope]) => scope && setAnswers((current) => ({ ...current, travelScope: scope, travelRanges: deriveTravelRanges(current.maxTravelTimeHours, scope, current.transportModes) }))} /></View>
          <View style={{ gap: spacing.sm }}><Text variant="h3">How do you want to go?</Text><ChipSelect options={[{ key: 'car', label: 'Car' }, { key: 'train', label: 'Train' }, { key: 'plane', label: 'Plane' }, { key: 'boat', label: 'Boat' }]} selected={answers.transportModes} onChange={(transportModes) => setAnswers((current) => ({ ...current, transportModes, travelRanges: deriveTravelRanges(current.maxTravelTimeHours, current.travelScope, transportModes) }))} /></View>
        </View>
      ),
    },
    {
      phase: 'foundation' as const,
      title: 'When can you travel?',
      subtitle: 'Select all months that work.',
      content: (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {MONTHS.map((m) => {
            const active = answers.months.includes(m.n);
            return (
              <Pressable
                key={m.n}
                onPress={() =>
                  set(
                    'months',
                    active ? answers.months.filter((x) => x !== m.n) : [...answers.months, m.n],
                  )
                }
                style={{
                  width: 64,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentLight : colors.cardBackground,
                  alignItems: 'center',
                }}
              >
                <Text
                  variant="labelMd"
                  style={{ color: active ? colors.accent : colors.textPrimary }}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ),
    },
    {
      phase: 'foundation' as const,
      title: 'How long is your trip?',
      subtitle: null,
      content: (
        <View style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {[3, 5, 7, 10, 14].map((d) => {
            const active = answers.duration === d;
            return (
              <Pressable
                key={d}
                onPress={() => set('duration', d)}
                style={{
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.full,
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentLight : colors.cardBackground,
                }}
              >
                <Text variant="labelLg" style={{ color: active ? colors.accent : colors.textPrimary }}>{d} days</Text>
              </Pressable>
            );
          })}
          </View>
          <View style={{ gap: spacing.sm }}><Text variant="h3">Custom number of days</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><Pressable onPress={() => set('duration', Math.max(1, answers.duration - 1))} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text variant="h2">–</Text></Pressable><TextInput value={String(answers.duration)} onChangeText={(value) => { const parsed = Number.parseInt(value, 10); if (Number.isFinite(parsed)) set('duration', Math.min(90, Math.max(1, parsed))); }} keyboardType="number-pad" selectTextOnFocus style={{ width: 70, textAlign: 'center', fontSize: 26, fontWeight: '700', color: colors.textPrimary, borderBottomWidth: 2, borderBottomColor: colors.accent, padding: spacing.xs }} /><Pressable onPress={() => set('duration', Math.min(90, answers.duration + 1))} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text variant="h2">+</Text></Pressable></View></View>
        </View>
      ),
    },
    {
      phase: 'foundation' as const,
      title: "Who's coming?",
      subtitle: null,
      content: (
        <View style={{ gap: spacing.xl }}>
          <TravelerSelector groupType={answers.groupType as GroupType} count={answers.groupSize} onChange={(groupType, count) => setAnswers((current) => ({ ...current, groupType, groupSize: count, collaboratorChoice: groupType === 'solo' ? undefined : current.collaboratorChoice }))} />
        </View>
      ),
    },
    {
      phase: 'foundation' as const,
      title: "What's your vibe?",
      subtitle: 'Budget & glamour level.',
      content: (
        <View style={{ gap: spacing.sm }}>
          {GLAMOUR_LEVELS.map((g) => {
            const active = answers.glamourLevel === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => set('glamourLevel', g.key)}
                style={{
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.base,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentLight : colors.cardBackground,
                }}
              >
                <Text
                  variant="labelLg"
                  style={{ color: active ? colors.accent : colors.textPrimary }}
                >
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ),
    },
    {
      phase: 'intent' as const,
      title: 'What are you looking for?',
      subtitle: 'Tell us in your own words. We’ll use it when matching destinations and shaping your trip.',
      content: (
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
            <TextInput
              value={answers.freeformWish}
              onChangeText={(value) => set('freeformWish', value.slice(0, 500))}
              placeholder="Warm weather, memorable meals, beautiful architecture, and enough downtime to wander…"
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
              style={{
                minHeight: 132,
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: answers.freeformWish ? colors.accent : colors.border,
                backgroundColor: colors.cardBackground,
                color: colors.textPrimary,
                fontSize: 16,
                lineHeight: 23,
              }}
            />
            <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'right' }}>
              {answers.freeformWish.length}/500
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            <Text variant="h3">A few quick signals</Text>
            <ChipSelect
              options={TRIP_GOALS}
              selected={answers.tripGoals}
              onChange={(value) => set('tripGoals', value)}
            />
          </View>
        </View>
      ),
    },
    {
      phase: 'interest' as const,
      title: 'What are you into?',
      subtitle: selectedDestination
        ? `Only showing interests that fit ${selectedDestination.destinationName}, plus flexible city favorites.`
        : 'Choose broad interests so we can find destinations that fit.',
      content: (
        <ChipSelect
          options={destinationInterestOptions}
          selected={answers.interests as never[]}
          onChange={(v) => set('interests', v as string[])}
        />
      ),
    },
    {
      phase: 'personalization' as const,
      title: `What feels essential in ${selectedDestination?.destinationName ?? 'this destination'}?`,
      subtitle: 'Choose suggested hallmarks or add your own. We’ll treat every selection as a must-have when building the itinerary.',
      content: (
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
          {destinationHallmarks.length > 0 ? destinationHallmarks.map((hallmark) => {
            const active = answers.hallmarkIds.includes(hallmark.id);
            return (
              <Pressable
                key={hallmark.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${hallmark.label}. ${hallmark.description}`}
                accessibilityHint={active ? 'Double tap to remove from your priorities' : 'Double tap to prioritize this in your itinerary'}
                onPress={() => setAnswers((current) => ({
                  ...current,
                  hallmarkIds: active
                    ? current.hallmarkIds.filter((id) => id !== hallmark.id)
                    : [...current.hallmarkIds, hallmark.id],
                  hallmarkNames: active
                    ? current.hallmarkNames.filter((name) => name !== hallmark.label)
                    : [...current.hallmarkNames, hallmark.label],
                }))}
                style={{
                  padding: spacing.sm,
                  borderRadius: radius.lg,
                  borderCurve: 'continuous',
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentLight : colors.cardBackground,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}
              >
                {hallmark.imageUrl ? (
                  <Image
                    source={{ uri: hallmark.imageUrl }}
                    recyclingKey={hallmark.imageUrl}
                    contentFit="cover"
                    transition={180}
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 24,
                      backgroundColor: colors.backgroundSecondary,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 24,
                      borderCurve: 'continuous',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.backgroundSecondary,
                    }}
                  >
                    <Text variant="h2" style={{ color: colors.textTertiary }}>✦</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: spacing.xxs, paddingVertical: spacing.xxs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                    <Text
                      variant="labelLg"
                      style={{ flex: 1, color: active ? colors.accent : colors.textPrimary }}
                    >
                      {hallmark.label}
                    </Text>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: active ? colors.accent : colors.border,
                        backgroundColor: active ? colors.accent : colors.cardBackground,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active ? <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '800' }}>✓</Text> : null}
                    </View>
                  </View>
                  <Text variant="caption" style={{ color: colors.textTertiary, textTransform: 'capitalize' }}>
                    {hallmark.kind}{hallmark.category ? ` · ${hallmark.category.replace(/_/g, ' ')}` : ''}
                  </Text>
                  <Text variant="bodySm" numberOfLines={3} style={{ color: colors.textSecondary }}>
                    {hallmark.description}
                  </Text>
                  {hallmark.imageProvider === 'google_places' ? (
                    <Text variant="caption" numberOfLines={1} style={{ color: colors.textTertiary }}>
                      Photo via Google{hallmark.imageAttribution ? ` · ${hallmark.imageAttribution}` : ''}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }) : (
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              We’ll use your interests to surface signature local choices.
            </Text>
          )}
          </View>

          <View
            style={{
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.xl,
              borderCurve: 'continuous',
              backgroundColor: colors.backgroundSecondary,
            }}
          >
            <View style={{ gap: spacing.xxs }}>
              <Text variant="h3">Add your own must-sees</Text>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                Name a place or describe an experience. Outing will match named places with Google and keep every idea in your plan.
              </Text>
            </View>
            <TextInput
              value={essentialInput}
              onChangeText={(value) => {
                setEssentialInput(value.slice(0, 500));
                if (essentialError) setEssentialError(null);
              }}
              onSubmitEditing={() => { void addCustomEssentials(); }}
              placeholder="The Louvre, a pastry class, sunset from a quiet viewpoint…"
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Your own must-see places and activities"
              style={{
                minHeight: 92,
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: essentialInput ? colors.accent : colors.border,
                backgroundColor: colors.cardBackground,
                color: colors.textPrimary,
                fontSize: 16,
                lineHeight: 22,
              }}
            />
            <Button
              size="sm"
              loading={resolvingEssentials}
              disabled={!essentialInput.trim() || !selectedDestination}
              onPress={() => { void addCustomEssentials(); }}
            >
              Match and add
            </Button>
            {essentialError ? (
              <Text variant="caption" style={{ color: colors.textSecondary }}>{essentialError}</Text>
            ) : null}
            {answers.customEssentials.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                {answers.customEssentials.map((essential) => (
                  <View
                    key={essential.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      padding: spacing.sm,
                      borderRadius: radius.lg,
                      borderCurve: 'continuous',
                      backgroundColor: colors.cardBackground,
                    }}
                  >
                    {essential.imageUrl ? (
                      <Image
                        source={{ uri: essential.imageUrl }}
                        recyclingKey={essential.imageUrl}
                        contentFit="cover"
                        style={{ width: 54, height: 54, borderRadius: 16 }}
                      />
                    ) : (
                      <View style={{ width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight }}>
                        <Text variant="h3" style={{ color: colors.accent }}>✦</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <Text variant="labelLg">{essential.label}</Text>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>
                        {essential.source === 'google_places' ? 'Matched with Google · required in itinerary' : 'Your idea · required in itinerary'}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${essential.label}`}
                      hitSlop={10}
                      onPress={() => removeCustomEssential(essential.id)}
                      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }}
                    >
                      <Text variant="labelLg" style={{ color: colors.textSecondary }}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ),
    },
    {
      phase: 'personalization' as const,
      title: 'Pace of your days?',
      subtitle: 'How much downtime vs activities do you want day to day?',
      content: (
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
            <Text variant="h3">Activity density</Text>
          {(
            [
              { key: 'packed' as const, label: 'Packed — fill the days', hint: 'More stops, fewer free blocks' },
              { key: 'balanced' as const, label: 'Balanced — classic Outing mix', hint: 'Sightseeing + evenings without overload' },
              { key: 'downtime' as const, label: 'Downtime — soft days', hint: 'Protected rest blocks every day' },
            ]
          ).map((opt) => {
            const active = answers.activityPace === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => set('activityPace', opt.key)}
                style={{
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.base,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentLight : colors.cardBackground,
                  gap: spacing.xxs,
                }}
              >
                <Text variant="labelLg" style={{ color: active ? colors.accent : colors.textPrimary }}>
                  {opt.label}
                </Text>
                <Text variant="caption" style={{ color: colors.textTertiary }}>{opt.hint}</Text>
              </Pressable>
            );
          })}
          </View>
          <View style={{ gap: spacing.sm }}>
            <Text variant="h3">Natural rhythm</Text>
            <ChipSelect
              options={[
                { key: 'early' as const, label: 'Early starts' },
                { key: 'flexible' as const, label: 'Flexible timing' },
                { key: 'late' as const, label: 'Slow mornings, later nights' },
              ]}
              selected={[answers.dayRhythm]}
              multi={false}
              onChange={([value]) => value && set('dayRhythm', value)}
            />
          </View>
        </View>
      ),
    },
    {
      phase: 'personalization' as const,
      title: 'Lodging sorted?',
      subtitle: 'If you already booked an Airbnb or hotel, we can prioritize nearby spots.',
      content: (
        <View style={{ gap: spacing.lg }}>
          {(
            [
              { key: 'none' as const, label: 'Not yet — suggest neighborhoods' },
              { key: 'booked' as const, label: 'Already booked — find spots nearby' },
            ]
          ).map((opt) => {
            const active = answers.lodgingStatus === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => set('lodgingStatus', opt.key)}
                style={{
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.base,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentLight : colors.cardBackground,
                }}
              >
                <Text variant="labelLg" style={{ color: active ? colors.accent : colors.textPrimary }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
          {answers.lodgingStatus === 'booked' ? (
            <TextInput
              value={answers.lodgingAddress}
              onChangeText={(t) => set('lodgingAddress', t)}
              placeholder="Paste Airbnb/hotel address or link"
              placeholderTextColor={colors.textTertiary}
              style={{
                fontSize: 16,
                color: colors.textPrimary,
                borderBottomWidth: 2,
                borderBottomColor: answers.lodgingAddress ? colors.accent : colors.border,
                paddingBottom: spacing.sm,
              }}
            />
          ) : null}
        </View>
      ),
    },
    {
      phase: 'personalization' as const,
      title: 'A few last things…',
      subtitle: null,
      content: (
        <View style={{ gap: spacing['2xl'] }}>
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Nightlife importance</Text>
            <NightlifeSlider value={answers.nightlife} onChange={(v) => set('nightlife', v)} />
          </View>

          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Looking for…</Text>
            <ChipSelect
              options={SOCIAL_PREFS}
              selected={answers.socialPrefs as never[]}
              onChange={(v) => set('socialPrefs', v as string[])}
            />
          </View>

          <View style={{ gap: spacing.md }}>
            <Text variant="h3">How should we handle food?</Text>
            <ChipSelect
              options={MEAL_PREFERENCES}
              selected={answers.mealPreferences as never[]}
              onChange={(value) => set('mealPreferences', value as string[])}
            />
          </View>

        </View>
      ),
    },
    {
      phase: 'personalization' as const,
      title: 'Things to avoid',
      subtitle: 'Choose anything you’d rather have less of. We’ll use it to shape your recommendations.',
      content: (
        <ChipSelect
          options={AVOIDANCES}
          selected={answers.avoidances as never[]}
          onChange={(value) => set('avoidances', value as string[])}
        />
      ),
    },
    ...(answers.groupType !== 'solo' ? [{
      phase: 'personalization' as const,
      title: 'Bring your travel buddies in?',
      subtitle: 'Add them now to keep their contact selections ready for the trip, or invite them later from the trip hub.',
      content: (
        <View style={{ gap: spacing.md }}>
          {([{ key: 'now' as const, label: 'Add your travel buddies now' }, { key: 'later' as const, label: 'I’ll add them later' }]).map((choice) => { const active = answers.collaboratorChoice === choice.key; return <Pressable key={choice.key} onPress={() => set('collaboratorChoice', choice.key)} style={{ padding: spacing.base, borderRadius: radius.lg, borderWidth: 1.5, borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentLight : colors.cardBackground }}><Text variant="labelLg" style={{ color: active ? colors.accent : colors.textPrimary }}>{choice.label}</Text></Pressable>; })}
          {answers.collaboratorChoice === 'now' ? <TravelBuddyPicker draftKey={QUIZ_BUDDY_DRAFT_KEY} autoRequest /> : null}
        </View>
      ),
    }] : []),
  ];

  const steps = allSteps.filter((candidate) => shouldIncludeQuestionnaireStep(candidate.phase, {
    hasDestination: Boolean(selectedDestination),
    resumedAfterDestinationChoice,
  }));

  const totalSteps = steps.length;
  const progress = ((step + 1) / totalSteps) * 100;

  const currentStep = steps[step];
  currentAnalyticsStepRef.current = {
    id: analyticsStepId(currentStep.title),
    index: step,
  };

  useEffect(() => {
    if (!analyticsInitialized || analyticsStartedRef.current) return;
    analyticsStartedRef.current = true;
    analyticsStartedAtRef.current = Date.now();
    const entryPoint = selectedDestination ? 'destination_detail' : 'trip_planning';
    track(ANALYTICS_EVENTS.QUESTIONNAIRE_STARTED, {
      entryPoint,
      destinationPrefilled,
    });
    posthog.capture('questionnaire_started', {
      entry_point: entryPoint,
      destination_prefilled: destinationPrefilled,
    });
    return () => {
      if (analyticsCompletedRef.current) return;
      const abandonMs = Date.now() - analyticsStartedAtRef.current;
      track(ANALYTICS_EVENTS.QUESTIONNAIRE_ABANDONED, {
        stepId: currentAnalyticsStepRef.current.id,
        stepIndex: currentAnalyticsStepRef.current.index,
        activeDurationMs: abandonMs,
      });
      posthog.capture('questionnaire_abandoned', {
        step_id: currentAnalyticsStepRef.current.id,
        step_index: currentAnalyticsStepRef.current.index,
        active_duration_ms: abandonMs,
      });
    };
  }, [analyticsInitialized, destinationPrefilled, track]);

  useEffect(() => {
    if (!analyticsInitialized) return;
    track(ANALYTICS_EVENTS.QUESTIONNAIRE_STEP_VIEWED, {
      stepId: analyticsStepId(currentStep.title),
      stepIndex: step,
    });
  }, [analyticsInitialized, currentStep.title, step, track]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Nav header */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Pressable onPress={goBack} style={{ padding: spacing.xs }}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={progress} />
        </View>
        <Text variant="caption" style={{ color: colors.textTertiary }}>
          {selectedDestination
            ? `${selectedDestination.destinationName} · ${step + 1}/${totalSteps}`
            : `${step + 1}/${totalSteps}`}
        </Text>
        <PlanningExitButton compact />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing['2xl'],
          paddingBottom: insets.bottom + spacing['4xl'],
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: spacing.sm }}>
          <Text variant="displayMd">{currentStep.title}</Text>
          {currentStep.subtitle ? (
            <Text variant="bodyLg" style={{ color: colors.textSecondary }}>
              {currentStep.subtitle}
            </Text>
          ) : null}
        </View>

        {currentStep.content}

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button size="lg" fullWidth onPress={() => goNext(false)}>
            {step < totalSteps - 1
              ? 'Continue'
              : selectedDestination
                ? 'Continue to trip'
                : 'See my matches'}
          </Button>
          {step < totalSteps - 1 && (
            <Button variant="ghost" fullWidth onPress={() => goNext(true)}>
              Skip
            </Button>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
