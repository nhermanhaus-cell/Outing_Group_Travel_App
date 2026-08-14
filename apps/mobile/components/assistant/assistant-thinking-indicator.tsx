import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { OutingIcon } from '../ui/OutingIcon';

function ThinkingDot({ color, delay }: { color: string; delay: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 360 }),
        withTiming(0, { duration: 360 }),
      ),
      -1,
      false,
    ));
    return () => cancelAnimation(pulse);
  }, [delay, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.42 + pulse.value * 0.58,
    transform: [{ translateY: -3 * pulse.value }],
  }));

  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, animatedStyle]} />;
}

export function AssistantThinkingIndicator({ status }: { status?: string }) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(130)}
      accessibilityRole="progressbar"
      accessibilityLabel={status ?? 'Outing is finding the strongest options'}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.full,
        backgroundColor: colors.plumLight,
        borderCurve: 'continuous',
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <OutingIcon name="spark" size={13} color={colors.plum} />
      </View>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {status ?? 'Finding the strongest options'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 }}>
        {[0, 1, 2].map((index) => <ThinkingDot key={index} color={colors.plum} delay={index * 130} />)}
      </View>
    </Animated.View>
  );
}
