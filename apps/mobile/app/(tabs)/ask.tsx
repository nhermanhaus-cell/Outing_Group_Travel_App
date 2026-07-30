import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AssistantChat } from '../../components/assistant/AssistantChat';
import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';
import { useAuth } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function AskScreen() {
  const { user, loading } = useAuth();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text variant="h1">Ask Outing</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>Travel ideas grounded in current trip and travel data</Text>
      </View>
      {!loading && !user ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
          <Text variant="displaySm">Your preferences make Ask useful.</Text>
          <Text variant="bodyLg" style={{ color: colors.textSecondary }}>
            Sign in to keep conversations private, protect trip context, and revisit your recommendations.
          </Text>
          <Button size="lg" onPress={() => router.push('/auth/login?returnTo=/ask')}>Sign in to Ask Outing</Button>
          <Button variant="ghost" onPress={() => router.push('/discover')}>Browse destinations instead</Button>
        </View>
      ) : user ? (
        <AssistantChat scope={{ kind: 'general' }} visibility="private" />
      ) : null}
    </View>
  );
}
