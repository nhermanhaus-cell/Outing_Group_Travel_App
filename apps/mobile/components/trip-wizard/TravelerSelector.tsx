import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';

export type GroupType = 'solo' | 'couple' | 'throuple' | 'friends' | 'group';
export const travelerDefaults: Record<GroupType, number> = { solo: 1, couple: 2, throuple: 3, friends: 4, group: 6 };

export function TravelerSelector({ groupType, count, onChange }: { groupType: GroupType; count: number; onChange: (groupType: GroupType, count: number) => void }) {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ gap: spacing.lg }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
      {(['solo', 'couple', 'throuple', 'friends', 'group'] as GroupType[]).map((type) => <Pressable key={type} onPress={() => onChange(type, travelerDefaults[type])} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1.5, borderColor: groupType === type ? colors.accent : colors.border, backgroundColor: groupType === type ? colors.accentLight : colors.cardBackground }}><Text variant="labelMd" style={{ color: groupType === type ? colors.accent : colors.textPrimary, textTransform: 'capitalize' }}>{type}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Pressable onPress={() => onChange(groupType, Math.max(1, count - 1))} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text variant="h2">–</Text></Pressable>
      <Text variant="displaySm" style={{ minWidth: 32, textAlign: 'center' }}>{count}</Text>
      <Pressable onPress={() => onChange(groupType, Math.min(50, count + 1))} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text variant="h2">+</Text></Pressable>
    </View>
  </View>;
}
