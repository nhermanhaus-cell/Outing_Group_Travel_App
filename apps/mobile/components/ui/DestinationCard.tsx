import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';
import { Badge } from './Badge';
import type { CatalogDestination } from '../../src/providers/AppProviders';
import { getDestinationContextRating, getDestinationRating } from '../../src/lib/destinationRating';
import { useDestinations, useTravelProfile } from '../../src/providers/AppProviders';
import { DestinationHeroImage } from './DestinationHeroImage';
import { buildDestinationOverview } from '../../src/lib/destinationOverview';

interface DestinationCardProps {
  destination: CatalogDestination;
  compact?: boolean;
  variant?: 'feature' | 'tile' | 'row';
  onPress?: () => void;
}

export function DestinationCard({ destination, compact = false, variant, onPress }: DestinationCardProps) {
  const { colors, spacing, radius, shadows } = useTheme();
  const { getScoringBySlug } = useDestinations();
  const { profile } = useTravelProfile();
  const router = useRouter();

  const handlePress = onPress ?? (() => router.push(`/destinations/${destination.slug}`));

  const scoring = getScoringBySlug(destination.slug);
  const rating = getDestinationRating({
    communityScore: scoring?.communityScore,
    nightlifeScore: scoring?.nightlifeScore,
    legalEqualityScore: destination.lgbtqContext?.legalEqualityScore,
    publicOpinionScore: destination.lgbtqContext?.publicOpinionScore,
  });
  const contextRating = getDestinationContextRating({
    legalEqualityScore: destination.lgbtqContext?.legalEqualityScore,
    publicOpinionScore: destination.lgbtqContext?.publicOpinionScore,
  });
  const advisoryLevel = destination.travelerAdvisoryLevel ?? 'standard';
  const advisoryLabel = advisoryLevel === 'severe'
    ? 'Restrictive LGBTQ+ laws'
    : advisoryLevel === 'elevated'
      ? 'Review LGBTQ+ guidance'
      : advisoryLevel === 'caution'
        ? 'Local context varies'
        : undefined;
  const overview = buildDestinationOverview(destination, profile.defaultInterests);
  const resolvedVariant = variant ?? (compact ? 'row' : 'feature');

  if (resolvedVariant === 'row') {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          backgroundColor: colors.cardBackground,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          overflow: 'hidden',
          opacity: pressed ? 0.85 : 1,
          ...shadows.sm,
        })}
      >
        <DestinationHeroImage
          destination={destination}
          style={{ width: 80, height: 80 }}
        />
        <View style={{ flex: 1, padding: spacing.md, justifyContent: 'center', gap: spacing.xxs }}>
          <Text variant="h4">{destination.name}</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {destination.country}
          </Text>
          {advisoryLabel ? <Text variant="caption" style={{ color: colors.warning }}>{advisoryLabel}</Text> : null}
        </View>
      </Pressable>
    );
  }

  if (resolvedVariant === 'tile') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${destination.name}, ${destination.country}`}
        onPress={handlePress}
        style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1, gap: spacing.sm })}
      >
        <View style={{ position: 'relative' }}>
          <DestinationHeroImage
            destination={destination}
            style={{ width: '100%', height: 148, borderRadius: radius.xl, backgroundColor: colors.backgroundTertiary }}
          />
          {advisoryLabel ? (
            <View style={{ position: 'absolute', left: spacing.sm, top: spacing.sm, maxWidth: '82%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.warningLight }}>
              <Text variant="labelSm" numberOfLines={1} style={{ color: colors.warning }}>{advisoryLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ gap: spacing.xxs }}>
          <Text variant="h3" numberOfLines={1}>{destination.name}</Text>
          <Text variant="caption" numberOfLines={1} style={{ color: colors.textSecondary }}>
            {destination.country}{rating ? ` · ${rating.score} pulse` : ''}
          </Text>
          <Text variant="caption" numberOfLines={2} style={{ color: colors.textTertiary }}>
            {overview.personalizedReason}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        backgroundColor: colors.cardBackground,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        overflow: 'hidden',
        opacity: pressed ? 0.9 : 1,
        ...shadows.md,
      })}
    >
      <DestinationHeroImage
        destination={destination}
        style={{ width: '100%', height: 200 }}
      />
      <View style={{ padding: spacing.base, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="h2">{destination.name}</Text>
            <Text variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
              {destination.country}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
            {rating ? <Badge label={`${rating.label} · ${rating.score}`} variant={rating.variant} /> : null}
            {contextRating && ['mixed', 'limited', 'caution'].includes(contextRating.level) ? (
              <Badge label={contextRating.label} variant={contextRating.variant} />
            ) : null}
            {advisoryLabel ? <Badge label={advisoryLabel} variant="warning" /> : null}
          </View>
        </View>
        <Text variant="bodySm" style={{ color: colors.textSecondary, lineHeight: 20 }} numberOfLines={5}>
          {overview.overview}
        </Text>
        <View style={{ padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.poolLight, gap: spacing.xxs }}>
          <Text variant="labelSm" style={{ color: colors.pool }}>WHY IT COULD FIT YOU</Text>
          <Text variant="caption" style={{ color: colors.textSecondary, lineHeight: 17 }} numberOfLines={4}>
            {overview.personalizedReason}
          </Text>
        </View>
        {destination.interests?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {destination.interests.slice(0, 4).map((interest) => (
              <Badge key={interest} label={interest.replace('_', ' ')} variant="default" />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
