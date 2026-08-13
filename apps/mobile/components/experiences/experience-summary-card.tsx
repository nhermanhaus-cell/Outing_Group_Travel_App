import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import type { MobileExperience } from '../../src/lib/experiences';
import { compactExperienceSummary } from '../../src/lib/experience-content';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';

function durationLabel(experience: MobileExperience): string | undefined {
  const minutes = experience.durationMinutes
    ?? (experience.durationHours !== undefined ? Math.round(experience.durationHours * 60) : undefined);
  if (!minutes) return undefined;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr${hours === 1 ? '' : 's'}`;
}

function priceLabel(experience: MobileExperience): string | undefined {
  if (experience.priceFrom === undefined) return undefined;
  try {
    return `From ${new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: experience.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(experience.priceFrom)}`;
  } catch {
    return `From ${experience.currency ?? ''} ${Math.round(experience.priceFrom)}`.trim();
  }
}

export function ExperienceSummaryCard({
  experience,
  onPress,
  variant = 'card',
}: {
  experience: MobileExperience;
  onPress: () => void;
  variant?: 'card' | 'rail';
}) {
  const { colors, spacing, radius } = useTheme();
  const duration = durationLabel(experience);
  const price = priceLabel(experience);

  if (variant === 'rail') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`View details for ${experience.title}`} onPress={onPress} style={{ gap: spacing.sm }}>
        {experience.imageUrls[0] ? <Image source={{ uri: experience.imageUrls[0] }} style={{ width: '100%', height: 148, borderRadius: radius.xl, backgroundColor: colors.backgroundTertiary }} contentFit="cover" transition={180} accessibilityLabel={`${experience.title} photo`} /> : <View style={{ height: 148, borderRadius: radius.xl, backgroundColor: colors.backgroundTertiary }} />}
        <View style={{ gap: spacing.xxs }}>
          <Text variant="h4" numberOfLines={2}>{experience.title}</Text>
          <Text variant="caption" numberOfLines={1} style={{ color: colors.textSecondary }}>
            {[price, duration, experience.rating ? `★ ${experience.rating.toFixed(1)}` : undefined].filter(Boolean).join(' · ')}
          </Text>
          {experience.freeCancellation ? <Text variant="caption" style={{ color: colors.pool }}>Free cancellation</Text> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Card elevated padded={false} style={{ overflow: 'hidden', borderCurve: 'continuous' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View details for ${experience.title}`}
        onPress={onPress}
      >
        {experience.imageUrls[0] ? (
          <Image
            source={{ uri: experience.imageUrls[0] }}
            style={{ width: '100%', height: 132, backgroundColor: colors.backgroundTertiary }}
            contentFit="cover"
            transition={180}
            accessibilityLabel={`${experience.title} photo`}
          />
        ) : null}
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          <Text variant="h4" numberOfLines={2}>{experience.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {experience.rating ? <Badge label={`${experience.rating.toFixed(1)} ★`} variant="success" /> : null}
            {duration ? <Badge label={duration} variant="default" /> : null}
            {price ? <Badge label={price} variant="accent" /> : null}
          </View>
          <Text variant="bodySm" numberOfLines={2} style={{ color: colors.textSecondary }}>
            {compactExperienceSummary(experience.summary, experience.title, 125)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text variant="caption" style={{ color: colors.textTertiary }}>
              {experience.provider === 'viator' ? 'Viator experience' : 'Outing suggestion'}
              {experience.freeCancellation ? ' · Free cancellation' : ''}
            </Text>
            <Text variant="labelMd" style={{ color: colors.accent }}>Details →</Text>
          </View>
        </View>
      </Pressable>
    </Card>
  );
}
