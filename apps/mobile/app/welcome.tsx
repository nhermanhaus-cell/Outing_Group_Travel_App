import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '../components/ui/Text';
import { Button } from '../components/ui/Button';
import { OutingIcon, type OutingIconName } from '../components/ui/OutingIcon';
import { RouteLine } from '../components/ui/RouteLine';
import { useTheme } from '../src/theme/ThemeProvider';
import { markOnboardingComplete } from '../src/lib/onboardingState';

const pages: Array<{
  eyebrow: string;
  title: string;
  body: string;
  icon: OutingIconName;
  accent: 'coral' | 'pool' | 'plum';
}> = [
  {
    eyebrow: 'Made for your kind of out',
    title: 'Find the place that fits.',
    body: 'Tell Outing what lights you up. We match the mood, season, budget, and experiences—not just a trending list.',
    icon: 'spark',
    accent: 'coral',
  },
  {
    eyebrow: 'Plans everyone can see themselves in',
    title: 'Get the group into the plan.',
    body: 'Blend preferences, vote on anchor activities, and leave free windows for the side quests people actually want.',
    icon: 'vote',
    accent: 'pool',
  },
  {
    eyebrow: 'From maybe to mapped',
    title: 'Turn ideas into an Outing.',
    body: 'Compare dates, events, routes, places, and bookable experiences—then ask Outing to make the plan feel more like you.',
    icon: 'route',
    accent: 'plum',
  },
];

export default function WelcomeScreen() {
  const [index, setIndex] = useState(0);
  const router = useRouter();
  const params = useLocalSearchParams<{ replay?: string }>();
  const insets = useSafeAreaInsets();
  const { colors, palette, spacing, radius } = useTheme();
  const page = pages[index];
  const accent =
    page.accent === 'pool' ? colors.pool : page.accent === 'plum' ? colors.plum : colors.accent;
  const tint =
    page.accent === 'pool' ? colors.poolLight : page.accent === 'plum' ? colors.plumLight : colors.accentLight;

  const finish = async (route: '/quiz' | '/discover') => {
    await markOnboardingComplete();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(route);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3" style={{ letterSpacing: 1.4 }}>OUTING</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          onPress={() => finish('/discover')}
          hitSlop={12}
        >
          <Text variant="labelMd" style={{ color: colors.textSecondary }}>
            {params.replay ? 'Close' : 'Skip'}
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl }}>
        <Animated.View
          key={index}
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(140)}
          style={{ gap: spacing.xl }}
        >
          <View style={{ height: 250, borderRadius: radius['2xl'], backgroundColor: tint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', top: 28, right: -20, transform: [{ rotate: '-12deg' }] }}>
              <RouteLine color={accent} width={240} />
            </View>
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: index === 1 ? '5deg' : '-4deg' }] }}>
              <OutingIcon name={page.icon} size={55} color={accent} />
            </View>
            <View style={{ position: 'absolute', left: 20, bottom: 18, backgroundColor: accent, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
              <Text variant="labelSm" style={{ color: palette.white }}>{index + 1} / {pages.length}</Text>
            </View>
          </View>

          <View style={{ gap: spacing.md }}>
            <Text variant="labelSm" style={{ color: accent, letterSpacing: 1.6, textTransform: 'uppercase' }}>{page.eyebrow}</Text>
            <Text variant="displayMd">{page.title}</Text>
            <Text variant="bodyLg" style={{ color: colors.textSecondary }}>{page.body}</Text>
          </View>
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          {pages.map((_, dot) => (
            <View key={dot} style={{ width: dot === index ? 28 : 8, height: 8, borderRadius: 4, backgroundColor: dot === index ? accent : colors.border }} />
          ))}
        </View>
        {index < pages.length - 1 ? (
          <Button
            size="lg"
            fullWidth
            onPress={() => {
              void Haptics.selectionAsync();
              setIndex((value) => value + 1);
            }}
          >
            Keep going
          </Button>
        ) : (
          <>
            <Button size="lg" fullWidth onPress={() => finish('/quiz')}>Find my trip</Button>
            <Button variant="ghost" fullWidth onPress={() => finish('/discover')}>Explore first</Button>
          </>
        )}
      </View>
    </View>
  );
}
