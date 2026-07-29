import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';

export function TripPathChooser({ onRecommend, onManual }: { onRecommend: () => void; onManual: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ padding: spacing.base, gap: spacing.md }}>
    <Pressable onPress={onRecommend} style={{ padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.accent, gap: spacing.sm }}><Text variant="h2" style={{ color: colors.textOnAccent }}>Find a destination for me</Text><Text variant="bodyMd" style={{ color: colors.textOnAccent }}>A compact quiz using your airports, range, interests, season, and group.</Text></Pressable>
    <Pressable onPress={onManual} style={{ padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardBackground, gap: spacing.sm }}><Text variant="h2">Build manually</Text><Text variant="bodyMd" style={{ color: colors.textSecondary }}>Add a destination now or leave it open, then set dates, travelers, lodging, and pace.</Text></Pressable>
  </View>;
}
