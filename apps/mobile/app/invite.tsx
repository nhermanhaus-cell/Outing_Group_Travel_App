import React from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AppProviders';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../components/ui/Text';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { useAnalytics } from '../src/analytics/analytics-provider';

async function inviteOperation<T>(operation: string, token: string): Promise<T> {
  if (!supabase) throw new Error('Trip invitations are not configured');
  const { data, error } = await supabase.functions.invoke('trip-invites', { body: { operation, token } });
  if (error) throw error;
  return data as T;
}

export default function PublicInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { track } = useAnalytics();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const preview = useQuery({ queryKey: ['invite-preview', token], queryFn: () => inviteOperation<{ trip: { tripId: string; name: string; destinationName?: string; startDate?: string; endDate?: string } }>('preview', token!), enabled: Boolean(token), retry: 1 });
  const redeem = async () => {
    if (!user) { router.push({ pathname: '/auth/login', params: { returnTo: `/invite?token=${token}` } }); return; }
    const result = await inviteOperation<{ tripId: string }>('redeem', token!);
    track(ANALYTICS_EVENTS.INVITE_ACCEPTED, { source: 'public_invite_link' });
    router.replace(`/trips/${result.tripId}`);
  };
  const trip = preview.data?.trip;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', paddingTop: insets.top, padding: spacing['2xl'] }}>
      <View style={{ gap: spacing.xl, alignItems: 'center' }}>
        <Text style={{ fontSize: 50 }}>✈</Text><Text variant="displaySm" style={{ textAlign: 'center' }}>You’re invited</Text>
        {trip ? <Card style={{ width: '100%', gap: spacing.sm }}><Text variant="h2" style={{ textAlign: 'center' }}>{trip.name}</Text>{trip.destinationName ? <Text variant="bodyLg" style={{ color: colors.textSecondary, textAlign: 'center' }}>{trip.destinationName}</Text> : null}{trip.startDate ? <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>{trip.startDate}{trip.endDate ? ` – ${trip.endDate}` : ''}</Text> : null}</Card> : null}
        {preview.isLoading ? <Text variant="bodyMd">Checking invite…</Text> : null}
        {preview.isError ? <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>This invite is invalid, expired, or already used.</Text> : null}
        {trip ? <Button size="lg" fullWidth onPress={redeem}>{user ? 'Join trip' : 'Sign in to join'}</Button> : null}
        <Pressable onPress={() => router.push('/')}><Text variant="labelMd" style={{ color: colors.accent }}>Explore Outing</Text></Pressable>
      </View>
    </View>
  );
}
