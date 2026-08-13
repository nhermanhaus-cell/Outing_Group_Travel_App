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
import { cleanExperienceText, experienceDetailLines } from '../../src/lib/experience-content';

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
  const { colors, spacing, radius, shadows } = useTheme();
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
  const description = cleanExperienceText(experience?.description ?? experience?.summary);
  const itineraryLines = detailLinesDistinctFromDescription(experience?.itinerary, description);
  const logisticsLines = detailLinesDistinctFromDescription(experience?.logistics, description);
  const inclusionLines = detailLinesDistinctFromDescription(experience?.inclusions, description);
  const exclusionLines = detailLinesDistinctFromDescription(experience?.exclusions, description);
  const cancellationLines = detailLinesDistinctFromDescription(experience?.cancellationPolicy, description);
  if (experience?.freeCancellation && cancellationLines.length === 0) {
    cancellationLines.push('Free cancellation is available. Confirm the exact cutoff and refund terms on Viator before booking.');
  }

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

  const openBooking = () => {
    if (!experience?.productUrl) return;
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
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ position: 'absolute', zIndex: 4, top: insets.top + spacing.sm, left: spacing.base }}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.sm }}><Text style={{ fontSize: 21, color: colors.textPrimary }}>←</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 132 }}>
        {!experience ? <View style={{ padding: spacing.base, paddingTop: insets.top + 70, gap: spacing.lg }}><Skeleton height={260} /><Skeleton height={32} /><Skeleton height={100} /></View> : (
          <>
            <PhotoCarousel urls={experience.imageUrls} height={310} attribution={experience.provider === 'viator' ? 'Images and product information provided by Viator' : 'Outing editorial'} />
            <View style={{ padding: spacing.base, gap: spacing.lg }}>
            <View style={{ gap: spacing.sm }}>
              <Text variant="displaySm">{experience.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
                {experience.rating ? <Text variant="labelMd">★ {experience.rating.toFixed(1)} · {experience.reviewCount ?? 0} reviews</Text> : null}
                {experience.durationMinutes ? <Text variant="bodySm" style={{ color: colors.textSecondary }}>{Math.round(experience.durationMinutes / 60 * 10) / 10} hours</Text> : null}
                {experience.confirmationType === 'INSTANT' ? <Text variant="bodySm" style={{ color: colors.textSecondary }}>Instant confirmation</Text> : null}
              </View>
              {description ? <Text selectable variant="bodyMd" style={{ color: colors.textSecondary, lineHeight: 23 }}>{description}</Text> : null}
              {experience.address ? <Text variant="bodySm" style={{ color: colors.textTertiary }}>Starts near {experience.address}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {experience.freeCancellation ? <Badge label="Free cancellation" variant="success" /> : null}
                <Badge label={experience.provider === 'viator' ? 'Offered by Viator' : 'Outing editorial'} variant={experience.provider === 'viator' ? 'warning' : 'default'} />
              </View>
            </View>
            <DetailBlock title="What to expect" lines={itineraryLines} />
            <DetailBlock title="Meeting and pickup" lines={logisticsLines} />
            <DetailBlock title="What’s included" lines={inclusionLines} />
            <DetailBlock title="What’s not included" lines={exclusionLines} />
            <DetailBlock title="Cancellation" lines={cancellationLines} />
            {experience.availabilitySummary?.length ? <Card><View style={{ gap: spacing.xs }}><Text variant="labelLg">Availability</Text>{experience.availabilitySummary.map((line) => <Text key={line} variant="bodyMd" style={{ color: colors.textSecondary }}>{line}</Text>)}</View></Card> : null}
            {details.isError || (details.isSuccess && !details.data) ? <Text variant="caption" style={{ color: colors.textTertiary }}>Live details are temporarily unavailable; showing the saved description.</Text> : null}
            <Text variant="caption" style={{ color: colors.textTertiary }}>Checkout opens only the exact product page returned by Viator. Outing may earn a commission.</Text>
            </View>
          </>
        )}
      </ScrollView>
      {experience ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.md }}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="caption" style={{ color: colors.textSecondary }}>{experience.freeCancellation ? 'Free cancellation' : 'Check live terms'}</Text>
            <Text variant="h3">{experience.priceFrom ? `From ${experience.currency ?? ''} ${experience.priceFrom}` : 'See live price'}</Text>
          </View>
          <Button size="lg" disabled={!experience.productUrl} onPress={openBooking}>{experience.productUrl ? 'Check availability' : 'Unavailable'}</Button>
        </View>
      ) : null}
    </View>
  );
}

function detailLinesDistinctFromDescription(value: unknown, description?: string): string[] {
  const normalizedDescription = description?.toLocaleLowerCase();
  return experienceDetailLines(value).filter((line) => {
    const normalizedLine = line.toLocaleLowerCase();
    return !normalizedDescription
      || (normalizedLine !== normalizedDescription && !normalizedDescription.includes(normalizedLine));
  });
}

function DetailBlock({ title, lines }: { title: string; lines: string[] }) {
  const { colors, spacing } = useTheme();
  if (lines.length === 0) return null;
  return (
    <View style={{ paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: spacing.sm }}>
      <Text variant="h3">{title}</Text>
      {lines.map((line, index) => (
        <View key={`${line}-${index}`} style={{ flexDirection: 'row', gap: spacing.sm }}>
          {lines.length > 1 ? <Text variant="bodyMd" style={{ color: colors.accent }}>•</Text> : null}
          <Text selectable variant="bodyMd" style={{ color: colors.textSecondary, flex: 1, lineHeight: 22 }}>{line}</Text>
        </View>
      ))}
    </View>
  );
}
