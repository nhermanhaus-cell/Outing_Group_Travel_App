import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { ActivityPreferenceChoice, ActivityPreferenceVote, Place } from '@gayi/shared';
import { isActivityPreferenceSessionComplete, normalizeActivityPreferenceChoice } from '@gayi/domain';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

type Props = {
  visible: boolean;
  destinationName: string;
  candidates: Place[];
  memberId: string;
  existingVotes: ActivityPreferenceVote[];
  groupVotes: ActivityPreferenceVote[];
  onSave: (votes: ActivityPreferenceVote[], completed: boolean) => Promise<void>;
};

const REACTIONS: Array<{
  choice: ActivityPreferenceChoice;
  label: string;
  marker: string;
}> = [
  { choice: 'very_uninterested', label: 'Very uninterested', marker: '−−' },
  { choice: 'uninterested', label: 'Uninterested', marker: '−' },
  { choice: 'neutral', label: 'Neutral', marker: '•' },
  { choice: 'interested', label: 'Interested', marker: '+' },
  { choice: 'very_interested', label: 'Very interested', marker: '++' },
];

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
  const complete = !reviewAll && isActivityPreferenceSessionComplete(memberVotes, candidates.length);
  const current = complete ? undefined : queue[index];
  const cardWidth = Math.min(width - spacing.xl * 2, 520);
  const canGoBack = index > 0;

  const vote = useCallback((choice: ActivityPreferenceChoice) => {
    if (!current) return;
    if (process.env.EXPO_OS === 'ios') {
      const normalized = normalizeActivityPreferenceChoice(choice);
      void Haptics.impactAsync(
        normalized === 'very_interested' || normalized === 'very_uninterested'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light,
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

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    const previous = queue[index - 1];
    if (previous) {
      setSessionVotes((prior) => prior.filter((entry) => entry.placeId !== previous.placeId));
    }
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
  const reactionColors = [colors.plum, colors.coral300, colors.textTertiary, colors.pool, colors.accent];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => void saveAndClose(false)}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="h2">Shape your {destinationName} plan</Text>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                Read the details, then choose one clear response. Outing moves to the next activity automatically.
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Save and close activity picker" onPress={() => void saveAndClose(false)}>
              <Text variant="labelMd" style={{ color: colors.accent }}>Save</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back to the previous activity"
              disabled={!canGoBack}
              onPress={goBack}
              style={({ pressed }) => ({ opacity: !canGoBack ? 0.3 : pressed ? 0.55 : 1, paddingVertical: spacing.xs })}
            >
              <Text variant="labelSm" style={{ color: colors.accent }}>‹ Back</Text>
            </Pressable>
            <View style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.backgroundTertiary }}>
              <View style={{ width: `${queue.length ? Math.min(100, (index / queue.length) * 100) : 100}%`, height: '100%', backgroundColor: colors.accent }} />
            </View>
            <Text variant="caption" style={{ color: colors.textTertiary, fontVariant: ['tabular-nums'] }}>
              {Math.min(index + 1, queue.length || 1)} / {queue.length || 1}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        >
          {current ? (
            <Animated.View key={current.placeId} entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)} style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: cardWidth,
                  overflow: 'hidden',
                  borderRadius: radius.xl,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.cardBackground,
                  boxShadow: '0 18px 40px rgba(28, 16, 32, 0.16)',
                }}
              >
                {current.photos?.[0]?.url ? (
                  <Image source={{ uri: current.photos[0].url }} style={{ width: '100%', height: 230 }} contentFit="cover" transition={180} />
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
                  {currentMemberHasResponded && tallyCount > 0 ? (
                    <Text variant="caption" style={{ color: colors.textTertiary }}>
                      Group so far: {tally.veryInterested} very interested · {tally.interested} interested · {tally.neutral} neutral · {tally.uninterested} uninterested · {tally.veryUninterested} very uninterested
                    </Text>
                  ) : null}
                </View>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xl }}>
              <View style={{ gap: spacing.sm, alignItems: 'center' }}>
                <Text variant="h1">Your picks are in</Text>
                <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                  Outing will balance the group’s interests, pace, travel time, meals, and open windows across every day.
                </Text>
              </View>
              <Button loading={saving} onPress={() => void saveAndClose(true)}>Build the day-by-day plan</Button>
              {canGoBack ? <Button variant="secondary" onPress={goBack}>Back to the last activity</Button> : null}
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
        </ScrollView>

        {current ? (
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingTop: spacing.sm,
              paddingBottom: spacing.lg,
              gap: spacing.sm,
              borderTopWidth: 1,
              borderTopColor: colors.cardBorder,
              backgroundColor: colors.background,
            }}
          >
            <Text variant="labelSm" style={{ color: colors.textSecondary, textAlign: 'center' }}>How interested are you?</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {REACTIONS.map((reaction, reactionIndex) => (
                <Pressable
                  key={reaction.choice}
                  accessibilityRole="button"
                  accessibilityLabel={reaction.label}
                  accessibilityHint="Records your response and moves to the next activity"
                  disabled={saving}
                  onPress={() => vote(reaction.choice)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 76,
                    paddingHorizontal: spacing.xxs,
                    paddingVertical: spacing.xs,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xxs,
                    borderRadius: radius.md,
                    borderCurve: 'continuous',
                    borderWidth: 1,
                    borderColor: pressed ? reactionColors[reactionIndex] : colors.cardBorder,
                    backgroundColor: pressed ? colors.backgroundTertiary : colors.cardBackground,
                    opacity: saving ? 0.45 : 1,
                  })}
                >
                  <Text variant="h4" style={{ color: reactionColors[reactionIndex] }}>{reaction.marker}</Text>
                  <Text variant="caption" numberOfLines={3} style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 13 }}>
                    {reaction.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
