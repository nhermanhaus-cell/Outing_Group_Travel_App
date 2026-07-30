import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computePulse } from '@gayi/domain';
import type { PulseInputs } from '@gayi/domain';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDestinations } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { PulseMeter } from '../../components/ui/PulseMeter';
import { DataSourceBadge } from '../../components/ui/DataSourceBadge';
import { PhotoCarousel } from '../../components/ui/PhotoCarousel';
import { DestinationHeroImage } from '../../components/ui/DestinationHeroImage';
import { getDestinationContextRating, getDestinationRating } from '../../src/lib/destinationRating';
import travelAdvisories from '../../assets/public/travel-advisories.json';
import travelBlogInsights from '../../assets/editorial/travel-blog-insights.json';
import { getApiKeyStatus } from '../../src/lib/apiKeys';
import {
  loadDestinationExperiences,
  type MobileExperience,
} from '../../src/lib/experiences';
import { lookupPlaceByName } from '../../src/lib/googlePlaces';
import {
  loadNearbyParks,
  loadTicketmasterEvents,
  loadWeatherForecast,
  searchCommonsImages,
  searchLocationImages,
} from '../../src/lib/travel-api';
import { destinationPlanHref } from '../../src/lib/tripPlanningFlow';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { useDestinationImages } from '../../src/lib/destinationImages';

type TabKey = 'overview' | 'lgbtq' | 'places' | 'events';

type TravelBlogArticle = {
  id: string;
  sourceName: string;
  title: string;
  url: string;
  destinationSlugs: string[];
  signals: string[];
  editorialRelevance?: number;
  publishedAt?: string;
};

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function priceBand(value?: number): string | undefined {
  if (value == null) return undefined;
  if (value < 50) return 'under_50';
  if (value < 100) return '50_99';
  if (value < 250) return '100_249';
  return '250_plus';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <Text
      variant="labelSm"
      style={{ color: colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm }}
    >
      {children}
    </Text>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
      <Text variant="bodyMd" style={{ color: colors.textSecondary, flex: 1 }}>{label}</Text>
      <Text variant="labelMd" style={{ color: accent ? colors.accent : colors.textPrimary, textAlign: 'right', flex: 1 }}>{value}</Text>
    </View>
  );
}

function weatherLabel(code?: number) {
  if (code == null) return 'Current conditions';
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Storms possible';
}

type EditorialPlace = {
  id: string;
  name: string;
  category: string;
  summary: string;
  address?: string;
  lat?: number;
  lng?: number;
  lgbtqRelevance?: string;
  estimatedCostUsd?: number;
  imageUrl?: string;
  imageUrls?: string[];
  imageAttribution?: string;
};

function DestinationPlaceCard({ place, destinationName, center, index }: { place: EditorialPlace; destinationName: string; center: { lat: number; lng: number }; index: number }) {
  const { colors, spacing } = useTheme();
  const { track, observePreference } = useAnalytics();
  const live = useQuery({
    queryKey: ['google-place-card-v2', destinationName, place.name, place.address, place.lat, place.lng],
    queryFn: () => lookupPlaceByName(place.name, destinationName, {
      center: place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : center,
      ...(place.address ? { address: place.address } : {}),
    }),
    staleTime: 15 * 60_000,
    retry: 1,
  });
  const google = live.data;
  const pexels = useQuery({
    queryKey: ['pexels-place-image-v1', destinationName, place.name, place.category, index],
    queryFn: () => searchLocationImages({
      subject: place.name,
      destination: destinationName,
      category: place.category,
      kind: 'place',
      limit: 3,
      variant: index,
    }),
    enabled: !live.isLoading && !google?.imageUrls.length,
    staleTime: 14 * 24 * 60 * 60_000,
    retry: 1,
  });
  const pexelsImages = pexels.data?.images ?? [];
  const commons = useQuery({
    queryKey: ['commons-place-image-v1', destinationName, place.name],
    queryFn: () => searchCommonsImages(`${place.name} ${destinationName}`, 3),
    enabled: !live.isLoading
      && !google?.imageUrls.length
      && !pexels.isLoading
      && pexelsImages.length === 0,
    staleTime: 24 * 60 * 60_000,
    retry: 1,
  });
  const commonsImages = commons.data?.images ?? [];
  const editorial = place.imageUrls?.length ? place.imageUrls : place.imageUrl ? [place.imageUrl] : [];
  const rotatedFallback = editorial.length
    ? [...editorial.slice(index % editorial.length), ...editorial.slice(0, index % editorial.length)]
    : [];
  const imageUrls = google?.imageUrls.length
    ? google.imageUrls
    : pexelsImages.length
      ? pexelsImages.map((image) => image.url)
      : commonsImages.length
        ? commonsImages.map((image) => image.url)
        : rotatedFallback.slice(0, 1);
  const mapsUrl = google?.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${destinationName}`)}`;
  const attribution = google?.imageAttributions?.length
    ? `Photos: ${google.imageAttributions.join(', ')} · Google`
    : imageUrls.length && !pexelsImages.length && !commonsImages.length
      ? 'Destination photo via Unsplash · venue photo not yet verified'
      : undefined;
  const imageAttributions = pexelsImages.length
    ? pexelsImages.map((image) => ({
        text: image.matchType === 'destination_fallback'
          ? `${destinationName} fallback · Photo by ${image.author ?? 'a contributor'} on Pexels`
          : `Photo by ${image.author ?? 'a contributor'} on Pexels`,
        url: image.sourcePage,
      }))
    : commonsImages.length
      ? commonsImages.map((image) => ({
          text: `${image.author ?? 'Contributor'} · ${image.license ?? 'Wikimedia Commons'}`,
          url: image.sourcePage,
        }))
      : undefined;

  return (
    <Card elevated padded style={{ marginBottom: spacing.sm }}>
      <View style={{ gap: spacing.sm }}>
        {live.isLoading || (!google?.imageUrls.length && pexels.isLoading) ? (
          <View style={{ height: 160, borderRadius: 12, backgroundColor: colors.backgroundTertiary }} />
        ) : imageUrls.length > 0 ? (
          <PhotoCarousel
            urls={imageUrls}
            height={160}
            attribution={attribution}
            attributions={imageAttributions}
          />
        ) : (
          <View style={{ height: 88, borderRadius: 12, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center', padding: spacing.md }}>
            <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>
              No verified place photo yet
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h4" style={{ flex: 1 }}>{place.name}</Text>
          <Badge label={place.category} variant="default" />
        </View>
        <Text variant="bodySm" style={{ color: colors.textSecondary }}>{place.summary}</Text>
        {google?.address || place.address ? <Text variant="caption" style={{ color: colors.textTertiary }}>{google?.address ?? place.address}</Text> : null}
        {place.lgbtqRelevance ? <Text variant="caption" style={{ color: colors.accent }}>✦ {place.lgbtqRelevance}</Text> : null}
        {place.estimatedCostUsd ? <Text variant="caption" style={{ color: colors.textTertiary }}>~${place.estimatedCostUsd}/person</Text> : null}
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            track(ANALYTICS_EVENTS.EXTERNAL_LINK_OPENED, {
              linkType: 'map',
              provider: 'google_maps',
              sourceScreen: '/destinations/[slug]',
            });
            observePreference({
              subjectType: 'activity_category',
              subjectKey: place.category,
              value: 0.4,
              weight: 1,
              source: 'accept',
              observedAt: new Date().toISOString(),
            });
            void Linking.openURL(mapsUrl);
          }}
        >
          View on Google Maps
        </Button>
      </View>
    </Card>
  );
}

export default function DestinationDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { slug, quizAnswers } = useLocalSearchParams<{ slug: string; quizAnswers?: string }>();
  const { getBySlug, getScoringBySlug } = useDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { track, observePreference } = useAnalytics();
  const experienceImpressionKeyRef = useRef('');

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [destinationExperiences, setDestinationExperiences] = useState<MobileExperience[]>(
    [],
  );
  const [experienceSource, setExperienceSource] = useState<
    'viator_live' | 'editorial_fallback'
  >('editorial_fallback');

  const destination = useMemo(() => getBySlug(slug ?? ''), [slug, getBySlug]);
  const scoringDestination = useMemo(() => getScoringBySlug(slug ?? ''), [slug, getScoringBySlug]);
  const destinationImages = useDestinationImages(destination);
  const weatherQuery = useQuery({
    queryKey: ['destination-weather-v1', destination?.slug],
    queryFn: () => loadWeatherForecast(destination!.lat, destination!.lng),
    enabled: Boolean(destination),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const liveEventsQuery = useQuery({
    queryKey: ['destination-events-v1', destination?.slug],
    queryFn: () => loadTicketmasterEvents(destination!.lat, destination!.lng, { limit: 10 }),
    enabled: Boolean(destination),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const parksQuery = useQuery({
    queryKey: ['destination-parks-v1', destination?.slug],
    queryFn: () => loadNearbyParks(destination!.name, 4),
    enabled: destination?.countryCode === 'US',
    staleTime: 12 * 60 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!destination?.slug) return;
    track(ANALYTICS_EVENTS.DESTINATION_VIEWED, {
      destinationSlug: destination.slug,
      source: quizAnswers ? 'questionnaire_results' : 'discovery',
    });
    const timer = setTimeout(() => {
      observePreference({
        subjectType: 'destination',
        subjectKey: destination.slug,
        value: 0.1,
        weight: 0.25,
        source: 'passive_view',
        observedAt: new Date().toISOString(),
      });
    }, 20_000);
    return () => clearTimeout(timer);
  }, [destination?.slug, observePreference, quizAnswers, track]);

  useEffect(() => {
    track(ANALYTICS_EVENTS.FILTER_APPLIED, {
      filterName: 'destination_tab',
      valueCategory: activeTab,
    });
  }, [activeTab, track]);

  useEffect(() => {
    if (!destination?.slug || destinationExperiences.length === 0) return;
    const key = `${destination.slug}:${destinationExperiences.map((item) => item.id).join(',')}`;
    if (experienceImpressionKeyRef.current === key) return;
    experienceImpressionKeyRef.current = key;
    destinationExperiences.slice(0, 10).forEach((experience, index) => {
      if (!experience.affiliateUrl) return;
      track(ANALYTICS_EVENTS.AFFILIATE_OFFER_IMPRESSION, {
        provider: experience.provider,
        productCategory: 'experience',
        rank: index + 1,
        ...(priceBand(experience.priceFrom) ? { priceBand: priceBand(experience.priceFrom) } : {}),
      });
    });
  }, [destination?.slug, destinationExperiences, track]);

  useEffect(() => {
    if (!slug) {
      setDestinationExperiences([]);
      setExperienceSource('editorial_fallback');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { experiences, source } = await loadDestinationExperiences(slug);
        if (cancelled) return;
        setDestinationExperiences(experiences);
        setExperienceSource(source);
      } catch {
        if (cancelled) return;
        setDestinationExperiences([]);
        setExperienceSource('editorial_fallback');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const pulse = useMemo(() => {
    if (!destination?.communityPulseComponents) return null;
    const c = destination.communityPulseComponents;
    const inputs: PulseInputs = {
      eventCount30d: c.upcomingEvents30d ?? 0,
      venueDensityPer100k: c.venueDensity ?? 0,
      reviewCount: c.recentReviews ?? 0,
      activeContributors30d: c.activeContributors ?? 0,
      publicTripsCount: c.publicTrips ?? 0,
      aggregateCheckins30d: c.aggregateCheckins ?? 0,
      responseRate: c.questionResponseRate ?? 0,
      verifiedVenueCount: Math.round((c.venueDensity ?? 0) * 0.4),
      prideEventThisYear: (destination.events ?? []).some((e: { category: string }) => e.category === 'pride'),
    };
    return computePulse(inputs);
  }, [destination]);

  const advisoryLinks = useMemo(() => {
    if (!destination) return [] as Array<{ title: string; url: string }>;
    const entries = (travelAdvisories as {
      entries: Array<{ countryCode: string; issuer: string; links: Array<{ title: string; url: string }> }>;
    }).entries;
    const match = entries.find((e) => e.countryCode === destination.countryCode);
    return match?.links ?? [];
  }, [destination]);

  const editorialGuides = useMemo(() => {
    if (!slug) return [] as TravelBlogArticle[];
    const matches = (travelBlogInsights.articles as TravelBlogArticle[])
      .filter((article) => article.destinationSlugs.includes(slug))
      .filter((article) => (article.editorialRelevance ?? 0) >= 4)
      .sort((a, b) =>
        (b.editorialRelevance ?? 0) - (a.editorialRelevance ?? 0)
        || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
      );
    const selected: TravelBlogArticle[] = [];
    const usedSources = new Set<string>();
    for (const article of matches) {
      if (!usedSources.has(article.sourceName)) {
        selected.push(article);
        usedSources.add(article.sourceName);
      }
      if (selected.length === 5) break;
    }
    for (const article of matches) {
      if (selected.some((selectedArticle) => selectedArticle.url === article.url)) continue;
      selected.push(article);
      if (selected.length === 5) break;
    }
    return selected;
  }, [slug]);

  const hasExternalExperienceBookings = useMemo(
    () =>
      destinationExperiences.some(
        (experience) =>
          experience.bookingMode === 'external' || Boolean(experience.affiliateUrl),
      ),
    [destinationExperiences],
  );

  const apiKeys = getApiKeyStatus();

  if (!destination) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="h3" style={{ color: colors.textTertiary }}>Destination not found</Text>
        <Button variant="ghost" onPress={() => router.back()}>Go back</Button>
      </View>
    );
  }

  const lgbtq = destination.lgbtqContext;
  const legal = lgbtq?.legalEqualityScore ?? 0;
  const opinion = lgbtq?.publicOpinionScore ?? 0;
  const destinationRating = getDestinationRating({
    reviewScore: scoringDestination?.reviewScore,
    communityScore: scoringDestination?.communityScore,
    nightlifeScore: scoringDestination?.nightlifeScore,
    legalEqualityScore: lgbtq?.legalEqualityScore,
    publicOpinionScore: lgbtq?.publicOpinionScore,
  });
  const contextRating = getDestinationContextRating({
    legalEqualityScore: lgbtq?.legalEqualityScore,
    publicOpinionScore: lgbtq?.publicOpinionScore,
  });

  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'lgbtq', label: 'LGBTQ+' },
    { key: 'places', label: 'Places' },
    { key: 'events', label: 'Events' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Hero */}
        <View style={{ position: 'relative' }}>
          <DestinationHeroImage
            destination={destination}
            style={{ width: '100%', height: 380 }}
            attributionTop={insets.top + 58}
          />
          <View style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.base, right: spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.back()} style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.full, padding: spacing.sm }}>
              <Text style={{ color: colors.white, fontSize: 16 }}>←</Text>
            </Pressable>
            <DataSourceBadge label={destination.sourceLabel ?? 'editorial_demo'} />
          </View>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,13,10,0.55)', paddingHorizontal: spacing['2xl'], paddingVertical: spacing.xl }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
              {destinationRating ? <Badge label={`${destinationRating.label} · ${destinationRating.score}`} variant={destinationRating.variant} /> : null}
              {contextRating ? <Badge label={contextRating.label} variant={contextRating.variant} /> : null}
            </View>
            <Text variant="displayMd" style={{ color: colors.white }}>{destination.name}</Text>
            <Text variant="bodyLg" style={{ color: 'rgba(255,255,255,0.8)' }}>{destination.country}</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{ flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === tab.key ? colors.accent : 'transparent' }}
            >
              <Text variant="labelMd" style={{ color: activeTab === tab.key ? colors.accent : colors.textSecondary }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: spacing.base }}>
          {/* ─── Overview ─── */}
          {activeTab === 'overview' && (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle>About</SectionTitle>
              <Text variant="bodyLg" style={{ color: colors.textSecondary, lineHeight: 26 }}>
                {destination.editorialSummary}
              </Text>
              {destinationRating ? (
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  Destination rating {destinationRating.score}/100 blends assigned review, community, nightlife, legal-equality, and public-opinion scores. It is not a safety rating.
                </Text>
              ) : null}
              {contextRating ? (
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  LGBTQ+ context: {contextRating.label} ({contextRating.score}/100), based on assigned legal and public-opinion data. Experiences vary by neighborhood and traveler; verify current local sources.
                </Text>
              ) : null}

              {(destinationImages.pexelsImages.length
                || destination.galleryImageUrls?.length > 0
                || destination.heroImageUrl) && (
                <>
                  <SectionTitle>Look & feel</SectionTitle>
                  <PhotoCarousel
                    urls={
                      destinationImages.pexelsImages.length
                        ? destinationImages.pexelsImages.map((image) => image.url)
                        : (destination.galleryImageUrls?.length
                            ? destination.galleryImageUrls
                            : [destination.heroImageUrl].filter(Boolean)) as string[]
                    }
                    height={220}
                    attribution={destinationImages.pexelsImages.length ? undefined : 'Photos via Unsplash'}
                    attributions={destinationImages.pexelsImages.map((image) => ({
                      text: `Photo by ${image.author ?? 'a contributor'} on Pexels`,
                      url: image.sourcePage,
                    }))}
                  />
                </>
              )}

              <SectionTitle>Community Pulse</SectionTitle>
              {pulse ? (
                <Card elevated padded>
                  <PulseMeter pulse={pulse} />
                </Card>
              ) : null}

              <SectionTitle>Best months</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {(destination.bestMonths ?? []).map((m: number) => (
                  <Badge key={m} label={MONTH_NAMES[m]} variant="info" />
                ))}
              </View>

              {weatherQuery.data?.weather ? (
                <>
                  <SectionTitle>Weather now</SectionTitle>
                  <Card elevated padded>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="h3">
                        {weatherQuery.data.weather.currentTemperatureC == null ? '—' : `${Math.round(weatherQuery.data.weather.currentTemperatureC)}°C`} · {weatherLabel(weatherQuery.data.weather.currentWeatherCode)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        {weatherQuery.data.weather.daily.slice(0, 4).map((day) => (
                          <View key={day.date} style={{ flex: 1, gap: spacing.xxs }}>
                            <Text variant="caption" style={{ color: colors.textTertiary }}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</Text>
                            <Text variant="labelSm">{day.temperatureMaxC == null ? '—' : `${Math.round(day.temperatureMaxC)}°`} / {day.temperatureMinC == null ? '—' : `${Math.round(day.temperatureMinC)}°`}</Text>
                            <Text variant="caption" style={{ color: colors.textTertiary }}>{day.precipitationProbabilityMax ?? 0}% rain</Text>
                          </View>
                        ))}
                      </View>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>Forecast by Open-Meteo · updated {new Date(weatherQuery.data.weather.retrievedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                    </View>
                  </Card>
                </>
              ) : null}

              <SectionTitle>Budget</SectionTitle>
              {destination.priceBands && (
                <View style={{ gap: spacing.xs }}>
                  <InfoRow label="Budget / day" value={`$${destination.priceBands.shoestring?.perPersonPerDayUsd?.low}–${destination.priceBands.shoestring?.perPersonPerDayUsd?.high}`} />
                  <InfoRow label="Mid / day" value={`$${destination.priceBands.mid?.perPersonPerDayUsd?.low}–${destination.priceBands.mid?.perPersonPerDayUsd?.high}`} />
                  <InfoRow label="Luxury / day" value={`$${destination.priceBands.luxury?.perPersonPerDayUsd?.low}–${destination.priceBands.luxury?.perPersonPerDayUsd?.high}`} />
                </View>
              )}

              <SectionTitle>Interests</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {(destination.interests ?? []).map((i: string) => (
                  <Badge key={i} label={i.replace('_', ' ')} variant="default" />
                ))}
              </View>

              <SectionTitle>Live APIs</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                <Badge
                  label={apiKeys.places ? 'Places keyed' : 'Places offline'}
                  variant={apiKeys.places ? 'success' : 'warning'}
                />
                <Badge
                  label={apiKeys.viator ? 'Viator keyed' : 'Viator offline'}
                  variant={apiKeys.viator ? 'success' : 'warning'}
                />
                <Badge
                  label={
                    experienceSource === 'viator_live' ? 'Experiences: live' : 'Experiences: editorial'
                  }
                  variant={experienceSource === 'viator_live' ? 'info' : 'default'}
                />
              </View>
              {!apiKeys.places || !apiKeys.viator ? (
                <Text variant="caption" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                  Put keys in the repo-root `.env`, then restart with `npx expo start --go --clear`. Watch the Metro terminal for `[gayi] API keys loaded`.
                </Text>
              ) : null}

              {destinationExperiences.length > 0 && (
                <>
                  <SectionTitle>Things to do</SectionTitle>
                  {destinationExperiences.map((experience, index) => (
                    <Card key={experience.id} elevated padded style={{ marginBottom: spacing.sm }}>
                      <View style={{ gap: spacing.sm }}>
                        <PhotoCarousel
                          urls={experience.imageUrls}
                          height={150}
                          attributions={experience.imageAttributions}
                          attribution={
                            experience.provider === 'viator' ? undefined : 'Photo via Unsplash'
                          }
                        />
                        <Text variant="h4">{experience.title}</Text>
                        <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                          {experience.summary}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                          {experienceSource === 'viator_live' || experience.provider === 'viator' ? (
                            <Badge label="Viator" variant="warning" />
                          ) : null}
                          {experience.tags?.slice(0, 4).map((tag) => (
                            <Badge key={tag} label={tag} variant="default" />
                          ))}
                        </View>
                        {typeof experience.affiliateUrl === 'string' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() => {
                              const affiliateUrl = experience.affiliateUrl;
                              if (affiliateUrl) {
                                track(ANALYTICS_EVENTS.AFFILIATE_CLICKED, {
                                  provider: experience.provider,
                                  productCategory: 'experience',
                                  rank: index + 1,
                                  ...(priceBand(experience.priceFrom) ? { priceBand: priceBand(experience.priceFrom) } : {}),
                                });
                                observePreference({
                                  subjectType: 'activity_category',
                                  subjectKey: experience.tags?.[0] ?? 'experience',
                                  value: 0.4,
                                  weight: 1,
                                  source: 'affiliate_handoff',
                                  observedAt: new Date().toISOString(),
                                });
                                void Linking.openURL(affiliateUrl);
                              }
                            }}
                          >
                            Open experience
                          </Button>
                        ) : null}
                      </View>
                    </Card>
                  ))}
                  {hasExternalExperienceBookings ? (
                    <Text variant="caption" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                      Partner bookings open on Viator. Outing may earn a commission.
                    </Text>
                  ) : null}
                </>
              )}

              {destination.neighborhoods?.length > 0 && (
                <>
                  <SectionTitle>Neighborhoods</SectionTitle>
                  {destination.neighborhoods.map((n: { id: string; name: string; summary: string; vibeTags: string[] }) => (
                    <View key={n.id} style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
                      <Text variant="h4">{n.name}</Text>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>{n.summary}</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                        {(n.vibeTags ?? []).map((t: string) => (
                          <Badge key={t} label={t} variant="default" />
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {editorialGuides.length > 0 && (
                <>
                  <SectionTitle>From queer travel writers</SectionTitle>
                  <Text variant="bodySm" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                    Independent perspectives for deeper trip research. Open the original article to verify current venue details and dates.
                  </Text>
                  {editorialGuides.map((article) => (
                    <Pressable
                      key={article.id}
                      onPress={() => void Linking.openURL(article.url)}
                      accessibilityRole="link"
                      accessibilityLabel={`Read ${article.title} on ${article.sourceName}`}
                      style={{
                        paddingVertical: spacing.md,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.borderSubtle,
                        gap: spacing.xs,
                      }}
                    >
                      <Text variant="h4">{article.title}</Text>
                      <Text variant="caption" style={{ color: colors.accent }}>
                        {article.sourceName} ↗
                      </Text>
                      {article.signals.length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                          {article.signals.slice(0, 4).map((signal) => (
                            <Badge key={signal} label={signal} variant="default" />
                          ))}
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </>
              )}

              {(parksQuery.data?.parks.length ?? 0) > 0 ? (
                <>
                  <SectionTitle>Official outdoor ideas nearby</SectionTitle>
                  {parksQuery.data!.parks.map((park) => (
                    <Pressable key={park.id} onPress={() => void Linking.openURL(park.url)} style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: spacing.xs }}>
                      <Text variant="h4">{park.name}</Text>
                      {park.designation ? <Text variant="caption" style={{ color: colors.accent }}>{park.designation} · National Park Service ↗</Text> : null}
                      {park.description ? <Text variant="bodySm" numberOfLines={3} style={{ color: colors.textSecondary }}>{park.description}</Text> : null}
                    </Pressable>
                  ))}
                </>
              ) : null}

              {(destination.sources?.length ?? 0) > 0 && (
                <>
                  <SectionTitle>Sources</SectionTitle>
                  <Text variant="bodySm" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                    Attribution for editorial further reading and public datasets. Outing never claims a destination is universally safe.
                  </Text>
                  {(destination.sources as Array<{ type: string; label: string; url: string }>).map((s, i) => (
                    <View
                      key={`${s.type}-${i}`}
                      style={{
                        paddingVertical: spacing.sm,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.borderSubtle,
                        gap: spacing.xxs,
                      }}
                    >
                      <Text variant="labelMd">{s.label}</Text>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>{s.type.replace('_', ' ')}</Text>
                      <Text variant="caption" style={{ color: colors.accent }}>{s.url}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* ─── LGBTQ+ ─── */}
          {activeTab === 'lgbtq' && (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle>Legal & Social Context</SectionTitle>
              <View style={{ gap: spacing.xs }}>
                <InfoRow label="Legal equality" value={`${legal}/100`} accent />
                <InfoRow label="Public opinion" value={`${opinion}/100`} accent />
                {contextRating ? <InfoRow label="Overall context" value={`${contextRating.label} · ${contextRating.score}/100`} /> : null}
                <InfoRow label="Criminalization" value={lgbtq?.criminalizationStatus ?? '—'} />
                <InfoRow label="Same-sex recognition" value={lgbtq?.sameSexRecognition ? 'Yes' : 'No'} />
                <InfoRow label="Anti-discrimination" value={lgbtq?.antiDiscrimination ? 'Yes' : 'No'} />
              </View>

              {lgbtq?.localVariation && (
                <>
                  <SectionTitle>Local variation</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{lgbtq.localVariation}</Text>
                </>
              )}

              {lgbtq?.genderRecognitionNotes && (
                <>
                  <SectionTitle>Gender recognition</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{lgbtq.genderRecognitionNotes}</Text>
                </>
              )}

              {lgbtq?.humanRightsSummary && (
                <>
                  <SectionTitle>Human rights summary</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                    {lgbtq.humanRightsSummary}
                  </Text>
                </>
              )}

              {lgbtq?.advocacyNotes && (
                <>
                  <SectionTitle>Advocacy notes</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                    {lgbtq.advocacyNotes}
                  </Text>
                </>
              )}

              {lgbtq?.recentRelevantEvents?.length > 0 && (
                <>
                  <SectionTitle>Recent relevant events</SectionTitle>
                  {lgbtq.recentRelevantEvents.map(
                    (
                      event: {
                        title: string;
                        date?: string;
                        summary?: string;
                        sourceUrl?: string;
                      },
                      index: number,
                    ) => (
                      <Card key={`${event.title}-${index}`} elevated padded style={{ marginBottom: spacing.sm }}>
                        <View style={{ gap: spacing.xs }}>
                          <Text variant="h4">{event.title}</Text>
                          {event.date ? (
                            <Text variant="caption" style={{ color: colors.textTertiary }}>
                              {event.date}
                            </Text>
                          ) : null}
                          {event.summary ? (
                            <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                              {event.summary}
                            </Text>
                          ) : null}
                          {event.sourceUrl ? (
                            <Text variant="caption" style={{ color: colors.accent }}>
                              {event.sourceUrl}
                            </Text>
                          ) : null}
                        </View>
                      </Card>
                    ),
                  )}
                </>
              )}

              {lgbtq?.neighborhoodNotes?.length > 0 && (
                <>
                  <SectionTitle>Traveler notes</SectionTitle>
                  {lgbtq.neighborhoodNotes.map((note: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs }}>
                      <Text style={{ color: colors.accent }}>◦</Text>
                      <Text variant="bodyMd" style={{ flex: 1, color: colors.textSecondary }}>{note}</Text>
                    </View>
                  ))}
                </>
              )}

              {lgbtq?.emergencyResources?.length > 0 && (
                <>
                  <SectionTitle>Resources</SectionTitle>
                  {lgbtq.emergencyResources.map((r: { name: string; url: string }, i: number) => (
                    <Text key={i} variant="bodyMd" style={{ color: colors.accent }}>
                      {r.name} ({r.url})
                    </Text>
                  ))}
                </>
              )}

              {advisoryLinks.length > 0 && (
                <>
                  <SectionTitle>Official advisories</SectionTitle>
                  <Text variant="bodySm" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                    Government links only — not an Outing safety rating.
                  </Text>
                  {advisoryLinks.map((link) => (
                    <Text key={link.url} variant="bodyMd" style={{ color: colors.accent, marginBottom: spacing.xs }}>
                      {link.title}
                      {'\n'}
                      <Text variant="caption" style={{ color: colors.textTertiary }}>{link.url}</Text>
                    </Text>
                  ))}
                </>
              )}

              {lgbtq?.lastReviewedAt && (
                <Text variant="caption" style={{ color: colors.textTertiary, marginTop: spacing.md }}>
                  Reviewed: {lgbtq.lastReviewedAt} · {lgbtq.dataLabel ?? 'editorial_demo'}
                </Text>
              )}

              <View style={{ marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.warningLight ?? colors.backgroundSecondary, borderRadius: radius.md }}>
                <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                  Context is sample data only. Always verify with current local sources before travel.
                </Text>
              </View>
            </View>
          )}

          {/* ─── Places ─── */}
          {activeTab === 'places' && (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle>Places</SectionTitle>
              {(destination.places ?? []).length === 0 ? (
                <Text variant="bodyMd" style={{ color: colors.textTertiary }}>No places listed.</Text>
              ) : (
                (destination.places ?? []).map((p: EditorialPlace, index: number) => (
                  <DestinationPlaceCard key={p.id} place={p} destinationName={destination.name} center={{ lat: destination.lat, lng: destination.lng }} index={index} />
                ))
              )}
            </View>
          )}

          {/* ─── Events ─── */}
          {activeTab === 'events' && (
            <View style={{ gap: spacing.xs }}>
              {(liveEventsQuery.data?.events.length ?? 0) > 0 ? (
                <>
                  <SectionTitle>Live event listings</SectionTitle>
                  {liveEventsQuery.data!.events.map((event) => (
                    <Card key={event.id} elevated padded style={{ marginBottom: spacing.sm }}>
                      <View style={{ gap: spacing.xs }}>
                        {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={{ width: '100%', height: 150, borderRadius: 12 }} resizeMode="cover" /> : null}
                        <Text variant="h4">{event.name}</Text>
                        <Text variant="caption" style={{ color: colors.textSecondary }}>{[event.startDate, event.startTime, event.venueName].filter(Boolean).join(' · ')}</Text>
                        {event.genre ? <Badge label={event.genre} variant="default" /> : null}
                        <Button size="sm" variant="secondary" onPress={() => void Linking.openURL(event.url)}>View official listing</Button>
                      </View>
                    </Card>
                  ))}
                  <Text variant="caption" style={{ color: colors.textTertiary }}>Live listings via Ticketmaster. A listing is not an Outing endorsement; verify venue and event details.</Text>
                </>
              ) : null}
              <SectionTitle>Upcoming events</SectionTitle>
              {(destination.events ?? []).length === 0 ? (
                <Text variant="bodyMd" style={{ color: colors.textTertiary }}>No events listed.</Text>
              ) : (
                (destination.events ?? []).map((e: { id: string; title: string; startDate: string; endDate: string; category: string; summary: string; estimatedCostUsd?: number }) => (
                  <Card key={e.id} elevated padded style={{ marginBottom: spacing.sm }}>
                    <View style={{ gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text variant="h4" style={{ flex: 1 }}>{e.title}</Text>
                        <Badge label={e.category} variant={e.category === 'pride' ? 'accent' : 'default'} />
                      </View>
                      <Text variant="caption" style={{ color: colors.textSecondary }}>
                        {e.startDate}{e.endDate !== e.startDate ? ` – ${e.endDate}` : ''}
                      </Text>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>{e.summary}</Text>
                    </View>
                  </Card>
                ))
              )}
              <Text variant="caption" style={{ color: colors.textTertiary, marginTop: spacing.md }}>
                Sample calendar data. Verify dates before travel.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* CTA Footer */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: spacing.base,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button
          fullWidth
          onPress={() => {
            track(ANALYTICS_EVENTS.TRIP_CREATION_PATH_SELECTED, {
              path: 'recommendations',
              entryPoint: 'destination_detail',
            });
            router.push(destinationPlanHref(
              {
                destinationSlug: destination.slug,
                destinationName: destination.name,
              },
              quizAnswers,
            ));
          }}
        >
          Plan a trip to {destination.name}
        </Button>
      </View>
    </View>
  );
}
