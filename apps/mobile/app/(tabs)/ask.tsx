import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { AssistantFocus, AssistantScope, ConversationVisibility } from '@gayi/shared';
import { AssistantChat } from '../../components/assistant/AssistantChat';
import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';
import { useAuth } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';
import { listAssistantConversations } from '../../src/lib/assistant-api';
import { OutingIcon } from '../../components/ui/OutingIcon';
import { RouteLine } from '../../components/ui/RouteLine';

export default function AskScreen() {
  const { user, loading } = useAuth();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ destinationSlug?: string; destinationSection?: string; importId?: string; inspirationLibrary?: string; prompt?: string }>();
  const [conversationId, setConversationId] = useState<string>();
  const [scope, setScope] = useState<AssistantScope>(params.destinationSlug
    ? { kind: 'destination', destinationSlug: params.destinationSlug }
    : { kind: 'general' });
  const [visibility, setVisibility] = useState<ConversationVisibility>('private');
  const focus: AssistantFocus | undefined = params.importId
    ? { kind: 'inspiration_import', importId: params.importId }
    : params.inspirationLibrary === '1'
      ? { kind: 'inspiration_library' }
    : params.destinationSlug && params.destinationSection
      ? {
          kind: 'destination_section',
          destinationSlug: params.destinationSlug,
          section: params.destinationSection as Extract<AssistantFocus, { kind: 'destination_section' }>['section'],
        }
      : undefined;
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
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}>
            <OutingIcon name="ask" size={21} color={colors.plum} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h1">Ask Outing</Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>Your taste, trip context, and current travel data</Text>
          </View>
          <View style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.poolLight }}>
            <Text variant="labelSm" style={{ color: colors.pool }}>Personalized</Text>
          </View>
        </View>
      </View>
      {!loading && !user ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.base, gap: spacing.lg }}>
          <View style={{ minHeight: 240, padding: spacing.xl, borderRadius: radius['2xl'], backgroundColor: colors.ink700, overflow: 'hidden', justifyContent: 'flex-end', gap: spacing.sm }}>
            <View style={{ position: 'absolute', right: -14, top: 10, opacity: 0.34 }}><RouteLine color={colors.coral300} width={230} /></View>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}><OutingIcon name="spark" size={24} color={colors.coral300} /></View>
            <Text variant="displaySm" style={{ color: colors.white }}>Better answers start with your taste.</Text>
            <Text variant="bodyMd" style={{ color: 'rgba(255,255,255,0.76)' }}>Sign in to privately connect your preferences, saved places, and trips—without having to explain them again.</Text>
          </View>
          <Button size="lg" onPress={() => router.push('/auth/login?returnTo=/ask')}>Continue to Ask Outing</Button>
          <Button variant="ghost" onPress={() => router.push('/discover')}>Explore without signing in</Button>
        </View>
      ) : user ? (
        <View style={{ flex: 1 }}>
          {(conversations.data?.length ?? 0) > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.base, paddingVertical: spacing.xs, gap: spacing.xs }}
              style={{ flexGrow: 0 }}
            >
              <Pressable
                onPress={() => {
                  setConversationId(undefined);
                  setScope({ kind: 'general' });
                  setVisibility('private');
                }}
                style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: !conversationId ? colors.accent : colors.backgroundSecondary, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
              >
                <OutingIcon name="spark" size={14} color={!conversationId ? colors.white : colors.textSecondary} />
                <Text variant="labelSm" style={{ color: !conversationId ? colors.white : colors.textPrimary }}>New</Text>
              </Pressable>
              {conversations.data?.map((conversation) => (
                <Pressable
                  key={conversation.id}
                  onPress={() => {
                    setConversationId(conversation.id);
                    setScope(conversation.scope);
                    setVisibility(conversation.visibility);
                  }}
                  style={{ maxWidth: 190, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: conversationId === conversation.id ? colors.ink700 : colors.backgroundSecondary }}
                >
                  <Text numberOfLines={1} variant="labelSm" style={{ color: conversationId === conversation.id ? colors.white : colors.textPrimary }}>
                    {conversation.title || 'Past conversation'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <AssistantChat
            key={conversationId ?? `${scope.kind}-${scope.kind === 'destination' ? scope.destinationSlug : 'new'}-${params.importId ?? (params.inspirationLibrary === '1' ? 'inspiration-library' : 'default')}`}
            scope={scope}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            initialConversationId={conversationId}
            initialDraft={conversationId ? undefined : params.prompt}
            focus={conversationId ? undefined : focus}
          />
        </View>
      ) : null}
    </View>
  );
}
