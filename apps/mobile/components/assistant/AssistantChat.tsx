import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type {
  AssistantRecommendation,
  AssistantFocus,
  AssistantDecisionCard,
  AssistantProposal,
  AssistantScope,
  AssistantSource,
  DestinationCandidate,
  ConversationVisibility,
} from '@gayi/shared';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { posthog } from '../../src/config/posthog';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import {
  loadAssistantConversationMessages,
  loadAssistantInsights,
  reviewAssistantProposal,
  streamAssistant,
} from '../../src/lib/assistant-api';
import { applyAssistantProposalToTrip } from '../../src/lib/assistantProposals';
import { featureFlags } from '../../src/lib/featureFlags';
import { useAuth, useTrips } from '../../src/providers/AppProviders';
import { useSavedDestinations } from '../../src/providers/SavedDestinationsProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { OutingIcon } from '../ui/OutingIcon';
import { DecisionBriefCard } from './DecisionBriefCard';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AssistantSource[];
  proposals?: AssistantProposal[];
  recommendations?: AssistantRecommendation[];
  decisionCards?: AssistantDecisionCard[];
  provisionalDestinations?: DestinationCandidate[];
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
  initialConversationId,
  initialDraft,
  focus,
}: {
  scope: AssistantScope;
  visibility: ConversationVisibility;
  onVisibilityChange?: (visibility: ConversationVisibility) => void;
  initialConversationId?: string;
  initialDraft?: string;
  focus?: AssistantFocus;
}) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { track } = useAnalytics();
  const router = useRouter();
  const { getTrip, updateTrip } = useTrips();
  const { toggleSaved } = useSavedDestinations();
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const trackedInsightIdsRef = useRef(new Set<string>());
  const scrollRef = useRef<ScrollView | null>(null);
  const scopedTrip = scope.kind === 'trip' ? getTrip(scope.tripId) : undefined;
  const memberRole = scopedTrip?.members?.find((member) => member.id === user?.id)?.role;
  const canApplyDirectly = !scopedTrip?.members?.length ||
    memberRole === 'owner' ||
    memberRole === 'organizer';
  const insightSurface = scope.kind === 'trip' ? 'trip' : scope.kind === 'destination' ? 'destination' : 'ask';
  const insights = useQuery({
    queryKey: ['assistant-insights', insightSurface, scope.kind === 'trip' ? scope.tripId : scope.kind === 'destination' ? scope.destinationSlug : 'general'],
    queryFn: ({ signal }) => loadAssistantInsights({
      surface: insightSurface,
      ...(scope.kind === 'trip' ? { tripId: scope.tripId } : {}),
      ...(scope.kind === 'destination' ? { destinationSlug: scope.destinationSlug } : {}),
      trigger: 'screen',
      force: false,
    }, signal),
    enabled: Boolean(user && featureFlags.assistantPersonalizationV1),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const starters = useMemo(() => {
    const personalized = insights.data?.insights.flatMap((insight) => insight.prompts) ?? [];
    const contextual = focus?.kind === 'today'
      ? ['What should I know about the next stop?', 'Find something near dinner', 'Give me a lighter backup for today']
      : focus?.kind === 'itinerary_day'
        ? [`Explain why Day ${focus.day} works`, `Make Day ${focus.day} lighter`, `Find something near this day’s dinner`]
        : focus?.kind === 'itinerary_item'
          ? ['Why does this fit the trip?', 'Find a nearby alternative', 'What should we know before going?']
          : [];
    return [...new Set(personalized.length ? [...contextual, ...personalized] : contextual.length ? contextual : STARTERS)].slice(0, 4);
  }, [focus, insights.data?.insights]);

  useEffect(() => {
    for (const insight of insights.data?.insights ?? []) {
      if (trackedInsightIdsRef.current.has(insight.id)) continue;
      trackedInsightIdsRef.current.add(insight.id);
      track(ANALYTICS_EVENTS.ASSISTANT_INSIGHT_VIEWED, {
        surface: insight.surface,
        insightKind: insight.kind,
        resultCountBucket: insight.recommendations.length >= 5 ? '5+' : String(insight.recommendations.length),
      });
    }
  }, [insights.data?.insights, track]);

  useEffect(() => {
    if (!initialConversationId) {
      setConversationId(undefined);
      setMessages([]);
      return;
    }
    let active = true;
    setConversationId(initialConversationId);
    setLoading(true);
    void loadAssistantConversationMessages(initialConversationId)
      .then((stored) => {
        if (!active) return;
        setMessages(stored.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })));
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : 'Could not reopen this conversation.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [initialConversationId]);

  useEffect(() => {
    if (!conversationId && messages.length === 0 && initialDraft) setDraft(initialDraft);
  }, [conversationId, initialDraft, messages.length]);

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
    setStatus('Understanding what would fit best…');
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
        {
          conversationId,
          scope,
          visibility,
          message,
          ...(focus ? { focus } : {}),
          agentRollout: featureFlags.mistralAgentV1,
          globalDiscoveryRollout: featureFlags.globalDiscoveryV1,
        },
        (event) => {
          if (event.type === 'start') setConversationId(event.conversationId);
          if (event.type === 'status') setStatus(event.message);
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
          if (event.type === 'recommendations') {
            setMessages((current) => current.map((item) =>
              item.id === assistantId ? { ...item, recommendations: event.recommendations } : item,
            ));
          }
          if (event.type === 'decision') {
            setMessages((current) => current.map((item) =>
              item.id === assistantId
                ? { ...item, decisionCards: [...(item.decisionCards ?? []), event.card] }
                : item,
            ));
          }
          if (event.type === 'provisional_destination') {
            setMessages((current) => current.map((item) =>
              item.id === assistantId
                ? { ...item, provisionalDestinations: [...(item.provisionalDestinations ?? []), event.destination] }
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
      setStatus(undefined);
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
              {starters.map((starter) => (
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
              {message.recommendations?.map((recommendation) => (
                <Pressable
                  key={recommendation.id}
                  onPress={() => {
                    const primarySource = message.sources?.find((source) =>
                      recommendation.sourceIds.includes(source.id))?.provider ?? 'unknown';
                    track(ANALYTICS_EVENTS.ASSISTANT_RECOMMENDATION_SELECTED, {
                      recommendationKind: recommendation.kind,
                      sourceProvider: primarySource,
                      fitScoreBucket: recommendation.fitScore === undefined
                        ? 'unknown'
                        : recommendation.fitScore >= 80 ? '80-100' : recommendation.fitScore >= 60 ? '60-79' : '0-59',
                      provisional: recommendation.provisional,
                      bookable: recommendation.bookable,
                    });
                    if (recommendation.bookable) {
                      track(ANALYTICS_EVENTS.AFFILIATE_CLICKED, {
                        provider: primarySource,
                        productCategory: recommendation.kind,
                      });
                    }
                    if (recommendation.action?.type === 'open_destination' && recommendation.destinationSlug) {
                      router.push(`/destinations/${recommendation.destinationSlug}`);
                    } else if (recommendation.action?.type === 'ask_follow_up') {
                      void send(recommendation.action.value);
                    } else if (
                      recommendation.action?.type === 'open_url' &&
                      /^https:\/\//i.test(recommendation.action.value)
                    ) {
                      void Linking.openURL(recommendation.action.value);
                    }
                  }}
                  style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.xs }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                    <Text variant="labelMd" style={{ flex: 1 }}>{recommendation.title}</Text>
                    {recommendation.fitScore !== undefined ? <Text variant="labelSm" style={{ color: colors.pool }}>{Math.round(recommendation.fitScore)}% fit</Text> : null}
                  </View>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>{recommendation.summary}</Text>
                  {recommendation.fitReasons.length ? (
                    <Text variant="caption" style={{ color: colors.pool }}>Why it fits: {recommendation.fitReasons.join(' · ')}</Text>
                  ) : null}
                  {recommendation.tradeoffs.length ? (
                    <Text variant="caption" style={{ color: colors.textTertiary }}>Consider: {recommendation.tradeoffs.join(' · ')}</Text>
                  ) : null}
                  {recommendation.affiliateDisclosure ? <Text variant="caption">{recommendation.affiliateDisclosure}</Text> : null}
                </Pressable>
              ))}
              {message.decisionCards?.map((card) => (
                <DecisionBriefCard
                  key={card.id}
                  card={card}
                  surface={scope.kind === 'trip' ? 'trip' : scope.kind === 'destination' ? 'destination' : 'home'}
                  onAction={() => {
                    if (card.action?.type === 'ask_follow_up') void send(card.action.value);
                    else if (card.action?.type === 'open_destination') router.push(`/destinations/${card.action.value}`);
                    else if (card.action?.type === 'open_trip') router.push(`/trips/${card.action.value}`);
                    else if (card.action?.type === 'open_today') router.push(`/trips/${card.action.value}/today`);
                    else if (card.action?.type === 'start_taste_deck') router.push(`/trips/${card.action.value}?deck=1`);
                    else if (card.action?.type === 'rework_day') {
                      const [tripId, day] = card.action.value.split(':');
                      router.push(`/trips/${tripId}?section=plan&day=${day}&rework=1`);
                    }
                    else if (card.action?.type === 'review_import') router.push(`/inspiration/${card.action.value}` as never);
                    else if (card.action?.type === 'open_compare') router.push({ pathname: '/compare', params: { slugs: card.action.value } });
                    else if (card.action?.type === 'open_url' && /^https:\/\//i.test(card.action.value)) void Linking.openURL(card.action.value);
                  }}
                />
              ))}
              {message.provisionalDestinations?.map((destination) => (
                <Pressable
                  key={destination.id}
                  onPress={() => {
                    track(ANALYTICS_EVENTS.DESTINATION_CANDIDATE_VIEWED, {
                      candidateStatus: destination.status,
                      sourceCountBucket: destination.sources.length >= 5 ? '5+' : String(destination.sources.length),
                    });
                    router.push(`/destinations/provisional/${destination.id}`);
                  }}
                  style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accent, gap: spacing.xs }}
                >
                  <Text variant="labelSm" style={{ color: colors.accent }}>PROVISIONAL DESTINATION</Text>
                  <Text variant="h3">{destination.name}, {destination.country}</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>{destination.summary}</Text>
                  <Text variant="caption">Provider-backed suggestions are available now; editorial and LGBTQ+ context are still under review.</Text>
                </Pressable>
              ))}
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
        {loading && status ? <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>{status}</Text> : null}
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
