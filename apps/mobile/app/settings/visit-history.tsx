import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TripVisitEvent } from '@gayi/shared';
import { useTrips } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';
import { deleteAllVisitHistory, deleteVisitEvent, loadVisitHistory } from '../../src/lib/trip-awareness';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

const LABELS: Record<TripVisitEvent['event'], string> = {
  arrived: 'Arrived',
  departed: 'Departed',
  skipped: 'Skipped',
  manually_visited: 'Marked visited',
};

export default function VisitHistoryScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { trips } = useTrips();
  const [events, setEvents] = useState<TripVisitEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setEvents(await loadVisitHistory()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const removeOne = (event: TripVisitEvent) => Alert.alert(
    'Delete this private visit event?',
    'This removes it from your history and preference learning. Other trip members have never had access to it.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteVisitEvent(event.id).then(refresh) },
    ],
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'], gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to settings" onPress={() => router.back()}><Text variant="h1">‹</Text></Pressable>
        <View style={{ flex: 1 }}><Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1.2 }}>PRIVATE DATA</Text><Text variant="h1">Visit history</Text></View>
      </View>
      <View style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.poolLight, gap: spacing.sm }}>
        <Text variant="h3">Only you can see this</Text>
        <Text variant="bodySm" style={{ color: colors.textSecondary }}>Outing stores derived arrival, departure, skipped, or manually visited events—not coordinate trails. Organizers and trip members cannot access them.</Text>
      </View>
      {loading ? <Text variant="bodyMd">Loading private history…</Text> : events.length ? events.map((event) => {
        const trip = trips.find((candidate) => candidate.tripId === event.tripId);
        return (
          <View key={event.id} style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}><View style={{ flex: 1 }}><Text variant="h3">{LABELS[event.event]}</Text><Text variant="bodySm" style={{ color: colors.textSecondary }}>{trip?.name ?? 'Trip'}{event.placeId ? ` · ${event.placeId}` : ''}</Text></View><Badge label={event.source === 'manual' ? 'Manual' : 'On device'} variant="info" /></View>
            <Text variant="caption" style={{ color: colors.textTertiary }}>{new Date(event.occurredAt).toLocaleString()}</Text>
            <Button size="sm" variant="ghost" onPress={() => removeOne(event)}>Delete this event</Button>
          </View>
        );
      }) : <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}><Text variant="h2">No private visits saved</Text><Text variant="bodySm" style={{ color: colors.textSecondary, textAlign: 'center' }}>If you enable trip awareness or mark a stop visited, it will appear here.</Text></View>}
      {events.length ? <Button variant="danger" onPress={() => Alert.alert('Delete all private visit history?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete all', style: 'destructive', onPress: () => void deleteAllVisitHistory().then(refresh) }])}>Delete all visit history</Button> : null}
    </ScrollView>
  );
}
