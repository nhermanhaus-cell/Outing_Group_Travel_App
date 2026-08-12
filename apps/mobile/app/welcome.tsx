import React, { useEffect, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text } from '../components/ui/Text';
import { Button } from '../components/ui/Button';
import { OutingIcon, type OutingIconName } from '../components/ui/OutingIcon';
import { RouteLine } from '../components/ui/RouteLine';
import { useAuth } from '../src/providers/AppProviders';
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
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [authMethod, setAuthMethod] = useState<'apple' | 'google'>();
  const [authError, setAuthError] = useState<string>();
  const scrollRef = useRef<ScrollView | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams<{ replay?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { user, loading: authLoading, signInWithApple, signInWithGoogle } = useAuth();
  const { colors, palette, spacing, radius, isDark } = useTheme();
  const replaying = Boolean(params.replay);
  const compact = height < 760;
  const currentPage = pages[index] ?? pages[0];
  const currentAccent = currentPage.accent === 'pool'
    ? colors.pool
    : currentPage.accent === 'plum'
      ? colors.plum
      : colors.accent;

  useEffect(() => {
    void AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const goToPage = (nextIndex: number) => {
    const safeIndex = Math.max(0, Math.min(pages.length - 1, nextIndex));
    setIndex(safeIndex);
    scrollRef.current?.scrollTo({ x: safeIndex * width, animated: true });
    void Haptics.selectionAsync();
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    setIndex(Math.max(0, Math.min(pages.length - 1, nextIndex)));
  };

  const finish = async (route: '/' | '/quiz' | '/discover') => {
    await markOnboardingComplete();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(route);
  };

  const authenticate = async (method: 'apple' | 'google') => {
    setAuthMethod(method);
    setAuthError(undefined);
    try {
      const result = method === 'apple'
        ? await signInWithApple()
        : await signInWithGoogle();
      if (result.cancelled) return;
      if (result.error) {
        setAuthError(result.error);
        return;
      }
      await finish('/');
    } finally {
      setAuthMethod(undefined);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3" style={{ letterSpacing: 1.4 }}>OUTING</Text>
        {replaying || index < pages.length - 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={replaying ? 'Close introduction' : 'Go to account choices'}
            onPress={() => replaying ? router.back() : goToPage(pages.length - 1)}
            hitSlop={12}
          >
            <Text variant="labelMd" style={{ color: colors.textSecondary }}>
              {replaying ? 'Close' : 'Sign in'}
            </Text>
          </Pressable>
        ) : <View style={{ width: 48 }} />}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={{ flex: 1 }}
        accessibilityLabel="Outing introduction"
      >
        {pages.map((page, pageIndex) => {
          const accent = page.accent === 'pool'
            ? colors.pool
            : page.accent === 'plum'
              ? colors.plum
              : colors.accent;
          const tint = page.accent === 'pool'
            ? colors.poolLight
            : page.accent === 'plum'
              ? colors.plumLight
              : colors.accentLight;
          return (
            <View
              key={page.title}
              style={{ width, justifyContent: 'center', paddingHorizontal: spacing.xl }}
            >
              <View style={{ gap: compact ? spacing.md : spacing.xl }}>
                <View style={{ height: compact ? 190 : 250, borderRadius: radius['2xl'], backgroundColor: tint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ position: 'absolute', top: 28, right: -20, transform: [{ rotate: '-12deg' }] }}>
                    <RouteLine color={accent} width={240} />
                  </View>
                  <View style={{ width: compact ? 92 : 112, height: compact ? 92 : 112, borderRadius: compact ? 46 : 56, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: pageIndex === 1 ? '5deg' : '-4deg' }] }}>
                    <OutingIcon name={page.icon} size={compact ? 46 : 55} color={accent} />
                  </View>
                  <View style={{ position: 'absolute', left: 20, bottom: 18, backgroundColor: accent, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                    <Text variant="labelSm" style={{ color: palette.white }}>{pageIndex + 1} / {pages.length}</Text>
                  </View>
                </View>

                <View style={{ gap: spacing.md }}>
                  <Text variant="labelSm" style={{ color: accent, letterSpacing: 1.6, textTransform: 'uppercase' }}>{page.eyebrow}</Text>
                  <Text variant="displayMd">{page.title}</Text>
                  <Text variant="bodyLg" style={{ color: colors.textSecondary }}>{page.body}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.lg, paddingTop: spacing.sm, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          {pages.map((page, dot) => (
            <Pressable
              key={page.title}
              accessibilityRole="button"
              accessibilityLabel={`Go to introduction page ${dot + 1}`}
              onPress={() => goToPage(dot)}
              hitSlop={8}
            >
              <View style={{ width: dot === index ? 28 : 8, height: 8, borderRadius: 4, backgroundColor: dot === index ? currentAccent : colors.border }} />
            </Pressable>
          ))}
        </View>

        {replaying ? (
          <Button size="lg" fullWidth onPress={() => router.back()}>Back to Outing</Button>
        ) : index < pages.length - 1 ? (
          <Button size="lg" fullWidth onPress={() => goToPage(index + 1)}>Next</Button>
        ) : user ? (
          <>
            <Button size="lg" fullWidth onPress={() => finish('/quiz')}>Start planning</Button>
            <Button variant="ghost" fullWidth onPress={() => finish('/discover')}>Browse destinations</Button>
          </>
        ) : (
          <>
            {authError ? (
              <Text variant="caption" style={{ color: colors.error, textAlign: 'center' }}>{authError}</Text>
            ) : null}
            {appleAvailable ? (
              <View pointerEvents={authMethod ? 'none' : 'auto'} style={{ opacity: authMethod ? 0.55 : 1 }}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={isDark
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.md}
                  style={{ width: '100%', height: 52 }}
                  onPress={() => void authenticate('apple')}
                />
              </View>
            ) : null}
            <Button
              size="lg"
              variant="secondary"
              fullWidth
              loading={authMethod === 'google'}
              disabled={Boolean(authMethod) || authLoading}
              onPress={() => void authenticate('google')}
            >
              Continue with Google
            </Button>
            <Button
              variant="ghost"
              fullWidth
              disabled={Boolean(authMethod)}
              onPress={() => finish('/discover')}
            >
              Browse as guest
            </Button>
            <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>
              Sign in to sync trips and use Ask Outing. Guest plans stay on this device.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
