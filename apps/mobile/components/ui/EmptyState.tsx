import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon = '✦', title, description, action, style }: EmptyStateProps) {
  const { colors, spacing } = useTheme();

  return (
    <View style={[{ alignItems: 'center', paddingVertical: spacing['4xl'], gap: spacing.md }, style]}>
      <Text style={{ fontSize: 40, opacity: 0.3 }}>{icon}</Text>
      <Text variant="h3" style={{ color: colors.textPrimary, textAlign: 'center' }}>
        {title}
      </Text>
      {description ? (
        <Text
          variant="bodyMd"
          style={{ color: colors.textSecondary, textAlign: 'center', maxWidth: 280 }}
        >
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}
