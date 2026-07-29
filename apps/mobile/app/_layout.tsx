import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import {
  AnalyticsBoundary,
  AnalyticsRouteObserver,
} from '../src/analytics/analytics-provider';
import { InternalSessionReplayProvider } from '../src/analytics/internal-session-replay';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <InternalSessionReplayProvider>
        <AppProviders>
          <AnalyticsBoundary>
            <AnalyticsRouteObserver />
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="quiz/index" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="quiz/results" options={{ headerShown: false }} />
            <Stack.Screen name="destinations/[slug]" options={{ headerShown: false }} />
            <Stack.Screen name="collections/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="experiences/[productCode]" options={{ headerShown: false }} />
            <Stack.Screen name="trips/new" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="invite" options={{ headerShown: false }} />
            <Stack.Screen name="trips/[tripId]/index" options={{ headerShown: false }} />
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
      </InternalSessionReplayProvider>
    </GestureHandlerRootView>
  );
}
