import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';
import { Badge } from './Badge';
import type { CatalogDestination } from '../../src/providers/AppProviders';
import { getDestinationContextRating, getDestinationRating } from '../../src/lib/destinationRating';
import { useDestinations } from '../../src/providers/AppProviders';
import { DestinationHeroImage } from './DestinationHeroImage';

interface DestinationCardProps {
  destination: CatalogDestination;
  compact?: boolean;
  onPress?: () => void;
}

export function DestinationCard({ destination, compact = false, onPress }: DestinationCardProps) {
  const { colors, spacing, radius, shadows } = useTheme();
  const { getScoringBySlug } = useDestinations();
  const router = useRouter();

  const handlePress = onPress ?? (() => router.push(`/destinations/${destination.slug}`));

  const scoring = getScoringBySlug(destination.slug);
  const rating = getDestinationRating({
    reviewScore: scoring?.reviewScore,
    communityScore: scoring?.communityScore,
    nightlifeScore: scoring?.nightlifeScore,
    legalEqualityScore: destination.lgbtqContext?.legalEqualityScore,
    publicOpinionScore: destination.lgbtqContext?.publicOpinionScore,
  });
  const contextRating = getDestinationContextRating({
    legalEqualityScore: destination.lgbtqContext?.legalEqualityScore,
    publicOpinionScore: destination.lgbtqContext?.publicOpinionScore,
  });

  if (compact) {
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
          showAttribution={false}
        />
        <View style={{ flex: 1, padding: spacing.md, justifyContent: 'center', gap: spacing.xxs }}>
          <Text variant="h4">{destination.name}</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {destination.country}
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
          </View>
        </View>
        {destination.editorialSummary ? (
          <Text variant="bodySm" style={{ color: colors.textSecondary }} numberOfLines={2}>
            {destination.editorialSummary}
          </Text>
        ) : null}
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
