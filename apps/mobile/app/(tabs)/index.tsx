import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { DestinationHeroImage } from '../../components/ui/DestinationHeroImage';
import { OutingIcon, type OutingIconName } from '../../components/ui/OutingIcon';
import { RouteLine } from '../../components/ui/RouteLine';
import {
  useAuth,
  useDestinations,
  useTravelProfile,
  useTrips,
} from '../../src/providers/AppProviders';
import { useSavedDestinations } from '../../src/providers/SavedDestinationsProvider';
import { featureFlags } from '../../src/lib/featureFlags';
import { useTheme } from '../../src/theme/ThemeProvider';

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

  const activeTrip = trips
    .filter((trip) => !trip.endDate || new Date(`${trip.endDate}T23:59:59`) >= new Date())
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'))[0];
  const pendingDecisions = activeTrip?.polls?.filter((poll) =>
    poll.options.every((option) => !option.votes.includes(user?.id ?? '__guest__')),
  ).length ?? 0;
  const saved = savedSlugs.map((slug) => getBySlug(slug)).filter(Boolean).slice(0, 4);

  const recommendations = useMemo(() => {
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
  }, [getBySlug, profile.defaultInterests, scoring]);

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

      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.xl, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <ActionCard
            title="Find my place"
            detail="Preference match"
            icon="spark"
            accent={colors.accent}
            tint={colors.accentLight}
            onPress={() => router.push('/quiz')}
          />
          <ActionCard
            title="Plan a trip"
            detail="I know where"
            icon="route"
            accent={colors.pool}
            tint={colors.poolLight}
            onPress={() => router.push('/trips/new')}
          />
        </View>
        {featureFlags.assistantV1 ? (
          <Pressable
            onPress={() => router.push('/ask')}
            style={{
              borderRadius: radius['2xl'],
              padding: spacing.lg,
              backgroundColor: colors.plum,
              overflow: 'hidden',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
            }}
          >
            <View style={{ position: 'absolute', right: -35, top: 2, opacity: 0.38 }}>
              <RouteLine color={colors.white} width={200} />
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <OutingIcon name="ask" size={23} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h3" style={{ color: colors.white }}>Ask Outing</Text>
              <Text variant="caption" style={{ color: 'rgba(255,255,255,0.78)' }}>Where to go, when to go, or what to change</Text>
            </View>
            <OutingIcon name="arrow" color={colors.white} size={20} />
          </Pressable>
        ) : null}
      </View>

      {activeTrip ? (
        <Section title="Up next" action="All trips" onAction={() => router.push('/trips')}>
          <Pressable
            onPress={() => router.push(`/trips/${activeTrip.tripId}`)}
            style={{ backgroundColor: colors.surface, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadows.sm }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text variant="h2">{activeTrip.name}</Text>
                <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                  {activeTrip.startDate ? formatDateRange(activeTrip.startDate, activeTrip.endDate) : 'Dates are still open'}
                </Text>
              </View>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.poolLight, alignItems: 'center', justifyContent: 'center' }}>
                <OutingIcon name="route" color={colors.pool} size={23} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <StatusPill label={`${activeTrip.tripPlan?.days.length ?? 0} plan days`} />
              {pendingDecisions ? <StatusPill label={`${pendingDecisions} to vote on`} accent /> : null}
              <StatusPill label={`${activeTrip.travelers} going`} />
            </View>
          </Pressable>
        </Section>
      ) : null}

      {pendingDecisions > 0 && activeTrip ? (
        <Section title="Your group needs you">
          <Pressable
            onPress={() => router.push(`/trips/${activeTrip.tripId}?section=group`)}
            style={{ borderRadius: radius['2xl'], backgroundColor: colors.poolLight, padding: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}
          >
            <OutingIcon name="vote" color={colors.pool} size={30} />
            <View style={{ flex: 1 }}>
              <Text variant="h3">{pendingDecisions} decision{pendingDecisions === 1 ? '' : 's'} waiting</Text>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>Vote so the plan can keep moving.</Text>
            </View>
            <OutingIcon name="arrow" color={colors.pool} size={20} />
          </Pressable>
        </Section>
      ) : null}

      {dateIdea ? (
        <Section title="A date worth considering" action="Compare dates" onAction={() => router.push('/quiz')}>
          <Pressable
            onPress={() => router.push(`/destinations/${dateIdea.destination.slug}`)}
            style={{ borderRadius: radius['2xl'], backgroundColor: colors.accentLight, padding: spacing.lg, gap: spacing.sm, overflow: 'hidden' }}
          >
            <Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1.1, textTransform: 'uppercase' }}>
              {MONTHS[dateIdea.event.month - 1]} · {dateIdea.destination.name}
            </Text>
            <Text variant="h2">{dateIdea.event.name}</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>
              This event overlaps with your preferences. Compare nearby dates against indicative fares before you lock it in.
            </Text>
            <Text variant="labelMd" style={{ color: colors.accent }}>See why it fits →</Text>
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
                style={{ width: 244, height: 290, borderRadius: radius['2xl'], overflow: 'hidden', backgroundColor: colors.ink700 }}
              >
                <DestinationHeroImage destination={destination!} style={{ width: '100%', height: '100%' }} />
                <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,13,10,0.25)' }} />
                <View style={{ position: 'absolute', left: spacing.base, right: spacing.base, bottom: spacing.base, gap: spacing.xs }}>
                  <Text variant="labelSm" style={{ color: colors.coral300 }}>
                    {index === 0 ? 'BEST MATCH' : 'ALSO YOUR SPEED'}
                  </Text>
                  <Text variant="displaySm" style={{ color: colors.white }}>{destination!.name}</Text>
                  <Text variant="caption" style={{ color: 'rgba(255,255,255,0.82)' }}>{destination!.country}</Text>
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
                style={{ width: 172, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <DestinationHeroImage destination={destination!} style={{ width: '100%', height: 112 }} />
                <View style={{ padding: spacing.md }}>
                  <Text variant="h3">{destination!.name}</Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>{destination!.country}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      <Section title="Outing notes">
        <View style={{ backgroundColor: colors.backgroundSecondary, padding: spacing.lg, borderRadius: radius['2xl'], gap: spacing.sm }}>
          <Text variant="labelSm" style={{ color: colors.pool, textTransform: 'uppercase', letterSpacing: 1.2 }}>PLAN BETTER TOGETHER</Text>
          <Text variant="h2">Anchor the day. Leave room for a side quest.</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            A group plan works best when one shared highlight gives the day shape and personal suggestions fill the open windows.
          </Text>
        </View>
      </Section>
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
      style={{ flex: 1, minHeight: 154, borderRadius: radius['2xl'], backgroundColor: tint, padding: spacing.base, justifyContent: 'space-between' }}
    >
      <OutingIcon name={icon} color={accent} size={30} />
      <View style={{ gap: 2 }}>
        <Text variant="h3">{title}</Text>
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
    <View style={{ paddingTop: spacing['2xl'], gap: spacing.md }}>
      <View style={{ paddingHorizontal: spacing.base, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="h2">{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction}><Text variant="labelMd" style={{ color: colors.accent }}>{action} →</Text></Pressable>
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
