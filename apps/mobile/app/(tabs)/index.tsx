import React from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDestinations } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { DestinationCard } from '../../components/ui/DestinationCard';

export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const { catalog } = useDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const featured = catalog.slice(0, 4);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['4xl'] }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={{ position: 'relative' }}>
        {featured[0]?.heroImageUrl ? (
          <Image
            source={{ uri: featured[0].heroImageUrl }}
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
            height: 340,
          }}
          pointerEvents="none"
        />
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
            Gay-i
          </Text>
          <Text
            variant="displayLg"
            style={{ color: colors.white, marginBottom: spacing.md, lineHeight: 46 }}
          >
            Travel made for us.
          </Text>
          <Text
            variant="bodyLg"
            style={{ color: 'rgba(255,255,255,0.82)', marginBottom: spacing.xl }}
          >
            Personalized LGBTQ+ travel — every destination scored for safety, community & vibe.
          </Text>
          <Button
            size="lg"
            onPress={() => router.push('/quiz')}
            style={{ alignSelf: 'flex-start' }}
          >
            Find my trip
          </Button>
        </View>

        {/* Top bar */}
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
          <Text variant="h2">Featured</Text>
          <Pressable onPress={() => router.push('/discover')}>
            <Text variant="labelMd" style={{ color: colors.accent }}>See all →</Text>
          </Pressable>
        </View>

        {featured.slice(1).map((dest) => (
          <DestinationCard key={dest.slug} destination={dest} />
        ))}
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
