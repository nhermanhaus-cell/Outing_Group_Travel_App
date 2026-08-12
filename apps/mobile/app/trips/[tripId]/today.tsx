import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { TodayAlternative, TodaySituation, TodaySnapshot } from '@gayi/shared';
import { useAuth, useDestinations, useTrips } from '../../../src/providers/AppProviders';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { loadTodayAlternatives, loadTodaySnapshot } from '../../../src/lib/today';
import {
  deleteTripVisitHistory,
  disableTripAwareness,
  enableTripAwareness,
  getTripAwarenessSetting,
  recordManualVisit,
} from '../../../src/lib/trip-awareness';
import { featureFlags } from '../../../src/lib/featureFlags';
import { scheduleItineraryReminders } from '../../../src/lib/notifications';
import { posthog } from '../../../src/config/posthog';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { OutingIcon } from '../../../components/ui/OutingIcon';

const SITUATIONS: Array<{ value: TodaySituation; label: string }> = [
  { value: 'closed', label: 'It’s closed' },
  { value: 'tired', label: 'We’re tired' },
  { value: 'raining', label: 'It’s raining' },
  { value: 'hungry', label: 'We’re hungry' },
  { value: 'crowded', label: 'Too crowded' },
  { value: 'changed_mood', label: 'Different mood' },
];

function formatGeneratedAt(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function TodayScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { getTrip } = useTrips();
  const { getBySlug } = useDestinations();
  const { user } = useAuth();
  const router = useRouter();
  const { colors, spacing, radius, shadows } = useTheme();
  const trip = getTrip(tripId);
  const timezone = trip?.destinationSlug ? getBySlug(trip.destinationSlug)?.timezone ?? 'UTC' : 'UTC';
  const [snapshot, setSnapshot] = useState<TodaySnapshot>();
  const [alternatives, setAlternatives] = useState<TodayAlternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [awarenessEnabled, setAwarenessEnabled] = useState(false);

  useEffect(() => {
    if (!featureFlags.outingFullExperienceV1) router.replace(`/trips/${tripId}` as Href);
  }, [router, tripId]);

  const refresh = useCallback(async () => {
    if (!trip || loading) return;
    setLoading(true);
    const controller = new AbortController();
    try {
      const value = await loadTodaySnapshot(trip, timezone, controller.signal);
      setSnapshot(value.snapshot);
      setAlternatives(value.alternatives);
    } finally { setLoading(false); }
  }, [loading, timezone, trip]);

  useEffect(() => { void refresh(); }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void getTripAwarenessSetting(tripId).then((setting) => setAwarenessEnabled(setting?.enabled === true)); }, [tripId]);

  const currentItem = useMemo(() => trip?.tripPlan?.items.find((item) => item.itemId === (snapshot?.current?.itemId ?? snapshot?.next?.itemId)), [snapshot?.current?.itemId, snapshot?.next?.itemId, trip?.tripPlan?.items]);

  const handleSituation = useCallback(async (situation: TodaySituation) => {
    setLoading(true);
    try {
      const values = await loadTodayAlternatives(tripId, situation);
      setAlternatives(values);
      posthog.capture('today_situation_requested', { situation, alternative_count: values.length });
    } catch (error) {
      Alert.alert('Live alternatives are unavailable', error instanceof Error ? error.message : 'Try Ask Outing or refresh later.');
    } finally { setLoading(false); }
  }, [tripId]);

  const toggleAwareness = useCallback(() => {
    if (!trip || !user) {
      router.push({ pathname: '/auth/login', params: { returnTo: `/trips/${tripId}/today` } });
      return;
    }
    if (awarenessEnabled) {
      Alert.alert('Turn off trip awareness?', 'Outing will stop monitoring upcoming stops. Your itinerary and Today still work.', [
        { text: 'Keep on', style: 'cancel' },
        { text: 'Turn off', style: 'destructive', onPress: () => void disableTripAwareness(tripId, user.id).then(() => setAwarenessEnabled(false)) },
      ]);
      return;
    }
    Alert.alert(
      'Let Today notice your next stops?',
      'For this active trip only, Outing can privately match your device to the next three itinerary stops. Raw location trails are never uploaded or stored. You can use Today without this.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Continue', onPress: () => void enableTripAwareness(trip, user.id).then((result) => {
          setAwarenessEnabled(true);
          void scheduleItineraryReminders(trip);
          Alert.alert(result.backgroundEnabled ? 'Trip awareness is on' : 'Today is ready', result.reason ?? 'Monitoring stops automatically when the trip ends.');
        }) },
      ],
    );
  }, [awarenessEnabled, router, trip, tripId, user]);

  if (!featureFlags.outingFullExperienceV1) {
    return null;
  }
  if (!trip) return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl }}><Text variant="h1">Trip not found</Text></View>;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'], gap: spacing.xl }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to trip" onPress={() => router.back()}><Text variant="h1">‹</Text></Pressable>
        <View style={{ flex: 1 }}><Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1.2 }}>TODAY</Text><Text variant="displaySm">{trip.destinationName ?? trip.name}</Text></View>
        {snapshot ? <Badge label={snapshot.offline ? 'Offline plan' : snapshot.providerFreshness} variant={snapshot.offline ? 'warning' : 'success'} /> : null}
      </View>

      {snapshot ? (
        <>
          <View style={{ padding: spacing.xl, borderRadius: radius['2xl'], backgroundColor: colors.plum, gap: spacing.lg, ...shadows.md }}>
            <Text variant="labelSm" style={{ color: colors.coral300 }}>{snapshot.current ? 'HAPPENING NOW' : 'UP NEXT'}</Text>
            <Text variant="displayMd" style={{ color: colors.white }}>{snapshot.current?.title ?? snapshot.next?.title ?? 'A little room to wander'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {snapshot.current ? <Badge label={`${snapshot.current.startTime}–${snapshot.current.endTime ?? ''}`} variant="info" /> : null}
              {!snapshot.current && snapshot.next ? <Badge label={snapshot.next.startTime} variant="info" /> : null}
              {snapshot.leaveBy ? <Badge label={`Leave by ${snapshot.leaveBy}`} variant="warning" /> : null}
              {(snapshot.current ?? snapshot.next)?.routeMinutes !== undefined ? <Badge label={`${(snapshot.current ?? snapshot.next)!.routeMinutes} min route`} variant="default" /> : null}
            </View>
            {(snapshot.current ?? snapshot.next)?.reservationSummary ? <Text variant="bodySm" style={{ color: colors.white }}>{(snapshot.current ?? snapshot.next)?.reservationSummary}</Text> : null}
            {currentItem ? <Button size="sm" variant="secondary" onPress={() => void recordManualVisit(tripId, currentItem).then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))}>Mark visited</Button> : null}
          </View>

          {snapshot.weather ? (
            <View style={{ flexDirection: 'row', padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.poolLight, gap: spacing.md, alignItems: 'center' }}>
              <OutingIcon name="spark" color={colors.pool} size={28} />
              <View style={{ flex: 1 }}><Text variant="h3">{snapshot.weather.summary}</Text><Text variant="caption" style={{ color: colors.textSecondary }}>{snapshot.weather.temperatureC !== undefined ? `${Math.round(snapshot.weather.temperatureC)}°C · ` : ''}{snapshot.weather.source}</Text></View>
            </View>
          ) : null}

          {snapshot.next && snapshot.current ? <TodayStop title="Next" name={snapshot.next.title} time={snapshot.next.startTime} routeMinutes={snapshot.next.routeMinutes} /> : null}
          {snapshot.nearbySavedPlaces.length ? (
            <View style={{ gap: spacing.md }}>
              <Text variant="h2">Saved nearby</Text>
              {snapshot.nearbySavedPlaces.map((place) => (
                <View key={place.placeId} style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.xs }}>
                  <Text variant="h3">{place.title}</Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    {place.routeMinutes !== undefined ? `About ${place.routeMinutes} min away · ` : ''}{place.source === 'google_places' ? 'Google Places' : 'Saved in your Outing plan'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            <Text variant="h2">Plans changed?</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>Get reviewable alternatives. Nothing changes until you approve it.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {SITUATIONS.map((item) => <Pressable key={item.value} onPress={() => void handleSituation(item.value)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}><Text variant="labelSm">{item.label}</Text></Pressable>)}
            </View>
          </View>

          {alternatives.length ? <View style={{ gap: spacing.md }}><Text variant="h2">Alternatives to review</Text>{alternatives.map((item) => (
            <View key={item.id} style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}><Text variant="h3" style={{ flex: 1 }}>{item.title}</Text><Badge label={`${Math.round(item.confidence * 100)}% confidence`} variant="info" /></View>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>{item.summary}</Text>
              <Button size="sm" onPress={() => router.push({ pathname: '/trips/[tripId]/ask', params: { tripId, focusKind: 'today', situation: item.situation, prompt: `Review this alternative: ${item.title}` } })}>Review with Ask Outing</Button>
            </View>
          ))}</View> : null}

          <View style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><OutingIcon name="pin" color={colors.accent} /><View style={{ flex: 1 }}><Text variant="h3">Private trip awareness</Text><Text variant="caption" style={{ color: colors.textSecondary }}>{awarenessEnabled ? 'On for this trip' : 'Optional · next three stops only'}</Text></View></View>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>Arrival and departure matches are private to you. Trip organizers and members cannot see them.</Text>
            <Button variant="secondary" onPress={toggleAwareness}>{awarenessEnabled ? 'Turn awareness off' : 'Set up awareness'}</Button>
            {user ? <Button variant="ghost" onPress={() => Alert.alert('Delete this trip’s private visit history?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteTripVisitHistory(tripId) }])}>Delete visit history</Button> : null}
          </View>

          <Button variant="secondary" onPress={() => router.push({ pathname: '/trips/[tripId]/ask', params: { tripId, focusKind: 'today', prompt: 'Help me with today’s plan' } })}>Ask Outing about today</Button>
          <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>Updated {formatGeneratedAt(snapshot.generatedAt)} · {snapshot.timezone} · {snapshot.freeWindowItemIds.length} free window{snapshot.freeWindowItemIds.length === 1 ? '' : 's'} · {snapshot.nearbySavedPlaces.length} nearby saved</Text>
        </>
      ) : <View style={{ minHeight: 420, justifyContent: 'center', alignItems: 'center', gap: spacing.md }}><Text variant="h2">Preparing today’s plan…</Text><Text variant="bodyMd" style={{ color: colors.textSecondary }}>Checking the itinerary, weather, routes, and saved places.</Text></View>}
    </ScrollView>
  );
}

function TodayStop({ title, name, time, routeMinutes }: { title: string; name: string; time: string; routeMinutes?: number }) {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.xs }}><Text variant="labelSm" style={{ color: colors.pool }}>{title.toUpperCase()}</Text><Text variant="h2">{name}</Text><Text variant="bodySm" style={{ color: colors.textSecondary }}>{time}{routeMinutes !== undefined ? ` · ${routeMinutes} min route` : ''}</Text></View>;
}
