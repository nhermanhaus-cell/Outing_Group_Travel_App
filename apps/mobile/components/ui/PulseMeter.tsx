import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';
import type { PulseResult } from '@gayi/domain';

interface PulseMeterProps {
  pulse: PulseResult;
  compact?: boolean;
}

const LABEL_COLORS: Record<string, string> = {
  'Major queer hub': '#3A7D5C',
  'Very active': '#2A6B8C',
  Connected: '#6B5C2A',
  Emerging: '#8C6B2A',
  Quiet: '#5C5047',
};

export function PulseMeter({ pulse, compact = false }: PulseMeterProps) {
  const { colors, spacing, radius } = useTheme();
  const labelColor = LABEL_COLORS[pulse.label] ?? colors.textSecondary;

  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 60, height: 4, backgroundColor: colors.borderSubtle, borderRadius: radius.full, overflow: 'hidden' }}>
          <View style={{ width: `${pulse.score}%`, height: 4, backgroundColor: labelColor, borderRadius: radius.full }} />
        </View>
        <Text variant="captionBold" style={{ color: labelColor }}>{pulse.label}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h4" style={{ color: labelColor }}>{pulse.label}</Text>
        <Text variant="h3" style={{ color: labelColor }}>{pulse.score}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: colors.borderSubtle, borderRadius: radius.full, overflow: 'hidden' }}>
        <View style={{ width: `${pulse.score}%`, height: 8, backgroundColor: labelColor, borderRadius: radius.full }} />
      </View>
      <Text variant="caption" style={{ color: colors.textSecondary }}>{pulse.explanation}</Text>
      {!compact && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
          {Object.entries(pulse.componentBreakdown).map(([key, val]) => (
            <View key={key} style={{ alignItems: 'center', gap: 2, minWidth: 60 }}>
              <Text variant="captionBold" style={{ color: colors.textPrimary }}>{Math.round(val as number)}</Text>
              <Text variant="caption" style={{ color: colors.textTertiary }}>{key}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
