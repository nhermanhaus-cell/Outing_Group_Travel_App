import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import * as Location from 'expo-location';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import {
  ANALYTICS_EVENTS,
  type GlamourLevel,
  type LongDistanceTransportMode,
  type TravelRange,
  type TravelScope,
} from '@gayi/shared';
import { useTravelProfile } from '../../src/providers/AppProviders';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { airportDataAttribution, airports, nearestAirports, type AirportRecord } from '../../src/content/airports';
import { TravelerSelector, type GroupType } from '../../components/trip-wizard/TravelerSelector';
import { AirportAutocomplete } from '../../components/trip-wizard/airport-autocomplete';
import { QUIZ_BUDDY_DRAFT_KEY, TravelBuddyPicker } from '../../components/trip-wizard/travel-buddy-picker';
import {
  questionnaireCompletionHref,
  selectedDestinationFromParams,
} from '../../src/lib/tripPlanningFlow';

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
  lodgingStatus: 'none',
  lodgingAddress: '',
};

const MONTHS = [
  { n: 1, label: 'Jan' }, { n: 2, label: 'Feb' }, { n: 3, label: 'Mar' },
  { n: 4, label: 'Apr' }, { n: 5, label: 'May' }, { n: 6, label: 'Jun' },
  { n: 7, label: 'Jul' }, { n: 8, label: 'Aug' }, { n: 9, label: 'Sep' },
  { n: 10, label: 'Oct' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dec' },
];

const INTERESTS_OPTIONS = [
  { key: 'nightlife', label: 'Nightlife' },
  { key: 'beach', label: 'Beach' },
  { key: 'food', label: 'Food & Drink' },
  { key: 'art', label: 'Art & Culture' },
  { key: 'pride', label: 'Pride Events' },
  { key: 'hiking', label: 'Outdoors' },
  { key: 'history', label: 'History' },
  { key: 'wellness', label: 'Wellness' },
  { key: 'lgbtq_venues', label: 'Queer Venues' },
  { key: 'drag', label: 'Drag' },
  { key: 'music', label: 'Music' },
  { key: 'shopping', label: 'Shopping' },
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
  const { track, initialized: analyticsInitialized } = useAnalytics();
  const params = useLocalSearchParams<{
    destinationSlug?: string;
    destinationName?: string;
  }>();
  const selectedDestination = selectedDestinationFromParams(params);
  const destinationPrefilled = Boolean(selectedDestination);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(DEFAULT_ANSWERS);
  const [nearbyAirports, setNearbyAirports] = useState<AirportRecord[]>([]);
  const analyticsStartedAtRef = useRef(Date.now());
  const analyticsCompletedRef = useRef(false);
  const analyticsStartedRef = useRef(false);
  const currentAnalyticsStepRef = useRef({ id: 'unknown', index: 0 });

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
    track(ANALYTICS_EVENTS.QUESTIONNAIRE_COMPLETED, {
      stepCount: totalSteps,
      activeDurationMs: Date.now() - analyticsStartedAtRef.current,
      destinationPrefilled,
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
      defaultGroupSize: answers.groupSize,
      defaultTripLengthDays: answers.duration,
      coarseHomeRegion: airport?.city,
    });
    router.push(questionnaireCompletionHref(answers, selectedDestination));
  };

  const steps = [
    {
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
      title: "Who's coming?",
      subtitle: null,
      content: (
        <View style={{ gap: spacing.xl }}>
          <TravelerSelector groupType={answers.groupType as GroupType} count={answers.groupSize} onChange={(groupType, count) => setAnswers((current) => ({ ...current, groupType, groupSize: count, collaboratorChoice: groupType === 'solo' ? undefined : current.collaboratorChoice }))} />
        </View>
      ),
    },
    {
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
      title: 'What are you into?',
      subtitle: 'Pick everything that excites you.',
      content: (
        <ChipSelect
          options={INTERESTS_OPTIONS}
          selected={answers.interests as never[]}
          onChange={(v) => set('interests', v as string[])}
        />
      ),
    },
    {
      title: 'Pace of your days?',
      subtitle: 'How much downtime vs activities do you want day to day?',
      content: (
        <View style={{ gap: spacing.sm }}>
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
      ),
    },
    {
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

        </View>
      ),
    },
    ...(answers.groupType !== 'solo' ? [{
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
    track(ANALYTICS_EVENTS.QUESTIONNAIRE_STARTED, {
      entryPoint: selectedDestination ? 'destination_detail' : 'trip_planning',
      destinationPrefilled,
    });
    return () => {
      if (analyticsCompletedRef.current) return;
      track(ANALYTICS_EVENTS.QUESTIONNAIRE_ABANDONED, {
        stepId: currentAnalyticsStepRef.current.id,
        stepIndex: currentAnalyticsStepRef.current.index,
        activeDurationMs: Date.now() - analyticsStartedAtRef.current,
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
