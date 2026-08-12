import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, type Href, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { ShareIntentProvider } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  useFonts as useFrauncesFonts,
} from '@expo-google-fonts/fraunces';
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts as useManropeFonts,
} from '@expo-google-fonts/manrope';
import { normalizeAnalyticsRoute } from '@gayi/shared';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { AppProviders } from '../src/providers/AppProviders';
import {
  AnalyticsBoundary,
  AnalyticsRouteObserver,
} from '../src/analytics/analytics-provider';
import { InternalSessionReplayProvider } from '../src/analytics/internal-session-replay';
import { posthog } from '../src/config/posthog';
import { featureFlags, isFullExperiencePreview, setRuntimeFullExperience } from '../src/lib/featureFlags';
import { supabase } from '../src/lib/supabase';
import { readOnboardingComplete, shouldOfferOnboarding } from '../src/lib/onboardingState';
import { ConnectionBanner } from '../components/ui/ConnectionBanner';
import { useTheme } from '../src/theme/ThemeProvider';
import { IncomingShareHandler } from '../components/inspiration/incoming-share-handler';
import { TripAwarenessCoordinator } from '../components/trips/trip-awareness-coordinator';
import '../src/lib/trip-awareness';
import '../src/lib/notifications';

void SplashScreen.preventAutoHideAsync();

function PostHogScreenObserver() {
  const ph = usePostHog();
  const pathname = usePathname();
  const previousPathnameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const normalized = normalizeAnalyticsRoute(pathname);
    if (previousPathnameRef.current !== normalized) {
      ph.screen(normalized, { previous_screen: previousPathnameRef.current ?? null });
      previousPathnameRef.current = normalized;
    }
  }, [pathname, ph]);

  return null;
}

export default function RootLayout() {
  const [frauncesLoaded] = useFrauncesFonts({ Fraunces_600SemiBold, Fraunces_700Bold });
  const [manropeLoaded] = useManropeFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  const [, setFeatureRevision] = useState(0);

  useEffect(() => {
    if (!supabase || isFullExperiencePreview) return;
    let active = true;
    const applyFlag = (enabled: unknown) => {
      if (!active || typeof enabled !== 'boolean') return;
      setRuntimeFullExperience(enabled);
      setFeatureRevision((value) => value + 1);
    };
    void supabase.from('feature_flags').select('enabled').eq('key', 'outingFullExperienceV1').maybeSingle().then(({ data, error }) => {
      if (!active || error || typeof data?.enabled !== 'boolean') return;
      applyFlag(data.enabled);
    });
    const channel = supabase.channel('outing-full-experience-flag')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feature_flags', filter: 'key=eq.outingFullExperienceV1' }, (payload) => {
        applyFlag((payload.new as { enabled?: unknown }).enabled);
      })
      .subscribe();
    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (frauncesLoaded && manropeLoaded) void SplashScreen.hideAsync();
  }, [frauncesLoaded, manropeLoaded]);

  if (!frauncesLoaded || !manropeLoaded) return null;

  return (
    <ShareIntentProvider options={{
      scheme: 'gayi',
      disabled: process.env.EXPO_OS === 'web' || Constants.appOwnership === 'expo',
      resetOnBackground: false,
    }}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <InternalSessionReplayProvider>
        <PostHogProvider
          client={posthog}
          autocapture={{
            captureScreens: false,
            captureTouches: true,
            propsToCapture: ['testID'],
            maxElementsCaptured: 20,
          }}
        >
          <AppProviders>
            <IncomingShareHandler />
            <TripAwarenessCoordinator />
            <NotificationNavigationHandler />
            <AnalyticsBoundary>
              <PostHogScreenObserver />
              <AnalyticsRouteObserver />
            <ThemedStatusBar />
            <OnboardingGate />
            <ConnectionBanner />
            <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="quiz/index" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="quiz/results" options={{ headerShown: false }} />
            <Stack.Screen name="destinations/[slug]" options={{ headerShown: false }} />
            <Stack.Screen name="collections/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="experiences/[productCode]" options={{ headerShown: false }} />
            <Stack.Screen name="trips/new" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="invite" options={{ headerShown: false }} />
            <Stack.Screen name="trips/[tripId]/index" options={{ headerShown: false }} />
            <Stack.Screen name="trips/[tripId]/ask" options={{ headerShown: false }} />
            <Stack.Screen name="trips/[tripId]/today" options={{ headerShown: false }} />
            <Stack.Screen name="inspiration/index" options={{ headerShown: false }} />
            <Stack.Screen name="inspiration/[importId]" options={{ headerShown: false }} />
            <Stack.Screen name="trips/[tripId]/invite" options={{ headerShown: false }} />
            <Stack.Screen name="auth/login" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
            <Stack.Screen name="settings/index" options={{ headerShown: false }} />
            <Stack.Screen name="settings/integrations" options={{ headerShown: false }} />
            <Stack.Screen name="settings/visit-history" options={{ headerShown: false }} />
            <Stack.Screen name="share/[tripId]" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="+not-found" />
            </Stack>
          </AnalyticsBoundary>
        </AppProviders>
        </PostHogProvider>
      </InternalSessionReplayProvider>
    </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

function NotificationNavigationHandler() {
  const router = useRouter();
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse) => {
      if (handled.current === response.notification.request.identifier) return;
      const path = response.notification.request.content.data?.path ?? response.notification.request.content.data?.route;
      if (typeof path !== 'string' || !(path === '/discover' || /^\/trips\/[0-9a-f-]{36}\/today$/i.test(path))) return;
      handled.current = response.notification.request.identifier;
      router.push(path as Href);
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response) open(response); });
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);
  return null;
}

function OnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();
  const checked = useRef(false);
  const [completed, setCompleted] = useState(true);

  useEffect(() => {
    let active = true;
    void readOnboardingComplete().then((value) => {
      if (!active) return;
      setCompleted(value);
      checked.current = true;
      if (shouldOfferOnboarding({ enabled: featureFlags.onboardingV1, completed: value, pathname })) {
        router.replace('/welcome');
      }
    });
    return () => { active = false; };
  }, [pathname, router]);

  useEffect(() => {
    if (
      checked.current &&
      shouldOfferOnboarding({ enabled: featureFlags.onboardingV1, completed, pathname })
    ) {
      router.replace('/welcome');
    }
  }, [completed, pathname, router]);

  return null;
}
