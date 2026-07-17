import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import type { GlamourLevel } from '@gayi/shared';

// ─── Quiz state ───────────────────────────────────────────────────────────────

export interface QuizAnswers {
  originAirport: string;
  months: number[];
  duration: number;
  groupType: string;
  groupSize: number;
  glamourLevel: GlamourLevel;
  interests: string[];
  nightlife: number; // 0-5
  socialPrefs: string[];
  identityConsiderations: string[];
  activityPace: 'packed' | 'balanced' | 'downtime';
  lodgingStatus: 'none' | 'booked';
  lodgingAddress: string;
}

const DEFAULT_ANSWERS: QuizAnswers = {
  originAirport: '',
  months: [],
  duration: 7,
  groupType: 'couple',
  groupSize: 2,
  glamourLevel: 'comfortably_fabulous',
  interests: [],
  nightlife: 3,
  socialPrefs: [],
  identityConsiderations: [],
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

const GROUP_TYPES = [
  { key: 'solo', label: 'Solo' },
  { key: 'couple', label: 'Couple' },
  { key: 'friends', label: 'Friends' },
  { key: 'group', label: 'Group' },
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

const IDENTITY_OPTS = [
  { key: 'trans_friendly', label: 'Trans-inclusive spaces' },
  { key: 'bi_visible', label: 'Bi-visibility important' },
  { key: 'poc_spaces', label: 'POC queer spaces' },
  { key: 'gender_neutral_bathrooms', label: 'Gender-neutral facilities' },
  { key: 'accessibility', label: 'Accessibility needs' },
];

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

const TOTAL_STEPS = 9;

export default function QuizScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(DEFAULT_ANSWERS);

  const set = useCallback(<K extends keyof QuizAnswers>(key: K, val: QuizAnswers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
  }, []);

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
    else handleComplete();
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else router.back();
  };

  const handleComplete = () => {
    router.push({ pathname: '/quiz/results', params: { answers: JSON.stringify(answers) } });
  };

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const steps = [
    {
      title: 'Where are you flying from?',
      subtitle: 'Enter your nearest airport code or city.',
      content: (
        <TextInput
          value={answers.originAirport}
          onChangeText={(t) => set('originAirport', t.toUpperCase())}
          placeholder="e.g. LHR, JFK, SYD"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={5}
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: colors.textPrimary,
            borderBottomWidth: 2,
            borderBottomColor: answers.originAirport ? colors.accent : colors.border,
            paddingBottom: spacing.sm,
            letterSpacing: 4,
          }}
        />
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
          {[3, 5, 7, 10, 14, 21].map((d) => {
            const active = answers.duration === d;
            return (
              <Pressable
                key={d}
                onPress={() => set('duration', d)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.base,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentLight : colors.cardBackground,
                }}
              >
                <Text variant="displaySm" style={{ color: active ? colors.accent : colors.textPrimary, minWidth: 36 }}>
                  {d}
                </Text>
                <Text variant="bodyMd" style={{ color: active ? colors.accent : colors.textSecondary }}>
                  {d === 1 ? 'night' : 'nights'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ),
    },
    {
      title: "Who's coming?",
      subtitle: null,
      content: (
        <View style={{ gap: spacing.xl }}>
          <ChipSelect
            options={GROUP_TYPES}
            selected={[answers.groupType as never]}
            onChange={(v) => set('groupType', v[0] ?? 'solo')}
            multi={false}
          />
          <View style={{ gap: spacing.sm }}>
            <Text variant="labelMd" style={{ color: colors.textSecondary }}>Travelers</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Pressable
                onPress={() => set('groupSize', Math.max(1, answers.groupSize - 1))}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text variant="h2">–</Text>
              </Pressable>
              <Text variant="displaySm" style={{ minWidth: 32, textAlign: 'center' }}>{answers.groupSize}</Text>
              <Pressable
                onPress={() => set('groupSize', Math.min(20, answers.groupSize + 1))}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text variant="h2">+</Text>
              </Pressable>
            </View>
          </View>
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
              { key: 'balanced' as const, label: 'Balanced — classic Gay-i mix', hint: 'Sightseeing + evenings without overload' },
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

          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h3">Identity considerations</Text>
              <Pressable onPress={() => {}}>
                <Text variant="caption" style={{ color: colors.textTertiary }}>Optional · skip</Text>
              </Pressable>
            </View>
            <ChipSelect
              options={IDENTITY_OPTS}
              selected={answers.identityConsiderations as never[]}
              onChange={(v) => set('identityConsiderations', v as string[])}
            />
          </View>
        </View>
      ),
    },
  ];

  const currentStep = steps[step];

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
          {step + 1}/{TOTAL_STEPS}
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
          <Button size="lg" fullWidth onPress={goNext}>
            {step < TOTAL_STEPS - 1 ? 'Continue' : 'See my matches'}
          </Button>
          {step < TOTAL_STEPS - 1 && (
            <Button variant="ghost" fullWidth onPress={goNext}>
              Skip
            </Button>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
