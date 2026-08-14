import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  partitionRecommendations,
  resolveOriginHub,
  scoreDestinations,
  type OriginHub,
  type RecommendationResult,
} from '@gayi/domain';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDestinations } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { ScoreBreakdown } from '../../components/ui/ScoreBreakdown';
import type { QuizAnswers } from './index';
import {
  ANALYTICS_EVENTS,
  type Destination,
  type TravelPreferences,
} from '@gayi/shared';
import originHubsJson from '../../assets/editorial/origin-hubs.json';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { destinationPlanHref } from '../../src/lib/tripPlanningFlow';
import { parseQuizResultsAnswers } from '../../src/lib/quizResultsState';
import { PlanningExitButton } from '../../components/trip-wizard/planning-exit-button';
import { applyWrittenTravelIntent, deriveNightlifeImportance } from '../../src/lib/questionnaire-flow';

const RECOVERY_ANSWERS: QuizAnswers = {
  originAirport: '',
  travelRanges: [],
  travelScope: 'either',
  transportModes: [],
  months: [],
  duration: 7,
  groupType: 'solo',
  groupSize: 1,
  glamourLevel: 'comfortably_fabulous',
  interests: [],
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

function mapAnswersToPrefs(answers: QuizAnswers): TravelPreferences {
  const preferences: TravelPreferences = {
    budgetLevel: answers.glamourLevel,
    departureAirports: answers.originAirport ? [answers.originAirport] : [],
    travelRanges: answers.travelRanges ?? [],
    ...(answers.maxTravelTimeHours !== undefined ? { maxTravelTimeHours: answers.maxTravelTimeHours } : {}),
    travelScope: answers.travelScope ?? 'either',
    longDistanceTransportModes: answers.transportModes ?? [],
    homeAirports: answers.originAirport
      ? [{ iata: answers.originAirport, name: answers.originAirport, primary: true, source: 'manual' }]
      : [],
    travelMonths: answers.months.length > 0 ? answers.months : [6, 7, 8],
    tripDurationDays: answers.duration,
    groupSize: answers.groupSize,
    interests: answers.interests as TravelPreferences['interests'],
    accessibilityNeeds: [],
    nightlifeImportance: deriveNightlifeImportance({
      legacyNightlifeScore: answers.nightlife,
      interests: answers.interests,
      socialPrefs: answers.socialPrefs,
      tripGoals: answers.tripGoals,
      dayRhythm: answers.dayRhythm,
      avoidances: answers.avoidances,
      freeformWish: answers.freeformWish,
    }),
    weatherPreference: 'any',
    lgbtqSafetyPriority: 0.8,
    soloTravel: answers.groupType === 'solo',
    lookingFor: answers.socialPrefs as TravelPreferences['lookingFor'],
    activityPace: answers.activityPace ?? 'balanced',
    dayRhythm: answers.dayRhythm ?? 'flexible',
    lodgingStatus: answers.lodgingStatus ?? 'none',
    lodgingAddress: answers.lodgingAddress || undefined,
  };
  return applyWrittenTravelIntent(preferences, answers.tripGoals, answers.freeformWish);
}

type SectionKey = 'weekend' | 'quick' | 'best';

interface ResultSection {
  key: SectionKey;
  title: string;
  subtitle: string;
  data: RecommendationResult[];
}

export default function QuizResultsScreen() {
  const { colors, spacing } = useTheme();
  const { scoring } = useDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ answers?: string }>();
  const { track, preferenceSignals } = useAnalytics();
  const trackedResultsRef = useRef(false);

  const parsedAnswers = useMemo(
    () => parseQuizResultsAnswers<QuizAnswers>(params.answers),
    [params.answers],
  );
  const answers = parsedAnswers ?? RECOVERY_ANSWERS;
  const adjustQuiz = () => router.replace({
    pathname: '/quiz',
    params: { quizAnswers: JSON.stringify(answers) },
  });

  const prefs = useMemo(() => mapAnswersToPrefs(answers), [answers]);

  const hubs = (originHubsJson as { hubs: OriginHub[] }).hubs;

  const hub = useMemo(
    () => resolveOriginHub(prefs.departureAirports, hubs),
    [prefs.departureAirports, hubs],
  );

  const partitioned = useMemo(() => {
    if (!scoring.length) {
      return {
        weekendNearby: [] as RecommendationResult[],
        quickFlights: [] as RecommendationResult[],
        bestMatches: [] as RecommendationResult[],
        excludedHomeSlugs: [] as string[],
        hub: null as OriginHub | null,
      };
    }
    const destinations = scoring.map((row) => {
      const { catalog: _catalog, ...dest } = row as Destination & { catalog?: unknown };
      return dest;
    });
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const destinationSignals = new Map(
      preferenceSignals
        .filter((signal) =>
          signal.subjectType === 'destination' &&
          new Date(signal.lastObservedAt).getTime() >= cutoff
        )
        .map((signal) => [signal.subjectKey, signal]),
    );
    const ranked = scoreDestinations(prefs, destinations)
      .map((result) => {
        const signal = destinationSignals.get(result.slug);
        if (!signal) return result;
        return {
          ...result,
          overallMatch: Math.max(
            0,
            Math.min(100, result.overallMatch + signal.score * signal.confidence * 10),
          ),
        };
      })
      .sort((a, b) => b.overallMatch - a.overallMatch || a.slug.localeCompare(b.slug));
    return partitionRecommendations(ranked, hub);
  }, [scoring, prefs, hub, preferenceSignals]);

  const sections = useMemo<ResultSection[]>(() => {
    const list: ResultSection[] = [];
    if (prefs.travelRanges?.includes('road_trip') && partitioned.weekendNearby.length > 0) {
      list.push({
        key: 'weekend',
        title: 'Weekend nearby',
        subtitle: hub
          ? `Easy escapes from ${hub.label}.`
          : 'Nearby weekend ideas.',
        data: partitioned.weekendNearby,
      });
    }
    if (prefs.travelRanges?.includes('short_flight') && partitioned.quickFlights.length > 0) {
      list.push({
        key: 'quick',
        title: 'Quick flights',
        subtitle: 'Editorial short-hop ideas — not live flight inventory.',
        data: partitioned.quickFlights,
      });
    }
    list.push({
      key: 'best',
      title: prefs.travelRanges?.length ? 'Best matches in your ranges' : 'Best matches',
      subtitle: 'Ranked by how well they match your preferences.',
      data: partitioned.bestMatches.slice(0, 10),
    });
    return list.filter((s) => s.data.length > 0 || s.key === 'best');
  }, [partitioned, hub, prefs.travelRanges]);

  const [expanded, setExpanded] = useState<string | null>(
    partitioned.weekendNearby[0]?.slug ??
      partitioned.bestMatches[0]?.slug ??
      null,
  );

  const totalShown = sections.reduce((n, s) => n + s.data.length, 0);

  useEffect(() => {
    if (trackedResultsRef.current || totalShown === 0) return;
    trackedResultsRef.current = true;
    track(ANALYTICS_EVENTS.RECOMMENDATION_GENERATED, {
      recommendationType: 'destination_matches',
      resultCount: totalShown,
      algorithmVersion: 'destination-score-v1',
    });
  }, [totalShown, track]);

  if (!parsedAnswers) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <Text variant="displaySm">Let’s get your trip preferences first.</Text>
        <Text variant="bodyLg" style={{ color: colors.textSecondary }}>
          This match link is missing its answers. Nothing was lost—you can restart the questionnaire or browse destinations.
        </Text>
        <Button size="lg" onPress={() => router.replace('/quiz')}>Start my match</Button>
        <Button variant="ghost" onPress={() => router.replace('/discover')}>Browse destinations</Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Adjust questionnaire answers" onPress={adjustQuiz}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>←</Text>
        </Pressable>
        <Text variant="h3">Your matches</Text>
        <PlanningExitButton />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(r) => r.slug}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.md,
          paddingBottom: insets.bottom + spacing['4xl'],
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
            <Text variant="h2">
              {totalShown} destination{totalShown !== 1 ? 's' : ''} for you
            </Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Ranked by your interests, timing, and travel preferences.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: spacing['4xl'], alignItems: 'center', gap: spacing.md }}>
            <Text variant="h3" style={{ color: colors.textTertiary }}>No matches found</Text>
            <Button variant="secondary" onPress={adjustQuiz}>Adjust preferences</Button>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ gap: spacing.xxs, marginTop: spacing.md, marginBottom: spacing.xs }}>
            <Text variant="h3">{section.title}</Text>
            <Text variant="caption" style={{ color: colors.textTertiary }}>
              {section.subtitle}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <ResultCard
            result={item}
            rank={index + 1}
            badge={
              section.key === 'weekend'
                ? 'Weekend'
                : section.key === 'quick'
                  ? 'Quick flight'
                  : undefined
            }
            expanded={expanded === item.slug}
            onToggle={() => setExpanded((prev) => (prev === item.slug ? null : item.slug))}
            answers={answers}
          />
        )}
      />
    </View>
  );
}

function ResultCard({
  result,
  rank,
  badge,
  expanded,
  onToggle,
  answers,
}: {
  result: RecommendationResult;
  rank: number;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  answers: QuizAnswers;
}) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={onToggle}
      style={{
        backgroundColor: colors.cardBackground,
        borderRadius: radius.xl,
        borderWidth: rank === 1 && !badge ? 2 : 1,
        borderColor: rank === 1 && !badge ? colors.accent : colors.cardBorder,
        overflow: 'hidden',
        marginBottom: spacing.sm,
      }}
    >
      <View style={{ padding: spacing.base, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: rank <= 3 ? colors.accentLight : colors.backgroundSecondary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            variant="h3"
            style={{ color: rank <= 3 ? colors.accent : colors.textTertiary }}
          >
            {rank}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{result.destinationName}</Text>
          {badge ? <Text variant="caption" style={{ color: colors.textTertiary }}>{badge}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
          <Text variant="displaySm" style={{ color: colors.accent }}>
            {Math.round(result.overallMatch)}
          </Text>
          <Text variant="caption" style={{ color: colors.textTertiary }}>/ 100</Text>
        </View>
      </View>

      {expanded && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            padding: spacing.base,
            gap: spacing.lg,
          }}
        >
          <ScoreBreakdown result={result} />

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              style={{ flex: 1 }}
              variant="secondary"
              onPress={() => router.push({
                pathname: '/destinations/[slug]',
                params: {
                  slug: result.slug,
                  quizAnswers: JSON.stringify(answers),
                },
              })}
            >
              View destination
            </Button>
            <Button
              style={{ flex: 1 }}
              onPress={() => router.replace(destinationPlanHref({
                destinationSlug: result.slug,
                destinationName: result.destinationName,
              }, JSON.stringify(answers)))}
            >
              Personalize trip
            </Button>
          </View>
        </View>
      )}
    </Pressable>
  );
}
