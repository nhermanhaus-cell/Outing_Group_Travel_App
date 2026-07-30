import React from 'react';
import { View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';

export function ConnectionBanner() {
  const network = useNetInfo();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  if (!offline) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutUp.duration(160)}
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: insets.top + spacing.xs,
        left: spacing.base,
        right: spacing.base,
        borderRadius: radius.full,
        backgroundColor: colors.plum,
        paddingHorizontal: spacing.base,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral300 }} />
        <Text variant="labelSm" style={{ color: colors.white }}>
          Offline · saved trips and guides are still available
        </Text>
      </View>
    </Animated.View>
  );
}
