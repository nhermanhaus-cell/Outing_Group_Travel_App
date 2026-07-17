import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { estimateBudget, generateItinerary } from '@gayi/domain';
import type { BudgetEngineInput, ItineraryInput } from '@gayi/domain';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth, useTrips } from '../../../src/providers/AppProviders';
import { useDestinations } from '../../../src/providers/AppProviders';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { GlamourSelector } from '../../../components/ui/GlamourSelector';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import type { GlamourLevel } from '@gayi/shared';
import type { Destination, Place, TravelPreferences } from '@gayi/shared';

type SectionKey = 'overview' | 'itinerary' | 'budget' | 'polls' | 'members' | 'places' | 'comments';

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'budget', label: 'Budget' },
  { key: 'polls', label: 'Polls' },
  { key: 'members', label: 'Members' },
  { key: 'comments', label: 'Chat' },
];

export default function TripHubScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { getTrip, updateTrip, deleteTrip } = useTrips();
  const { user } = useAuth();
  const { getScoringBySlug } = useDestinations();

  const [section, setSection] = useState<SectionKey>('overview');
  const [comment, setComment] = useState('');
  const [savedGlamour, setSavedGlamour] = useState<GlamourLevel | null>(null);

  const trip = getTrip(tripId ?? '');

  const destScoring = useMemo(
    () => (trip?.destinationSlug ? getScoringBySlug(trip.destinationSlug) : null),
    [trip?.destinationSlug, getScoringBySlug],
  );

  const destination = useMemo<Destination | null>(() => {
    if (!destScoring) return null;
    return destScoring as unknown as Destination;
  }, [destScoring]);

  const glamour = (savedGlamour ?? trip?.glamourLevel ?? 'comfortably_fabulous') as GlamourLevel;

  const budget = useMemo(() => {
    if (!destination) return null;
    try {
      const input: BudgetEngineInput = {
        destination,
        glamourLevel: glamour,
        groupSize: trip?.travelers ?? 2,
        tripDurationDays: getDuration(trip?.startDate, trip?.endDate),
      };
      return estimateBudget(input);
    } catch {
      return null;
    }
  }, [destination, glamour, trip]);

  const itinerary = useMemo(() => {
    if (!destination || !trip) return null;
    try {
      const prefs: TravelPreferences = {
        budgetLevel: glamour,
        departureAirports: trip.origin ? [trip.origin] : [],
        travelMonths: [getCurrentMonth(trip.startDate)],
        tripDurationDays: getDuration(trip.startDate, trip.endDate),
        groupSize: trip.travelers,
        interests: ['nightlife', 'food', 'art', 'pride'] as TravelPreferences['interests'],
        accessibilityNeeds: [],
        nightlifeImportance: 0.6,
        weatherPreference: 'any',
        lgbtqSafetyPriority: 0.8,
        soloTravel: trip.travelers === 1,
        lookingFor: ['community', 'exploration'] as TravelPreferences['lookingFor'],
      };
      const places: Place[] = ((destScoring as { catalog?: { places?: unknown[] } })?.catalog?.places ?? []).map((p: unknown) => {
        const rp = p as Record<string, unknown>;
        return {
          placeId: rp.id as string ?? Math.random().toString(),
          name: rp.name as string ?? '',
          category: (rp.category as string ?? 'other') as Place['category'],
          coords: { lat: rp.lat as number ?? 0, lng: rp.lng as number ?? 0 },
          durationMinutes: rp.durationMinutes as number ?? 60,
          estimatedCostPerPerson: rp.estimatedCostUsd as number ?? 0,
          bookingRequired: false,
          interests: [] as Place['interests'],
          lgbtqRelevance: rp.lgbtqRelevance as string | undefined,
          source: 'sample',
        };
      });
      const input: ItineraryInput = {
        destination,
        places,
        preferences: prefs,
        tripDurationDays: getDuration(trip.startDate, trip.endDate),
      };
      return generateItinerary(input);
    } catch {
      return null;
    }
  }, [destination, trip, glamour, destScoring]);

  const addComment = async () => {
    if (!comment.trim() || !user || !trip) return;
    const newComment = {
      id: `c-${Date.now()}`,
      userId: user.id,
      displayName: user.displayName ?? user.email,
      text: comment.trim(),
      createdAt: new Date().toISOString(),
    };
    await updateTrip(trip.tripId, {
      comments: [...(trip.comments ?? []), newComment],
    });
    setComment('');
  };

  const addPoll = async () => {
    if (!trip) return;
    const poll = {
      id: `p-${Date.now()}`,
      question: 'Where should we go for dinner?',
      options: [
        { id: 'o1', label: 'Local tapas bar', votes: [] },
        { id: 'o2', label: 'Rooftop restaurant', votes: [] },
        { id: 'o3', label: 'Street food tour', votes: [] },
      ],
      createdAt: new Date().toISOString(),
    };
    await updateTrip(trip.tripId, { polls: [...(trip.polls ?? []), poll] });
  };

  const votePoll = async (pollId: string, optionId: string) => {
    if (!trip || !user) return;
    const polls = (trip.polls ?? []).map((poll) => {
      if (poll.id !== pollId) return poll;
      return {
        ...poll,
        options: poll.options.map((opt) => {
          if (opt.id !== optionId) return { ...opt, votes: opt.votes.filter((v) => v !== user.id) };
          return { ...opt, votes: opt.votes.includes(user.id) ? opt.votes.filter((v) => v !== user.id) : [...opt.votes, user.id] };
        }),
      };
    });
    await updateTrip(trip.tripId, { polls });
  };

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: spacing.md }}>
        <Text variant="h3" style={{ color: colors.textTertiary }}>Trip not found</Text>
        <Button variant="secondary" onPress={() => router.back()}>Back</Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: spacing.xs,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ fontSize: 20, color: colors.textSecondary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: spacing.md }}>
            <Text variant="h3" numberOfLines={1}>{trip.name}</Text>
            {trip.destinationName ? (
              <Text variant="caption" style={{ color: colors.textSecondary }}>{trip.destinationName}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => router.push(`/share/${trip.tripId}`)}>
            <Text style={{ fontSize: 18, color: colors.accent }}>⬆</Text>
          </Pressable>
        </View>

        {/* Section tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.xs }}>
          {SECTIONS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setSection(s.key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.full,
                backgroundColor: section === s.key ? colors.accent : colors.backgroundSecondary,
                borderWidth: 1,
                borderColor: section === s.key ? colors.accent : colors.border,
              }}
            >
              <Text variant="labelSm" style={{ color: section === s.key ? colors.textOnAccent : colors.textSecondary }}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: insets.bottom + spacing['4xl'] }}
      >
        {/* ─── Overview ─── */}
        {section === 'overview' && (
          <View style={{ gap: spacing.md }}>
            <Card>
              <View style={{ gap: spacing.sm }}>
                {trip.destinationName ? <InfoRow label="Destination" value={trip.destinationName} /> : null}
                {trip.startDate ? <InfoRow label="Dates" value={`${trip.startDate}${trip.endDate ? ` – ${trip.endDate}` : ''}`} /> : null}
                <InfoRow label="Travelers" value={`${trip.travelers}`} />
                <InfoRow label="Glamour" value={trip.glamourLevel} />
                {trip.origin ? <InfoRow label="Flying from" value={trip.origin} /> : null}
                {trip.budget ? <InfoRow label="Budget" value={`$${trip.budget}`} /> : null}
              </View>
            </Card>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/trips/${trip.tripId}/invite`)}>
                Invite
              </Button>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/share/${trip.tripId}`)}>
                Share
              </Button>
              <Button variant="danger" style={{ flex: 1 }} onPress={() => {
                Alert.alert('Delete trip?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTrip(trip.tripId); router.back(); } },
                ]);
              }}>
                Delete
              </Button>
            </View>
          </View>
        )}

        {/* ─── Itinerary ─── */}
        {section === 'itinerary' && (
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Suggested itinerary</Text>
            {!destination ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                Set a destination to generate an itinerary.
              </Text>
            ) : itinerary === null || itinerary.length === 0 ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                Not enough place data to generate an itinerary yet.
              </Text>
            ) : (
              groupByDay(itinerary).map(({ day, items }) => (
                <View key={day}>
                  <Text variant="labelLg" style={{ marginBottom: spacing.sm, color: colors.accent }}>Day {day}</Text>
                  {items.map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
                      <View style={{ width: 40, alignItems: 'center' }}>
                        <Text variant="caption" style={{ color: colors.textTertiary }}>{item.time}</Text>
                        {i < items.length - 1 && (
                          <View style={{ flex: 1, width: 1, backgroundColor: colors.border, marginTop: spacing.xs }} />
                        )}
                      </View>
                      <Card style={{ flex: 1 }}>
                        <Text variant="labelLg">{item.title}</Text>
                        <Text variant="caption" style={{ color: colors.textSecondary }}>{item.category} · {item.duration}min</Text>
                        {item.lgbtqRelevance ? <Text variant="caption" style={{ color: colors.accent }}>✦ {item.lgbtqRelevance}</Text> : null}
                        <Text variant="caption" style={{ color: colors.textTertiary }}>{item.whySelected}</Text>
                      </Card>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {/* ─── Budget ─── */}
        {section === 'budget' && (
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Budget estimate</Text>
            <GlamourSelector value={glamour} onChange={setSavedGlamour} />
            {!budget ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                Set a destination with cost data to estimate budget.
              </Text>
            ) : (
              <View style={{ gap: spacing.md }}>
                <Card elevated>
                  <View style={{ gap: spacing.sm }}>
                    <Text variant="h2">
                      ${budget.perPerson.total.low.toLocaleString()} – ${budget.perPerson.total.high.toLocaleString()}
                    </Text>
                    <Text variant="bodyMd" style={{ color: colors.textSecondary }}>per person</Text>
                    <Text variant="caption" style={{ color: colors.textTertiary }}>
                      Group total: ${budget.groupTotal.total.low.toLocaleString()} – ${budget.groupTotal.total.high.toLocaleString()}
                    </Text>
                  </View>
                </Card>
                {Object.entries(budget.perPerson.categories).map(([cat, line]) => (
                  cat !== 'flights' ? (
                    <ProgressBar
                      key={cat}
                      label={cat}
                      value={Math.round((line.high / budget.perPerson.total.high) * 100)}
                      showValue
                    />
                  ) : null
                ))}
                {budget.assumptions.length > 0 && (
                  <View style={{ gap: spacing.xs }}>
                    <Text variant="labelMd" style={{ color: colors.textSecondary }}>Assumptions</Text>
                    {budget.assumptions.map((a, i) => (
                      <Text key={i} variant="caption" style={{ color: colors.textTertiary }}>◦ {a}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ─── Polls ─── */}
        {section === 'polls' && (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="h3">Group polls</Text>
              <Button size="sm" variant="secondary" onPress={addPoll}>+ Add poll</Button>
            </View>
            {(trip.polls ?? []).length === 0 ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>No polls yet. Create one!</Text>
            ) : (
              (trip.polls ?? []).map((poll) => (
                <Card key={poll.id} elevated>
                  <Text variant="h4" style={{ marginBottom: spacing.sm }}>{poll.question}</Text>
                  {poll.options.map((opt) => {
                    const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
                    const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                    const voted = user ? opt.votes.includes(user.id) : false;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => user && votePoll(poll.id, opt.id)}
                        style={{ marginBottom: spacing.sm }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xxs }}>
                          <Text variant="bodyMd" style={{ color: voted ? colors.accent : colors.textPrimary }}>{opt.label}</Text>
                          <Text variant="caption" style={{ color: colors.textSecondary }}>{opt.votes.length} vote{opt.votes.length !== 1 ? 's' : ''}</Text>
                        </View>
                        <ProgressBar value={pct} color={voted ? colors.accent : undefined} />
                      </Pressable>
                    );
                  })}
                </Card>
              ))
            )}
          </View>
        )}

        {/* ─── Members ─── */}
        {section === 'members' && (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="h3">Members</Text>
              <Button size="sm" variant="secondary" onPress={() => router.push(`/trips/${trip.tripId}/invite`)}>Invite</Button>
            </View>
            {(trip.members ?? []).map((m) => (
              <Card key={m.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="bodyMd">{m.displayName}</Text>
                  <Badge label={m.role} variant={m.role === 'owner' ? 'accent' : 'default'} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* ─── Comments ─── */}
        {section === 'comments' && (
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Trip chat</Text>
            {(trip.comments ?? []).length === 0 ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>No messages yet.</Text>
            ) : (
              (trip.comments ?? []).map((c) => (
                <View key={c.id} style={{ gap: spacing.xxs }}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' }}>
                    <Text variant="labelMd">{c.displayName}</Text>
                    <Text variant="caption" style={{ color: colors.textTertiary }}>{formatTime(c.createdAt)}</Text>
                  </View>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{c.text}</Text>
                </View>
              ))
            )}
            {user ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Add a message…"
                  placeholderTextColor={colors.textTertiary}
                  style={{
                    flex: 1,
                    backgroundColor: colors.backgroundSecondary,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    color: colors.textPrimary,
                    fontSize: 14,
                  }}
                  onSubmitEditing={addComment}
                />
                <Button size="sm" onPress={addComment}>Send</Button>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
      <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{label}</Text>
      <Text variant="labelMd">{value}</Text>
    </View>
  );
}

function getDuration(startDate?: string, endDate?: string): number {
  if (!startDate || !endDate) return 7;
  try {
    const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  } catch { return 7; }
}

function getCurrentMonth(startDate?: string): number {
  if (!startDate) return new Date().getMonth() + 1;
  try { return new Date(startDate).getMonth() + 1; } catch { return 6; }
}

function groupByDay(items: Array<{ day: number; time: string; title: string; category: string; duration: number; lgbtqRelevance?: string; whySelected: string }>) {
  const map = new Map<number, typeof items>();
  for (const item of items) {
    if (!map.has(item.day)) map.set(item.day, []);
    map.get(item.day)!.push(item);
  }
  return Array.from(map.entries()).map(([day, items]) => ({ day, items }));
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}
