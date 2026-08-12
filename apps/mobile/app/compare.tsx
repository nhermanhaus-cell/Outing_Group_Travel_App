import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { useAuth, useDestinations } from '../src/providers/AppProviders';
import { useSavedDestinations } from '../src/providers/SavedDestinationsProvider';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAnalytics } from '../src/analytics/analytics-provider';
import { featureFlags } from '../src/lib/featureFlags';
import { loadAssistantInsights } from '../src/lib/assistant-api';
import { Text } from '../components/ui/Text';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DestinationHeroImage } from '../components/ui/DestinationHeroImage';
import { DecisionBriefCard } from '../components/assistant/DecisionBriefCard';

export default function CompareScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ slugs?: string }>();
  const { user } = useAuth();
  const { catalog, getBySlug } = useDestinations();
  const { slugs: savedSlugs } = useSavedDestinations();
  const { track } = useAnalytics();
  const trackedRef = useRef('');
  const available = useMemo(() => savedSlugs.map((slug) => getBySlug(slug)).filter(Boolean), [getBySlug, savedSlugs]);
  const requested = useMemo(() => (params.slugs ?? '').split(',').filter((slug) => catalog.some((item) => item.slug === slug)).slice(0, 4), [catalog, params.slugs]);
  const requestedKey = requested.join(',');
  const [selected, setSelected] = useState<string[]>(requested.length >= 2 ? requested : savedSlugs.slice(0, 4));

  useEffect(() => {
    if (requestedKey.split(',').filter(Boolean).length >= 2) setSelected(requestedKey.split(',').filter(Boolean));
  }, [requestedKey]);

  const comparisonQuery = useQuery({
    queryKey: ['assistant-insights', 'comparison-v1', user?.id, [...selected].sort().join(',')],
    queryFn: ({ signal }) => loadAssistantInsights({
      surface: 'ask',
      trigger: 'screen',
      intent: { kind: 'compare', entityKind: 'destination', optionIds: selected },
      force: false,
    }, signal),
    enabled: Boolean(user && featureFlags.smartCompareV1 && selected.length >= 2),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const insight = comparisonQuery.data?.insights.find((item) => item.kind === 'comparison');
  const comparison = insight?.comparison;

  useEffect(() => {
    if (!comparison) return;
    const key = comparison.options.map((item) => item.id).join(',');
    if (trackedRef.current === key) return;
    trackedRef.current = key;
    track(ANALYTICS_EVENTS.ASSISTANT_COMPARISON_COMPLETED, {
      entityKind: comparison.entityKind,
      optionCount: comparison.options.length,
    });
  }, [comparison, track]);

  const toggle = (slug: string) => {
    setSelected((current) => current.includes(slug)
      ? current.length <= 2 ? current : current.filter((item) => item !== slug)
      : current.length >= 4 ? current : [...current, slug]);
  };

  if (!featureFlags.smartCompareV1) {
    return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl }}><Text variant="bodyLg">Destination comparison is not enabled for this rollout.</Text></View>;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing['4xl'], gap: spacing.xl }}
    >
      <View style={{ paddingHorizontal: spacing.base, gap: spacing.sm }}>
        <Pressable onPress={() => router.back()}><Text variant="labelMd" style={{ color: colors.accent }}>← Back</Text></Pressable>
        <Text variant="displayMd">Compare what matters</Text>
        <Text variant="bodyLg" style={{ color: colors.textSecondary }}>Choose two to four saved destinations. Outing keeps the same preferences and requirements across every option.</Text>
      </View>

      {!user ? (
        <View style={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>Sign in so the comparison can use your private travel preferences.</Text>
          <Button onPress={() => router.push('/auth/login?returnTo=/compare')}>Sign in to compare</Button>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
        {available.map((destination) => {
          if (!destination) return null;
          const active = selected.includes(destination.slug);
          return (
            <Pressable
              key={destination.slug}
              onPress={() => toggle(destination.slug)}
              style={{ width: 150, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 2, borderColor: active ? colors.accent : colors.border }}
            >
              <DestinationHeroImage destination={destination} style={{ width: '100%', height: 105 }} />
              <View style={{ padding: spacing.sm, gap: spacing.xs }}>
                <Text variant="labelMd" numberOfLines={1}>{destination.name}</Text>
                <Badge label={active ? 'Included' : 'Tap to add'} variant={active ? 'accent' : 'info'} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.base, gap: spacing.lg }}>
        {available.length < 2 ? (
          <View style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, gap: spacing.sm }}>
            <Text variant="h3">Save two destinations to compare</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>Use the bookmark on destination pages, then return here for a side-by-side decision.</Text>
            <Button variant="secondary" onPress={() => router.push('/discover')}>Discover destinations</Button>
          </View>
        ) : null}
        {comparisonQuery.isFetching && !comparison ? <Text variant="bodyMd" style={{ color: colors.textSecondary }}>Checking the same criteria across {selected.length} destinations…</Text> : null}
        {comparisonQuery.isError && !comparison ? <Text variant="bodySm" style={{ color: colors.textSecondary }}>Live comparison is unavailable. Your saved destinations are still available above.</Text> : null}
        {insight?.decisionCard ? <DecisionBriefCard card={insight.decisionCard} surface="compare" /> : null}

        {comparison?.dimensions.map((dimension) => (
          <View key={dimension.key} style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md }}>
            <Text variant="h3">{dimension.label}</Text>
            {dimension.values.map((value) => {
              const option = comparison.options.find((item) => item.id === value.optionId);
              return (
                <View key={value.optionId} style={{ paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: spacing.xs }}>
                  <Text variant="labelMd" style={{ color: colors.plum }}>{option?.title ?? 'Option'}</Text>
                  <Text variant="bodyMd">{value.value}</Text>
                  {value.evidence ? <Text variant="caption" style={{ color: colors.textSecondary }}>{value.evidence}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
