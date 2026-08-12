import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AssistantFocus, ConversationVisibility, TodaySituation } from '@gayi/shared';
import { AssistantChat } from '../../../components/assistant/AssistantChat';
import { Text } from '../../../components/ui/Text';
import { useAuth, useTrips } from '../../../src/providers/AppProviders';
import { useTheme } from '../../../src/theme/ThemeProvider';

export default function TripAskScreen() {
  const { tripId, prompt, focusKind, focusAction, day, itemId, situation } = useLocalSearchParams<{
    tripId: string; prompt?: string; focusKind?: string; focusAction?: string; day?: string; itemId?: string; situation?: string; pollId?: string;
  }>();
  const { getTrip } = useTrips();
  const { user } = useAuth();
  const trip = getTrip(tripId);
  const [visibility, setVisibility] = useState<ConversationVisibility>('private');
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focus: AssistantFocus | undefined = focusKind === 'today'
    ? { kind: 'today', tripId, ...(situation ? { situation: situation as TodaySituation } : {}) }
    : focusKind === 'day' && Number.isFinite(Number(day))
      ? { kind: 'itinerary_day', tripId, day: Number(day), action: focusAction === 'rework' ? 'rework' : focusAction === 'nearby' ? 'nearby' : 'explain' }
      : focusKind === 'item' && itemId
        ? { kind: 'itinerary_item', tripId, itemId, action: 'explain' }
        : focusKind === 'map'
          ? { kind: 'trip_map', tripId, ...(Number.isFinite(Number(day)) ? { day: Number(day) } : {}) }
          : focusKind === 'group'
            ? { kind: 'group_decision', tripId }
        : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md }}>
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()}>
          <Text variant="h2">‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="h2">Ask about {trip?.destinationName ?? trip?.name ?? 'this trip'}</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>Contextual ideas, always yours to review</Text>
        </View>
      </View>
      {user ? (
        <AssistantChat
          scope={{ kind: 'trip', tripId }}
          visibility={visibility}
          onVisibilityChange={setVisibility}
          initialDraft={prompt}
          focus={focus}
        />
      ) : (
        <View style={{ padding: spacing.xl }}>
          <Text variant="bodyLg">Sign in to use trip-aware Ask Outing.</Text>
        </View>
      )}
    </View>
  );
}
