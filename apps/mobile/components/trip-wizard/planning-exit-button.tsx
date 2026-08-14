import React from 'react';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { exitTripPlanning } from '../../src/lib/planning-navigation';
import { useTheme } from '../../src/theme/ThemeProvider';
import { OutingIcon } from '../ui/OutingIcon';
import { Text } from '../ui/Text';

export function PlanningExitButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Leave trip planning and return home"
      hitSlop={8}
      onPress={() => {
        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
        exitTripPlanning(router);
      }}
      style={({ pressed }) => ({
        minHeight: 38,
        minWidth: compact ? 38 : undefined,
        paddingHorizontal: compact ? spacing.sm : spacing.md,
        borderRadius: radius.full,
        backgroundColor: colors.backgroundSecondary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        opacity: pressed ? 0.68 : 1,
      })}
    >
      <OutingIcon name="home" size={16} color={colors.textSecondary} />
      {!compact ? <Text variant="labelSm" style={{ color: colors.textSecondary }}>Home</Text> : null}
    </Pressable>
  );
}
