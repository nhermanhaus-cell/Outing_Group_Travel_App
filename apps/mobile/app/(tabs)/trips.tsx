import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
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
  const orderedTrips = useMemo(() => [...trips].sort((left, right) => {
    const today = new Date().toISOString().slice(0, 10);
    const leftPast = Boolean(left.endDate && left.endDate < today);
    const rightPast = Boolean(right.endDate && right.endDate < today);
    if (leftPast !== rightPast) return leftPast ? 1 : -1;
    return (left.startDate ?? '9999-12-31').localeCompare(right.startDate ?? '9999-12-31');
  }), [trips]);

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
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="displaySm">Trips</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>Plans, people, and everything you’ve saved</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Plan a new trip"
          onPress={handleNewTrip}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="h2" style={{ color: colors.white }}>+</Text>
        </Pressable>
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
        data={orderedTrips}
        keyExtractor={(t) => t.tripId}
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.md,
          paddingBottom: insets.bottom + spacing['4xl'],
        }}
        ListHeaderComponent={trips.length > 0 ? (
          <View style={{ paddingBottom: spacing.sm, gap: spacing.xs }}>
            <Text variant="h2">Your plans</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>{trips.length} trip{trips.length === 1 ? '' : 's'} ready whenever you are</Text>
          </View>
        ) : null}
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
        ListFooterComponent={<InspirationFeature />}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            deleting={deletingTripId === item.tripId}
            onManage={() => {
              const allowDelete = canDeleteTrip(item, user?.id);
              Alert.alert(item.name, 'Manage this trip', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Rename', onPress: () => setRenamingTrip(item) },
                ...(allowDelete ? [{ text: 'Delete trip', style: 'destructive' as const, onPress: () => confirmDelete(item) }] : []),
              ]);
            }}
          />
        )}
      />

      <RenameTripSheet visible={Boolean(renamingTrip)} currentName={renamingTrip?.name ?? ''} onDismiss={() => setRenamingTrip(null)} onSave={(name) => updateTrip(renamingTrip!.tripId, { name })} />

    </View>
  );
}

function TripCard({ trip, deleting, onManage }: {
  trip: LocalTrip;
  deleting: boolean;
  onManage: () => void;
}) {
  const { colors, spacing, radius, shadows } = useTheme();
  const router = useRouter();
  const { getBySlug } = useDestinations();
  const destination = trip.destinationSlug ? getBySlug(trip.destinationSlug) : undefined;

  const dateRange = trip.startDate && trip.endDate
    ? formatTripDateRange(trip.startDate, trip.endDate)
    : trip.startDate
    ? `From ${formatDate(trip.startDate, true)}`
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
        minHeight: 142,
        flexDirection: 'row',
        opacity: pressed ? 0.85 : 1,
        ...shadows.sm,
      })}
    >
      {destination ? (
        <DestinationHeroImage destination={destination} style={{ width: 126, alignSelf: 'stretch' }} />
      ) : (
        <View style={{ width: 100, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <RouteLine color={colors.plum} width={150} />
        </View>
      )}
      <View style={{ flex: 1, padding: spacing.md, gap: spacing.sm, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="h2" numberOfLines={2} style={{ flex: 1 }}>{trip.name}</Text>
        {deleting ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        {!deleting ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Manage ${trip.name}`}
            hitSlop={10}
            onPress={(event) => { event.stopPropagation(); onManage(); }}
            style={{ paddingLeft: spacing.sm, paddingBottom: spacing.sm }}
          >
            <Text variant="h3" style={{ color: colors.textTertiary }}>•••</Text>
          </Pressable>
        ) : null}
      </View>
      {trip.destinationName ? (
        <Text variant="bodySm" numberOfLines={1} style={{ color: colors.textSecondary }}>
          {trip.destinationName}
        </Text>
      ) : null}
      <Text variant="caption" style={{ color: colors.textTertiary }}>{dateRange}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.xs }}>
        <TripPeople trip={trip} />
        <OutingIcon name="arrow" size={17} color={colors.accent} />
      </View>
      </View>
    </Pressable>
  );
}

function TripPeople({ trip }: { trip: LocalTrip }) {
  const { colors } = useTheme();
  const members = trip.members?.slice(0, 3) ?? [];
  if (!members.length) return <Text variant="caption" style={{ color: colors.textTertiary }}>{trip.travelers > 1 ? `${trip.travelers} travelers` : 'Your trip'}</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {members.map((member, index) => member.avatarUrl ? (
        <Image key={member.id} source={{ uri: member.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.cardBackground, marginLeft: index ? -7 : 0 }} />
      ) : (
        <View key={member.id} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.cardBackground, backgroundColor: colors.plumLight, marginLeft: index ? -7 : 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="labelSm" style={{ color: colors.plum }}>{member.displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
      {trip.travelers > members.length ? <Text variant="caption" style={{ color: colors.textTertiary, paddingLeft: 6 }}>+{trip.travelers - members.length}</Text> : null}
    </View>
  );
}

function InspirationFeature() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  return (
    <View style={{ marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}><Text variant="h2">Inspiration</Text><Text variant="bodySm" style={{ color: colors.textSecondary }}>A private folder for everything that might belong on a future trip.</Text></View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open your inspiration folder"
        onPress={() => router.push('/inspiration' as Href)}
        style={({ pressed }) => ({ padding: spacing.lg, minHeight: 174, borderRadius: radius['2xl'], borderCurve: 'continuous', backgroundColor: colors.plumLight, overflow: 'hidden', gap: spacing.md, opacity: pressed ? 0.82 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><OutingIcon name="image" size={24} color={colors.plum} /></View>
          <OutingIcon name="arrow" size={18} color={colors.plum} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text variant="h2">Share it with Outing.</Text>
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>Screenshots, articles, Maps links, and public social-video links become organized places. After you confirm them, Mistral can find patterns and suggest trips that fit what caught your eye.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {['Screenshots', 'Links', 'Video links'].map((label) => <View key={label} style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.surface }}><Text variant="labelSm" style={{ color: colors.plum }}>{label}</Text></View>)}
        </View>
      </Pressable>
    </View>
  );
}

function formatDate(iso: string, includeYear = false): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}),
    });
  } catch {
    return iso;
  }
}

function formatTripDateRange(start: string, end: string): string {
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  return startYear === endYear
    ? `${formatDate(start)} – ${formatDate(end)}, ${endYear}`
    : `${formatDate(start, true)} – ${formatDate(end, true)}`;
}
