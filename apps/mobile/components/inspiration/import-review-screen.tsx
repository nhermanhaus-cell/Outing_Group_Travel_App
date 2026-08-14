import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { InspirationImport, InspirationItem } from '@gayi/shared';
import { useTrips } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';
import {
  deleteInspirationImport,
  loadInspirationImport,
  reviewInspirationItem,
} from '../../src/lib/inspiration-imports';
import { posthog } from '../../src/config/posthog';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { OutingIcon } from '../ui/OutingIcon';
import { claimUnknownDestination, lookupUnknownDestinations } from '../../src/lib/destination-discovery-api';

export function ImportReviewScreen({ importId }: { importId: string }) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { trips } = useTrips();
  const [value, setValue] = useState<InspirationImport>();
  const [error, setError] = useState<string>();
  const [busyItem, setBusyItem] = useState<string>();
  const [tripId, setTripId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void loadInspirationImport(importId, controller.signal).then(setValue).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Could not load this import.');
    });
    return () => controller.abort();
  }, [importId]);

  const review = useCallback(async (item: InspirationItem, action: 'confirm' | 'dismiss') => {
    const perform = async () => {
      setBusyItem(item.id);
      try {
        const next = await reviewInspirationItem(importId, item.id, action, action === 'confirm' ? tripId : undefined);
        setValue(next);
        posthog.capture('inspiration_item_reviewed', { action, source_kind: item.inputKind, attached_to_trip: Boolean(tripId) });
        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
      } catch (caught) {
        Alert.alert('Couldn’t save that choice', caught instanceof Error ? caught.message : 'Please try again.');
      } finally { setBusyItem(undefined); }
    };
    if (action === 'confirm') {
      Alert.alert(
        tripId ? 'Add this place to the trip?' : 'Save this place?',
        tripId ? `${item.title} will be added to the selected trip.` : `${item.title} will be kept in your private inspiration history.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: tripId ? 'Add to trip' : 'Save', onPress: () => void perform() }],
      );
    } else void perform();
  }, [importId, tripId]);

  const requestDestination = useCallback((item: InspirationItem) => {
    const query = item.destinationName ?? item.title;
    Alert.alert(
      `Build an Outing page for ${query}?`,
      'Outing will validate the destination, research trusted sources, and create a provisional page for your review. Unverified sections will be labeled.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Build page', onPress: () => void lookupUnknownDestinations(query).then(async (matches) => {
          if (!matches[0]) throw new Error('Outing could not validate that destination.');
          const candidate = await claimUnknownDestination(matches[0].canonicalPlaceId, query);
          router.push(`/destinations/provisional/${candidate.id}`);
        }).catch((caught) => Alert.alert('Couldn’t start the destination', caught instanceof Error ? caught.message : 'Try again shortly.')) },
      ],
    );
  }, [router]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
        <Text variant="h1">This import isn’t available</Text>
        <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{error}</Text>
        <Button onPress={() => router.replace('/inspiration/new' as Href)}>Start another import</Button>
      </View>
    );
  }
  if (!value) {
    return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}><Text variant="bodyMd">Loading your places…</Text></View>;
  }
  const pending = value.items.filter((item) => item.status === 'candidate');
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'], gap: spacing.xl }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><OutingIcon name="arrow" size={22} color={colors.textPrimary} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1.2 }}>IMPORT REVIEW</Text>
          <Text variant="h2">{pending.length ? `${pending.length} place${pending.length === 1 ? '' : 's'} to decide` : 'Review complete'}</Text>
        </View>
      </View>

      <View style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.poolLight, gap: spacing.sm }}>
        <Text variant="h3">Outing verified the identities</Text>
        <Text variant="bodySm" style={{ color: colors.textSecondary }}>
          Confirm only what you recognize. Only confirmed places can shape future Ask Outing recommendations, and nothing joins a trip until you approve it.
        </Text>
      </View>

      {trips.length ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="labelMd">Save confirmed places to</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Pressable onPress={() => setTripId(undefined)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: !tripId ? colors.plum : colors.surface, borderWidth: 1, borderColor: !tripId ? colors.plum : colors.border }}>
              <Text variant="labelSm" style={{ color: !tripId ? colors.white : colors.textPrimary }}>Saved inspiration</Text>
            </Pressable>
            {trips.map((trip) => (
              <Pressable key={trip.tripId} onPress={() => setTripId(trip.tripId)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: tripId === trip.tripId ? colors.plum : colors.surface, borderWidth: 1, borderColor: tripId === trip.tripId ? colors.plum : colors.border }}>
                <Text variant="labelSm" style={{ color: tripId === trip.tripId ? colors.white : colors.textPrimary }}>{trip.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ gap: spacing.md }}>
        {value.items.map((item) => (
          <Animated.View key={item.id} layout={LinearTransition} entering={FadeIn.duration(180)} style={{ padding: spacing.lg, borderRadius: radius['2xl'], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' }}><OutingIcon name="pin" color={colors.accent} /></View>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text variant="h2">{item.title}</Text>
                {item.destinationName ? <Text variant="bodySm" style={{ color: colors.textSecondary }}>{item.destinationName}</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {item.category ? <Badge label={item.category.replaceAll('_', ' ')} variant="default" /> : null}
                  <Badge label={`${Math.round(item.confidence * 100)}% identity match`} variant="success" />
                  {item.status !== 'candidate' ? <Badge label={item.status} variant={item.status === 'confirmed' ? 'success' : 'default'} /> : null}
                </View>
              </View>
            </View>
            {item.summary ? <Text variant="bodySm" style={{ color: colors.textSecondary }}>{item.summary}</Text> : null}
            {item.status === 'candidate' ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button variant="secondary" style={{ flex: 1 }} disabled={Boolean(busyItem)} onPress={() => void review(item, 'dismiss')}>Not this one</Button>
                <Button style={{ flex: 1 }} loading={busyItem === item.id} disabled={Boolean(busyItem && busyItem !== item.id)} onPress={() => void review(item, 'confirm')}>{tripId ? 'Add to trip' : 'Save place'}</Button>
              </View>
            ) : null}
            {item.destinationName && !item.destinationSlug ? (
              <Button variant="ghost" size="sm" onPress={() => requestDestination(item)}>Build a destination page for {item.destinationName}</Button>
            ) : null}
          </Animated.View>
        ))}
      </View>

      {!pending.length ? (
        <View style={{ gap: spacing.md }}>
          <Button size="lg" onPress={() => router.replace('/discover')}>Explore with these ideas</Button>
          <Button variant="secondary" onPress={() => router.push({ pathname: '/ask', params: { importId, prompt: 'Use the places I confirmed here to suggest destinations, activities, or a trip direction that fits the patterns.' } })}>Ask Outing about these ideas</Button>
          <Button variant="secondary" onPress={() => router.replace('/inspiration/new' as Href)}>Import something else</Button>
        </View>
      ) : null}
      <Button variant="ghost" onPress={() => Alert.alert('Delete this import?', 'Confirmed places already added to trips stay there.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteInspirationImport(importId).then(() => router.replace('/inspiration')) },
      ])}>Delete import record</Button>
    </ScrollView>
  );
}
