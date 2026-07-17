import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';

interface DataSourceBadgeProps {
  label?: string;
}

export function DataSourceBadge({ label = 'Sample data' }: DataSourceBadgeProps) {
  const { colors, spacing, radius, isDark } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: isDark ? colors.backgroundTertiary : colors.backgroundSecondary,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: colors.border,
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: isDark ? '#F0B96A' : '#B87D2A',
        }}
      />
      <Text variant="captionBold" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </View>
  );
}
