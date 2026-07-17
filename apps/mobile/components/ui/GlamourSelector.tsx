import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';
import type { GlamourLevel } from '@gayi/shared';

interface GlamourSelectorProps {
  value: GlamourLevel;
  onChange: (level: GlamourLevel) => void;
}

const LEVELS: Array<{ key: GlamourLevel; label: string; emoji: string; desc: string }> = [
  { key: 'shoestring_slay', label: 'Shoestring Slay', emoji: '✂️', desc: 'Budget-savvy & fabulous' },
  { key: 'cute_but_controlled', label: 'Cute but Controlled', emoji: '💳', desc: 'Mindful mid-range' },
  { key: 'comfortably_fabulous', label: 'Comfortably Fabulous', emoji: '🥂', desc: 'The sweet spot' },
  { key: 'luxury_gaycation', label: 'Luxury Gaycation', emoji: '💎', desc: 'Full premium experience' },
  { key: 'no_budget_just_vibes', label: 'No Budget Just Vibes', emoji: '👑', desc: 'Unlimited fabulousness' },
];

export function GlamourSelector({ value, onChange }: GlamourSelectorProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
      {LEVELS.map((level) => {
        const isSelected = value === level.key;
        return (
          <Pressable
            key={level.key}
            onPress={() => onChange(level.key)}
            style={{
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.base,
              borderRadius: radius.lg,
              borderWidth: 1.5,
              borderColor: isSelected ? colors.accent : colors.border,
              backgroundColor: isSelected ? colors.accentLight : colors.cardBackground,
              alignItems: 'center',
              gap: spacing.xs,
              minWidth: 110,
            }}
          >
            <Text style={{ fontSize: 22 }}>{level.emoji}</Text>
            <Text variant="labelMd" style={{ color: isSelected ? colors.accent : colors.textPrimary, textAlign: 'center' }}>
              {level.label}
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary, textAlign: 'center' }}>
              {level.desc}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
