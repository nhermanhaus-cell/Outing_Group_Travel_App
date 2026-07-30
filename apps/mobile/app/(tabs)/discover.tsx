import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { editorialCollections } from '../../src/content/collections';
import { useDestinations, useTravelProfile } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { DestinationCard } from '../../components/ui/DestinationCard';
import { DataSourceBadge } from '../../components/ui/DataSourceBadge';
import { featureFlags } from '../../src/lib/featureFlags';
import { useQuery } from '@tanstack/react-query';
import { loadIndicativeFlightDeals } from '../../src/lib/travel-api';
import {
  ANALYTICS_EVENTS,
  bucketCount,
  bucketQueryLength,
} from '@gayi/shared';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { DestinationHeroImage } from '../../components/ui/DestinationHeroImage';

function nextMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function DiscoverScreen() {
  const { colors, spacing, radius } = useTheme();
  const { catalog } = useDestinations();
  const { profile } = useTravelProfile();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const { track } = useAnalytics();
  const impressionKeyRef = useRef('');
  const primaryAirport = profile.homeAirports.find((airport) => airport.primary) ?? profile.homeAirports[0];
  const flightDealsQuery = useQuery({
    queryKey: ['indicative-flight-deals-v1', primaryAirport?.iata, nextMonth()],
    queryFn: () => loadIndicativeFlightDeals({ originIata: primaryAirport!.iata, departureMonth: nextMonth(), limit: 24 }),
    enabled: Boolean(primaryAirport?.iata),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
  const destinationDeals = useMemo(() => (flightDealsQuery.data?.deals ?? []).flatMap((deal) => {
    const match = catalog.find((destination) =>
      destination.country.toLowerCase() === deal.destinationCountry?.toLowerCase()
      || destination.name.toLowerCase() === deal.destinationName.toLowerCase()
      || deal.destinationName.toLowerCase().includes(destination.name.toLowerCase()),
    );
    return match ? [{ deal, destination: match }] : [];
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.destination.slug === item.destination.slug) === index).slice(0, 8), [catalog, flightDealsQuery.data?.deals]);

  const collections = useMemo(() => (featureFlags.collectionsV1 ? editorialCollections : []).slice().sort((a, b) => {
    const affinity = (collection: typeof a) =>
      collection.bestFor.filter((tag) => profile.defaultInterests.includes(tag as never)).length * 3 +
      (collection.travelRanges?.some((range) => profile.preferredTravelRanges.includes(range)) ? 2 : 0) +
      (collection.bestMonths?.includes(new Date().getMonth() + 1) ? 1 : 0) +
      (collection.id === 'weekend-escapes' && profile.homeAirports.length > 0 ? 2 : 0) +
      ((profile.defaultTripLengthDays ?? 7) <= 4 && collection.bestFor.includes('long weekends') ? 2 : 0);
    return affinity(b) - affinity(a);
  }), [profile.defaultInterests, profile.defaultTripLengthDays, profile.homeAirports.length, profile.preferredTravelRanges]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((destination) => !needle || destination.name.toLowerCase().includes(needle) || destination.country.toLowerCase().includes(needle));
  }, [catalog, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim()) return;
      track(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
        searchContext: 'destination_discovery',
        queryLengthBucket: bucketQueryLength(query.trim().length),
        resultCountBucket: bucketCount(results.length),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, results.length, track]);

  useEffect(() => {
    const key = `${query.trim().toLowerCase()}:${results.slice(0, 20).map((item) => item.slug).join(',')}`;
    if (impressionKeyRef.current === key) return;
    impressionKeyRef.current = key;
    results.slice(0, 20).forEach((destination, index) => {
      track(ANALYTICS_EVENTS.DESTINATION_IMPRESSION, {
        destinationSlug: destination.slug,
        source: query.trim() ? 'search_results' : 'destination_catalog',
        rank: index + 1,
      });
    });
  }, [query, results, track]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.base, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text variant="displayMd">Discover</Text><DataSourceBadge /></View>
        <Text variant="bodyLg" style={{ color: colors.textSecondary }}>Editorial trips worth looking forward to.</Text>
      </View>

      {destinationDeals.length > 0 ? (
        <View style={{ paddingTop: spacing.xl, gap: spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.base, gap: spacing.xxs }}>
            <Text variant="h2">Unexpectedly affordable ideas</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>Indicative one-way fares from {primaryAirport?.iata} for next month.</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
            {destinationDeals.map(({ deal, destination }) => (
              <Pressable
                key={destination.slug}
                onPress={() => {
                  router.push(`/destinations/${destination.slug}`);
                }}
                style={{ width: 250, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.backgroundSecondary }}
              >
                <DestinationHeroImage
                  destination={destination}
                  style={{ width: '100%', height: 150 }}
                />
                <View style={{ padding: spacing.md, gap: spacing.xs }}>
                  <Text variant="h4">{destination.name}</Text>
                  <Text variant="h3">from {new Intl.NumberFormat(undefined, { style: 'currency', currency: deal.currency, maximumFractionDigits: 0 }).format(deal.price)}</Text>
                  {deal.savingsPercent && deal.savingsPercent > 0 ? <Text variant="labelSm" style={{ color: colors.accent }}>{deal.savingsPercent}% below our recent median</Text> : null}
                  <Text variant="caption" style={{ color: colors.textTertiary }}>{deal.direct ? 'Direct quote' : 'Stops may apply'} · recently observed via Skyscanner</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Text variant="caption" style={{ color: colors.textTertiary, paddingHorizontal: spacing.base }}>Exploration estimate for one adult in economy; indicative prices may be several days old. Check a live search before making plans.</Text>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={Math.min(width * 0.84, 380) + spacing.md} contentContainerStyle={{ padding: spacing.base, gap: spacing.md }}>
        {collections.map((collection) => {
          const destination = catalog.find((item) => collection.destinationSlugs.includes(item.slug));
          return (
            <Pressable
              key={collection.id}
              onPress={() => {
                track(ANALYTICS_EVENTS.COLLECTION_VIEWED, {
                  collectionId: collection.id,
                  source: 'discover',
                });
                router.push(`/collections/${collection.id}`);
              }}
              style={{ width: Math.min(width * 0.84, 380), height: 470, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.backgroundSecondary }}
            >
              <DestinationHeroImage
                destination={destination}
                style={{ position: 'absolute', inset: 0 }}
                attributionTop={spacing.xs}
              />
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(13,10,14,0.38)' }} />
              <View style={{ marginTop: 'auto', padding: spacing.xl, gap: spacing.sm }}>
                <Text variant="captionBold" style={{ color: '#fff', textTransform: 'uppercase', letterSpacing: 1.3 }}>{collection.kicker}</Text>
                <Text variant="displaySm" style={{ color: '#fff' }}>{collection.title}</Text>
                <Text variant="bodyMd" numberOfLines={3} style={{ color: 'rgba(255,255,255,0.9)' }}>{collection.whyVisit}</Text>
                <Text variant="labelMd" style={{ color: '#fff' }}>Open collection →</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.base, gap: spacing.base, paddingBottom: insets.bottom + spacing['4xl'] }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="h2">All destinations</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search city or country…" placeholderTextColor={colors.textTertiary} style={{ backgroundColor: colors.backgroundSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, fontSize: 15 }} />
        </View>
        {results.map((destination) => <DestinationCard key={destination.slug} destination={destination} />)}
      </View>
    </ScrollView>
  );
}
