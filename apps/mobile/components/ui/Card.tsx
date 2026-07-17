import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  padded?: boolean;
}

export function Card({ children, style, elevated = false, padded = true }: CardProps) {
  const { colors, radius, spacing, shadows } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.cardBackground,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          ...(padded && { padding: spacing.base }),
          ...(elevated && shadows.sm),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
