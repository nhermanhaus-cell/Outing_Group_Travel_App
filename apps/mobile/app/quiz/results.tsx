import React, { useMemo, useState } from 'react';
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
import { DataSourceBadge } from '../../components/ui/DataSourceBadge';
import type { QuizAnswers } from './index';
import type { Destination, TravelPreferences } from '@gayi/shared';
import originHubsJson from '../../assets/editorial/origin-hubs.json';

function mapAnswersToPrefs(answers: QuizAnswers): TravelPreferences {
  return {
    budgetLevel: answers.glamourLevel,
    departureAirports: answers.originAirport ? [answers.originAirport] : [],
    travelMonths: answers.months.length > 0 ? answers.months : [6, 7, 8],
    tripDurationDays: answers.duration,
    groupSize: answers.groupSize,
    interests: answers.interests as TravelPreferences['interests'],
    accessibilityNeeds: [],
    nightlifeImportance: answers.nightlife / 5,
    weatherPreference: 'any',
    lgbtqSafetyPriority: 0.8,
    soloTravel: answers.groupType === 'solo',
    lookingFor: answers.socialPrefs as TravelPreferences['lookingFor'],
    activityPace: answers.activityPace ?? 'balanced',
    lodgingStatus: answers.lodgingStatus ?? 'none',
    lodgingAddress: answers.lodgingAddress || undefined,
  };
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
  const params = useLocalSearchParams<{ answers: string }>();

  const answers: QuizAnswers = useMemo(() => {
    try {
      return JSON.parse(params.answers ?? '{}');
    } catch {
      return {} as QuizAnswers;
    }
  }, [params.answers]);

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
    const ranked = scoreDestinations(prefs, destinations);
    return partitionRecommendations(ranked, hub);
  }, [scoring, prefs, hub]);

  const sections = useMemo<ResultSection[]>(() => {
    const list: ResultSection[] = [];
    if (partitioned.weekendNearby.length > 0) {
      list.push({
        key: 'weekend',
        title: 'Weekend nearby',
        subtitle: hub
          ? `Easy escapes from ${hub.label}.`
          : 'Nearby weekend ideas.',
        data: partitioned.weekendNearby,
      });
    }
    if (partitioned.quickFlights.length > 0) {
      list.push({
        key: 'quick',
        title: 'Quick flights',
        subtitle: 'Editorial short-hop ideas — not live flight inventory.',
        data: partitioned.quickFlights,
      });
    }
    list.push({
      key: 'best',
      title: 'Best matches',
      subtitle: partitioned.excludedHomeSlugs.length
        ? `Ranked for you (excluding ${partitioned.excludedHomeSlugs.join(', ')}).`
        : 'Ranked by how well they match your preferences.',
      data: partitioned.bestMatches.slice(0, 10),
    });
    return list.filter((s) => s.data.length > 0 || s.key === 'best');
  }, [partitioned, hub]);

  const [expanded, setExpanded] = useState<string | null>(
    partitioned.weekendNearby[0]?.slug ??
      partitioned.bestMatches[0]?.slug ??
      null,
  );

  const totalShown = sections.reduce((n, s) => n + s.data.length, 0);

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
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>←</Text>
        </Pressable>
        <Text variant="h3">Your matches</Text>
        <DataSourceBadge />
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
              {hub
                ? `Origin-aware picks for ${hub.label}. Your home city is never recommended.`
                : 'Ranked by how well they match your preferences.'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: spacing['4xl'], alignItems: 'center', gap: spacing.md }}>
            <Text variant="h3" style={{ color: colors.textTertiary }}>No matches found</Text>
            <Button variant="secondary" onPress={() => router.back()}>Adjust quiz</Button>
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
}: {
  result: RecommendationResult;
  rank: number;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const confidentPct = Math.round(result.dataConfidence * 100);

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
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            {badge ? `${badge} · ` : ''}{confidentPct}% confidence
          </Text>
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
              onPress={() => router.push(`/destinations/${result.slug}`)}
            >
              View destination
            </Button>
            <Button
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/trips/new', params: { destinationSlug: result.slug, destinationName: result.destinationName } })}
            >
              Create trip
            </Button>
          </View>
        </View>
      )}
    </Pressable>
  );
}
