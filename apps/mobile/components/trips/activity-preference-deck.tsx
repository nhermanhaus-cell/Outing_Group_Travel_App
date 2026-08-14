import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import {
  ACTIVITY_SWIPE_GUIDE,
  activityChoiceForSwipe,
  type ActivitySwipeAction,
} from '../../src/lib/activitySwipe';
import { Text } from '../ui/Text';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { OutingIcon, type OutingIconName } from '../ui/OutingIcon';

type Props = {
  visible: boolean;
  destinationName: string;
  candidates: Place[];
  memberId: string;
  existingVotes: ActivityPreferenceVote[];
  groupVotes: ActivityPreferenceVote[];
  onSave: (votes: ActivityPreferenceVote[], completed: boolean) => Promise<void>;
};

type SwipeDirection = 'left' | 'right' | 'up';

function categoryLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function fallbackSummary(place: Place, destinationName: string): string {
  const address = place.address ? ` near ${place.address}` : ` in ${destinationName}`;
  return `${categoryLabel(place.category)}${address}. Outing will use your response to decide whether this belongs in the shared day-by-day plan.`;
}

function SwipeActionButton({
  accessibilityLabel,
  color,
  icon,
  label,
  onPress,
  size,
  disabled,
}: {
  accessibilityLabel: string;
  color: string;
  icon: OutingIconName;
  label: string;
  onPress: () => void;
  size: number;
  disabled?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Records your choice and moves to the next activity"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: colors.cardBackground,
          boxShadow: pressed ? '0 3px 8px rgba(28, 16, 32, 0.10)' : '0 8px 20px rgba(28, 16, 32, 0.14)',
          opacity: disabled ? 0.4 : pressed ? 0.72 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <OutingIcon name={icon} color={color} size={size >= 60 ? 27 : 21} />
      </Pressable>
      <Text variant="caption" style={{ color: colors.textSecondary, textAlign: 'center' }}>{label}</Text>
    </View>
  );
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const existingForMember = useMemo(
    () => new Map(existingVotes.filter((vote) => vote.memberId === memberId).map((vote) => [vote.placeId, vote])),
    [existingVotes, memberId],
  );
  const [reviewAll, setReviewAll] = useState(false);
  const [index, setIndex] = useState(0);
  const [sessionVotes, setSessionVotes] = useState<ActivityPreferenceVote[]>([]);
  const [saving, setSaving] = useState(false);
  const animatingRef = useRef(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const queue = useMemo(
    () => reviewAll ? candidates : candidates.filter((place) => !existingForMember.has(place.placeId)),
    [candidates, existingForMember, reviewAll],
  );
  const memberVotes = useMemo(() => [
    ...existingVotes.filter((vote) => vote.memberId === memberId),
    ...sessionVotes,
  ], [existingVotes, memberId, sessionVotes]);
  const complete = !reviewAll && isActivityPreferenceSessionComplete(memberVotes, candidates.length);
  const current = complete ? undefined : queue[index];
  const next = complete ? undefined : queue[index + 1];
  const cardWidth = Math.min(width - spacing.lg * 2, 520);
  const cardHeight = Math.min(640, Math.max(360, height - 330));
  const imageHeight = Math.min(230, Math.max(150, cardHeight * 0.42));
  const canGoBack = index > 0;
  const swipeThreshold = Math.min(130, Math.max(82, width * 0.24));

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    animatingRef.current = false;
  }, [current?.placeId, translateX, translateY]);

  const vote = useCallback((choice: ActivityPreferenceChoice) => {
    if (!current) return;
    if (process.env.EXPO_OS === 'ios') {
      const normalized = normalizeActivityPreferenceChoice(choice);
      void Haptics.impactAsync(
        normalized === 'very_interested'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : Haptics.ImpactFeedbackStyle.Medium,
      );
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
    setIndex((value) => value + 1);
  }, [current, memberId]);

  const finishAnimatedVote = useCallback((choice: ActivityPreferenceChoice) => {
    animatingRef.current = false;
    vote(choice);
  }, [vote]);

  const animateChoice = useCallback((action: ActivitySwipeAction, direction: SwipeDirection) => {
    if (!current || saving || animatingRef.current) return;
    animatingRef.current = true;
    const choice = activityChoiceForSwipe(action);
    const targetX = direction === 'left' ? -width * 1.3 : direction === 'right' ? width * 1.3 : 0;
    const targetY = direction === 'up' ? -height * 0.8 : translateY.value;
    translateX.value = withTiming(targetX, { duration: 190 });
    translateY.value = withTiming(targetY, { duration: 190 }, (finished) => {
      if (finished) runOnJS(finishAnimatedVote)(choice);
    });
  }, [current, finishAnimatedVote, height, saving, translateX, translateY, width]);

  const panGesture = Gesture.Pan()
    .enabled(Boolean(current) && !saving)
    .activeOffsetX([-16, 16])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY * 0.08;
    })
    .onEnd((event) => {
      const shouldSwipe = Math.abs(event.translationX) >= swipeThreshold || Math.abs(event.velocityX) > 900;
      if (shouldSwipe) {
        runOnJS(animateChoice)(event.translationX < 0 ? 'pass' : 'interested', event.translationX < 0 ? 'left' : 'right');
      } else {
        translateX.value = withSpring(0, { damping: 17, stiffness: 180 });
        translateY.value = withSpring(0, { damping: 17, stiffness: 180 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${interpolate(translateX.value, [-width, 0, width], [-11, 0, 11], 'clamp')}deg` },
    ],
  }));
  const passStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-swipeThreshold * 1.25, -swipeThreshold * 0.35], [1, 0], 'clamp'),
    transform: [{ rotateZ: '-8deg' }, { scale: interpolate(translateX.value, [-swipeThreshold, 0], [1, 0.86], 'clamp') }],
  }));
  const interestedStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [swipeThreshold * 0.35, swipeThreshold * 1.25], [0, 1], 'clamp'),
    transform: [{ rotateZ: '8deg' }, { scale: interpolate(translateX.value, [0, swipeThreshold], [0.86, 1], 'clamp') }],
  }));

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    const previous = queue[index - 1];
    if (previous) setSessionVotes((prior) => prior.filter((entry) => entry.placeId !== previous.placeId));
    setIndex((value) => Math.max(0, value - 1));
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
  }, [canGoBack, index, queue]);

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
        (value, entry) => {
          const choice = normalizeActivityPreferenceChoice(entry.choice);
          return {
            veryInterested: value.veryInterested + (choice === 'very_interested' ? 1 : 0),
            interested: value.interested + (choice === 'interested' ? 1 : 0),
            neutral: value.neutral + (choice === 'neutral' ? 1 : 0),
            uninterested: value.uninterested + (choice === 'uninterested' ? 1 : 0),
            veryUninterested: value.veryUninterested + (choice === 'very_uninterested' ? 1 : 0),
          };
        },
        { veryInterested: 0, interested: 0, neutral: 0, uninterested: 0, veryUninterested: 0 },
      )
    : { veryInterested: 0, interested: 0, neutral: 0, uninterested: 0, veryUninterested: 0 };
  const tallyCount = Object.values(tally).reduce((sum, value) => sum + value, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => void saveAndClose(false)}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: Math.max(spacing.lg, insets.top), paddingBottom: spacing.sm, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="h2">Shape your {destinationName} plan</Text>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                Swipe the card to decide. Scroll up and down inside it for details.
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Save and close activity picker" onPress={() => void saveAndClose(false)} hitSlop={10}>
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
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {ACTIVITY_SWIPE_GUIDE.map((guide) => {
                const guideColor = guide.action === 'pass' ? colors.plum : guide.action === 'must_see' ? colors.accent : colors.pool;
                return (
                  <View key={guide.action} style={{ flex: 1, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.backgroundSecondary, gap: 2 }}>
                    <Text variant="labelSm" style={{ color: guideColor, textAlign: 'center' }}>{guide.label}</Text>
                    <Text variant="caption" numberOfLines={1} style={{ color: colors.textTertiary, textAlign: 'center', fontSize: 10 }}>{guide.detail}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {current ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
            <View style={{ width: cardWidth, height: cardHeight }}>
              {next ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    transform: [{ translateY: 10 }, { scale: 0.965 }],
                    opacity: 0.46,
                    overflow: 'hidden',
                    borderRadius: radius.xl,
                    borderCurve: 'continuous',
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.cardBackground,
                  }}
                >
                  {next.photos?.[0]?.url ? <Image source={{ uri: next.photos[0].url }} style={{ width: '100%', height: imageHeight }} contentFit="cover" /> : null}
                </View>
              ) : null}

              <GestureDetector gesture={panGesture}>
                <Animated.View
                  key={current.placeId}
                  entering={FadeIn.duration(150)}
                  exiting={FadeOut.duration(90)}
                  style={[
                    {
                      position: 'absolute',
                      inset: 0,
                      overflow: 'hidden',
                      borderRadius: radius.xl,
                      borderCurve: 'continuous',
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.cardBackground,
                      boxShadow: '0 18px 40px rgba(28, 16, 32, 0.18)',
                    },
                    cardStyle,
                  ]}
                >
                  <Animated.View pointerEvents="none" style={[{ position: 'absolute', zIndex: 3, top: spacing.lg, left: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 3, borderColor: colors.plum, backgroundColor: 'rgba(255,255,255,0.92)' }, passStampStyle]}>
                    <Text variant="h3" style={{ color: colors.plum, letterSpacing: 1.5 }}>PASS</Text>
                  </Animated.View>
                  <Animated.View pointerEvents="none" style={[{ position: 'absolute', zIndex: 3, top: spacing.lg, right: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 3, borderColor: colors.pool, backgroundColor: 'rgba(255,255,255,0.92)' }, interestedStampStyle]}>
                    <Text variant="h3" style={{ color: colors.pool, letterSpacing: 1.2 }}>INTERESTED</Text>
                  </Animated.View>

                  {current.photos?.[0]?.url ? (
                    <Image source={{ uri: current.photos[0].url }} style={{ width: '100%', height: imageHeight }} contentFit="cover" transition={180} />
                  ) : (
                    <View style={{ height: imageHeight, backgroundColor: colors.plum, padding: spacing.xl, justifyContent: 'flex-end' }}>
                      <Text variant="h1" style={{ color: colors.white }}>{categoryLabel(current.category)}</Text>
                    </View>
                  )}
                  <ScrollView
                    style={{ flex: 1 }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      <Badge label={categoryLabel(current.category)} variant="accent" />
                      <Badge label={`${current.durationMinutes} min`} variant="default" />
                      {current.source === 'viator' ? <Badge label="Viator" variant="warning" /> : null}
                      {current.rating ? <Badge label={`${current.rating.toFixed(1)} ★`} variant="success" /> : null}
                      {current.bookingOffer?.price !== undefined ? <Badge label={`From ${current.bookingOffer.currency ?? ''} ${Math.round(current.bookingOffer.price)}`} variant="default" /> : null}
                      {current.bookingOffer?.cancellationSummary ? <Badge label="Free cancellation" variant="success" /> : null}
                      {current.bookingRequired ? <Badge label="May need booking" variant="warning" /> : null}
                      {current.neighborhood ? <Badge label={current.neighborhood} variant="default" /> : null}
                      {current.routeTimeMinutes !== undefined ? <Badge label={`${current.routeTimeMinutes} min away`} variant="info" /> : null}
                      {current.freshness ? <Badge label={`${current.freshness} details`} variant={current.freshness === 'stale' ? 'warning' : 'info'} /> : null}
                      {current.confidence !== undefined ? <Badge label={`${Math.round(current.confidence * 100)}% confidence`} variant="info" /> : null}
                    </View>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="h2">{current.name}</Text>
                      <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                        {current.summary ?? fallbackSummary(current, destinationName)}
                      </Text>
                    </View>
                    {current.lgbtqRelevance ? <Text variant="bodySm" style={{ color: colors.accent }}>✦ {current.lgbtqRelevance}</Text> : null}
                    {current.fitReasons?.length ? (
                      <View style={{ padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.accentLight, gap: spacing.xs }}>
                        <Text variant="labelSm" style={{ color: colors.accent }}>WHY THIS FITS</Text>
                        {current.fitReasons.slice(0, 2).map((reason) => <Text key={reason} variant="bodySm">{reason}</Text>)}
                      </View>
                    ) : null}
                    {current.providerDisclosure ? <Text variant="caption" style={{ color: colors.textTertiary }}>{current.providerDisclosure}</Text> : null}
                    {currentMemberHasResponded && tallyCount > 0 ? (
                      <Text variant="caption" style={{ color: colors.textTertiary }}>
                        Group so far: {tally.veryInterested} must-see · {tally.interested} interested · {tally.neutral} neutral · {tally.uninterested + tally.veryUninterested} passed
                      </Text>
                    ) : null}
                  </ScrollView>
                </Animated.View>
              </GestureDetector>
            </View>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl }}>
            <View style={{ gap: spacing.sm, alignItems: 'center' }}>
              <Text variant="h1">Your picks are in</Text>
              <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                Outing will balance the group’s interests, pace, travel time, meals, and open windows across every day.
              </Text>
            </View>
            <Button loading={saving} onPress={() => void saveAndClose(true)}>Build the day-by-day plan</Button>
            {canGoBack ? <Button variant="secondary" onPress={goBack}>Undo the last choice</Button> : null}
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

        {current ? (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: Math.max(spacing.md, insets.bottom),
              borderTopWidth: 1,
              borderTopColor: colors.cardBorder,
              backgroundColor: colors.background,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' }}>
              <SwipeActionButton accessibilityLabel="Undo the last activity choice" color={colors.textTertiary} icon="undo" label="Undo" size={46} disabled={!canGoBack || saving} onPress={goBack} />
              <SwipeActionButton accessibilityLabel="Pass on this activity" color={colors.plum} icon="close" label="Pass" size={60} disabled={saving} onPress={() => animateChoice('pass', 'left')} />
              <SwipeActionButton accessibilityLabel="Mark this activity as a must-see" color={colors.accent} icon="spark" label="Must see" size={64} disabled={saving} onPress={() => animateChoice('must_see', 'up')} />
              <SwipeActionButton accessibilityLabel="Mark this activity as interesting" color={colors.pool} icon="heart" label="Interested" size={60} disabled={saving} onPress={() => animateChoice('interested', 'right')} />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
