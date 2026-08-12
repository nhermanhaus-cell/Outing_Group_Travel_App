import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { AssistantScope, ConversationVisibility } from '@gayi/shared';
import { AssistantChat } from '../../components/assistant/AssistantChat';
import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';
import { useAuth } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';
import { listAssistantConversations } from '../../src/lib/assistant-api';

export default function AskScreen() {
  const { user, loading } = useAuth();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ destinationSlug?: string; prompt?: string }>();
  const [conversationId, setConversationId] = useState<string>();
  const [scope, setScope] = useState<AssistantScope>(params.destinationSlug
    ? { kind: 'destination', destinationSlug: params.destinationSlug }
    : { kind: 'general' });
  const [visibility, setVisibility] = useState<ConversationVisibility>('private');
  const conversations = useQuery({
    queryKey: ['assistant-conversations', user?.id],
    queryFn: () => listAssistantConversations(),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!params.destinationSlug) return;
    setConversationId(undefined);
    setScope({ kind: 'destination', destinationSlug: params.destinationSlug });
    setVisibility('private');
  }, [params.destinationSlug]);

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
        <View style={{ flex: 1 }}>
          {(conversations.data?.length ?? 0) > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm }}
              style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Pressable
                onPress={() => {
                  setConversationId(undefined);
                  setScope({ kind: 'general' });
                  setVisibility('private');
                }}
                style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: !conversationId ? colors.accent : colors.backgroundSecondary }}
              >
                <Text variant="labelSm" style={{ color: !conversationId ? colors.white : colors.textPrimary }}>New question</Text>
              </Pressable>
              {conversations.data?.map((conversation) => (
                <Pressable
                  key={conversation.id}
                  onPress={() => {
                    setConversationId(conversation.id);
                    setScope(conversation.scope);
                    setVisibility(conversation.visibility);
                  }}
                  style={{ maxWidth: 220, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: conversationId === conversation.id ? colors.plum : colors.backgroundSecondary }}
                >
                  <Text numberOfLines={1} variant="labelSm" style={{ color: conversationId === conversation.id ? colors.white : colors.textPrimary }}>
                    {conversation.title || 'Past conversation'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <AssistantChat
            key={conversationId ?? `${scope.kind}-${scope.kind === 'destination' ? scope.destinationSlug : 'new'}`}
            scope={scope}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            initialConversationId={conversationId}
            initialDraft={conversationId ? undefined : params.prompt}
          />
        </View>
      ) : null}
    </View>
  );
}
