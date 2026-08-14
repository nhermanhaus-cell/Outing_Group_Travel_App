import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';

interface ProgressBarProps {
  value: number; // 0–100
  label?: string;
  showValue?: boolean;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  value,
  label,
  showValue = false,
  height = 6,
  color,
  style,
}: ProgressBarProps) {
  const { colors, spacing, radius } = useTheme();
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <View style={[{ gap: spacing.xs }, style]}>
      {(label || showValue) ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {label ? <Text variant="labelMd" style={{ color: colors.textSecondary }}>{label}</Text> : null}
          {showValue ? <Text variant="labelMd" style={{ color: colors.textSecondary }}>{clamped}%</Text> : null}
        </View>
      ) : null}
      <View
        style={{
          height,
          backgroundColor: colors.borderSubtle,
          borderRadius: radius.full,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height,
            width: `${clamped}%`,
            backgroundColor: color ?? colors.accent,
            borderRadius: radius.full,
          }}
        />
      </View>
    </View>
  );
}
