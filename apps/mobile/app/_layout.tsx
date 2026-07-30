import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
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
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { AppProviders } from '../src/providers/AppProviders';
import {
  AnalyticsBoundary,
  AnalyticsRouteObserver,
} from '../src/analytics/analytics-provider';
import { InternalSessionReplayProvider } from '../src/analytics/internal-session-replay';
import { posthog } from '../src/config/posthog';
import { featureFlags } from '../src/lib/featureFlags';
import { readOnboardingComplete, shouldOfferOnboarding } from '../src/lib/onboardingState';
import { ConnectionBanner } from '../components/ui/ConnectionBanner';
import { useTheme } from '../src/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

function PostHogScreenObserver() {
  const ph = usePostHog();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousPathnameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      ph.screen(pathname, { previous_screen: previousPathnameRef.current ?? null, ...params });
      previousPathnameRef.current = pathname;
    }
  }, [pathname, params, ph]);

  return null;
}

export default function RootLayout() {
  const [frauncesLoaded] = useFrauncesFonts({ Fraunces_600SemiBold, Fraunces_700Bold });
  const [manropeLoaded] = useManropeFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });

  useEffect(() => {
    if (frauncesLoaded && manropeLoaded) void SplashScreen.hideAsync();
  }, [frauncesLoaded, manropeLoaded]);

  if (!frauncesLoaded || !manropeLoaded) return null;

  return (
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
            <Stack.Screen name="trips/[tripId]/invite" options={{ headerShown: false }} />
            <Stack.Screen name="auth/login" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
            <Stack.Screen name="settings/index" options={{ headerShown: false }} />
            <Stack.Screen name="settings/integrations" options={{ headerShown: false }} />
            <Stack.Screen name="share/[tripId]" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="+not-found" />
            </Stack>
          </AnalyticsBoundary>
        </AppProviders>
        </PostHogProvider>
      </InternalSessionReplayProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
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
