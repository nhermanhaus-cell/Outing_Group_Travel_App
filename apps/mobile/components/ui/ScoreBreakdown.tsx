import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';
import { ProgressBar } from './ProgressBar';
import type { RecommendationResult } from '@gayi/domain';

interface ScoreBreakdownProps {
  result: RecommendationResult;
}

const SCORE_LABELS: Partial<Record<keyof RecommendationResult['componentScores'], string>> = {
  lgbtqLegal: 'LGBTQ+ Legal',
  publicAttitude: 'Public Attitude',
  budgetFit: 'Budget Fit',
  seasonalFit: 'Seasonal Fit',
  nightlifeMatch: 'Nightlife',
  interestMatch: 'Interests',
  communityActivity: 'Community',
  weatherMatch: 'Weather',
  dataConfidence: 'Confidence',
};

const TOP_KEYS = [
  'lgbtqLegal',
  'publicAttitude',
  'budgetFit',
  'seasonalFit',
  'nightlifeMatch',
  'interestMatch',
  'communityActivity',
] as const;

export function ScoreBreakdown({ result }: ScoreBreakdownProps) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        <Text variant="displaySm" style={{ color: colors.accent }}>
          {Math.round(result.overallMatch)}
        </Text>
        <Text variant="bodyMd" style={{ color: colors.textSecondary }}>/ 100 match</Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        {TOP_KEYS.map((key) => {
          const score = result.componentScores[key];
          if (score === undefined) return null;
          return (
            <ProgressBar
              key={key}
              value={score}
              label={SCORE_LABELS[key] ?? key}
              showValue
            />
          );
        })}
      </View>

      {result.topThreeReasons.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="labelMd" style={{ color: colors.textSecondary }}>Why it fits</Text>
          {result.topThreeReasons.map((reason, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Text style={{ color: colors.accent }}>✦</Text>
              <Text variant="bodySm" style={{ flex: 1, color: colors.textSecondary }}>{reason}</Text>
            </View>
          ))}
        </View>
      )}

      {result.twoTradeoffs.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="labelMd" style={{ color: colors.textSecondary }}>Tradeoffs</Text>
          {result.twoTradeoffs.map((tradeoff, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Text style={{ color: colors.textTertiary }}>◦</Text>
              <Text variant="bodySm" style={{ flex: 1, color: colors.textTertiary }}>{tradeoff}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
