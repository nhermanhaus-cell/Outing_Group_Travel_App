import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { OutingIcon } from '../ui/OutingIcon';

const BUILD_STAGES = [
  'Reading the preferences everyone shared',
  'Finding the strongest activity matches',
  'Balancing routes, meals, and downtime',
  'Spreading the best ideas across each day',
  'Adding a little room to wander',
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);

  return reduced;
}

export function ItineraryBuildingScreen({ destinationName }: { destinationName?: string }) {
  const { colors, palette, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    rotation.value = withRepeat(
      withTiming(1, { duration: 4_800, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(pulse);
    };
  }, [pulse, reducedMotion, rotation]);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(
      () => setStageIndex((current) => Math.min(BUILD_STAGES.length - 1, current + 1)),
      1_400,
    );
    return () => clearInterval(interval);
  }, [reducedMotion]);

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(280)}
      exiting={reducedMotion ? undefined : FadeOut.duration(260)}
      accessibilityRole="progressbar"
      accessibilityLabel={`Building itinerary${destinationName ? ` for ${destinationName}` : ''}`}
      accessibilityValue={{ text: BUILD_STAGES[stageIndex] }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', width: 310, height: 310, borderRadius: 155, backgroundColor: colors.plumLight, top: -100, right: -105 }} />
      <View style={{ position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: colors.poolLight, bottom: -95, left: -85 }} />

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing['2xl'] }}>
        <View style={{ height: 224, alignItems: 'center', justifyContent: 'center' }} accessible={false} importantForAccessibility="no-hide-descendants">
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 196,
                height: 196,
                borderRadius: 98,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.accentMuted,
              },
              orbitStyle,
            ]}
          >
            <View style={{ position: 'absolute', top: -13, left: 83 }}><OutingIcon name="spark" size={27} color={colors.accent} /></View>
            <View style={{ position: 'absolute', right: -8, top: 70 }}><OutingIcon name="spark" size={18} color={colors.pool} /></View>
            <View style={{ position: 'absolute', bottom: -8, left: 42 }}><OutingIcon name="spark" size={21} color={colors.plum} /></View>
            <View style={{ position: 'absolute', left: -7, top: 55 }}><OutingIcon name="spark" size={15} color={colors.accent} /></View>
          </Animated.View>

          <Animated.View
            style={[
              {
                width: 118,
                height: 118,
                borderRadius: 59,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.plum,
                borderWidth: 8,
                borderColor: colors.plumLight,
              },
              pulseStyle,
            ]}
          >
            <OutingIcon name="route" size={48} color={palette.white} />
          </Animated.View>
        </View>

        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(120).duration(360)}>
            <Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1.5, textAlign: 'center' }}>
              OUTING IS PLOTTING
            </Text>
          </Animated.View>
          <Text variant="displayMd" style={{ textAlign: 'center' }}>Building your itinerary</Text>
          <Text variant="bodyLg" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {destinationName
              ? `Shaping each day in ${destinationName} around your trip.`
              : 'Shaping each day around the trip you described.'}
          </Text>
        </View>

        <View accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
            {BUILD_STAGES.map((stage, index) => (
              <View
                key={stage}
                style={{
                  width: index === stageIndex ? 28 : 8,
                  height: 8,
                  borderRadius: radius.full,
                  backgroundColor: index <= stageIndex ? colors.accent : colors.border,
                }}
              />
            ))}
          </View>
          <Text variant="bodySm" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {BUILD_STAGES[stageIndex]}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
