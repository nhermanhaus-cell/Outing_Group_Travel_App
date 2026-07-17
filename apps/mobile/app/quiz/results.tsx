import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scoreDestinations } from '@gayi/domain';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDestinations } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ScoreBreakdown } from '../../components/ui/ScoreBreakdown';
import { DataSourceBadge } from '../../components/ui/DataSourceBadge';
import type { QuizAnswers } from './index';
import type { Destination, TravelPreferences } from '@gayi/shared';
import type { RecommendationResult } from '@gayi/domain';

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
  };
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

  const results = useMemo<RecommendationResult[]>(() => {
    if (!scoring.length) return [];
    return scoreDestinations(prefs, scoring as Destination[]).slice(0, 10);
  }, [scoring, prefs]);

  const [expanded, setExpanded] = useState<string | null>(results[0]?.slug ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
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

      <FlatList
        data={results}
        keyExtractor={(r) => r.slug}
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.md,
          paddingBottom: insets.bottom + spacing['4xl'],
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
            <Text variant="h2">
              {results.length} destination{results.length !== 1 ? 's' : ''} for you
            </Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Ranked by how well they match your preferences.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: spacing['4xl'], alignItems: 'center', gap: spacing.md }}>
            <Text variant="h3" style={{ color: colors.textTertiary }}>No matches found</Text>
            <Button variant="secondary" onPress={() => router.back()}>Adjust quiz</Button>
          </View>
        }
        renderItem={({ item, index }) => (
          <ResultCard
            result={item}
            rank={index + 1}
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
  expanded,
  onToggle,
}: {
  result: RecommendationResult;
  rank: number;
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
        borderWidth: rank === 1 ? 2 : 1,
        borderColor: rank === 1 ? colors.accent : colors.cardBorder,
        overflow: 'hidden',
      }}
    >
      {/* Summary row */}
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
            {confidentPct}% confidence
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
          <Text variant="displaySm" style={{ color: colors.accent }}>
            {Math.round(result.overallMatch)}
          </Text>
          <Text variant="caption" style={{ color: colors.textTertiary }}>/ 100</Text>
        </View>
      </View>

      {/* Expanded detail */}
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
