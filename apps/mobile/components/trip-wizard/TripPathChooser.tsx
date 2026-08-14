import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';

export function TripPathChooser({ onRecommend, onManual }: { onRecommend: () => void; onManual: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ padding: spacing.base, gap: spacing.md }}>
    <Pressable onPress={onRecommend} style={{ padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.accent, gap: spacing.sm }}><Text variant="h2" style={{ color: colors.textOnAccent }}>Help me choose a destination</Text><Text variant="bodyMd" style={{ color: colors.textOnAccent }}>Start with travel range and broad interests, then personalize around the destination you pick.</Text></Pressable>
    <Pressable onPress={onManual} style={{ padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardBackground, gap: spacing.sm }}><Text variant="h2">I already know where I’m going</Text><Text variant="bodyMd" style={{ color: colors.textSecondary }}>Choose the destination first, then tell us what you want from this specific trip.</Text></Pressable>
  </View>;
}
