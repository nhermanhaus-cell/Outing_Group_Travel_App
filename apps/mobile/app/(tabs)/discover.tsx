import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDestinations } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { DestinationCard } from '../../components/ui/DestinationCard';
import { DataSourceBadge } from '../../components/ui/DataSourceBadge';
import type { CatalogDestination } from '../../src/providers/AppProviders';

type SortKey = 'name' | 'safety' | 'community';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'A–Z' },
  { key: 'safety', label: 'Safety' },
  { key: 'community', label: 'Community' },
];

const INTEREST_FILTERS = [
  'nightlife', 'beach', 'food', 'art_culture', 'pride', 'outdoors', 'history', 'wellness',
];

export default function DiscoverScreen() {
  const { colors, spacing, radius } = useTheme();
  const { catalog } = useDestinations();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [activeInterests, setActiveInterests] = useState<string[]>([]);

  const toggleInterest = (interest: string) => {
    setActiveInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  };

  const filtered = useMemo<CatalogDestination[]>(() => {
    let list = catalog.filter((d) => {
      const matchesQuery =
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.country.toLowerCase().includes(query.toLowerCase());
      const matchesInterests =
        activeInterests.length === 0 ||
        activeInterests.some((i) =>
          d.interests?.some((di: string) => di === i || di.replace('_', '') === i.replace('_', '')),
        );
      return matchesQuery && matchesInterests;
    });

    if (sort === 'name') {
      list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'safety') {
      list = list.slice().sort((a, b) => {
        const sa = a.lgbtqContext?.legalEqualityScore ?? 0;
        const sb = b.lgbtqContext?.legalEqualityScore ?? 0;
        return sb - sa;
      });
    } else if (sort === 'community') {
      list = list.slice().sort((a, b) => {
        const ca = a.lgbtqContext?.publicOpinionScore ?? 0;
        const cb = b.lgbtqContext?.publicOpinionScore ?? 0;
        return cb - ca;
      });
    }

    return list;
  }, [catalog, query, sort, activeInterests]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + spacing.base,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.md,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h1">Discover</Text>
          <DataSourceBadge />
        </View>

        {/* Search */}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search destinations…"
          placeholderTextColor={colors.textTertiary}
          style={{
            backgroundColor: colors.backgroundSecondary,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            color: colors.textPrimary,
            fontSize: 15,
          }}
        />

        {/* Sort */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setSort(opt.key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.full,
                backgroundColor: sort === opt.key ? colors.accent : colors.backgroundSecondary,
                borderWidth: 1,
                borderColor: sort === opt.key ? colors.accent : colors.border,
              }}
            >
              <Text
                variant="labelSm"
                style={{ color: sort === opt.key ? colors.textOnAccent : colors.textSecondary }}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Interest filters */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={INTEREST_FILTERS}
          keyExtractor={(i) => i}
          contentContainerStyle={{ gap: spacing.xs }}
          renderItem={({ item }) => {
            const isActive = activeInterests.includes(item);
            return (
              <Pressable
                onPress={() => toggleInterest(item)}
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs + 1,
                  borderRadius: radius.full,
                  backgroundColor: isActive ? colors.accentLight : colors.backgroundSecondary,
                  borderWidth: 1,
                  borderColor: isActive ? colors.accent : colors.border,
                }}
              >
                <Text
                  variant="captionBold"
                  style={{ color: isActive ? colors.accent : colors.textSecondary }}
                >
                  {item.replace('_', ' ')}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Results */}
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.slug}
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: insets.bottom + spacing['4xl'],
        }}
        ListEmptyComponent={
          <View style={{ paddingVertical: spacing['4xl'], alignItems: 'center' }}>
            <Text variant="h3" style={{ color: colors.textTertiary }}>No destinations found</Text>
          </View>
        }
        ListHeaderComponent={
          <Text variant="caption" style={{ color: colors.textTertiary, marginBottom: spacing.xs }}>
            {filtered.length} destination{filtered.length !== 1 ? 's' : ''}
          </Text>
        }
        renderItem={({ item }) => <DestinationCard destination={item} />}
      />
    </View>
  );
}
