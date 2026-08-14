import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  FadeInDown,
  FadeIn,
  cancelAnimation,
  createAnimatedComponent,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { DestinationCandidate } from '@gayi/shared';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useTheme } from '../../src/theme/ThemeProvider';

const AnimatedPath = createAnimatedComponent(Path);

const STAGES: Array<{
  key: DestinationCandidate['generationStage'];
  title: string;
  detail: string;
}> = [
  { key: 'identity', title: 'Confirming the destination', detail: 'Matching the city and country' },
  { key: 'places', title: 'Finding neighborhoods and landmarks', detail: 'Checking current places and local highlights' },
  { key: 'experiences', title: 'Exploring things to do', detail: 'Gathering activities, events, and bookable experiences' },
  { key: 'timing', title: 'Comparing when to go', detail: 'Looking at timing and seasonal context' },
  { key: 'context', title: 'Building the city overview', detail: 'Turning verified results into a useful first look' },
  { key: 'finalizing', title: 'Finishing your Outing guide', detail: 'Checking sources and polishing the page' },
];

const STAGE_ORDER = new Map(STAGES.map((stage, index) => [stage.key, index]));
const STAGE_MESSAGES: Partial<Record<DestinationCandidate['generationStage'], string[]>> = {
  identity: ['Matching the city and country', 'Checking the canonical place record'],
  places: ['Checking current landmarks', 'Looking for places travelers consistently value', 'Separating exact matches from similarly named places'],
  experiences: ['Gathering activities and excursions', 'Looking for current events', 'Checking bookable experiences'],
  timing: ['Reviewing seasonal context', 'Checking timing signals and current events'],
  context: ['Turning provider results into a useful first look', 'Organizing neighborhoods and practical details', 'Keeping unverified claims clearly labeled'],
  finalizing: ['Checking source quality', 'Polishing the destination page', 'Saving the guide for future travelers'],
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

export function DestinationGenerationJourney({
  candidate,
  onRetry,
  onKeepBrowsing,
  retrying,
  online,
}: {
  candidate: DestinationCandidate;
  onRetry: () => void;
  onKeepBrowsing: () => void;
  retrying: boolean;
  online: boolean;
}) {
  const { colors, spacing, radius, palette } = useTheme();
  const reducedMotion = useReducedMotion();
  const routeProgress = useSharedValue(reducedMotion ? 1 : 0);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [messageIndex, setMessageIndex] = useState(0);
  const activeIndex = candidate.generationStage === 'complete'
    ? STAGES.length
    : STAGE_ORDER.get(candidate.generationStage) ?? 0;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(routeProgress);
    if (reducedMotion) {
      routeProgress.value = 1;
    } else if (active) {
      routeProgress.value = 0;
      routeProgress.value = withRepeat(withTiming(1, { duration: 2_200, easing: Easing.inOut(Easing.cubic) }), -1, false);
    }
    return () => cancelAnimation(routeProgress);
  }, [active, reducedMotion, routeProgress]);

  useEffect(() => {
    setMessageIndex(0);
    if (!active || reducedMotion || candidate.generationStatus === 'failed') return;
    const timer = setInterval(() => setMessageIndex((value) => value + 1), 1_900);
    return () => clearInterval(timer);
  }, [active, candidate.generationStage, candidate.generationStatus, reducedMotion]);

  const routeProps = useAnimatedProps(() => ({ strokeDashoffset: 340 * (1 - routeProgress.value) }));
  const completedCount = Math.max(1, Math.min(STAGES.length, activeIndex));
  const progressLabel = candidate.generationStatus === 'failed'
    ? 'Generation paused'
    : `${completedCount} of ${STAGES.length} steps underway`;
  const currentMessage = useMemo(() => {
    if (!online) return 'Reconnect to continue building this guide. Completed research is saved.';
    if (candidate.generationStatus === 'failed') return 'The completed research is safe. Retry to finish the remaining sections.';
    const messages = STAGE_MESSAGES[candidate.generationStage];
    return messages?.[messageIndex % messages.length]
      ?? STAGES[Math.min(activeIndex, STAGES.length - 1)]?.detail
      ?? 'Putting the finishing touches on your guide.';
  }, [activeIndex, candidate.generationStage, candidate.generationStatus, messageIndex, online]);

  return (
    <View style={{ flex: 1, padding: spacing.base, paddingBottom: spacing['4xl'], gap: spacing.xl }}>
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(350)} style={{ padding: spacing.xl, borderRadius: radius['2xl'], backgroundColor: colors.plumLight, overflow: 'hidden', gap: spacing.sm }}>
        <Text variant="labelSm" style={{ color: colors.plum, textTransform: 'uppercase', letterSpacing: 1.2 }}>
          Outing is making something new
        </Text>
        <Text variant="displayMd">{candidate.name}</Text>
        <Text variant="h3" style={{ color: colors.textSecondary }}>{candidate.country}</Text>
        <View style={{ height: 126, marginTop: spacing.sm }} accessible={false} importantForAccessibility="no-hide-descendants">
          <Svg width="100%" height="126" viewBox="0 0 340 126">
            <Path d="M14 100 C68 14 122 116 177 59 C221 14 266 21 326 40" fill="none" stroke={colors.border} strokeWidth={3} strokeDasharray="7 10" />
            <AnimatedPath animatedProps={routeProps} d="M14 100 C68 14 122 116 177 59 C221 14 266 21 326 40" fill="none" stroke={colors.accent} strokeWidth={4} strokeLinecap="round" strokeDasharray="340 340" />
            <Circle cx="14" cy="100" r="7" fill={palette.pool500} />
            <Circle cx="326" cy="40" r="11" fill={palette.coral500} />
            <Circle cx="326" cy="40" r="4" fill={palette.white} />
          </Svg>
        </View>
        <View accessibilityLiveRegion="polite" accessibilityRole="text" style={{ gap: spacing.xxs }}>
          <Text variant="labelMd" style={{ color: colors.accent }}>{progressLabel}</Text>
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>{currentMessage}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {STAGES.map((stage, index) => (
            <View key={stage.key} style={{ flex: 1, height: 5, borderRadius: radius.full, backgroundColor: index <= activeIndex ? colors.accent : colors.border }} />
          ))}
        </View>
      </Animated.View>

      <View style={{ gap: spacing.sm }}>
        {STAGES.map((stage, index) => {
          const complete = index < activeIndex || candidate.generationStage === 'complete';
          const current = index === activeIndex && candidate.generationStatus !== 'failed';
          return (
            <Animated.View
              key={stage.key}
              entering={reducedMotion ? undefined : FadeInDown.delay(index * 45).duration(280)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: current ? colors.accentLight : colors.cardBackground, borderWidth: 1, borderColor: current ? colors.accent : colors.border }}
            >
              <View style={{ width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? colors.pool : current ? colors.accent : colors.backgroundTertiary }}>
                <Text variant="labelMd" style={{ color: complete || current ? colors.white : colors.textTertiary }}>{complete ? '✓' : index + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="labelLg">{stage.title}</Text>
                {current ? <Text variant="caption" style={{ color: colors.textSecondary }}>{stage.detail}</Text> : null}
              </View>
              {current ? <Text variant="labelSm" style={{ color: colors.accent }}>IN PROGRESS</Text> : null}
            </Animated.View>
          );
        })}
      </View>

      {candidate.generationStatus === 'failed' ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>Some travel providers did not respond. You can safely retry without losing completed research.</Text>
          <Button loading={retrying} disabled={!online} onPress={onRetry}>Retry generation</Button>
        </View>
      ) : null}
      <Button variant="ghost" onPress={onKeepBrowsing}>Keep browsing</Button>
    </View>
  );
}
