import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';
import { Badge } from './Badge';
import type { CatalogDestination } from '../../src/providers/AppProviders';
import { lgbtqVibeLabel, lgbtqVibeVariant } from '../../src/lib/lgbtqVibe';

interface DestinationCardProps {
  destination: CatalogDestination;
  compact?: boolean;
  onPress?: () => void;
}

export function DestinationCard({ destination, compact = false, onPress }: DestinationCardProps) {
  const { colors, spacing, radius, shadows } = useTheme();
  const router = useRouter();

  const handlePress = onPress ?? (() => router.push(`/destinations/${destination.slug}`));

  const legal = destination.lgbtqContext?.legalEqualityScore ?? 0;
  const legalLabel = lgbtqVibeLabel(legal);
  const legalVariant = lgbtqVibeVariant(legal);

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
        <Image
          source={{ uri: destination.heroImageUrl }}
          style={{ width: 80, height: 80 }}
          resizeMode="cover"
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
      {destination.heroImageUrl ? (
        <Image
          source={{ uri: destination.heroImageUrl }}
          style={{ width: '100%', height: 200 }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ width: '100%', height: 200, backgroundColor: colors.backgroundTertiary }} />
      )}
      <View style={{ padding: spacing.base, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="h2">{destination.name}</Text>
            <Text variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
              {destination.country}
            </Text>
          </View>
          <Badge label={legalLabel} variant={legalVariant as 'success' | 'info' | 'warning' | 'error'} />
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
