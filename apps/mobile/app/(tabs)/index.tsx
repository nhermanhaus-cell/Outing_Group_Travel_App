import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { DestinationHeroImage } from '../../components/ui/DestinationHeroImage';
import { OutingIcon, type OutingIconName } from '../../components/ui/OutingIcon';
import {
  useAuth,
  useDestinations,
  useTravelProfile,
  useTrips,
} from '../../src/providers/AppProviders';
import { useSavedDestinations } from '../../src/providers/SavedDestinationsProvider';
import { featureFlags } from '../../src/lib/featureFlags';
import { loadAssistantInsights } from '../../src/lib/assistant-api';
import { useTheme } from '../../src/theme/ThemeProvider';
import { DecisionBriefCard } from '../../components/assistant/DecisionBriefCard';
import { deriveHomeJourney, isActivityPreferenceSessionComplete } from '@gayi/domain';
import { CONTENT_DENSITY } from '../../src/lib/content-density';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function HomeScreen() {
  const { colors, spacing, radius, shadows } = useTheme();
  const { user } = useAuth();
  const { trips } = useTrips();
  const { catalog, scoring, getBySlug } = useDestinations();
  const { profile } = useTravelProfile();
  const { slugs: savedSlugs } = useSavedDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const journey = useMemo(() => deriveHomeJourney(trips.map((trip) => ({
    tripId: trip.tripId,
    destinationName: trip.destinationName,
    destinationTimezone: trip.destinationSlug ? getBySlug(trip.destinationSlug)?.timezone : undefined,
    startDate: trip.startDate,
    endDate: trip.endDate,
    hasLodging: trip.lodgingStatus === 'booked',
    hasBlockingPlanIssue: trip.tripPlan?.days.some((day) => day.reservationRisk === 'high') ?? false,
    pendingVoteCount: trip.polls?.filter((poll) =>
      poll.options.every((option) => !option.votes.includes(user?.id ?? '__guest__')),
    ).length ?? 0,
    tasteDeckComplete: trip.activityPreferenceSessionComplete === true || isActivityPreferenceSessionComplete(
      (trip.activityPreferences ?? []).filter((vote) => vote.memberId === (user?.id ?? `owner-${trip.tripId}`)),
      Number.POSITIVE_INFINITY,
    ),
  })), { hasOpportunity: scoring.length > 0 }), [getBySlug, scoring.length, trips, user?.id]);
  const activeTrip = trips.find((trip) => trip.tripId === journey.trip?.tripId);
  const activeDestination = activeTrip?.destinationSlug ? getBySlug(activeTrip.destinationSlug) : undefined;
  const pendingDecisions = activeTrip?.polls?.filter((poll) =>
    poll.options.every((option) => !option.votes.includes(user?.id ?? '__guest__')),
  ).length ?? 0;
  const saved = savedSlugs.map((slug) => getBySlug(slug)).filter(Boolean).slice(0, 4);
  const assistantInsights = useQuery({
    queryKey: ['assistant-insights', 'home', user?.id],
    queryFn: ({ signal }) => loadAssistantInsights({ surface: 'home', trigger: 'screen', force: false }, signal),
    enabled: Boolean(user && featureFlags.proactiveInsightsV1),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const destinationInsight = assistantInsights.data?.insights.find((insight) => insight.kind === 'destination_matches');
  const decisionInsight = assistantInsights.data?.insights.find((insight) => insight.kind === 'decision_brief');
  const serverRecommendations = destinationInsight?.recommendations.filter((item) => item.kind === 'destination') ?? [];
  const serverRecommendationBySlug = new Map(serverRecommendations.map((item) => [item.destinationSlug, item]));

  const recommendations = useMemo(() => {
    if (serverRecommendations.length) {
      return serverRecommendations
        .map((recommendation) => recommendation.destinationSlug ? getBySlug(recommendation.destinationSlug) : undefined)
        .filter(Boolean)
        .slice(0, 3);
    }
    const interests = new Set(profile.defaultInterests);
    return scoring
      .map((destination) => ({
        destination,
        score: destination.interests.filter((interest) =>
          interests.has(interest as never) ||
          (interest === 'art_culture' && (interests.has('art') || interests.has('culture'))) ||
          (interest === 'outdoors' && interests.has('hiking')),
        ).length,
      }))
      .sort((a, b) => b.score - a.score || b.destination.communityScore - a.destination.communityScore)
      .map(({ destination }) => getBySlug(destination.slug))
      .filter(Boolean)
      .slice(0, 3);
  }, [getBySlug, profile.defaultInterests, scoring, serverRecommendations]);

  const dateIdea = useMemo(() => {
    const match = scoring
      .flatMap((destination) => destination.upcomingEvents.map((event) => ({ destination, event })))
      .find(({ event, destination }) =>
        event.month >= new Date().getMonth() + 1 &&
        (profile.defaultInterests.includes('pride') && event.type === 'pride' ||
          profile.defaultInterests.includes('music') && event.type === 'festival' ||
          destination.slug === recommendations[0]?.slug),
      );
    return match ?? scoring[0]?.upcomingEvents[0]
      ? match ?? { destination: scoring[0]!, event: scoring[0]!.upcomingEvents[0]! }
      : null;
  }, [profile.defaultInterests, recommendations, scoring]);

  if (!featureFlags.homeV2) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg }}>
        <Text variant="displayLg">Go somewhere that gets you.</Text>
        <Text variant="bodyLg" style={{ color: colors.textSecondary }}>Personalized trips, better group decisions, and every useful detail in one plan.</Text>
        <Button size="lg" onPress={() => router.push('/quiz')}>Find my trip</Button>
        <Button variant="secondary" onPress={() => router.push('/discover')}>Explore destinations</Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing['5xl'],
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: spacing.base, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h3" style={{ letterSpacing: 1.6 }}>OUTING</Text>
          <Pressable accessibilityLabel="Open profile" hitSlop={12} onPress={() => router.push('/profile')}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="labelMd" style={{ color: colors.plum }}>
                {(user?.displayName ?? user?.email ?? 'You').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          </Pressable>
        </View>
        <Text variant="displayMd" style={{ marginTop: spacing.md }}>
          {activeTrip ? `Ready for ${activeTrip.destinationName ?? 'what’s next'}?` : 'What are we getting into?'}
        </Text>
        <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
          {activeTrip
            ? 'Your plan, decisions, and new ideas are waiting.'
            : 'Start with your mood. Outing will help with the place, people, timing, and plan.'}
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.lg, gap: spacing.md }}>
        {featureFlags.outingFullExperienceV1 ? <Pressable
          accessibilityRole="button"
          onPress={() => router.push(journey.nextAction.href as Href)}
          style={{ borderRadius: radius.xl, padding: spacing.base, backgroundColor: journey.nextAction.blocking ? colors.accentLight : colors.poolLight, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <OutingIcon name={journey.nextAction.blocking ? 'vote' : 'spark'} color={journey.nextAction.blocking ? colors.accent : colors.pool} size={21} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="labelSm" style={{ color: journey.nextAction.blocking ? colors.accent : colors.pool }}>
              {journey.state.replace('_', ' ').toUpperCase()} · NEXT
            </Text>
            <Text variant="h3" numberOfLines={1}>{journey.nextAction.title}</Text>
            <Text variant="caption" numberOfLines={2} style={{ color: colors.textSecondary }}>{journey.nextAction.summary}</Text>
          </View>
          <OutingIcon name="arrow" color={journey.nextAction.blocking ? colors.accent : colors.pool} size={18} />
        </Pressable> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <ActionCard title="Find a place" detail="Match" icon="spark" accent={colors.accent} tint={colors.accentLight} onPress={() => router.push('/quiz')} />
          <ActionCard title="Plan a trip" detail="Start" icon="route" accent={colors.pool} tint={colors.poolLight} onPress={() => router.push('/trips/new')} />
          {featureFlags.outingFullExperienceV1 ? <ActionCard title="Import idea" detail="Save it" icon="image" accent={colors.pool} tint={colors.poolLight} onPress={() => router.push('/inspiration/new' as Href)} /> : null}
          {featureFlags.assistantV1 ? <ActionCard title="Ask Outing" detail="Get advice" icon="ask" accent={colors.plum} tint={colors.plumLight} onPress={() => router.push('/ask')} /> : null}
        </ScrollView>
      </View>

      {featureFlags.decisionBriefsV1 && decisionInsight?.decisionCard ? (
        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.xl }}>
          <DecisionBriefCard card={decisionInsight.decisionCard} surface="home" />
        </View>
      ) : null}

      {activeTrip ? (
        <Section title="Up next" action="All trips" onAction={() => router.push('/trips')}>
          <Pressable
            onPress={() => router.push(`/trips/${activeTrip.tripId}`)}
            style={{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', flexDirection: 'row', minHeight: 118, ...shadows.sm }}
          >
            {activeDestination ? <DestinationHeroImage destination={activeDestination} style={{ width: 118, alignSelf: 'stretch' }} /> : <View style={{ width: 96, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}><OutingIcon name="route" color={colors.plum} size={28} /></View>}
            <View style={{ flex: 1, padding: spacing.md, gap: spacing.xs, justifyContent: 'center' }}>
              <Text variant="h3" numberOfLines={1}>{activeTrip.name}</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {activeTrip.startDate ? formatDateRange(activeTrip.startDate, activeTrip.endDate) : 'Dates are still open'} · {activeTrip.travelers} going
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <StatusPill label={`${activeTrip.tripPlan?.days.length ?? 0} days`} />
                {pendingDecisions ? <StatusPill label={`${pendingDecisions} to vote`} accent /> : null}
              </View>
            </View>
          </Pressable>
        </Section>
      ) : null}

      {dateIdea ? (
        <Section title="A date worth considering" action="Compare dates" onAction={() => router.push('/quiz')}>
          <Pressable
            onPress={() => router.push(`/destinations/${dateIdea.destination.slug}`)}
            style={{ borderRadius: radius.xl, backgroundColor: colors.accentLight, padding: spacing.base, gap: spacing.xs, overflow: 'hidden' }}
          >
            <Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1.1, textTransform: 'uppercase' }}>
              {MONTHS[dateIdea.event.month - 1]} · {dateIdea.destination.name}
            </Text>
            <Text variant="h2">{dateIdea.event.name}</Text>
            <Text variant="caption" numberOfLines={2} style={{ color: colors.textSecondary }}>Matches your interests. Compare nearby dates and indicative fares.</Text>
          </Pressable>
        </Section>
      ) : null}

      {recommendations.length ? (
        <Section title="Feels like you" action="See all" onAction={() => router.push('/discover')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            {recommendations.map((destination, index) => (
              <Pressable
                key={destination!.slug}
                onPress={() => router.push(`/destinations/${destination!.slug}`)}
                style={{ width: CONTENT_DENSITY.horizontalCardWidth, gap: spacing.sm }}
              >
                <View style={{ position: 'relative' }}>
                  <DestinationHeroImage destination={destination!} style={{ width: '100%', height: CONTENT_DENSITY.horizontalCardImageHeight, borderRadius: radius.xl }} />
                  <View style={{ position: 'absolute', left: spacing.sm, top: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.surface }}>
                  <Text variant="labelSm" style={{ color: colors.coral300 }}>
                    {serverRecommendationBySlug.get(destination!.slug)?.fitScore !== undefined
                      ? `${Math.round(serverRecommendationBySlug.get(destination!.slug)!.fitScore!)}% MATCH`
                      : index === 0 ? 'BEST MATCH' : 'ALSO YOUR SPEED'}
                  </Text>
                  </View>
                </View>
                <View style={{ gap: 2 }}>
                  <Text variant="h3" numberOfLines={1}>{destination!.name}</Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>{destination!.country}</Text>
                  {serverRecommendationBySlug.get(destination!.slug)?.fitReasons[0] ? (
                    <Text variant="caption" numberOfLines={2} style={{ color: colors.textTertiary }}>
                      {serverRecommendationBySlug.get(destination!.slug)!.fitReasons[0]}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {saved.length ? (
        <Section title="Saved for later" action="Discover" onAction={() => router.push('/discover')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            {saved.map((destination) => (
              <Pressable
                key={destination!.slug}
                onPress={() => router.push(`/destinations/${destination!.slug}`)}
                style={{ width: 154, gap: spacing.sm }}
              >
                <DestinationHeroImage destination={destination!} style={{ width: '100%', height: 118, borderRadius: radius.lg }} />
                <View style={{ gap: 2 }}>
                  <Text variant="h3">{destination!.name}</Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>{destination!.country}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

    </ScrollView>
  );
}

function ActionCard({
  title,
  detail,
  icon,
  accent,
  tint,
  onPress,
}: {
  title: string;
  detail: string;
  icon: OutingIconName;
  accent: string;
  tint: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{ width: 112, minHeight: 92, borderRadius: radius.xl, backgroundColor: tint, padding: spacing.md, justifyContent: 'space-between', gap: spacing.sm }}
    >
      <OutingIcon name={icon} color={accent} size={23} />
      <View style={{ gap: 2 }}>
        <Text variant="labelMd" numberOfLines={1}>{title}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ paddingTop: spacing.xl, gap: spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.base, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="h2">{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}><Text variant="labelMd" style={{ color: colors.textSecondary }}>{action}</Text><OutingIcon name="arrow" size={16} color={colors.textSecondary} /></Pressable>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: spacing.base }}>{children}</View>
    </View>
  );
}

function StatusPill({ label, accent = false }: { label: string; accent?: boolean }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ borderRadius: radius.full, backgroundColor: accent ? colors.accentLight : colors.backgroundSecondary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
      <Text variant="captionBold" style={{ color: accent ? colors.accent : colors.textSecondary }}>{label}</Text>
    </View>
  );
}

function formatDateRange(start: string, end?: string): string {
  const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return end ? `${format(start)} – ${format(end)}` : `From ${format(start)}`;
}
