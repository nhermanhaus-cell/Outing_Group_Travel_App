import React from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth, useTrips } from '../../../src/providers/AppProviders';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

export default function TripInviteScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { getTrip, updateTrip } = useTrips();
  const { user } = useAuth();

  const trip = getTrip(tripId ?? '');

  const handleJoin = async () => {
    if (!user || !trip) return;
    const alreadyMember = (trip.members ?? []).some((m) => m.id === user.id);
    if (!alreadyMember) {
      await updateTrip(trip.tripId, {
        members: [
          ...(trip.members ?? []),
          { id: user.id, displayName: user.displayName ?? user.email, role: 'member' },
        ],
      });
    }
    router.replace(`/trips/${trip.tripId}`);
  };

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="h3" style={{ color: colors.textTertiary }}>Invite link expired or invalid</Text>
        <Button variant="ghost" onPress={() => router.push('/')}>Go home</Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing['2xl'] }}>
      <View style={{ alignItems: 'center', gap: spacing.xl }}>
        <Text style={{ fontSize: 48 }}>✈</Text>
        <Text variant="displaySm" style={{ textAlign: 'center' }}>You're invited!</Text>
        <Card style={{ width: '100%', gap: spacing.sm }}>
          <Text variant="h3" style={{ textAlign: 'center' }}>{trip.name}</Text>
          {trip.destinationName ? (
            <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>{trip.destinationName}</Text>
          ) : null}
          {trip.startDate ? (
            <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>
              {trip.startDate}{trip.endDate ? ` – ${trip.endDate}` : ''}
            </Text>
          ) : null}
          <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>
            {(trip.members ?? []).length} member{(trip.members ?? []).length !== 1 ? 's' : ''}
          </Text>
        </Card>

        {user ? (
          <Button fullWidth size="lg" onPress={handleJoin}>
            Join trip
          </Button>
        ) : (
          <>
            <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
              Sign in to join this trip and collaborate.
            </Text>
            <Button fullWidth size="lg" onPress={() => router.push('/auth/login')}>
              Sign in to join
            </Button>
          </>
        )}

        <Button variant="ghost" onPress={() => router.push('/')}>
          Browse without joining
        </Button>
      </View>
    </View>
  );
}
