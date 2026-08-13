import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth, useTrips } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import type { LocalTrip } from '../../src/providers/AppProviders';
import { RenameTripSheet } from '../../components/trips/RenameTripSheet';
import { OutingIcon } from '../../components/ui/OutingIcon';
import { RouteLine } from '../../components/ui/RouteLine';
import { DestinationHeroImage } from '../../components/ui/DestinationHeroImage';
import { useDestinations } from '../../src/providers/AppProviders';
import { canDeleteTrip } from '../../src/lib/tripPermissions';

export default function TripsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { trips, updateTrip, deleteTrip } = useTrips();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [renamingTrip, setRenamingTrip] = useState<LocalTrip | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);

  const handleNewTrip = () => {
    router.push('/trips/new');
  };

  const confirmDelete = (trip: LocalTrip) => {
    Alert.alert(
      `Delete “${trip.name}”?`,
      user
        ? 'This removes the trip for everyone in the group. This cannot be undone.'
        : 'This removes the trip from this phone. This cannot be undone.',
      [
        { text: 'Keep trip', style: 'cancel' },
        {
          text: 'Delete trip',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingTripId(trip.tripId);
              try {
                await deleteTrip(trip.tripId);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (caught) {
                Alert.alert(
                  'Trip wasn’t deleted',
                  caught instanceof Error ? caught.message : 'Please check your connection and try again.',
                );
              } finally {
                setDeletingTripId(null);
              }
            })();
          },
        },
      ],
    );
  };

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
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="displaySm">Trips</Text>
        <Button size="sm" onPress={handleNewTrip}>+ New trip</Button>
      </View>

      {!user ? (
        <View
          style={{
            margin: spacing.base,
            padding: spacing.base,
            backgroundColor: colors.backgroundSecondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            gap: spacing.sm,
          }}
        >
          <Text variant="h3">Trips save on this phone</Text>
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>
            You can plan without an account. Sign in whenever you want to sync across devices or invite collaborators.
          </Text>
          <Button size="sm" onPress={() => router.push('/auth/login')}>Sign in</Button>
        </View>
      ) : null}

      <FlatList
        data={trips}
        keyExtractor={(t) => t.tripId}
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.md,
          paddingBottom: insets.bottom + spacing['4xl'],
        }}
        ListEmptyComponent={
          <View style={{ paddingTop: spacing['2xl'], alignItems: 'center', gap: spacing.lg }}>
            <View style={{ width: 220, height: 150, borderRadius: radius['2xl'], backgroundColor: colors.poolLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <View style={{ position: 'absolute', top: 14, left: 20 }}><RouteLine color={colors.pool} width={180} /></View>
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <OutingIcon name="trips" color={colors.pool} size={30} />
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: spacing.sm, maxWidth: 300 }}>
              <Text variant="h2">Your next Outing starts here.</Text>
              <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                Pick a destination or let your preferences lead the way. You can invite people after the first draft.
              </Text>
            </View>
            <Button size="lg" onPress={handleNewTrip}>Plan a trip</Button>
            <Button variant="ghost" onPress={() => router.push('/quiz')}>Help me choose where</Button>
          </View>
        }
        ListFooterComponent={trips.length > 0 ? <NextTripIdeas /> : null}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            deleting={deletingTripId === item.tripId}
            onRename={() => setRenamingTrip(item)}
            onDelete={canDeleteTrip(item, user?.id) ? () => confirmDelete(item) : undefined}
          />
        )}
      />

      <RenameTripSheet visible={Boolean(renamingTrip)} currentName={renamingTrip?.name ?? ''} onDismiss={() => setRenamingTrip(null)} onSave={(name) => updateTrip(renamingTrip!.tripId, { name })} />

    </View>
  );
}

function TripCard({ trip, deleting, onRename, onDelete }: {
  trip: LocalTrip;
  deleting: boolean;
  onRename: () => void;
  onDelete?: () => void;
}) {
  const { colors, spacing, radius, shadows } = useTheme();
  const router = useRouter();
  const { getBySlug } = useDestinations();
  const destination = trip.destinationSlug ? getBySlug(trip.destinationSlug) : undefined;

  const dateRange = trip.startDate && trip.endDate
    ? `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
    : trip.startDate
    ? `From ${formatDate(trip.startDate)}`
    : 'Dates TBD';

  return (
    <Pressable
      disabled={deleting}
      onPress={() => router.push(`/trips/${trip.tripId}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.cardBackground,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        overflow: 'hidden',
        minHeight: 124,
        flexDirection: 'row',
        opacity: pressed ? 0.85 : 1,
        ...shadows.sm,
      })}
    >
      {destination ? (
        <DestinationHeroImage destination={destination} style={{ width: 118, alignSelf: 'stretch' }} />
      ) : (
        <View style={{ width: 100, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <RouteLine color={colors.plum} width={150} />
        </View>
      )}
      <View style={{ flex: 1, padding: spacing.md, gap: spacing.xs, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="h3" numberOfLines={1} style={{ flex: 1 }}>{trip.name}</Text>
        {deleting ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>
      {trip.destinationName ? (
        <Text variant="bodySm" numberOfLines={1} style={{ color: colors.textSecondary }}>
          {trip.destinationName}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Text variant="caption" style={{ color: colors.textTertiary }}>{dateRange}</Text>
        {trip.travelers > 1 ? (
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            {trip.travelers} travelers
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Rename ${trip.name}`}
          hitSlop={8}
          onPress={(event) => { event.stopPropagation(); onRename(); }}
          style={{ paddingVertical: spacing.xs, paddingRight: spacing.sm }}
        >
          <Text variant="captionBold" style={{ color: colors.textSecondary }}>Rename</Text>
        </Pressable>
        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${trip.name}`}
            disabled={deleting}
            hitSlop={8}
            onPress={(event) => { event.stopPropagation(); onDelete(); }}
            style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}
          >
            <Text variant="captionBold" style={{ color: colors.error }}>{deleting ? 'Deleting…' : 'Delete'}</Text>
          </Pressable>
        ) : (
          <Text variant="caption" style={{ color: colors.textTertiary }}>Only an organizer can delete this group trip</Text>
        )}
        <OutingIcon name="arrow" size={16} color={colors.accent} />
      </View>
      </View>
    </Pressable>
  );
}

function NextTripIdeas() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const ideas = [
    {
      key: 'match',
      eyebrow: 'PERSONALIZED MATCH',
      title: 'Find somewhere that fits you',
      summary: 'Turn your pace, interests, budget, and travel mood into destination matches.',
      icon: 'spark' as const,
      onPress: () => router.push('/quiz'),
    },
    {
      key: 'ask',
      eyebrow: 'ASK OUTING',
      title: 'Start with a feeling or a season',
      summary: 'Try “a warm long weekend in March” or “food, nightlife, and easy transit.”',
      icon: 'ask' as const,
      onPress: () => router.push({ pathname: '/ask', params: { prompt: 'Help me ideate on my next trip using my preferences, the time of year, and a few different budget levels.' } }),
    },
    {
      key: 'browse',
      eyebrow: 'EXPLORE',
      title: 'Browse places worth saving',
      summary: 'Collect a few possibilities, then compare their timing, cost, and tradeoffs.',
      icon: 'discover' as const,
      onPress: () => router.push('/discover'),
    },
  ];

  return (
    <View style={{ marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="h2">Where to next?</Text>
        <Text variant="bodySm" style={{ color: colors.textSecondary }}>
          You don’t need a destination yet. Start with what you want the trip to feel like.
        </Text>
      </View>
      {ideas.map((idea) => (
        <Pressable
          key={idea.key}
          accessibilityRole="button"
          onPress={idea.onPress}
          style={({ pressed }) => ({
            padding: spacing.md,
            borderRadius: radius.xl,
            backgroundColor: colors.backgroundSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            opacity: pressed ? 0.78 : 1,
          })}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <OutingIcon name={idea.icon} size={21} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="labelSm" style={{ color: colors.accent }}>{idea.eyebrow}</Text>
            <Text variant="h4">{idea.title}</Text>
            <Text variant="caption" numberOfLines={2} style={{ color: colors.textSecondary }}>{idea.summary}</Text>
          </View>
          <Text style={{ color: colors.accent, fontSize: 20 }}>→</Text>
        </Pressable>
      ))}
      <Button variant="secondary" onPress={() => router.push('/trips/new')}>Plan from scratch</Button>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
