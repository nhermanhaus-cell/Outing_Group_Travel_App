import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { editorialCollections } from '../../src/content/collections';
import { useAuth, useDestinations, useTravelProfile } from '../../src/providers/AppProviders';
import { useSavedDestinations } from '../../src/providers/SavedDestinationsProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { DestinationCard } from '../../components/ui/DestinationCard';
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
import { UnknownDestinationResults } from '../../components/destinations/unknown-destination-results';
import { DecisionBriefCard } from '../../components/assistant/DecisionBriefCard';
import { loadAssistantInsights } from '../../src/lib/assistant-api';
import {
  destinationMatchesSearchIntent,
  isConversationalTravelSearch,
  parseTravelSearchIntent,
  travelSearchChips,
} from '../../src/lib/smartSearch';
import { loadDestinationExperiences } from '../../src/lib/experiences';

function nextMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizedLookup(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export default function DiscoverScreen() {
  const { colors, spacing, radius } = useTheme();
  const { catalog, scoring, getBySlug } = useDestinations();
  const { profile } = useTravelProfile();
  const { user } = useAuth();
  const { slugs: savedSlugs } = useSavedDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 450);
    return () => clearTimeout(timer);
  }, [query]);

  const parsedIntent = useMemo(() => parseTravelSearchIntent(debouncedQuery || query), [debouncedQuery, query]);
  const conversationalSearch = isConversationalTravelSearch(parsedIntent);
  const chips = travelSearchChips(parsedIntent);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    if (!conversationalSearch) {
      return catalog.filter((destination) => destination.name.toLowerCase().includes(needle) || destination.country.toLowerCase().includes(needle));
    }
    const matchingSlugs = new Set(scoring.filter((destination) => destinationMatchesSearchIntent(destination, parsedIntent)).map((destination) => destination.slug));
    return catalog.filter((destination) => matchingSlugs.has(destination.slug));
  }, [catalog, conversationalSearch, parsedIntent, query, scoring]);
  const assistantSearch = useQuery({
    queryKey: ['assistant-insights', 'discover-search-v1', user?.id, parsedIntent],
    queryFn: ({ signal }) => loadAssistantInsights({
      surface: 'ask',
      trigger: 'screen',
      intent: { kind: 'search', search: parsedIntent },
      force: false,
    }, signal),
    enabled: Boolean(user && featureFlags.decisionBriefsV1 && conversationalSearch && debouncedQuery.length >= 4),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const searchDecision = assistantSearch.data?.insights.find((insight) => insight.kind === 'decision_brief');
  const searchRelaxations = assistantSearch.data?.insights.find((insight) => insight.kind === 'search_relaxation')?.relaxations ?? [];
  const serverResults = searchDecision?.recommendations.flatMap((recommendation) => {
    const destination = recommendation.destinationSlug ? getBySlug(recommendation.destinationSlug) : undefined;
    return destination ? [destination] : [];
  }) ?? [];
  const visibleResults = serverResults.length ? serverResults : results;
  const experienceDestination = useMemo(() => {
    const normalizedQuery = normalizedLookup(debouncedQuery);
    if (normalizedQuery.length < 3) return undefined;
    const direct = catalog
      .filter((destination) => normalizedQuery.includes(normalizedLookup(destination.name)))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (direct) return direct;
    if (visibleResults.length === 1 && (parsedIntent.interests.length > 0 || /\b(tour|experience|activity|things to do)\b/i.test(debouncedQuery))) {
      return visibleResults[0];
    }
    return undefined;
  }, [catalog, debouncedQuery, parsedIntent.interests.length, visibleResults]);
  const experienceSearch = useQuery({
    queryKey: [
      'discover-viator-experiences-v2',
      experienceDestination?.slug,
      debouncedQuery,
      parsedIntent.interests,
      parsedIntent.budgetLevel,
      profile.defaultInterests,
    ],
    queryFn: ({ signal }) => loadDestinationExperiences({
      destinationSlug: experienceDestination!.slug,
      destinationName: experienceDestination!.name,
      country: experienceDestination!.country,
      lat: experienceDestination!.lat,
      lng: experienceDestination!.lng,
      destinationType: experienceDestination!.destinationType,
      currency: 'USD',
      interests: parsedIntent.interests.length ? parsedIntent.interests : profile.defaultInterests,
      searchTerm: debouncedQuery,
      maxPrice: parsedIntent.budgetLevel === 'shoestring_slay' ? 125 : undefined,
      maxDurationMinutes: 360,
      minRating: 3.5,
      preferFreeCancellation: true,
      limit: 6,
      signal,
    }),
    enabled: Boolean(featureFlags.viatorV2 && experienceDestination && debouncedQuery.length >= 3),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
  const searchExperiences = useMemo(
    () => experienceSearch.data?.experiences.filter((experience) => experience.provider === 'viator') ?? [],
    [experienceSearch.data?.experiences],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim()) return;
      track(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
        searchContext: 'destination_discovery',
        queryLengthBucket: bucketQueryLength(query.trim().length),
        resultCountBucket: bucketCount(visibleResults.length),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, track, visibleResults.length]);

  useEffect(() => {
    const key = `${query.trim().toLowerCase()}:${visibleResults.slice(0, 20).map((item) => item.slug).join(',')}`;
    if (impressionKeyRef.current === key) return;
    impressionKeyRef.current = key;
    visibleResults.slice(0, 20).forEach((destination, index) => {
      track(ANALYTICS_EVENTS.DESTINATION_IMPRESSION, {
        destinationSlug: destination.slug,
        source: query.trim() ? 'search_results' : 'destination_catalog',
        rank: index + 1,
      });
    });
  }, [query, track, visibleResults]);

  useEffect(() => {
    if (!experienceDestination || searchExperiences.length === 0) return;
    searchExperiences.slice(0, 6).forEach((experience, index) => {
      track(ANALYTICS_EVENTS.AFFILIATE_OFFER_IMPRESSION, {
        provider: experience.provider,
        productCategory: 'experience',
        rank: index + 1,
      });
    });
  }, [experienceDestination, searchExperiences, track]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.base, gap: spacing.xs }}>
        <Text variant="displayMd">Discover</Text>
        <Text variant="bodyLg" style={{ color: colors.textSecondary }}>Places picked for the way you like to travel.</Text>
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
                  <Text variant="caption" style={{ color: colors.textTertiary }}>{deal.direct ? 'Direct flight' : 'Stops may apply'} · recently observed via Skyscanner</Text>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text variant="h2">Find your fit</Text>
            {featureFlags.smartCompareV1 && savedSlugs.length >= 2 ? (
              <Pressable onPress={() => router.push({ pathname: '/compare', params: { slugs: savedSlugs.slice(0, 4).join(',') } })}>
                <Text variant="labelMd" style={{ color: colors.accent }}>Compare saved</Text>
              </Pressable>
            ) : null}
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Try “warm, affordable beach trip in March”"
            placeholderTextColor={colors.textTertiary}
            style={{ backgroundColor: colors.backgroundSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, fontSize: 15 }}
          />
          {chips.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {chips.map((chip) => (
                <View key={chip} style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.poolLight }}>
                  <Text variant="labelSm" style={{ color: colors.pool }}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {assistantSearch.isFetching && !searchDecision ? (
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>Outing is checking your preferences against the catalog…</Text>
        ) : null}
        {searchDecision?.decisionCard ? (
          <DecisionBriefCard card={searchDecision.decisionCard} surface="discover" />
        ) : null}
        {searchRelaxations.length ? (
          <View style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.accentLight, gap: spacing.sm }}>
            <Text variant="labelLg">Broaden one thing</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>Your accessibility, safety, travel-time, and avoidance requirements will stay fixed.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {searchRelaxations.map((relaxation) => (
                <Pressable
                  key={relaxation.id}
                  onPress={() => {
                    track(ANALYTICS_EVENTS.ASSISTANT_RELAXATION_SELECTED, {
                      dimension: relaxation.dimension,
                      resultCountBucket: bucketCount(relaxation.resultCount),
                    });
                    router.push({ pathname: '/ask', params: { prompt: `${relaxation.title} for this search: ${query}. Keep all of my hard requirements fixed.` } });
                  }}
                  style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.surface }}
                >
                  <Text variant="labelSm" style={{ color: colors.accent }}>{relaxation.title}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {experienceSearch.isFetching && experienceDestination ? (
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>
            Checking bookable experiences in {experienceDestination.name}…
          </Text>
        ) : null}
        {searchExperiences.length > 0 && experienceDestination ? (
          <View style={{ marginHorizontal: -spacing.base, gap: spacing.sm }}>
            <View style={{ paddingHorizontal: spacing.base, gap: spacing.xxs }}>
              <Text variant="h2">Experiences in {experienceDestination.name}</Text>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                Ranked for this search using live Viator product details. Booking opens on Viator.
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
              {searchExperiences.map((experience) => (
                <Pressable
                  key={experience.id}
                  onPress={() => router.push({
                    pathname: '/experiences/[productCode]',
                    params: {
                      productCode: experience.productCode ?? experience.id,
                      destinationSlug: experienceDestination.slug,
                      seed: JSON.stringify(experience),
                    },
                  })}
                  style={{ width: 260, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary }}
                >
                  {experience.imageUrls[0] ? (
                    <Image source={{ uri: experience.imageUrls[0] }} style={{ width: '100%', height: 150 }} contentFit="cover" transition={180} />
                  ) : (
                    <View style={{ height: 150, backgroundColor: colors.plum }} />
                  )}
                  <View style={{ padding: spacing.md, gap: spacing.xs }}>
                    <Text variant="h4" numberOfLines={2}>{experience.title}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      {experience.rating ? <Text variant="captionBold">{experience.rating.toFixed(1)} ★</Text> : null}
                      {experience.priceFrom !== undefined ? (
                        <Text variant="captionBold">From {experience.currency ?? ''} {Math.round(experience.priceFrom)}</Text>
                      ) : null}
                      {experience.freeCancellation ? <Text variant="caption" style={{ color: colors.pool }}>Free cancellation</Text> : null}
                    </View>
                    <Text variant="caption" numberOfLines={2} style={{ color: colors.textTertiary }}>
                      {experience.summary}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Text variant="caption" style={{ color: colors.textTertiary, paddingHorizontal: spacing.base }}>
              Outing may earn a commission when you book through a partner link.
            </Text>
          </View>
        ) : null}
        {visibleResults.map((destination) => <DestinationCard key={destination.slug} destination={destination} />)}
        <UnknownDestinationResults
          query={query}
          enabled={featureFlags.globalDiscoveryV1 && !conversationalSearch && query.trim().length >= 2 && visibleResults.length === 0}
          returnPath="/discover"
        />
      </View>
    </ScrollView>
  );
}
