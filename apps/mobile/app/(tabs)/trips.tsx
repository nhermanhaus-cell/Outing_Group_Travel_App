import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth, useTrips } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { AuthGate } from '../../components/ui/AuthGate';
import type { LocalTrip } from '../../src/providers/AppProviders';

export default function TripsScreen() {
  const { colors, spacing, radius, shadows } = useTheme();
  const { user } = useAuth();
  const { trips } = useTrips();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [gateVisible, setGateVisible] = useState(false);

  const handleNewTrip = () => {
    if (!user) {
      setGateVisible(true);
    } else {
      router.push('/trips/new');
    }
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
          <Text variant="h3">Sign in to save trips</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            Your trips will be saved and accessible across devices.
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
        renderItem={({ item }) => <TripCard trip={item} />}
      />

      <AuthGate
        visible={gateVisible}
        onDismiss={() => setGateVisible(false)}
        reason="Sign in to create and save trips."
      />
    </View>
  );
}

function TripCard({ trip }: { trip: LocalTrip }) {
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
        <Text style={{ fontSize: 20 }}>✈</Text>
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
