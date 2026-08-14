import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';

function parseDate(value?: string) {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1, 12);
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DateField({ value, onChange, placeholder, minimumDate }: { value?: string; onChange: (value: string) => void; placeholder: string; minimumDate?: string }) {
  const { colors, spacing, radius } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen((current) => !current)} style={{ backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: open ? colors.accent : colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
        <Text variant="bodyMd" style={{ color: value ? colors.textPrimary : colors.textTertiary }}>{value ? parseDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : placeholder}</Text>
      </Pressable>
      {open ? <DateTimePicker value={parseDate(value)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={minimumDate ? parseDate(minimumDate) : undefined} onChange={(event, date) => { if (Platform.OS !== 'ios') setOpen(false); if (event.type !== 'dismissed' && date) onChange(isoDate(date)); }} /> : null}
    </View>
  );
}
