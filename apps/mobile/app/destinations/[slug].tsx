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
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth, useDestinations, useTravelProfile } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { PulseMeter } from '../../components/ui/PulseMeter';
import { PhotoCarousel } from '../../components/ui/PhotoCarousel';
import { DestinationHeroImage } from '../../components/ui/DestinationHeroImage';
import { getDestinationContextRating, getDestinationRating } from '../../src/lib/destinationRating';
import travelAdvisories from '../../assets/public/travel-advisories.json';
import travelBlogInsights from '../../assets/editorial/travel-blog-insights.json';
import {
  experienceRouteSeed,
  loadDestinationExperiences,
} from '../../src/lib/experiences';
import { ExperienceSummaryCard } from '../../components/experiences/experience-summary-card';
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
import { useSavedDestinations } from '../../src/providers/SavedDestinationsProvider';
import { OutingIcon } from '../../components/ui/OutingIcon';
import { Skeleton } from '../../components/ui/Skeleton';
import { featureFlags } from '../../src/lib/featureFlags';
import { loadAssistantInsights } from '../../src/lib/assistant-api';
import { DecisionBriefCard } from '../../components/assistant/DecisionBriefCard';
import { buildDestinationPulse } from '../../src/lib/communityPulse';
import { buildDestinationOverview } from '../../src/lib/destinationOverview';
import {
  buildTrustedDestinationSources,
  type TrustedDestinationSource,
} from '../../src/lib/destinationSources';
import { formatMoneyRange, formatTemperature } from '../../src/lib/display-format';
import { useDisplayPreferences } from '../../src/lib/display-preferences';

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

function isOlderThan(value: string | undefined, days: number): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp > days * 24 * 60 * 60 * 1000;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <Text
      variant="labelSm"
      style={{ color: colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm }}
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

function TrustedSourcesDisclosure({
  destinationName,
  sources,
}: {
  destinationName: string;
  sources: TrustedDestinationSource[];
}) {
  const { colors, spacing, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionTitle>Research & sources</SectionTitle>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.xl,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: colors.cardBackground,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${expanded ? 'Hide' : 'See'} trusted sources for ${destinationName}`}
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => ({
            minHeight: 68,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            backgroundColor: pressed ? colors.backgroundSecondary : colors.cardBackground,
          })}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight }}>
            <OutingIcon name="link" size={19} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text variant="labelLg" style={{ color: colors.textPrimary }}>
              {expanded ? 'Trusted sources' : 'See our trusted sources for more information'}
            </Text>
            <Text variant="caption" style={{ color: colors.textTertiary }}>
              {sources.length} destination-specific {sources.length === 1 ? 'reference' : 'references'}
            </Text>
          </View>
          <Text
            variant="h3"
            style={{ color: colors.accent, transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          >
            →
          </Text>
        </Pressable>

        {expanded ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSubtle }}>
            <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                These links are attached specifically to {destinationName}. Global datasets and generic publisher homepages are not shown here.
              </Text>
            </View>
            {sources.map((source, index) => (
              <Pressable
                key={source.id}
                accessibilityRole="link"
                accessibilityLabel={`Open ${source.label}${source.publisher ? ` from ${source.publisher}` : ''}`}
                onPress={() => void Linking.openURL(source.url)}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  gap: spacing.xxs,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.borderSubtle,
                  backgroundColor: pressed ? colors.backgroundSecondary : colors.cardBackground,
                })}
              >
                <Text variant="labelMd" style={{ color: colors.textPrimary }}>{source.label}</Text>
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  {[source.publisher, source.categoryLabel].filter(Boolean).join(' · ')}
                </Text>
                <Text variant="caption" style={{ color: colors.accent }}>Open source ↗</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
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
  accessibilityNotes?: string;
  websiteUri?: string;
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
        {place.accessibilityNotes ? <Text variant="caption" style={{ color: colors.textSecondary }}>Accessibility: {place.accessibilityNotes}</Text> : null}
        {place.estimatedCostUsd ? <Text variant="caption" style={{ color: colors.textTertiary }}>~${place.estimatedCostUsd}/person</Text> : null}
        {place.websiteUri ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(place.websiteUri!)}>
            <Text variant="caption" style={{ color: colors.accent }}>Official site ↗</Text>
          </Pressable>
        ) : null}
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
  const [displayPreferences] = useDisplayPreferences();
  const { isSaved, toggleSaved } = useSavedDestinations();
  const { user } = useAuth();
  const { profile } = useTravelProfile();
  const { slug, quizAnswers } = useLocalSearchParams<{ slug: string; quizAnswers?: string }>();
  const { getBySlug, getScoringBySlug } = useDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { track, observePreference } = useAnalytics();
  const experienceImpressionKeyRef = useRef('');

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const destination = useMemo(() => getBySlug(slug ?? ''), [slug, getBySlug]);
  const destinationOverview = useMemo(
    () => destination ? buildDestinationOverview(destination, profile.defaultInterests) : undefined,
    [destination, profile.defaultInterests],
  );
  const practical = (destination as unknown as { practical?: { gettingAround?: string; typicalStay?: string; costContext?: string } } | undefined)?.practical;
  const scoringDestination = useMemo(() => getScoringBySlug(slug ?? ''), [slug, getScoringBySlug]);
  const destinationExperiencesQuery = useQuery({
    queryKey: ['destination-experiences-v5', destination?.slug, destination?.interests ?? []],
    queryFn: ({ signal }) => loadDestinationExperiences({
      destinationSlug: destination!.slug,
      destinationName: destination!.name,
      country: destination!.country,
      lat: destination!.lat,
      lng: destination!.lng,
      destinationType: destination!.destinationType,
      currency: destination!.currency,
      interests: destination!.interests,
      minRating: 3.5,
      preferFreeCancellation: true,
      limit: 8,
      signal,
    }),
    enabled: Boolean(destination),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
  const destinationExperiences = destinationExperiencesQuery.data?.experiences ?? [];
  const personalizedInsight = useQuery({
    queryKey: ['assistant-insights', 'destination', destination?.slug, user?.id],
    queryFn: ({ signal }) => loadAssistantInsights({
      surface: 'destination',
      destinationSlug: destination!.slug,
      trigger: 'screen',
      force: false,
    }, signal),
    enabled: Boolean(user && destination && featureFlags.proactiveInsightsV1),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const fitRecommendation = personalizedInsight.data?.insights
    .flatMap((insight) => insight.recommendations)
    .find((recommendation) => recommendation.destinationSlug === destination?.slug);
  const decisionInsight = personalizedInsight.data?.insights.find((insight) => insight.kind === 'decision_brief');
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
      catalogCohort: destination.catalogWave ?? 'original',
      advisoryLevel: destination.travelerAdvisoryLevel ?? 'standard',
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

  const pulse = useMemo(() => {
    if (!destination) return null;
    return buildDestinationPulse(destination);
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

  const trustedSources = useMemo(
    () => destination
      ? buildTrustedDestinationSources(destination, editorialGuides)
      : [],
    [destination, editorialGuides],
  );

  const hasExternalExperienceBookings = useMemo(
    () =>
      destinationExperiences.some(
        (experience) =>
          experience.bookingMode === 'external' || Boolean(experience.affiliateUrl),
      ),
    [destinationExperiences],
  );


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
    communityScore: scoringDestination?.communityScore,
    nightlifeScore: scoringDestination?.nightlifeScore,
    legalEqualityScore: lgbtq?.legalEqualityScore,
    publicOpinionScore: lgbtq?.publicOpinionScore,
  });
  const contextRating = getDestinationContextRating({
    legalEqualityScore: lgbtq?.legalEqualityScore,
    publicOpinionScore: lgbtq?.publicOpinionScore,
  });
  const advisoryLevel = destination.travelerAdvisoryLevel ?? 'standard';
  const showAdvisory = advisoryLevel === 'elevated' || advisoryLevel === 'severe';
  const lgbtqContextIsStale = isOlderThan(lgbtq?.lastReviewedAt, 90);

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
            style={{ width: '100%', height: 330 }}
          />
          <View style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.base, right: spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.back()} style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.full, padding: spacing.sm }}>
              <Text style={{ color: colors.white, fontSize: 16 }}>←</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={isSaved(destination.slug) ? 'Remove saved destination' : 'Save destination'}
              onPress={() => void toggleSaved(destination.slug)}
              style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.full, padding: spacing.sm }}
            >
              <OutingIcon name="bookmark" size={20} color={colors.white} filled={isSaved(destination.slug)} />
            </Pressable>
          </View>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,13,10,0.55)', paddingHorizontal: spacing.lg, paddingVertical: spacing.base }}>
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.sm }}>
          <QuickFact label="Best time" value={(destination.bestMonths ?? []).slice(0, 3).map((month) => MONTH_NAMES[month]).join(', ') || 'Year-round'} />
          <QuickFact label="Trip shape" value={practical?.typicalStay ?? 'Flexible stay'} />
          <QuickFact label="Currency" value={destination.currency} />
          {destination.priceBands?.mid?.perPersonPerDayUsd ? (
            <QuickFact
              label="Typical day"
              value={formatMoneyRange(
                destination.priceBands.mid.perPersonPerDayUsd.low,
                destination.priceBands.mid.perPersonPerDayUsd.high,
                'USD',
                displayPreferences.currency,
              )}
            />
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: spacing.base }}>
          {user && featureFlags.assistantV1 ? (
            <Pressable
              onPress={() => router.push({
                pathname: '/ask',
                params: {
                  destinationSlug: destination.slug,
                  destinationSection: activeTab === 'lgbtq' ? 'context' : activeTab,
                  prompt: activeTab === 'overview'
                    ? `What should I know before choosing ${destination.name}?`
                    : `Help me explore ${destination.name} ${activeTab}`,
                },
              })}
              style={{ marginTop: spacing.base, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.plumLight, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
            >
              <OutingIcon name="ask" size={16} color={colors.plum} />
              <Text variant="labelSm" style={{ color: colors.plum }}>Ask about this section</Text>
            </Pressable>
          ) : null}
          {showAdvisory ? (
            <View
              accessibilityRole="alert"
              style={{ marginTop: spacing.base, padding: spacing.base, borderRadius: radius.lg, backgroundColor: colors.warningLight, gap: spacing.xs }}
            >
              <Text variant="h4">Review current LGBTQ+ guidance</Text>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                {advisoryLevel === 'severe'
                  ? 'Local laws or enforcement can create serious risk for LGBTQ+ travelers. Review the sourced legal context and current government guidance before planning.'
                  : 'Legal protections and day-to-day experiences can vary. Review the sourced local context before deciding whether this destination fits you.'}
              </Text>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  track(ANALYTICS_EVENTS.DESTINATION_ADVISORY_OPENED, {
                    destinationSlug: destination.slug,
                    advisoryLevel,
                  });
                  setActiveTab('lgbtq');
                }}
              >
                Read LGBTQ+ context
              </Button>
            </View>
          ) : null}
          {/* ─── Overview ─── */}
          {activeTab === 'overview' && (
            <View style={{ gap: spacing.xs }}>
              {featureFlags.decisionBriefsV1 && decisionInsight?.decisionCard ? (
                <View style={{ marginTop: spacing.lg }}>
                  <DecisionBriefCard
                    card={decisionInsight.decisionCard}
                    surface="destination"
                    onAction={(card) => router.push({
                      pathname: '/ask',
                      params: { destinationSlug: destination.slug, prompt: card.action?.value },
                    })}
                  />
                </View>
              ) : null}
              <SectionTitle>About</SectionTitle>
              <Text variant="bodyMd" style={{ color: colors.textSecondary, lineHeight: 23 }}>
                {destinationOverview?.overview ?? destination.editorialSummary}
              </Text>
              {practical?.gettingAround || practical?.typicalStay || practical?.costContext ? (
                <View style={{ marginTop: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSubtle }}>
                  {practical.gettingAround ? <Text variant="bodySm" style={{ color: colors.textSecondary }}><Text variant="labelMd">Getting around · </Text>{practical.gettingAround}</Text> : null}
                  {practical.costContext ? <Text variant="bodySm" style={{ color: colors.textSecondary }}><Text variant="labelMd">Cost context · </Text>{practical.costContext}</Text> : null}
                </View>
              ) : null}
              <View style={{ marginTop: spacing.md, padding: spacing.base, borderRadius: radius.xl, backgroundColor: colors.poolLight, gap: spacing.xs }}>
                <Text variant="labelSm" style={{ color: colors.pool }}>WHY IT MIGHT BE COOL FOR YOU</Text>
                <Text variant="bodySm" style={{ color: colors.textSecondary, lineHeight: 21 }}>
                  {destinationOverview?.personalizedReason}
                </Text>
              </View>
              {!featureFlags.decisionBriefsV1 && fitRecommendation ? (
                <View style={{ marginTop: spacing.md, padding: spacing.base, borderRadius: radius.xl, backgroundColor: colors.poolLight, gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
                    <Text variant="h3">Why this fits you</Text>
                    {fitRecommendation.fitScore !== undefined ? <Badge label={`${Math.round(fitRecommendation.fitScore)}% match`} variant="info" /> : null}
                  </View>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>{fitRecommendation.fitReasons.join(' · ')}</Text>
                  {fitRecommendation.tradeoffs.length ? (
                    <Text variant="caption" style={{ color: colors.textTertiary }}>Consider: {fitRecommendation.tradeoffs.join(' · ')}</Text>
                  ) : null}
                  <Button size="sm" variant="secondary" onPress={() => router.push({ pathname: '/ask', params: { destinationSlug: destination.slug } })}>Ask Outing about {destination.name}</Button>
                </View>
              ) : user && featureFlags.assistantV1 ? (
                <Button size="sm" variant="secondary" onPress={() => router.push({ pathname: '/ask', params: { destinationSlug: destination.slug } })}>Ask Outing about {destination.name}</Button>
              ) : null}
              {destinationRating ? (
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  Destination rating {destinationRating.score}/100 blends sourced community infrastructure, nightlife, legal-equality, and public-opinion context. It is not a user review or safety rating.
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

              {weatherQuery.isLoading ? (
                <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                  <Skeleton width="34%" height={12} />
                  <Skeleton height={78} borderRadius={radius.lg} />
                </View>
              ) : null}

              {weatherQuery.data?.weather ? (
                <>
                  <SectionTitle>Weather now</SectionTitle>
                  <Card elevated padded>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="h3">
                        {weatherQuery.data.weather.currentTemperatureC == null ? '—' : formatTemperature(weatherQuery.data.weather.currentTemperatureC, displayPreferences.temperatureUnit)} · {weatherLabel(weatherQuery.data.weather.currentWeatherCode)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        {weatherQuery.data.weather.daily.slice(0, 4).map((day) => (
                          <View key={day.date} style={{ flex: 1, gap: spacing.xxs }}>
                            <Text variant="caption" style={{ color: colors.textTertiary }}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</Text>
                            <Text variant="labelSm">
                              {day.temperatureMaxC == null ? '—' : formatTemperature(day.temperatureMaxC, displayPreferences.temperatureUnit, false)} / {day.temperatureMinC == null ? '—' : formatTemperature(day.temperatureMinC, displayPreferences.temperatureUnit, false)} {displayPreferences.temperatureUnit === 'fahrenheit' ? 'F' : 'C'}
                            </Text>
                            <Text variant="caption" style={{ color: colors.textTertiary }}>{day.precipitationProbabilityMax ?? 0}% rain</Text>
                          </View>
                        ))}
                      </View>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>Forecast by Open-Meteo · updated {new Date(weatherQuery.data.weather.retrievedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                    </View>
                  </Card>
                </>
              ) : null}

              {weatherQuery.isError && liveEventsQuery.isError ? (
                <View style={{ marginTop: spacing.lg, padding: spacing.base, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary, gap: spacing.sm }}>
                  <Text variant="h4">Current details couldn’t refresh.</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                    The saved destination guide is still here. Reconnect to update weather and events.
                  </Text>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      void weatherQuery.refetch();
                      void liveEventsQuery.refetch();
                    }}
                  >
                    Try again
                  </Button>
                </View>
              ) : null}

              <SectionTitle>Budget · {displayPreferences.currency} estimates</SectionTitle>
              {destination.priceBands && (
                <View style={{ gap: spacing.xs }}>
                  {destination.priceBands.shoestring?.perPersonPerDayUsd ? <InfoRow label="Budget / day" value={formatMoneyRange(destination.priceBands.shoestring.perPersonPerDayUsd.low, destination.priceBands.shoestring.perPersonPerDayUsd.high, 'USD', displayPreferences.currency)} /> : null}
                  {destination.priceBands.mid?.perPersonPerDayUsd ? <InfoRow label="Mid / day" value={formatMoneyRange(destination.priceBands.mid.perPersonPerDayUsd.low, destination.priceBands.mid.perPersonPerDayUsd.high, 'USD', displayPreferences.currency)} /> : null}
                  {destination.priceBands.luxury?.perPersonPerDayUsd ? <InfoRow label="Luxury / day" value={formatMoneyRange(destination.priceBands.luxury.perPersonPerDayUsd.low, destination.priceBands.luxury.perPersonPerDayUsd.high, 'USD', displayPreferences.currency)} /> : null}
                  {displayPreferences.currency !== 'USD' ? <Text variant="caption" style={{ color: colors.textTertiary }}>Approximate display conversion from Outing’s USD planning estimates.</Text> : null}
                </View>
              )}

              <SectionTitle>Interests</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {(destination.interests ?? []).map((i: string) => (
                  <Badge key={i} label={i.replace('_', ' ')} variant="default" />
                ))}
              </View>

              <SectionTitle>Things to do</SectionTitle>
              {destinationExperiencesQuery.isPending ? (
                <Card elevated padded style={{ marginBottom: spacing.sm }}>
                  <View style={{ gap: spacing.sm }}>
                    <Skeleton height={150} borderRadius={radius.md} />
                    <Skeleton height={20} width="72%" borderRadius={radius.sm} />
                    <Skeleton height={14} width="94%" borderRadius={radius.sm} />
                    <Text variant="caption" style={{ color: colors.textTertiary }}>
                      Finding the best bookable experiences in {destination.name}…
                    </Text>
                  </View>
                </Card>
              ) : destinationExperiences.length > 0 ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.base }} contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
                    {destinationExperiences.map((experience) => (
                      <View key={experience.id} style={{ width: 224 }}>
                        <ExperienceSummaryCard
                          experience={experience}
                          variant="rail"
                          onPress={() => router.push({
                            pathname: '/experiences/[productCode]',
                            params: {
                              productCode: experience.productCode ?? experience.id,
                              destinationSlug: destination.slug,
                              seed: experienceRouteSeed(experience),
                            },
                          })}
                        />
                      </View>
                    ))}
                  </ScrollView>
                  {hasExternalExperienceBookings ? (
                    <Text variant="caption" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                      Partner bookings open on Viator. Outing may earn a commission.
                    </Text>
                  ) : null}
                </>
              ) : (
                <Card padded style={{ marginBottom: spacing.sm }}>
                  <View style={{ gap: spacing.sm }}>
                    <Text variant="h4">More experiences are coming</Text>
                    <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                      Viator does not currently have a destination-matched option available here. Outing will still use verified places and events when planning your days.
                    </Text>
                    {destinationExperiencesQuery.isError ? (
                      <Button size="sm" variant="secondary" onPress={() => void destinationExperiencesQuery.refetch()}>
                        Try again
                      </Button>
                    ) : null}
                  </View>
                </Card>
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

              <TrustedSourcesDisclosure
                destinationName={destination.name}
                sources={trustedSources}
              />
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
                  Reviewed {new Date(lgbtq.lastReviewedAt).toLocaleDateString()}
                  {lgbtqContextIsStale ? ' · Context is due for review' : ''}
                </Text>
              )}

              {lgbtqContextIsStale ? (
                <Badge label="Context may be stale" variant="warning" />
              ) : null}

              <View style={{ marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.warningLight ?? colors.backgroundSecondary, borderRadius: radius.md }}>
                <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                  Conditions and local experiences can change. Check current official and local sources before travel.
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
                (destination.events ?? []).map((e: { id: string; title: string; startDate: string; endDate: string; category: string; summary: string; estimatedCostUsd?: number; sourceUrl?: string; scheduleStatus?: string }) => (
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
                      {e.sourceUrl ? <Button size="sm" variant="secondary" onPress={() => void Linking.openURL(e.sourceUrl!)}>Check official event site</Button> : null}
                    </View>
                  </Card>
                ))
              )}
              <Text variant="caption" style={{ color: colors.textTertiary, marginTop: spacing.md }}>
                Annual event timing is a planning aid. Confirm exact dates with the organizer before booking travel.
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
            const href = destinationPlanHref(
              { destinationSlug: destination.slug, destinationName: destination.name },
              quizAnswers,
            );
            if (quizAnswers) router.replace(href);
            else router.push(href);
          }}
        >
          Plan a trip to {destination.name}
        </Button>
      </View>
    </View>
  );
}

function QuickFact({ label, value }: { label: string; value: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ minWidth: 126, maxWidth: 190, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary, gap: 2 }}>
      <Text variant="caption" style={{ color: colors.textTertiary }}>{label}</Text>
      <Text variant="labelMd" numberOfLines={2}>{value}</Text>
    </View>
  );
}
