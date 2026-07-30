import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type {
  AssistantProposal,
  AssistantScope,
  AssistantSource,
  ConversationVisibility,
} from '@gayi/shared';
import { posthog } from '../../src/config/posthog';
import { reviewAssistantProposal, streamAssistant } from '../../src/lib/assistant-api';
import { applyAssistantProposalToTrip } from '../../src/lib/assistantProposals';
import { useAuth, useTrips } from '../../src/providers/AppProviders';
import { useSavedDestinations } from '../../src/providers/SavedDestinationsProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { OutingIcon } from '../ui/OutingIcon';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AssistantSource[];
  proposals?: AssistantProposal[];
};

const STARTERS = [
  'Where should I go in October?',
  'Find me a food-first long weekend',
  'Compare two affordable destinations',
  'What feels lively but not exhausting?',
];

export function AssistantChat({
  scope,
  visibility,
  onVisibilityChange,
}: {
  scope: AssistantScope;
  visibility: ConversationVisibility;
  onVisibilityChange?: (visibility: ConversationVisibility) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { getTrip, updateTrip } = useTrips();
  const { toggleSaved } = useSavedDestinations();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const scopedTrip = scope.kind === 'trip' ? getTrip(scope.tripId) : undefined;
  const memberRole = scopedTrip?.members?.find((member) => member.id === user?.id)?.role;
  const canApplyDirectly = !scopedTrip?.members?.length ||
    memberRole === 'owner' ||
    memberRole === 'organizer';

  const updateProposalStatus = (
    proposalId: string,
    status: AssistantProposal['status'],
  ) => {
    setMessages((current) => current.map((message) => ({
      ...message,
      proposals: message.proposals?.map((proposal) =>
        proposal.id === proposalId ? { ...proposal, status } : proposal),
    })));
  };

  const reviewProposal = async (
    proposal: AssistantProposal,
    action: 'apply' | 'dismiss',
  ) => {
    try {
      if (action === 'dismiss') {
        await reviewAssistantProposal(proposal.id, 'dismiss');
        updateProposalStatus(proposal.id, 'dismissed');
        return;
      }

      if (scopedTrip && !canApplyDirectly) {
        const polls = [...(scopedTrip.polls ?? []), {
          id: `assistant-${proposal.id}`,
          question: proposal.title,
          options: [
            { id: `${proposal.id}-accept`, label: 'Add it to the plan', votes: [] },
            { id: `${proposal.id}-dismiss`, label: 'Skip this change', votes: [] },
          ],
          createdAt: new Date().toISOString(),
          assistantProposal: proposal,
        }];
        await updateTrip(scopedTrip.tripId, { polls });
        await reviewAssistantProposal(proposal.id, 'submit_poll');
        updateProposalStatus(proposal.id, 'polling');
        posthog.capture('assistant_proposal_submitted_to_poll', { proposal_kind: proposal.kind });
        return;
      }

      if (proposal.kind === 'save_destination' && proposal.payload.destinationSlug) {
        await toggleSaved(proposal.payload.destinationSlug, 'assistant');
      } else if (scopedTrip) {
        await updateTrip(
          scopedTrip.tripId,
          applyAssistantProposalToTrip(scopedTrip, proposal),
        );
      }
      await reviewAssistantProposal(proposal.id, 'apply');
      updateProposalStatus(proposal.id, 'applied');
      posthog.capture('assistant_proposal_applied', { proposal_kind: proposal.kind });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review this proposal.');
    }
  };

  const send = async (suggested?: string) => {
    const message = (suggested ?? draft).trim();
    if (!message || loading) return;
    const userMessage: Message = { id: `user-${Date.now()}`, role: 'user', content: message };
    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [...current, userMessage, { id: assistantId, role: 'assistant', content: '' }]);
    setDraft('');
    setError(undefined);
    setLoading(true);
    const startedAt = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    posthog.capture('assistant_request_started', {
      scope_kind: scope.kind,
      visibility,
      has_existing_conversation: Boolean(conversationId),
    });

    try {
      await streamAssistant(
        { conversationId, scope, visibility, message },
        (event) => {
          if (event.type === 'start') setConversationId(event.conversationId);
          if (event.type === 'delta') {
            setMessages((current) => current.map((item) =>
              item.id === assistantId ? { ...item, content: item.content + event.text } : item,
            ));
          }
          if (event.type === 'sources') {
            setMessages((current) => current.map((item) =>
              item.id === assistantId ? { ...item, sources: event.sources } : item,
            ));
          }
          if (event.type === 'proposal') {
            setMessages((current) => current.map((item) =>
              item.id === assistantId
                ? { ...item, proposals: [...(item.proposals ?? []), event.proposal] }
                : item,
            ));
          }
          if (event.type === 'error') setError(event.message);
        },
        controller.signal,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      posthog.capture('assistant_request_completed', {
        scope_kind: scope.kind,
        visibility,
        duration_ms: Date.now() - startedAt,
      });
    } catch (caught) {
      if (!controller.signal.aborted) {
        const messageText = caught instanceof Error ? caught.message : 'Ask Outing is unavailable right now.';
        setError(messageText);
        setMessages((current) => current.filter((item) => item.id !== assistantId || item.content));
        posthog.capture('assistant_request_failed', {
          scope_kind: scope.kind,
          duration_ms: Date.now() - startedAt,
          error_kind: caught instanceof Error ? caught.name : 'unknown',
        });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={86}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {scope.kind === 'trip' && !conversationId && onVisibilityChange ? (
          <View style={{ padding: spacing.base, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, gap: spacing.sm }}>
            <Text variant="labelMd">Who should see this conversation?</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['private', 'trip_shared'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => onVisibilityChange(option)}
                  style={{
                    flex: 1,
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: visibility === option ? colors.accent : colors.border,
                    backgroundColor: visibility === option ? colors.accentLight : colors.surface,
                  }}
                >
                  <Text variant="labelMd">{option === 'private' ? 'Just me' : 'Trip members'}</Text>
                  <Text variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
                    {option === 'private' ? 'Ideas stay private' : 'Chat is visible to the group'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text variant="caption" style={{ color: colors.textTertiary }}>
              Visibility locks after your first message. You can still share a private proposal without sharing the chat.
            </Text>
          </View>
        ) : null}

        {messages.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}>
              <OutingIcon name="spark" color={colors.plum} size={28} />
            </View>
            <Text variant="displaySm">What are we getting into?</Text>
            <Text variant="bodyLg" style={{ color: colors.textSecondary }}>
              Ask about destinations, timing, places, events, fares, or how to make a trip fit the people going.
            </Text>
            <View style={{ gap: spacing.sm }}>
              {STARTERS.map((starter) => (
                <Pressable
                  key={starter}
                  onPress={() => void send(starter)}
                  style={{ padding: spacing.base, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                >
                  <Text variant="bodyMd" style={{ flex: 1 }}>{starter}</Text>
                  <OutingIcon name="arrow" size={18} color={colors.accent} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={{
                alignSelf: message.role === 'user' ? 'flex-end' : 'stretch',
                maxWidth: message.role === 'user' ? '86%' : '100%',
                padding: spacing.base,
                borderRadius: radius.xl,
                backgroundColor: message.role === 'user' ? colors.plum : colors.surface,
                borderWidth: message.role === 'assistant' ? 1 : 0,
                borderColor: colors.border,
                gap: spacing.md,
              }}
            >
              {message.content ? (
                <Text variant="bodyMd" style={{ color: message.role === 'user' ? colors.white : colors.textPrimary }}>
                  {message.content}
                </Text>
              ) : <ActivityIndicator color={colors.accent} />}
              {message.sources?.length ? (
                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelSm" style={{ color: colors.textSecondary }}>Sources</Text>
                  {message.sources.map((source) => (
                    <Text key={source.id} variant="caption" style={{ color: colors.pool }}>• {source.label}</Text>
                  ))}
                </View>
              ) : null}
              {message.proposals?.map((proposal) => (
                <View key={proposal.id} style={{ backgroundColor: colors.poolLight, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
                  <Text variant="labelSm" style={{ color: colors.pool, textTransform: 'uppercase' }}>Review before changing</Text>
                  <Text variant="h3">{proposal.title}</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>{proposal.summary}</Text>
                  {proposal.status === 'proposed' || proposal.status === 'polling' ? (
                    proposal.status === 'polling' ? (
                      <Text variant="labelMd" style={{ color: colors.pool }}>Waiting for the group vote</Text>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button size="sm" onPress={() => void reviewProposal(proposal, 'apply')}>
                          {scopedTrip && !canApplyDirectly ? 'Send to vote' : 'Apply'}
                        </Button>
                        {(canApplyDirectly || !scopedTrip) ? (
                          <Button size="sm" variant="ghost" onPress={() => void reviewProposal(proposal, 'dismiss')}>Dismiss</Button>
                        ) : null}
                      </View>
                    )
                  ) : (
                    <Text variant="labelMd" style={{ color: proposal.status === 'applied' ? colors.pool : colors.textSecondary }}>
                      {proposal.status === 'applied' ? 'Applied to your plan' : 'Dismissed'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))
        )}
        {error ? (
          <View style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.accentLight }}>
            <Text variant="bodySm" style={{ color: colors.error }}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            editable={!loading}
            placeholder="Ask Outing…"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={4000}
            style={{
              flex: 1,
              minHeight: 46,
              maxHeight: 120,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              borderRadius: radius.xl,
              paddingHorizontal: spacing.base,
              paddingVertical: spacing.md,
              fontFamily: 'Manrope_400Regular',
              fontSize: 14,
            }}
          />
          {loading ? (
            <Button variant="secondary" onPress={() => abortRef.current?.abort()}>Stop</Button>
          ) : (
            <Button disabled={!draft.trim()} onPress={() => void send()}>Send</Button>
          )}
        </View>
        <Text variant="caption" style={{ color: colors.textTertiary }}>
          Suggestions can be wrong. Outing never books or changes a trip without review.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
