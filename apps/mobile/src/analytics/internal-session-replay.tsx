import { usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  PostHogProvider,
  usePostHog,
} from 'posthog-react-native';
import { normalizeAnalyticsRoute } from '@gayi/shared';

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ?? '';
const posthogHost =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
const internalBuild = process.env.EXPO_PUBLIC_INTERNAL_ANALYTICS_BUILD === '1';
const replayFlag = process.env.EXPO_PUBLIC_SESSION_REPLAY_ENABLED === '1';
const replayEnabled =
  internalBuild &&
  replayFlag &&
  Boolean(projectToken) &&
  (Platform.OS === 'ios' || Platform.OS === 'android');

const EXCLUDED_ROUTES = new Set([
  '/auth/login',
  '/auth/callback',
  '/ask',
  '/quiz',
  '/quiz/results',
  '/profile',
  '/settings',
  '/settings/integrations',
  '/invite',
  '/inspiration',
  '/inspiration/[importId]',
  '/share/[tripId]',
  '/trips/new',
  '/trips/[tripId]',
  '/trips/[tripId]/invite',
]);

function ReplayRouteGuard() {
  const pathname = usePathname();
  const posthog = usePostHog();

  useEffect(() => {
    const route = normalizeAnalyticsRoute(pathname);
    if (EXCLUDED_ROUTES.has(route) || route.startsWith('/trips/') || route.startsWith('/inspiration/')) {
      void posthog.optOut();
    } else {
      void posthog.optIn();
    }
  }, [pathname, posthog]);

  return null;
}

/**
 * Native replay is deliberately available only in explicitly marked internal
 * builds. Public production builds render children without initializing PostHog.
 */
export function InternalSessionReplayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!replayEnabled) return <>{children}</>;

  return (
    <PostHogProvider
      apiKey={projectToken}
      autocapture={{ captureScreens: false, captureTouches: false }}
      options={{
        host: posthogHost,
        defaultOptIn: false,
        captureAppLifecycleEvents: false,
        disableGeoip: true,
        sendFeatureFlagEvent: false,
        preloadFeatureFlags: false,
        enableSessionReplay: true,
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: true,
          maskAllSandboxedViews: true,
          captureLog: false,
          captureNetworkTelemetry: false,
          sampleRate: 0.1,
          throttleDelayMs: 1_000,
        },
      }}
    >
      <ReplayRouteGuard />
      {children}
    </PostHogProvider>
  );
}
