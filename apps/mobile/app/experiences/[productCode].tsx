import React, { useEffect, useMemo, useRef } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadExperienceDetails, type MobileExperience } from '../../src/lib/experiences';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { PhotoCarousel } from '../../components/ui/PhotoCarousel';
import { Skeleton } from '../../components/ui/Skeleton';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { posthog } from '../../src/config/posthog';

function priceBand(value?: number): string | undefined {
  if (value == null) return undefined;
  if (value < 50) return 'under_50';
  if (value < 100) return '50_99';
  if (value < 250) return '100_249';
  return '250_plus';
}

function latencyBucket(value: number): string {
  if (value < 500) return 'under_500ms';
  if (value < 1500) return '500_1499ms';
  if (value < 5000) return '1500_4999ms';
  return '5000ms_plus';
}

export default function ExperienceDetailScreen() {
  const params = useLocalSearchParams<{ productCode: string; destinationSlug?: string; seed?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = useTheme();
  const { track, observePreference } = useAnalytics();
  const requestStartedAtRef = useRef(Date.now());
  const requestTrackedRef = useRef(false);
  const impressionTrackedRef = useRef(false);
  const seed = useMemo<MobileExperience | null>(() => {
    try { return params.seed ? JSON.parse(params.seed) as MobileExperience : null; } catch { return null; }
  }, [params.seed]);
  const isLive = seed?.provider === 'viator' || Boolean(seed?.productCode);
  const details = useQuery({
    queryKey: ['viator-product', params.productCode],
    queryFn: () => loadExperienceDetails(params.destinationSlug ?? '', params.productCode),
    enabled: isLive && Boolean(params.productCode),
    staleTime: 15 * 60 * 1000,
    retry: 2,
  });
  const experience = details.data ?? seed;

  useEffect(() => {
    if (requestTrackedRef.current || (!details.isSuccess && !details.isError)) return;
    requestTrackedRef.current = true;
    track(ANALYTICS_EVENTS.PROVIDER_REQUEST_COMPLETED, {
      provider: 'viator',
      operation: 'experience_details',
      status: details.isSuccess ? 'success' : 'failure',
      latencyBucket: latencyBucket(Date.now() - requestStartedAtRef.current),
      resultCountBucket: details.data ? '1' : '0',
    });
  }, [details.data, details.isError, details.isSuccess, track]);

  useEffect(() => {
    if (!experience?.productUrl || impressionTrackedRef.current) return;
    impressionTrackedRef.current = true;
    track(ANALYTICS_EVENTS.AFFILIATE_OFFER_IMPRESSION, {
      provider: experience.provider,
      productCategory: 'experience',
      rank: 1,
      ...(priceBand(experience.priceFrom) ? { priceBand: priceBand(experience.priceFrom) } : {}),
    });
  }, [experience, track]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.base, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable onPress={() => router.back()}><Text style={{ fontSize: 22, color: colors.textSecondary }}>←</Text></Pressable>
        <Text variant="h3" numberOfLines={1} style={{ flex: 1 }}>Experience details</Text>
      </View>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: insets.bottom + 120 }}>
        {!experience ? <><Skeleton height={220} /><Skeleton height={32} /><Skeleton height={100} /></> : (
          <>
            <PhotoCarousel urls={experience.imageUrls} height={240} attribution={experience.provider === 'viator' ? 'Images and product information provided by Viator' : 'Outing editorial'} />
            <View style={{ gap: spacing.sm }}>
              <Text variant="displaySm">{experience.title}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {experience.provider === 'viator' ? <Badge label="Viator" variant="warning" /> : <Badge label="Editorial idea" />}
                {experience.rating ? <Badge label={`${experience.rating.toFixed(1)} ★ · ${experience.reviewCount ?? 0} reviews`} variant="success" /> : null}
                {experience.durationMinutes ? <Badge label={`${Math.round(experience.durationMinutes / 60 * 10) / 10} hours`} /> : null}
                {experience.priceFrom ? <Badge label={`From ${experience.currency ?? ''} ${experience.priceFrom}`} variant="accent" /> : null}
              </View>
              <Text variant="bodyLg" style={{ color: colors.textSecondary }}>{experience.summary}</Text>
            </View>
            <DetailBlock title="What to expect" value={experience.itinerary} />
            <DetailBlock title="Meeting and pickup" value={experience.logistics} />
            <DetailBlock title="What’s included" value={experience.inclusions} />
            <DetailBlock title="What’s not included" value={experience.exclusions} />
            <DetailBlock title="Cancellation" value={experience.cancellationPolicy} />
            {experience.availabilitySummary?.length ? <Card><View style={{ gap: spacing.xs }}><Text variant="labelLg">Availability</Text>{experience.availabilitySummary.map((line) => <Text key={line} variant="bodyMd" style={{ color: colors.textSecondary }}>{line}</Text>)}</View></Card> : null}
            {details.isError ? <Text variant="caption" style={{ color: colors.textTertiary }}>Live details are temporarily unavailable; showing the saved summary.</Text> : null}
            <Button
              size="lg"
              fullWidth
              disabled={!experience.productUrl}
              onPress={() => {
                if (!experience.productUrl) return;
                const eventProperties = {
                  provider: experience.provider,
                  productCategory: 'experience',
                  ...(priceBand(experience.priceFrom) ? { priceBand: priceBand(experience.priceFrom) } : {}),
                };
                track(ANALYTICS_EVENTS.AFFILIATE_CLICKED, eventProperties);
                track(ANALYTICS_EVENTS.BOOKING_HANDOFF, eventProperties);
                posthog.capture('booking_handoff', {
                  provider: experience.provider,
                  product_category: 'experience',
                  ...(priceBand(experience.priceFrom) ? { price_band: priceBand(experience.priceFrom) } : {}),
                  title: experience.title,
                });
                observePreference({
                  subjectType: 'activity_category',
                  subjectKey: experience.tags?.[0] ?? 'experience',
                  value: 0.4,
                  weight: 1,
                  source: 'affiliate_handoff',
                  observedAt: new Date().toISOString(),
                });
                void Linking.openURL(experience.productUrl);
              }}
            >
              {experience.productUrl ? 'Book on Viator' : 'Booking link unavailable'}
            </Button>
            <Text variant="caption" style={{ color: colors.textTertiary }}>Checkout opens only the exact product page returned by Viator. Outing may earn a commission.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  const { colors, spacing } = useTheme();
  if (value == null || (Array.isArray(value) && value.length === 0)) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2).replace(/[{}\[\]"]/g, '').replace(/,/g, ' · ');
  return <Card><View style={{ gap: spacing.xs }}><Text variant="labelLg">{title}</Text><Text variant="bodyMd" style={{ color: colors.textSecondary }}>{text}</Text></View></Card>;
}
