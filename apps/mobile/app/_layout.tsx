import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="quiz" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="quiz/results" options={{ headerShown: false }} />
          <Stack.Screen name="destinations/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="trips/new" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="trips/[tripId]" options={{ headerShown: false }} />
          <Stack.Screen name="trips/[tripId]/invite" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="settings/integrations" options={{ headerShown: false }} />
          <Stack.Screen name="share/[tripId]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </AppProviders>
    </GestureHandlerRootView>
  );
}
