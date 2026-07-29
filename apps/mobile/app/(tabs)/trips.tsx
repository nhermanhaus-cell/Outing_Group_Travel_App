import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth, useTrips } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import type { LocalTrip } from '../../src/providers/AppProviders';
import { RenameTripSheet } from '../../components/trips/RenameTripSheet';

export default function TripsScreen() {
  const { colors, spacing, radius, shadows } = useTheme();
  const { user } = useAuth();
  const { trips, updateTrip } = useTrips();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [renamingTrip, setRenamingTrip] = useState<LocalTrip | null>(null);

  const handleNewTrip = () => {
    router.push('/trips/new');
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
        <Text variant="h1">My Trips</Text>
        <Button size="sm" onPress={handleNewTrip}>+ New trip</Button>
      </View>

      {!user ? (
        <View
          style={{
            margin: spacing.base,
            padding: spacing.lg,
            backgroundColor: colors.backgroundSecondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            gap: spacing.md,
          }}
        >
          <Text variant="h3">Trips save on this phone</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            You can plan without an account. Sign in whenever you want to sync across devices or invite collaborators.
          </Text>
          <Button onPress={() => router.push('/auth/login')}>Sign in</Button>
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
          <EmptyState
            icon="✈"
            title="No trips yet"
            description="Start planning your next LGBTQ+ adventure."
            action={<Button onPress={handleNewTrip}>Plan a trip</Button>}
          />
        }
        renderItem={({ item }) => <TripCard trip={item} onRename={() => setRenamingTrip(item)} />}
      />

      <RenameTripSheet visible={Boolean(renamingTrip)} currentName={renamingTrip?.name ?? ''} onDismiss={() => setRenamingTrip(null)} onSave={(name) => updateTrip(renamingTrip!.tripId, { name })} />

    </View>
  );
}

function TripCard({ trip, onRename }: { trip: LocalTrip; onRename: () => void }) {
  const { colors, spacing, radius, shadows } = useTheme();
  const router = useRouter();

  const dateRange = trip.startDate && trip.endDate
    ? `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
    : trip.startDate
    ? `From ${formatDate(trip.startDate)}`
    : 'Dates TBD';

  return (
    <Pressable
      onPress={() => router.push(`/trips/${trip.tripId}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.cardBackground,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        padding: spacing.base,
        gap: spacing.sm,
        opacity: pressed ? 0.85 : 1,
        ...shadows.sm,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="h3" style={{ flex: 1 }}>{trip.name}</Text>
        <Pressable hitSlop={12} onPress={(event) => { event.stopPropagation(); onRename(); }} accessibilityLabel="Rename trip"><Text style={{ fontSize: 20, color: colors.accent }}>✎</Text></Pressable>
      </View>
      {trip.destinationName ? (
        <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
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
    </Pressable>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
