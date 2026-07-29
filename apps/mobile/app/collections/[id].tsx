import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCollection } from '../../src/content/collections';
import { useDestinations } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { DestinationCard } from '../../components/ui/DestinationCard';

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();
  const { catalog } = useDestinations();
  const collection = getCollection(id ?? '');
  const destinations = useMemo(
    () => collection?.destinationSlugs.map((slug) => catalog.find((item) => item.slug === slug)).filter(Boolean) ?? [],
    [catalog, collection],
  );
  if (!collection) return null;
  const hero = destinations[0]?.heroImageUrl;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ height: 360 }}>
        {hero ? <Image source={{ uri: hero }} style={{ flex: 1 }} contentFit="cover" transition={200} /> : null}
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
        <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.base, padding: spacing.sm }}>
          <Text style={{ color: '#fff', fontSize: 24 }}>←</Text>
        </Pressable>
        <View style={{ position: 'absolute', left: spacing.base, right: spacing.base, bottom: spacing.xl, gap: spacing.xs }}>
          <Text variant="captionBold" style={{ color: '#fff', textTransform: 'uppercase', letterSpacing: 1.5 }}>{collection.kicker}</Text>
          <Text variant="displayMd" style={{ color: '#fff' }}>{collection.title}</Text>
        </View>
      </View>
      <View style={{ padding: spacing.base, gap: spacing.xl, paddingBottom: insets.bottom + spacing['4xl'] }}>
        <View style={{ gap: spacing.sm }}><Text variant="h2">Why visit</Text><Text variant="bodyLg" style={{ color: colors.textSecondary }}>{collection.whyVisit}</Text></View>
        <View style={{ gap: spacing.md }}>
          <Text variant="h2">What to look forward to</Text>
          {collection.highlights.map((highlight, index) => (
            <View key={highlight.title} style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary }}>
              <Text variant="h2" style={{ color: colors.accent }}>0{index + 1}</Text>
              <View style={{ flex: 1, gap: spacing.xxs }}><Text variant="labelLg">{highlight.title}</Text><Text variant="bodyMd" style={{ color: colors.textSecondary }}>{highlight.description}</Text></View>
            </View>
          ))}
        </View>
        <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{collection.seasonGuidance}</Text>
        <View style={{ gap: spacing.base }}><Text variant="h2">Destinations in this collection</Text>{destinations.map((destination) => <DestinationCard key={destination!.slug} destination={destination!} />)}</View>
        <Text variant="caption" style={{ color: colors.textTertiary }}>{collection.attribution}</Text>
      </View>
    </ScrollView>
  );
}
