import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition } from 'react-native-reanimated';
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
import { lookupPlaceById, lookupPlaceByName } from '../../src/lib/googlePlaces';
import {
  createItineraryItemEditProposal,
  resolveItineraryItem,
  updateTripPlanItem,
} from '../../src/lib/itinerary-item-actions';
import { featureFlags } from '../../src/lib/featureFlags';
import { useAuth, useDestinations, useTravelProfile, useTrips } from '../../src/providers/AppProviders';
import { useSavedDestinations } from '../../src/providers/SavedDestinationsProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { OutingIcon } from '../ui/OutingIcon';
import { RouteLine } from '../ui/RouteLine';
import { DecisionBriefCard } from './DecisionBriefCard';
import {
  assistantDisplayText,
  assistantHeroCopy,
  recommendationCardFit,
  recommendationCardSummary,
  recommendationRequestedForItinerary,
  starterCategory,
} from '../../src/lib/assistant-presentation';
import { AssistantThinkingIndicator } from './assistant-thinking-indicator';
import { formatClockTime } from '../../src/lib/display-format';
import { useDisplayPreferences } from '../../src/lib/display-preferences';
import { buildDestinationOverview } from '../../src/lib/destinationOverview';

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

function estimatedPlaceCost(priceLevel?: string): number {
  if (!priceLevel) return 40;
  if (/free|inexpensive|level_?1|^1$/i.test(priceLevel)) return 20;
  if (/moderate|level_?2|^2$/i.test(priceLevel)) return 40;
  if (/very_expensive|level_?4|^4$/i.test(priceLevel)) return 100;
  return 70;
}

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
  const { colors, spacing, radius, shadows } = useTheme();
  const [displayPreferences] = useDisplayPreferences();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const { getBySlug } = useDestinations();
  const { profile } = useTravelProfile();
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
  const anchoredTurnRef = useRef<string | undefined>(undefined);
  const [activeTurnUserId, setActiveTurnUserId] = useState<string>();
  const [expandedSourceMessages, setExpandedSourceMessages] = useState<Set<string>>(() => new Set());
  const [addingRecommendationId, setAddingRecommendationId] = useState<string>();
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
  const heroCopy = useMemo(() => assistantHeroCopy(scope, focus), [focus, scope]);

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
      setActiveTurnUserId(undefined);
      anchoredTurnRef.current = undefined;
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

      let proposalForTrip = proposal;
      const focusedItem = scopedTrip?.tripPlan && focus?.kind === 'itinerary_item'
        ? resolveItineraryItem(scopedTrip.tripPlan.items, focus.itemId)
        : undefined;
      if (
        focusedItem &&
        (proposal.kind === 'add_itinerary_item' || proposal.kind === 'replace_itinerary_item')
      ) {
        proposalForTrip = {
          ...proposal,
          kind: 'replace_itinerary_item',
          payload: { ...proposal.payload, itemId: focus?.kind === 'itinerary_item' ? focus.itemId : proposal.payload.itemId },
        };
      }
      const place = scopedTrip && focusedItem && proposalForTrip.payload.title
        ? await lookupPlaceById(proposalForTrip.payload.placeId ?? '') ?? await lookupPlaceByName(
            proposalForTrip.payload.title,
            scopedTrip.destinationName ?? scopedTrip.name,
            { center: focusedItem.coords },
          )
        : null;
      const placeResolution = place ? {
        placeId: place.placeId,
        title: place.name,
        category: place.category,
        coords: { lat: place.lat, lng: place.lng },
        ...(place.address || place.vicinity ? { address: place.address ?? place.vicinity } : {}),
        estimatedCost: estimatedPlaceCost(place.priceLevel),
        ...(place.rating !== undefined ? { rating: place.rating } : {}),
      } : undefined;
      if (placeResolution) {
        proposalForTrip = {
          ...proposalForTrip,
          payload: {
            ...proposalForTrip.payload,
            title: placeResolution.title,
            placeId: placeResolution.placeId,
            category: placeResolution.category,
            lat: placeResolution.coords.lat,
            lng: placeResolution.coords.lng,
            estimatedCost: placeResolution.estimatedCost,
            ...(placeResolution.address ? { notes: placeResolution.address } : {}),
          },
        };
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
          assistantProposal: proposalForTrip,
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
          applyAssistantProposalToTrip(scopedTrip, proposalForTrip, placeResolution),
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

  const sendToAssistant = async (suggested?: string) => {
    const message = (suggested ?? draft).trim();
    if (!message || loading) return;
    const userMessage: Message = { id: `user-${Date.now()}`, role: 'user', content: message };
    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [...current, userMessage, { id: assistantId, role: 'assistant', content: '' }]);
    anchoredTurnRef.current = undefined;
    setActiveTurnUserId(userMessage.id);
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
    }
  };

  const addRecommendationToItinerary = async (
    recommendation: AssistantRecommendation,
    userText = `Add ${recommendation.title} to my itinerary.`,
  ) => {
    const plan = scopedTrip?.tripPlan;
    const focusedItem = plan && focus?.kind === 'itinerary_item'
      ? resolveItineraryItem(plan.items, focus.itemId)
      : undefined;
    if (!scopedTrip || !plan || !focusedItem || focus?.kind !== 'itinerary_item') {
      await sendToAssistant(userText);
      return;
    }

    const userMessage: Message = { id: `user-add-${Date.now()}-${recommendation.id}`, role: 'user', content: userText };
    setMessages((current) => [...current, userMessage]);
    anchoredTurnRef.current = undefined;
    setActiveTurnUserId(userMessage.id);
    setDraft('');
    setError(undefined);
    setAddingRecommendationId(recommendation.id);
    try {
      const place = await lookupPlaceById(recommendation.providerPlaceId ?? '') ?? await lookupPlaceByName(
        recommendation.title,
        scopedTrip.destinationName ?? scopedTrip.name,
        { center: focusedItem.coords },
      );
      if (!place) throw new Error('Google Places could not verify this listing. Open it in Google Maps and try another result.');
      const targetId = focus.itemId;
      const nextPlan = updateTripPlanItem(plan, targetId, {
        title: place.name,
        summary: [place.category, place.vicinity].filter(Boolean).join(' · '),
        category: place.category,
        placeId: place.placeId,
        coords: { lat: place.lat, lng: place.lng },
        estimatedCost: estimatedPlaceCost(place.priceLevel),
        source: 'google_places',
        confidence: place.rating ? Math.min(0.98, 0.65 + place.rating / 20) : 0.75,
        whySelected: 'Chosen by you from Ask Outing recommendations.',
        kind: 'place',
        locked: true,
        scheduleStatus: 'verified',
      });
      const requiresVote = Boolean(scopedTrip.members?.length) && !canApplyDirectly;
      if (requiresVote) {
        const action = focusedItem.kind === 'meal' || focusedItem.kind === 'downtime' ? 'fill_open_slot' : 'replace_item';
        const proposal = createItineraryItemEditProposal(
          plan,
          nextPlan,
          focusedItem.day,
          action,
          `Add ${place.name} at ${formatClockTime(focusedItem.time, displayPreferences.timeFormat)} on Day ${focusedItem.day}`,
          scopedTrip.tripId,
        );
        await updateTrip(scopedTrip.tripId, {
          tripPlanProposals: [...(scopedTrip.tripPlanProposals ?? []), proposal],
          polls: [...(scopedTrip.polls ?? []), {
            id: `assistant-place-${Date.now()}`,
            question: proposal.summary,
            options: [
              { id: `${proposal.proposalId}-yes`, label: 'Add it to the itinerary', votes: [] },
              { id: `${proposal.proposalId}-no`, label: 'Keep this time open', votes: [] },
            ],
            createdAt: new Date().toISOString(),
            planProposalId: proposal.proposalId,
          }],
        });
        setMessages((current) => [...current, {
          id: `assistant-add-${Date.now()}-${recommendation.id}`,
          role: 'assistant',
          content: `${place.name} is ready for the group to vote on. The itinerary will update if it is accepted.`,
        }]);
      } else {
        await updateTrip(scopedTrip.tripId, {
          tripPlan: nextPlan,
          itineraryItems: nextPlan.items as unknown as Array<Record<string, unknown>>,
        });
        setMessages((current) => [...current, {
          id: `assistant-add-${Date.now()}-${recommendation.id}`,
          role: 'assistant',
          content: `Added ${place.name} at ${formatClockTime(focusedItem.time, displayPreferences.timeFormat)} on Day ${focusedItem.day}.`,
        }]);
      }
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      posthog.capture('assistant_recommendation_added_to_itinerary', {
        recommendation_kind: recommendation.kind,
        group_review_required: requiresVote,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'That place could not be added right now.';
      setError(message);
      Alert.alert('Couldn’t add this place', message);
    } finally {
      setAddingRecommendationId(undefined);
    }
  };

  const send = async (suggested?: string) => {
    const message = (suggested ?? draft).trim();
    const recentRecommendations = [...messages].reverse().find((item) => item.recommendations?.length)?.recommendations ?? [];
    const selected = focus?.kind === 'itinerary_item'
      ? recommendationRequestedForItinerary(message, recentRecommendations)
      : undefined;
    if (selected) {
      await addRecommendationToItinerary(selected, message);
      return;
    }
    await sendToAssistant(suggested);
  };

  const openRecommendationListing = (recommendation: AssistantRecommendation) => {
    const url = recommendation.googleMapsUrl ?? (
      recommendation.action?.type === 'open_url' ? recommendation.action.value : undefined
    );
    if (url && /^https:\/\//i.test(url)) {
      void Linking.openURL(url);
      return;
    }
    const destination = scopedTrip?.destinationName ?? '';
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${recommendation.title} ${destination}`.trim())}`);
  };

  const chooseRecommendationAction = (recommendation: AssistantRecommendation) => {
    const canAddToFocusedSlot = recommendation.kind === 'place' && focus?.kind === 'itinerary_item' && Boolean(scopedTrip?.tripPlan);
    if (!canAddToFocusedSlot) {
      openRecommendationListing(recommendation);
      return;
    }
    Alert.alert(
      recommendation.title,
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Google listing', onPress: () => openRecommendationListing(recommendation) },
        { text: 'Add to itinerary', onPress: () => void addRecommendationToItinerary(recommendation) },
      ],
    );
  };

  const anchorTurnAtTop = (messageId: string, event: LayoutChangeEvent) => {
    if (messageId !== activeTurnUserId || anchoredTurnRef.current === messageId) return;
    anchoredTurnRef.current = messageId;
    const y = Math.max(0, event.nativeEvent.layout.y - spacing.sm);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: true }));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={86}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: spacing['2xl'] }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={16}
      >
        {scope.kind === 'trip' && !conversationId && onVisibilityChange ? (
          <Animated.View entering={FadeInDown.duration(220)} style={{ padding: spacing.sm, borderRadius: radius.full, backgroundColor: colors.backgroundSecondary, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="captionBold" style={{ color: colors.textSecondary, paddingLeft: spacing.sm }}>Keep chat</Text>
            <View style={{ flex: 1, flexDirection: 'row', gap: spacing.xs }}>
              {(['private', 'trip_shared'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
                    onVisibilityChange(option);
                  }}
                  style={{
                    flex: 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.full,
                    backgroundColor: visibility === option ? colors.accentLight : colors.surface,
                    alignItems: 'center',
                  }}
                >
                  <Text variant="labelSm" style={{ color: visibility === option ? colors.accent : colors.textSecondary }}>{option === 'private' ? 'Just me' : 'The group'}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {messages.length === 0 ? (
          <Animated.View entering={FadeIn.duration(240)} style={{ gap: spacing.lg }}>
            <View style={{ minHeight: 190, padding: spacing.xl, borderRadius: radius['2xl'], backgroundColor: colors.ink700, overflow: 'hidden', justifyContent: 'flex-end', gap: spacing.sm }}>
              <View style={{ position: 'absolute', right: -18, top: 6, opacity: 0.34 }}><RouteLine color={colors.coral300} width={220} /></View>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <OutingIcon name="spark" color={colors.coral300} size={22} />
              </View>
              <Text variant="labelSm" style={{ color: colors.coral300, letterSpacing: 1.2 }}>{heroCopy.eyebrow}</Text>
              <Text variant="displaySm" style={{ color: colors.white }}>{heroCopy.title}</Text>
              <Text variant="bodySm" style={{ color: 'rgba(255,255,255,0.76)', lineHeight: 20 }}>{heroCopy.summary}</Text>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text variant="h3">Start with one of these</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {starters.map((starter, index) => (
                  <Animated.View key={starter} entering={FadeInUp.duration(220).delay(index * 45)} style={{ width: '48%', flexGrow: 1 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
                        void send(starter);
                      }}
                      style={({ pressed }) => ({ minHeight: 118, padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'space-between', gap: spacing.sm, opacity: pressed ? 0.72 : 1, borderCurve: 'continuous' })}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 0.8 }}>{starterCategory(starter, index)}</Text>
                        <OutingIcon name="arrow" size={15} color={colors.textTertiary} />
                      </View>
                      <Text variant="bodySm" numberOfLines={4} style={{ color: colors.textPrimary, lineHeight: 19 }}>{starter}</Text>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {['Your preferences', 'Current travel data', 'Changes require review'].map((label) => (
                <View key={label} style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.poolLight }}>
                  <Text variant="caption" style={{ color: colors.pool }}>{label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : (
          messages.map((message) => (
            <Animated.View
              key={message.id}
              onLayout={(event) => message.role === 'user' && anchorTurnAtTop(message.id, event)}
              entering={message.role === 'user' ? FadeInUp.duration(180) : FadeIn.duration(220)}
              layout={LinearTransition.duration(180)}
              style={{
                alignSelf: message.role === 'user' ? 'flex-end' : 'stretch',
                maxWidth: message.role === 'user' ? '86%' : '100%',
                paddingHorizontal: message.role === 'user' ? spacing.base : 0,
                paddingVertical: message.role === 'user' ? spacing.md : 0,
                borderRadius: message.role === 'user' ? radius.xl : 0,
                backgroundColor: message.role === 'user' ? colors.ink700 : 'transparent',
                gap: spacing.sm,
              }}
            >
              {message.role === 'assistant' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}>
                    <OutingIcon name="spark" size={15} color={colors.plum} />
                  </View>
                  <Text variant="labelSm" style={{ color: colors.textSecondary, letterSpacing: 1 }}>OUTING</Text>
                </View>
              ) : null}
              {message.content ? (
                <Text selectable variant="bodyMd" style={{ color: message.role === 'user' ? colors.white : colors.textPrimary, lineHeight: 22 }}>
                  {message.role === 'assistant'
                    ? assistantDisplayText(message.content, Boolean(message.recommendations?.length))
                    : message.content}
                </Text>
              ) : (
                <AssistantThinkingIndicator status={status} />
              )}
              {message.recommendations?.map((recommendation) => {
                const scopedDestinationSlug = recommendation.destinationSlug
                  ?? (scope.kind === 'destination' ? scope.destinationSlug : undefined)
                  ?? scopedTrip?.destinationSlug;
                const catalogDestination = scopedDestinationSlug ? getBySlug(scopedDestinationSlug) : undefined;
                const imageUrl = recommendation.imageUrl
                  ?? catalogDestination?.heroImageUrl
                  ?? catalogDestination?.galleryImageUrls?.[0];
                const summary = recommendation.kind === 'destination' && catalogDestination
                  ? recommendationCardSummary(buildDestinationOverview(catalogDestination, profile.defaultInterests).personalizedReason)
                  : recommendationCardSummary(recommendation.summary);
                const fitLine = recommendationCardFit(recommendation.fitReasons);
                return <Pressable
                  key={recommendation.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${recommendation.title}${recommendation.fitScore !== undefined ? `, ${Math.round(recommendation.fitScore)} percent fit` : ''}`}
                  disabled={addingRecommendationId === recommendation.id}
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
                    if (recommendation.kind === 'place') {
                      chooseRecommendationAction(recommendation);
                    } else if (recommendation.action?.type === 'open_destination' && recommendation.destinationSlug) {
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
                  style={({ pressed }) => ({ borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', opacity: pressed ? 0.74 : 1, borderCurve: 'continuous', ...shadows.sm })}
                >
                  <View style={{ flexDirection: 'row', minHeight: 126 }}>
                    {imageUrl ? (
                      <Image
                        accessibilityLabel={`${recommendation.title} destination photo`}
                        source={{ uri: imageUrl }}
                        contentFit="cover"
                        transition={180}
                        style={{ width: 108, alignSelf: 'stretch', backgroundColor: colors.backgroundSecondary }}
                      />
                    ) : (
                      <View style={{ width: 108, alignSelf: 'stretch', backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}>
                        <OutingIcon name={recommendation.kind === 'destination' ? 'discover' : 'pin'} size={26} color={colors.plum} />
                      </View>
                    )}
                    <View style={{ flex: 1, padding: spacing.sm, gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                        <Text variant="labelLg" numberOfLines={2} style={{ flex: 1, lineHeight: 20 }}>{recommendation.title}</Text>
                        {recommendation.fitScore !== undefined ? (
                          <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.poolLight }}>
                            <Text variant="labelSm" style={{ color: colors.pool }}>{Math.round(recommendation.fitScore)}% fit</Text>
                          </View>
                        ) : null}
                      </View>
                      {recommendation.kind !== 'destination' && recommendation.facts.length ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                          {recommendation.facts.slice(0, 2).map((fact) => (
                            <View key={fact} style={{ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.backgroundSecondary }}>
                              <Text variant="caption" numberOfLines={1} style={{ color: colors.textSecondary }}>{fact}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <Text variant="bodySm" numberOfLines={2} style={{ color: colors.textSecondary, lineHeight: 18 }}>{summary}</Text>
                      {fitLine ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                          <OutingIcon name="spark" size={12} color={colors.pool} />
                          <Text variant="caption" numberOfLines={1} style={{ color: colors.pool, flex: 1 }}>{fitLine}</Text>
                        </View>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 'auto' }}>
                        {addingRecommendationId === recommendation.id ? <Text variant="caption" style={{ color: colors.accent, marginRight: spacing.xs }}>Adding…</Text> : null}
                        <OutingIcon name="arrow" size={14} color={colors.accent} />
                      </View>
                    </View>
                  </View>
                  {recommendation.affiliateDisclosure ? <Text variant="caption" numberOfLines={1} style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>{recommendation.affiliateDisclosure}</Text> : null}
                </Pressable>;
              })}
              {message.sources?.length ? (
                <View style={{ gap: spacing.xs }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setExpandedSourceMessages((current) => {
                      const next = new Set(current);
                      if (next.has(message.id)) next.delete(message.id);
                      else next.add(message.id);
                      return next;
                    })}
                    style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary }}
                  >
                    <Text variant="labelSm" style={{ color: colors.textSecondary }}>{message.sources.length} trusted {message.sources.length === 1 ? 'source' : 'sources'}</Text>
                    <View style={{ transform: [{ rotate: expandedSourceMessages.has(message.id) ? '-90deg' : '90deg' }] }}>
                      <OutingIcon name="arrow" size={14} color={colors.textTertiary} />
                    </View>
                  </Pressable>
                  {expandedSourceMessages.has(message.id) ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                      {message.sources.map((source) => (
                        <Pressable key={source.id} disabled={!source.url} onPress={() => source.url && void Linking.openURL(source.url)} style={{ maxWidth: 210, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.poolLight }}>
                          <Text numberOfLines={1} variant="caption" style={{ color: colors.pool }}>{source.label}{source.url ? ' ↗' : ''}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              ) : null}
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
            </Animated.View>
          ))
        )}
        {error ? (
          <View style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.accentLight }}>
            <Text variant="bodySm" style={{ color: colors.error }}>{error}</Text>
          </View>
        ) : null}
        {activeTurnUserId ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ height: Math.max(320, Math.round(windowHeight * 0.58)) }}
          />
        ) : null}
      </ScrollView>

      <Animated.View layout={LinearTransition.duration(180)} style={{ paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: Math.max(spacing.sm, insets.bottom), backgroundColor: colors.background, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: spacing.xs, paddingLeft: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius['2xl'], backgroundColor: colors.surface, ...shadows.sm }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            editable={!loading}
            placeholder={scope.kind === 'trip' ? 'Ask about this trip…' : scope.kind === 'destination' ? 'Ask about this destination…' : 'Ask about a place, date, or plan…'}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={4000}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              backgroundColor: 'transparent',
              color: colors.textPrimary,
              paddingRight: spacing.sm,
              paddingVertical: spacing.sm + 2,
              fontFamily: 'Manrope_400Regular',
              fontSize: 15,
            }}
          />
          {loading ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop response" onPress={() => abortRef.current?.abort()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 13, height: 13, borderRadius: radius.sm, backgroundColor: colors.textSecondary }} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim()} onPress={() => void send()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: draft.trim() ? colors.accent : colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ transform: [{ rotate: '-90deg' }] }}><OutingIcon name="arrow" size={19} color={draft.trim() ? colors.white : colors.textTertiary} /></View>
            </Pressable>
          )}
        </View>
        <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>
          Check important details · Trip changes always require review
        </Text>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
