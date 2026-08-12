import React, { useEffect, useRef } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssistantDecisionCard } from '@gayi/shared';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { Text } from '../ui/Text';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { OutingIcon } from '../ui/OutingIcon';

function confidenceBucket(value: number): string {
  if (value >= 0.8) return 'high';
  if (value >= 0.55) return 'medium';
  return 'limited';
}

const FRESHNESS_LABELS: Record<AssistantDecisionCard['sourceFreshness'], string> = {
  live: 'Live sources',
  recent: 'Recently checked',
  cached: 'Saved insight',
  stale: 'Offline · last saved',
  limited: 'Limited evidence',
};

export function DecisionBriefCard({
  card,
  surface,
  onAction,
}: {
  card: AssistantDecisionCard;
  surface: 'home' | 'discover' | 'destination' | 'trip' | 'compare';
  onAction?: (card: AssistantDecisionCard) => void;
}) {
  const { colors, spacing, radius, shadows } = useTheme();
  const { track } = useAnalytics();
  const router = useRouter();
  const viewedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (viewedRef.current === card.id) return;
    viewedRef.current = card.id;
    track(ANALYTICS_EVENTS.ASSISTANT_DECISION_VIEWED, {
      surface,
      decisionKind: card.kind,
      freshness: card.sourceFreshness,
      confidenceBucket: confidenceBucket(card.confidence),
    });
  }, [card, surface, track]);

  const runAction = async () => {
    if (!card.action) return;
    track(ANALYTICS_EVENTS.ASSISTANT_DECISION_ACTIONED, {
      surface,
      decisionKind: card.kind,
      actionType: card.action.type,
    });
    if (onAction) {
      onAction(card);
      return;
    }
    if (card.action.type === 'open_destination') router.push(`/destinations/${card.action.value}`);
    else if (card.action.type === 'open_compare') router.push({ pathname: '/compare', params: { slugs: card.action.value } });
    else if (card.action.type === 'open_trip') router.push(`/trips/${card.action.value}`);
    else if (card.action.type === 'ask_follow_up') router.push({ pathname: '/ask', params: { prompt: card.action.value } });
    else if (card.action.type === 'open_url') await Linking.openURL(card.action.value);
  };

  return (
    <View
      style={{
        padding: spacing.lg,
        borderRadius: radius['2xl'],
        backgroundColor: colors.plumLight,
        borderWidth: 1,
        borderColor: colors.plum,
        gap: spacing.md,
        ...shadows.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.plum, alignItems: 'center', justifyContent: 'center' }}>
          <OutingIcon name="spark" color={colors.white} size={20} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="labelSm" style={{ color: colors.plum, letterSpacing: 1.1 }}>OUTING DECISION BRIEF</Text>
          <Text variant="h3">{card.title}</Text>
        </View>
        <Badge label={FRESHNESS_LABELS[card.sourceFreshness]} variant={card.sourceFreshness === 'stale' ? 'warning' : 'info'} />
      </View>

      <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{card.summary}</Text>

      {card.fitReasons.length ? (
        <View style={{ gap: spacing.xs }}>
          {card.fitReasons.slice(0, 3).map((reason) => (
            <View key={reason} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Text style={{ color: colors.pool }}>✓</Text>
              <Text variant="bodySm" style={{ flex: 1 }}>{reason}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {card.tradeoffs.length ? (
        <View style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.xs }}>
          <Text variant="labelSm" style={{ color: colors.textTertiary }}>KEEP IN MIND</Text>
          {card.tradeoffs.slice(0, 3).map((tradeoff) => (
            <Text key={tradeoff} variant="bodySm" style={{ color: colors.textSecondary }}>• {tradeoff}</Text>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text variant="caption" style={{ color: colors.textTertiary }}>
          {Math.round(card.confidence * 100)}% evidence confidence · {new Date(card.generatedAt).toLocaleDateString()}
        </Text>
        {card.action ? <Button size="sm" onPress={() => void runAction()}>{card.action.label}</Button> : null}
      </View>
    </View>
  );
}
