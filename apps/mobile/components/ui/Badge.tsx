import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'outline';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, variant = 'default', style }: BadgeProps) {
  const { colors, spacing, radius, isDark } = useTheme();

  const bgMap: Record<BadgeVariant, string> = {
    default: colors.backgroundSecondary,
    accent: colors.accentLight,
    success: isDark ? '#1A3D2D' : '#D1EAE0',
    warning: isDark ? '#3D2D1A' : '#F5E4C2',
    error: isDark ? '#3D1A1A' : '#F5D0D0',
    info: isDark ? '#1A2D3D' : '#C2DCF0',
    outline: 'transparent',
  };

  const textColorMap: Record<BadgeVariant, string> = {
    default: colors.textSecondary,
    accent: colors.accent,
    success: isDark ? '#7DCCA8' : '#3A7D5C',
    warning: isDark ? '#F0B96A' : '#7A4F1A',
    error: isDark ? '#F09090' : '#8C1A1A',
    info: isDark ? '#7AB8D9' : '#1A4D6C',
    outline: colors.textSecondary,
  };

  return (
    <View
      style={[
        {
          backgroundColor: bgMap[variant],
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xxs + 1,
          borderRadius: radius.full,
          alignSelf: 'flex-start',
          ...(variant === 'outline' && { borderWidth: 1, borderColor: colors.border }),
        },
        style,
      ]}
    >
      <Text variant="captionBold" style={{ color: textColorMap[variant] }}>
        {label}
      </Text>
    </View>
  );
}
