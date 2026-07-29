import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { airports, type AirportRecord } from '../../src/content/airports';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';

export function AirportAutocomplete({ value, onSelect, placeholder = 'City or airport' }: { value: string; onSelect: (airport: AirportRecord) => void; placeholder?: string }) {
  const { colors, spacing, radius } = useTheme();
  const selected = airports.find((airport) => airport.iata === value.toUpperCase());
  const [query, setQuery] = useState(selected ? `${selected.city} · ${selected.iata}` : value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const next = airports.find((airport) => airport.iata === value.toUpperCase());
    if (!focused) setQuery(next ? `${next.city} · ${next.iata}` : value);
  }, [focused, value]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return airports.slice(0, 6);
    return airports.filter((airport) => [airport.iata, airport.city, airport.name].some((part) => part.toLowerCase().includes(needle))).slice(0, 6);
  }, [query]);

  return (
    <View style={{ gap: spacing.xs }}>
      <TextInput
        value={query}
        onChangeText={(text) => { setQuery(text); setFocused(true); }}
        onFocus={() => { setFocused(true); if (selected) setQuery(selected.city); }}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCorrect={false}
        style={{ backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: focused ? colors.accent : colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, color: colors.textPrimary, fontSize: 16 }}
      />
      {focused ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.cardBackground }}>
          {results.length ? results.map((airport) => (
            <Pressable key={airport.iata} onPress={() => { onSelect(airport); setQuery(`${airport.city} · ${airport.iata}`); setFocused(false); }} style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
              <Text variant="labelLg">{airport.city} · {airport.iata}</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>{airport.name}</Text>
            </Pressable>
          )) : <Text variant="bodySm" style={{ padding: spacing.md, color: colors.textTertiary }}>No airport match yet.</Text>}
        </View>
      ) : null}
    </View>
  );
}
