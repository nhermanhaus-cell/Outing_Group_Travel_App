import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDestinations } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { DestinationCard } from '../../components/ui/DestinationCard';
import homeEditorial from '../../assets/editorial/home.json';

type HomeEditorial = {
  hero: {
    brand: string;
    headline: string;
    subhead: string;
    ctaLabel: string;
    ctaRoute: string;
    heroDestinationSlug: string;
  };
  featuredDestinationSlugs: string[];
  placesToVisit: Array<{
    destinationSlug: string;
    placeName: string;
    blurb: string;
  }>;
};

export default function HomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const { catalog, getBySlug } = useDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const editorial = homeEditorial as HomeEditorial;

  const featured = useMemo(() => {
    const fromEditorial = editorial.featuredDestinationSlugs
      .map((slug) => getBySlug(slug))
      .filter(Boolean);
    return fromEditorial.length > 0 ? fromEditorial : catalog.slice(0, 6);
  }, [catalog, editorial.featuredDestinationSlugs, getBySlug]);

  const heroDest =
    getBySlug(editorial.hero.heroDestinationSlug) ?? featured[0] ?? catalog[0];

  const places = editorial.placesToVisit;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['4xl'] }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={{ position: 'relative' }}>
        {heroDest?.heroImageUrl ? (
          <Image
            source={{ uri: heroDest.heroImageUrl }}
            style={{ width: '100%', height: 520 }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ width: '100%', height: 520, backgroundColor: colors.ink700 }} />
        )}

        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: spacing['2xl'],
            paddingBottom: spacing['3xl'],
            paddingTop: spacing['4xl'],
            backgroundColor: 'rgba(15,13,10,0.62)',
          }}
        >
          <Text
            variant="caption"
            style={{
              color: colors.coral300 ?? colors.accent,
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: spacing.sm,
              fontWeight: '700',
            }}
          >
            {editorial.hero.brand}
          </Text>
          <Text
            variant="displayLg"
            style={{ color: colors.white, marginBottom: spacing.md, lineHeight: 46 }}
          >
            {editorial.hero.headline}
          </Text>
          <Text
            variant="bodyLg"
            style={{ color: 'rgba(255,255,255,0.82)', marginBottom: spacing.xl }}
          >
            {editorial.hero.subhead}
          </Text>
          <Button
            size="lg"
            onPress={() => router.push(editorial.hero.ctaRoute as '/quiz')}
            style={{ alignSelf: 'flex-start' }}
          >
            {editorial.hero.ctaLabel}
          </Button>
        </View>

        <View
          style={{
            position: 'absolute',
            top: insets.top + spacing.sm,
            left: spacing.base,
            right: spacing.base,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text
            variant="h3"
            style={{ color: colors.white, letterSpacing: 1, fontWeight: '800' }}
          >
            GAY-I
          </Text>
          <Pressable
            onPress={() => router.push('/settings')}
            style={{ padding: spacing.sm }}
          >
            <Text style={{ color: colors.white, fontSize: 18 }}>⊙</Text>
          </Pressable>
        </View>
      </View>

      {/* Featured destinations */}
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing['2xl'], gap: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text variant="h2">Featured destinations</Text>
          <Pressable onPress={() => router.push('/discover')}>
            <Text variant="labelMd" style={{ color: colors.accent }}>See all →</Text>
          </Pressable>
        </View>

        {featured.map((dest) => (
          <DestinationCard key={dest!.slug} destination={dest!} />
        ))}
      </View>

      {/* Places to visit */}
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing['2xl'], gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="h2">Places to visit</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            Editorial spotlights from our curated queer travel map.
          </Text>
        </View>

        {places.map((spot) => {
          const dest = getBySlug(spot.destinationSlug);
          return (
            <Pressable
              key={`${spot.destinationSlug}-${spot.placeName}`}
              onPress={() => router.push(`/destinations/${spot.destinationSlug}`)}
              style={{
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.backgroundSecondary,
                padding: spacing.base,
                gap: spacing.xs,
              }}
            >
              <Text variant="h3">{spot.placeName}</Text>
              <Text variant="caption" style={{ color: colors.accent }}>
                {dest?.name ?? spot.destinationSlug}
              </Text>
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                {spot.blurb}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Divider CTA */}
      <View
        style={{
          marginHorizontal: spacing.base,
          marginTop: spacing['2xl'],
          borderRadius: 16,
          backgroundColor: colors.backgroundSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.xl,
          gap: spacing.md,
          alignItems: 'center',
        }}
      >
        <Text variant="h3" style={{ textAlign: 'center' }}>
          Ready to plan your next gaycation?
        </Text>
        <Text
          variant="bodyMd"
          style={{ color: colors.textSecondary, textAlign: 'center' }}
        >
          Answer a few questions and we'll rank the best destinations for your trip.
        </Text>
        <Button fullWidth onPress={() => router.push('/quiz')}>
          Start the quiz
        </Button>
      </View>
    </ScrollView>
  );
}
