import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ActivityPreferenceChoice, ActivityPreferenceVote, Place } from '@gayi/shared';
import { isActivityPreferenceSessionComplete, normalizeActivityPreferenceChoice } from '@gayi/domain';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { featureFlags } from '../../src/lib/featureFlags';

type Props = {
  visible: boolean;
  destinationName: string;
  candidates: Place[];
  memberId: string;
  existingVotes: ActivityPreferenceVote[];
  groupVotes: ActivityPreferenceVote[];
  onSave: (votes: ActivityPreferenceVote[], completed: boolean) => Promise<void>;
};

function categoryLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function fallbackSummary(place: Place, destinationName: string): string {
  const address = place.address ? ` near ${place.address}` : ` in ${destinationName}`;
  return `${categoryLabel(place.category)}${address}. Outing will use your response to decide whether this belongs in the shared day-by-day plan.`;
}

export function ActivityPreferenceDeck({
  visible,
  destinationName,
  candidates,
  memberId,
  existingVotes,
  groupVotes,
  onSave,
}: Props) {
  const { colors, spacing, radius } = useTheme();
  const { width } = useWindowDimensions();
  const existingForMember = useMemo(
    () => new Map(existingVotes.filter((vote) => vote.memberId === memberId).map((vote) => [vote.placeId, vote])),
    [existingVotes, memberId],
  );
  const [reviewAll, setReviewAll] = useState(false);
  const [index, setIndex] = useState(0);
  const [sessionVotes, setSessionVotes] = useState<ActivityPreferenceVote[]>([]);
  const [saving, setSaving] = useState(false);
  const queue = useMemo(
    () => reviewAll ? candidates : candidates.filter((place) => !existingForMember.has(place.placeId)),
    [candidates, existingForMember, reviewAll],
  );
  const memberVotes = useMemo(() => [
    ...existingVotes.filter((vote) => vote.memberId === memberId),
    ...sessionVotes,
  ], [existingVotes, memberId, sessionVotes]);
  const complete = isActivityPreferenceSessionComplete(memberVotes, candidates.length);
  const current = complete ? undefined : queue[index];
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const cardWidth = Math.min(width - spacing.xl * 2, 520);
  const advance = useCallback(() => setIndex((value) => value + 1), []);

  const vote = useCallback((choice: ActivityPreferenceChoice) => {
    if (!current) return;
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(choice === 'interested'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light);
    }
    setSessionVotes((prior) => [
      ...prior.filter((entry) => entry.placeId !== current.placeId),
      {
        placeId: current.placeId,
        memberId,
        choice,
        category: current.category,
        createdAt: new Date().toISOString(),
      },
    ]);
    const direction = choice === 'must_do' || choice === 'interested' ? 1 : -1;
    translateX.value = withTiming(direction * Math.max(width, 420), { duration: 180 }, (finished) => {
      if (finished) {
        translateX.value = 0;
        rotate.value = 0;
        runOnJS(advance)();
      }
    });
  }, [advance, current, memberId, rotate, translateX, width]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      rotate.value = interpolate(event.translationX, [-cardWidth, cardWidth], [-8, 8]);
    })
    .onEnd((event) => {
      if (event.translationX > 90) runOnJS(vote)('interested');
      else if (event.translationX < -90) runOnJS(vote)('not_for_this_trip');
      else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        rotate.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const animatedCard = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { rotate: `${rotate.value}deg` }],
  }));

  const saveAndClose = useCallback(async (completed: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(sessionVotes, completed);
      setSessionVotes([]);
      setIndex(0);
      setReviewAll(false);
    } catch (error) {
      Alert.alert(
        'Your choices weren’t saved',
        error instanceof Error ? error.message : 'Please check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [onSave, saving, sessionVotes]);

  const currentMemberHasResponded = current
    ? memberVotes.some((entry) => entry.placeId === current.placeId)
    : false;
  const tally = current
    ? groupVotes.filter((entry) => entry.placeId === current.placeId).reduce(
        (value, entry) => ({
          mustDo: value.mustDo + (normalizeActivityPreferenceChoice(entry.choice) === 'must_do' ? 1 : 0),
          interested: value.interested + (normalizeActivityPreferenceChoice(entry.choice) === 'interested' ? 1 : 0),
          maybe: value.maybe + (normalizeActivityPreferenceChoice(entry.choice) === 'maybe' ? 1 : 0),
          notForTrip: value.notForTrip + (normalizeActivityPreferenceChoice(entry.choice) === 'not_for_this_trip' ? 1 : 0),
        }),
        { mustDo: 0, interested: 0, maybe: 0, notForTrip: 0 },
      )
    : { mustDo: 0, interested: 0, maybe: 0, notForTrip: 0 };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => void saveAndClose(false)}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.background }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text variant="h2">Shape your {destinationName} plan</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>
              {featureFlags.outingFullExperienceV1
                ? 'Swipe for a quick yes or no, or use all four reactions. Group results stay hidden until you answer.'
                : 'Swipe or tap. Your choices guide the itinerary; they never book anything.'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Save and close activity picker" onPress={() => void saveAndClose(false)}>
            <Text variant="labelMd" style={{ color: colors.accent }}>Save</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.backgroundTertiary }}>
            <View style={{ width: `${queue.length ? Math.min(100, (index / queue.length) * 100) : 100}%`, height: '100%', backgroundColor: colors.accent }} />
          </View>
          <Text variant="caption" style={{ color: colors.textTertiary, fontVariant: ['tabular-nums'] }}>
            {Math.min(index + 1, queue.length || 1)} / {queue.length || 1}
          </Text>
        </View>

        {current ? (
          <Animated.View key={current.placeId} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ alignItems: 'center' }}>
            <GestureDetector gesture={pan}>
              <Animated.View
                style={[
                  {
                    width: cardWidth,
                    overflow: 'hidden',
                    borderRadius: radius.xl,
                    borderCurve: 'continuous',
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.cardBackground,
                    boxShadow: '0 18px 40px rgba(28, 16, 32, 0.16)',
                  },
                  animatedCard,
                ]}
              >
                {current.photos?.[0]?.url ? (
                  <Image source={{ uri: current.photos[0].url }} style={{ width: '100%', height: 250 }} contentFit="cover" transition={180} />
                ) : (
                  <View style={{ height: 150, backgroundColor: colors.plum, padding: spacing.xl, justifyContent: 'flex-end' }}>
                    <Text variant="h1" style={{ color: colors.white }}>{categoryLabel(current.category)}</Text>
                  </View>
                )}
                <View style={{ padding: spacing.lg, gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    <Badge label={categoryLabel(current.category)} variant="accent" />
                    <Badge label={`${current.durationMinutes} min`} variant="default" />
                    {current.source === 'viator' ? <Badge label="Viator" variant="warning" /> : null}
                    {current.rating ? <Badge label={`${current.rating.toFixed(1)} ★`} variant="success" /> : null}
                    {current.bookingOffer?.price !== undefined ? (
                      <Badge label={`From ${current.bookingOffer.currency ?? ''} ${Math.round(current.bookingOffer.price)}`} variant="default" />
                    ) : null}
                    {current.bookingOffer?.cancellationSummary ? <Badge label="Free cancellation" variant="success" /> : null}
                    {current.bookingRequired ? <Badge label="May need booking" variant="warning" /> : null}
                    {current.neighborhood ? <Badge label={current.neighborhood} variant="default" /> : null}
                    {current.routeTimeMinutes !== undefined ? <Badge label={`${current.routeTimeMinutes} min from the prior stop`} variant="info" /> : null}
                    {current.freshness ? <Badge label={`${current.freshness} details`} variant={current.freshness === 'stale' ? 'warning' : 'info'} /> : null}
                    {current.confidence !== undefined ? <Badge label={`${Math.round(current.confidence * 100)}% confidence`} variant="info" /> : null}
                  </View>
                  <View style={{ gap: spacing.xs }}>
                    <Text variant="h2">{current.name}</Text>
                    <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                      {current.summary ?? fallbackSummary(current, destinationName)}
                    </Text>
                  </View>
                  {current.lgbtqRelevance ? (
                    <Text variant="bodySm" style={{ color: colors.accent }}>✦ {current.lgbtqRelevance}</Text>
                  ) : null}
                  {current.fitReasons?.length ? (
                    <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentLight, gap: spacing.xs }}>
                      <Text variant="labelSm" style={{ color: colors.accent }}>WHY THIS FITS</Text>
                      {current.fitReasons.slice(0, 2).map((reason) => <Text key={reason} variant="bodySm">{reason}</Text>)}
                    </View>
                  ) : null}
                  {current.providerDisclosure ? <Text variant="caption" style={{ color: colors.textTertiary }}>{current.providerDisclosure}</Text> : null}
                  {(!featureFlags.outingFullExperienceV1 || currentMemberHasResponded) && tally.mustDo + tally.interested + tally.maybe + tally.notForTrip > 0 ? (
                    <Text variant="caption" style={{ color: colors.textTertiary }}>
                      Group so far: {tally.mustDo} must-do · {tally.interested} interested · {tally.maybe} maybe · {tally.notForTrip} pass
                    </Text>
                  ) : null}
                </View>
              </Animated.View>
            </GestureDetector>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
            <View style={{ gap: spacing.sm, alignItems: 'center' }}>
              <Text variant="h1">Your picks are in</Text>
              <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                Outing will balance the group’s interests, pace, travel time, meals, and open windows across every day.
              </Text>
            </View>
            <Button loading={saving} onPress={() => void saveAndClose(true)}>Build the day-by-day plan</Button>
            <Button
              variant="secondary"
              onPress={() => {
                setReviewAll(true);
                setIndex(0);
                setSessionVotes([]);
              }}
            >
              Review all choices
            </Button>
          </Animated.View>
        )}

        {current && featureFlags.outingFullExperienceV1 ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button disabled={saving} variant="secondary" style={{ flex: 1 }} onPress={() => vote('not_for_this_trip')}>Not this trip</Button>
              <Button disabled={saving} variant="secondary" style={{ flex: 1 }} onPress={() => vote('maybe')}>Maybe</Button>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button disabled={saving} variant="secondary" style={{ flex: 1 }} onPress={() => vote('interested')}>Interested</Button>
              <Button disabled={saving} style={{ flex: 1 }} onPress={() => vote('must_do')}>Must do</Button>
            </View>
          </View>
        ) : current ? (
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button disabled={saving} variant="secondary" style={{ flex: 1 }} onPress={() => vote('not_for_this_trip')}>Not for me</Button>
            <Button disabled={saving} style={{ flex: 1 }} onPress={() => vote('interested')}>Interested</Button>
          </View>
        ) : null}
      </ScrollView>
    </Modal>
  );
}
