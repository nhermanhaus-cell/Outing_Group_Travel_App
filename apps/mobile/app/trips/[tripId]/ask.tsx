import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AssistantFocus, ConversationVisibility, TodaySituation } from '@gayi/shared';
import { AssistantChat } from '../../../components/assistant/AssistantChat';
import { Text } from '../../../components/ui/Text';
import { useAuth, useTrips } from '../../../src/providers/AppProviders';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { OutingIcon } from '../../../components/ui/OutingIcon';

export default function TripAskScreen() {
  const { tripId, prompt, focusKind, focusAction, day, itemId, situation } = useLocalSearchParams<{
    tripId: string; prompt?: string; focusKind?: string; focusAction?: string; day?: string; itemId?: string; situation?: string; pollId?: string;
  }>();
  const { getTrip } = useTrips();
  const { user } = useAuth();
  const trip = getTrip(tripId);
  const [visibility, setVisibility] = useState<ConversationVisibility>('private');
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focus: AssistantFocus | undefined = focusKind === 'today'
    ? { kind: 'today', tripId, ...(situation ? { situation: situation as TodaySituation } : {}) }
    : focusKind === 'day' && Number.isFinite(Number(day))
      ? { kind: 'itinerary_day', tripId, day: Number(day), action: focusAction === 'rework' ? 'rework' : focusAction === 'nearby' ? 'nearby' : 'explain' }
      : focusKind === 'item' && itemId
        ? { kind: 'itinerary_item', tripId, itemId, action: focusAction === 'nearby' ? 'nearby' : focusAction === 'replace' ? 'replace' : 'explain' }
        : focusKind === 'map'
          ? { kind: 'trip_map', tripId, ...(Number.isFinite(Number(day)) ? { day: Number(day) } : {}) }
          : focusKind === 'group'
            ? { kind: 'group_decision', tripId }
        : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.sm }}>
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="h3">‹</Text>
        </Pressable>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}><OutingIcon name="ask" size={19} color={colors.plum} /></View>
        <View style={{ flex: 1 }}>
          <Text variant="h2">Ask Outing</Text>
          <Text variant="caption" numberOfLines={1} style={{ color: colors.textSecondary }}>{trip?.name ?? trip?.destinationName ?? 'Trip-aware advice'} · Changes require review</Text>
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
