import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth, useDestinations, useTravelProfile, useTrips } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { GlamourSelector } from '../../components/ui/GlamourSelector';
import type {
  ActivityPace,
  GlamourLevel,
  LookingFor,
  PreferredTransportMode,
  TravelRange,
} from '@gayi/shared';
import {
  ANALYTICS_EVENTS,
  bucketCount,
  bucketDurationDays,
} from '@gayi/shared';
import { featureFlags } from '../../src/lib/featureFlags';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { posthog } from '../../src/config/posthog';
import { TravelerSelector, type GroupType } from '../../components/trip-wizard/TravelerSelector';
import { TripPathChooser } from '../../components/trip-wizard/TripPathChooser';
import type { QuizAnswers } from '../quiz';
import { AirportAutocomplete } from '../../components/trip-wizard/airport-autocomplete';
import { DateField } from '../../components/trip-wizard/date-field';
import { QUIZ_BUDDY_DRAFT_KEY, TravelBuddyPicker } from '../../components/trip-wizard/travel-buddy-picker';
import { airports } from '../../src/content/airports';
import { destinationPlanHref } from '../../src/lib/tripPlanningFlow';
import { useQueries, useQuery } from '@tanstack/react-query';
import { loadIndicativeFlightDeals, loadTicketmasterEvents } from '../../src/lib/travel-api';
import { nearestAirports } from '../../src/content/airports';
import {
  buildTripDateRecommendations,
  upcomingCandidateMonths,
} from '../../src/lib/dateRecommendations';

const NEW_TRIP_BUDDY_DRAFT_KEY = 'gayi:new-trip-travel-buddies';

export default function NewTripScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile, updateProfile } = useTravelProfile();
  const { catalog } = useDestinations();
  const { createTrip } = useTrips();
  const { track } = useAnalytics();
  const params = useLocalSearchParams<{
    destinationSlug?: string;
    destinationName?: string;
    lodgingAddress?: string;
    activityPace?: ActivityPace;
    quizAnswers?: string;
  }>();
  let quizAnswers: Partial<QuizAnswers> = {};
  try { quizAnswers = params.quizAnswers ? JSON.parse(params.quizAnswers) : {}; } catch { /* ignore */ }
  const fromQuiz = Boolean(params.quizAnswers);

  const [loading, setLoading] = useState(false);
  const [creationPath, setCreationPath] = useState<'choose' | 'destination' | 'manual'>(
    params.destinationName || !featureFlags.tripWizardV2 ? 'manual' : 'choose',
  );
  const [destinationQuery, setDestinationQuery] = useState('');
  const primaryAirport = profile.homeAirports.find((airport) => airport.primary) ?? profile.homeAirports[0];

  const [form, setForm] = useState({
    name: params.destinationName ? `${params.destinationName} trip` : '',
    destinationSlug: params.destinationSlug ?? '',
    destinationName: params.destinationName ?? '',
    startDate: '',
    endDate: '',
    origin: quizAnswers.originAirport ?? primaryAirport?.iata ?? '',
    travelers: quizAnswers.groupSize ?? profile.defaultGroupSize ?? 2,
    groupType: (quizAnswers.groupType ?? 'couple') as GroupType,
    collaboratorChoice: quizAnswers.collaboratorChoice,
    glamourLevel: (quizAnswers.glamourLevel ?? 'comfortably_fabulous') as GlamourLevel,
    budget: '',
    lodgingAddress: params.lodgingAddress ?? quizAnswers.lodgingAddress ?? '',
    activityPace:
      params.activityPace === 'packed' ||
      params.activityPace === 'balanced' ||
      params.activityPace === 'downtime'
        ? params.activityPace
        : quizAnswers.activityPace
          ? quizAnswers.activityPace
        : undefined,
    travelRanges: quizAnswers.travelRanges ?? profile.preferredTravelRanges,
    preferredTransportMode: profile.preferredTransportMode,
  });

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const selectedCatalogDestination = useMemo(
    () => catalog.find((destination) => destination.slug === form.destinationSlug),
    [catalog, form.destinationSlug],
  );
  const destinationAirport = useMemo(
    () => selectedCatalogDestination
      ? nearestAirports(selectedCatalogDestination.lat, selectedCatalogDestination.lng, 1)[0]?.airport
      : undefined,
    [selectedCatalogDestination],
  );
  const recommendationMonths = useMemo(
    () => upcomingCandidateMonths(new Date(), quizAnswers.months ?? [], 6),
    [quizAnswers.months],
  );
  const fareQueries = useQueries({
    queries: recommendationMonths.map((month) => ({
      queryKey: [
        'trip-date-fare-window-v1',
        form.origin,
        destinationAirport?.iata,
        month,
        quizAnswers.duration,
      ],
      queryFn: () => loadIndicativeFlightDeals({
        originIata: form.origin,
        destinationIata: destinationAirport!.iata,
        departureMonth: month,
        returnMonth: month,
        limit: 12,
      }),
      enabled: Boolean(fromQuiz && form.origin && destinationAirport?.iata),
      staleTime: 6 * 60 * 60_000,
      retry: 1,
    })),
  });
  const liveEventsQuery = useQuery({
    queryKey: [
      'trip-date-live-events-v1',
      selectedCatalogDestination?.slug,
      quizAnswers.interests?.join(','),
    ],
    queryFn: () => loadTicketmasterEvents(
      selectedCatalogDestination!.lat,
      selectedCatalogDestination!.lng,
      {
        startDate: new Date().toISOString().slice(0, 10),
        endDate: futureIsoDate(365),
        limit: 20,
      },
    ),
    enabled: Boolean(fromQuiz && selectedCatalogDestination),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
  const dateRecommendations = useMemo(() => {
    if (!selectedCatalogDestination || !destinationAirport || !form.origin) return [];
    const fareObservations = fareQueries.flatMap((query, index) => {
      const deal = query.data?.deals.find((candidate) =>
        !candidate.destinationIata
        || candidate.destinationIata.toUpperCase() === destinationAirport.iata.toUpperCase());
      return deal ? [{ requestedMonth: recommendationMonths[index]!, deal }] : [];
    });
    const catalogEvents = (selectedCatalogDestination.events ?? []).flatMap((event) =>
      event.id && event.title && event.startDate
        ? [{
            id: event.id,
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            category: event.category,
          }]
        : []);
    const liveEvents = (liveEventsQuery.data?.events ?? []).flatMap((event) =>
      event.startDate
        ? [{
            id: `ticketmaster-${event.id}`,
            title: event.name,
            startDate: event.startDate,
            category: event.genre,
          }]
        : []);
    return buildTripDateRecommendations({
      originIata: form.origin,
      destinationIata: destinationAirport.iata,
      durationDays: quizAnswers.duration ?? 7,
      fareObservations,
      events: [...catalogEvents, ...liveEvents],
      bestMonths: selectedCatalogDestination.bestMonths,
      preferences: {
        interests: quizAnswers.interests ?? [],
        goals: quizAnswers.tripGoals ?? [],
        hallmarkIds: quizAnswers.hallmarkIds ?? [],
        nightlife: quizAnswers.nightlife ?? 0,
        preferredMonths: quizAnswers.months ?? [],
      },
    });
  }, [
    destinationAirport,
    fareQueries,
    form.origin,
    liveEventsQuery.data?.events,
    quizAnswers.duration,
    quizAnswers.hallmarkIds,
    quizAnswers.interests,
    quizAnswers.months,
    quizAnswers.nightlife,
    quizAnswers.tripGoals,
    recommendationMonths,
    selectedCatalogDestination,
  ]);
  const dateRecommendationsLoading = fareQueries.some((query) => query.isLoading);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const trip = await createTrip({
        name: form.name || 'Untitled trip',
        destinationSlug: form.destinationSlug || undefined,
        destinationName: form.destinationName || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        origin: form.origin || undefined,
        travelers: form.travelers,
        glamourLevel: form.glamourLevel,
        budget: form.budget ? parseInt(form.budget, 10) : undefined,
        lodgingAddress: form.lodgingAddress || undefined,
        activityPace: form.activityPace,
        lodgingStatus: quizAnswers.lodgingStatus,
        interests: quizAnswers.mealPreferences?.includes('food_low_priority')
          ? quizAnswers.interests?.filter((interest) => interest !== 'food') as never[] | undefined
          : quizAnswers.mealPreferences?.some((preference) => preference !== 'food_low_priority')
            ? Array.from(new Set([...(quizAnswers.interests ?? []), 'food'])) as never[]
            : quizAnswers.interests as never[] | undefined,
        nightlifeImportance: quizAnswers.nightlife !== undefined
          ? Math.max(0, Math.min(1, quizAnswers.nightlife / 5))
          : undefined,
        lookingFor: deriveLookingForFromQuiz(quizAnswers),
        planningPreferences: {
          goals: quizAnswers.tripGoals ?? [],
          vacationStyles: quizAnswers.vacationStyles ?? [],
          dayRhythm: quizAnswers.dayRhythm ?? 'flexible',
          mealPreferences: quizAnswers.mealPreferences ?? [],
          avoidances: quizAnswers.avoidances ?? [],
          hallmarkIds: quizAnswers.hallmarkIds ?? [],
          hallmarkNames: quizAnswers.hallmarkNames ?? [],
          ...(quizAnswers.freeformWish?.trim()
            ? { freeformWish: quizAnswers.freeformWish.trim() }
            : {}),
        },
        travelRanges: form.travelRanges,
        preferredTransportMode: form.preferredTransportMode,
        members: [{ id: user?.id ?? 'local-owner', displayName: user?.displayName ?? user?.email ?? 'You', role: 'owner' }],
      });
      const durationDays = form.startDate && form.endDate
        ? Math.max(
            1,
            Math.round(
              (new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) /
              (24 * 60 * 60 * 1000),
            ) + 1,
          )
        : undefined;
      track(ANALYTICS_EVENTS.TRIP_CREATED, {
        creationPath: fromQuiz ? 'recommendations' : 'manual',
        groupType: form.groupType,
        travelerCountBucket: bucketCount(form.travelers),
        ...(durationDays ? { durationBucket: bucketDurationDays(durationDays) } : {}),
        destinationPrefilled: Boolean(params.destinationSlug),
      });
      posthog.capture('trip_created', {
        creation_path: fromQuiz ? 'recommendations' : 'manual',
        group_type: form.groupType,
        traveler_count_bucket: bucketCount(form.travelers),
        ...(durationDays ? { duration_bucket: bucketDurationDays(durationDays) } : {}),
        destination_prefilled: Boolean(params.destinationSlug),
        glamour_level: form.glamourLevel,
      });
      const airportCode = form.origin.trim().toUpperCase();
      const selectedAirport = airports.find((airport) => airport.iata === airportCode);
      await updateProfile({
        preferredTravelRanges: form.travelRanges,
        preferredTransportMode: form.preferredTransportMode,
        defaultGroupSize: form.travelers,
        ...(airportCode ? { homeAirports: [{ iata: airportCode, name: selectedAirport?.name ?? airportCode, ...(selectedAirport ? { city: selectedAirport.city, countryCode: selectedAirport.countryCode, coords: { lat: selectedAirport.lat, lng: selectedAirport.lng } } : {}), primary: true, source: 'manual' as const }, ...profile.homeAirports.filter((airport) => airport.iata !== airportCode).map((airport) => ({ ...airport, primary: false }))] } : {}),
      });
      if (form.groupType !== 'solo' && form.collaboratorChoice === 'now') {
        const sourceKey = fromQuiz ? QUIZ_BUDDY_DRAFT_KEY : NEW_TRIP_BUDDY_DRAFT_KEY;
        const selected = await SecureStore.getItemAsync(sourceKey);
        if (selected) await SecureStore.setItemAsync(`gayi:pending-invites:${trip.tripId}`, selected);
        await SecureStore.deleteItemAsync(sourceKey);
      }
      router.replace(form.groupType !== 'solo' && form.collaboratorChoice === 'now' ? `/trips/${trip.tripId}/invite` : `/trips/${trip.tripId}`);
    } catch (error) {
      track(ANALYTICS_EVENTS.OPERATION_FAILED, {
        operation: 'trip_create',
        errorCategory: error instanceof Error ? 'create_failed' : 'unknown',
        sourceScreen: '/trips/new',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  if (creationPath === 'choose') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.lg }}>
        <View style={{ paddingHorizontal: spacing.base, gap: spacing.xs }}>
          <Pressable onPress={() => router.back()} style={{ paddingVertical: spacing.sm }}>
            <Text style={{ fontSize: 20, color: colors.textSecondary }}>←</Text>
          </Pressable>
          <Text variant="displayMd">Start a new trip</Text>
          <Text variant="bodyLg" style={{ color: colors.textSecondary }}>
            Find your next destination, or begin with a flexible draft.
          </Text>
        </View>
        <TripPathChooser
          onRecommend={() => {
            track(ANALYTICS_EVENTS.TRIP_CREATION_PATH_SELECTED, {
              path: 'recommendations',
              entryPoint: 'new_trip',
            });
            posthog.capture('trip_creation_path_selected', { path: 'recommendations', entry_point: 'new_trip' });
            router.push('/quiz');
          }}
          onManual={() => {
            track(ANALYTICS_EVENTS.TRIP_CREATION_PATH_SELECTED, {
              path: 'manual',
              entryPoint: 'new_trip',
            });
            posthog.capture('trip_creation_path_selected', { path: 'manual', entry_point: 'new_trip' });
            setCreationPath('destination');
          }}
        />
      </View>
    );
  }

  if (creationPath === 'destination') {
    const needle = destinationQuery.trim().toLowerCase();
    const destinationOptions = catalog
      .filter((destination) =>
        !needle
        || destination.name.toLowerCase().includes(needle)
        || destination.country.toLowerCase().includes(needle))
      .slice(0, 12);
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.lg }}>
        <View style={{ paddingHorizontal: spacing.base, gap: spacing.md, flex: 1 }}>
          <Pressable onPress={() => setCreationPath('choose')} style={{ paddingVertical: spacing.sm }}>
            <Text style={{ fontSize: 20, color: colors.textSecondary }}>←</Text>
          </Pressable>
          <View style={{ gap: spacing.xs }}>
            <Text variant="displayMd">Where are you going?</Text>
            <Text variant="bodyLg" style={{ color: colors.textSecondary }}>
              We’ll tailor the next questions to what is actually available there.
            </Text>
          </View>
          <StyledInput
            value={destinationQuery}
            onChangeText={setDestinationQuery}
            placeholder="Search city or country"
            autoFocus
          />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}>
            {destinationOptions.map((destination) => (
              <Pressable
                key={destination.slug}
                onPress={() => {
                  track(ANALYTICS_EVENTS.TRIP_CREATION_PATH_SELECTED, {
                    path: 'manual',
                    entryPoint: 'new_trip',
                  });
                  router.push(destinationPlanHref({
                    destinationSlug: destination.slug,
                    destinationName: destination.name,
                  }));
                }}
                style={{
                  padding: spacing.base,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.cardBackground,
                  gap: spacing.xxs,
                }}
              >
                <Text variant="labelLg">{destination.name}</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>{destination.country}</Text>
              </Pressable>
            ))}
            <Button variant="ghost" onPress={() => setCreationPath('manual')}>
              My destination isn’t listed
            </Button>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: spacing.base,
            paddingBottom: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable onPress={() => router.back()}>
            <Text style={{ fontSize: 20, color: colors.textSecondary }}>✕</Text>
          </Pressable>
          <Text variant="h3">New trip</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: insets.bottom + 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Trip name">
            <StyledInput
              value={form.name}
              onChangeText={(v) => set('name', v)}
              placeholder="e.g. Summer in Barcelona"
            />
          </Field>

          <Field label="Destination" optional>
            <StyledInput
              value={form.destinationName}
              onChangeText={(v) => set('destinationName', v)}
              placeholder="e.g. Barcelona"
            />
          </Field>

          <View style={{ gap: spacing.md }}>
            {fromQuiz && selectedCatalogDestination ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ gap: spacing.xxs }}>
                  <Text variant="h3">Recommended dates</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                    Based on indicative fare observations and events matching your preferences.
                  </Text>
                </View>
                {dateRecommendationsLoading && dateRecommendations.length === 0 ? (
                  <Text variant="caption" style={{ color: colors.textTertiary }}>
                    Comparing upcoming fare windows…
                  </Text>
                ) : null}
                {dateRecommendations.map((recommendation) => (
                  <View
                    key={recommendation.id}
                    style={{
                      padding: spacing.md,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.cardBackground,
                      gap: spacing.xs,
                    }}
                  >
                    <Text variant="labelLg">{recommendation.title}</Text>
                    <Text variant="bodyMd">
                      {formatRecommendedDate(recommendation.startDate)} – {formatRecommendedDate(recommendation.endDate)}
                    </Text>
                    <Text variant="caption" style={{ color: colors.textSecondary }}>
                      {recommendation.reason}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      <Button
                        size="sm"
                        onPress={() => setForm((current) => ({
                          ...current,
                          startDate: recommendation.startDate,
                          endDate: recommendation.endDate,
                        }))}
                      >
                        Use these dates
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => {
                          track(ANALYTICS_EVENTS.EXTERNAL_LINK_OPENED, {
                            linkType: 'flight_search',
                            provider: 'google_flights',
                            sourceScreen: '/trips/new',
                          });
                          void Linking.openURL(recommendation.googleFlightsUrl);
                        }}
                      >
                        Check on Google Flights
                      </Button>
                    </View>
                  </View>
                ))}
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  Indicative fares can change. Google Flights opens for live date-grid, price-graph, and tracking confirmation.
                </Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Field label="Start date" optional>
                <DateField value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value, endDate: current.endDate && current.endDate >= value ? current.endDate : quizAnswers.duration ? addDays(value, Math.max(0, quizAnswers.duration - 1)) : '' }))} placeholder="Choose start date" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="End date" optional>
                <DateField value={form.endDate} onChange={(value) => set('endDate', value)} placeholder="Choose end date" minimumDate={form.startDate || undefined} />
              </Field>
            </View>
          </View>

          <Field label="Flying from" optional>
            <AirportAutocomplete value={form.origin} onSelect={(airport) => set('origin', airport.iata)} placeholder="City or airport" />
          </Field>

          {!fromQuiz ? <Field label="Travel range">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {([
                ['road_trip', 'Road trip'], ['short_flight', 'Short flight'], ['long_domestic', 'Long domestic'], ['international', 'International'],
              ] as Array<[TravelRange, string]>).map(([range, label]) => { const active = form.travelRanges.includes(range); return <Pressable key={range} onPress={() => set('travelRanges', active ? form.travelRanges.filter((item) => item !== range) : [...form.travelRanges, range])} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1.5, borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentLight : colors.cardBackground }}><Text variant="labelMd">{label}</Text></Pressable>; })}
            </View>
          </Field> : null}

          {!fromQuiz ? <Field label="Getting around">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {(['auto', 'walking', 'transit', 'driving'] as PreferredTransportMode[]).map((mode) => <Pressable key={mode} onPress={() => set('preferredTransportMode', mode)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1.5, borderColor: form.preferredTransportMode === mode ? colors.accent : colors.border, backgroundColor: form.preferredTransportMode === mode ? colors.accentLight : colors.cardBackground }}><Text variant="labelMd" style={{ textTransform: 'capitalize' }}>{mode}</Text></Pressable>)}
            </View>
          </Field> : null}

          {!fromQuiz ? <Field label="Travelers">
            <TravelerSelector groupType={form.groupType} count={form.travelers} onChange={(groupType, count) => setForm((current) => ({ ...current, groupType, travelers: count }))} />
          </Field> : null}

          {!fromQuiz && form.groupType !== 'solo' ? (
            <Field label="Travel buddies">
              <View style={{ gap: spacing.sm }}>
                {([
                  { key: 'now' as const, label: 'Add your travel buddies now', hint: 'Their interests can make the itinerary more accurate.' },
                  { key: 'later' as const, label: 'I’ll add them later', hint: 'Invite people from the trip hub anytime.' },
                ]).map((choice) => <Pressable key={choice.key} onPress={() => set('collaboratorChoice', choice.key)} style={{ padding: spacing.md, borderWidth: 1.5, borderColor: form.collaboratorChoice === choice.key ? colors.accent : colors.border, backgroundColor: form.collaboratorChoice === choice.key ? colors.accentLight : colors.cardBackground, borderRadius: radius.lg, gap: spacing.xxs }}><Text variant="labelLg">{choice.label}</Text><Text variant="caption" style={{ color: colors.textTertiary }}>{choice.hint}</Text></Pressable>)}
                {form.collaboratorChoice === 'now' ? <TravelBuddyPicker draftKey={NEW_TRIP_BUDDY_DRAFT_KEY} autoRequest /> : null}
              </View>
            </Field>
          ) : null}

          {!fromQuiz ? <Field label="Glamour level">
            <GlamourSelector
              value={form.glamourLevel}
              onChange={(v) => set('glamourLevel', v)}
            />
          </Field> : null}

          <Field label="Total budget (USD)" optional>
            <StyledInput
              value={form.budget}
              onChangeText={(v) => set('budget', v)}
              placeholder="e.g. 5000"
              keyboardType="numeric"
            />
          </Field>

          <Button size="lg" fullWidth loading={loading} onPress={handleCreate}>
            Create trip
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

    </>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'baseline' }}>
        <Text variant="labelMd" style={{ color: colors.textSecondary }}>{label}</Text>
        {optional ? <Text variant="caption" style={{ color: colors.textTertiary }}>(optional)</Text> : null}
      </View>
      {children}
    </View>
  );
}

function deriveLookingForFromQuiz(answers: Partial<QuizAnswers>): LookingFor[] | undefined {
  const values = new Set<LookingFor>((answers.socialPrefs ?? []) as LookingFor[]);
  const goals = new Set(answers.tripGoals ?? []);
  if (goals.has('explore') || goals.has('learn')) values.add('exploration');
  if (goals.has('recharge')) values.add('relaxation');
  if (goals.has('celebrate')) values.add('dancing');
  if (goals.has('connect')) values.add('community');
  if (goals.has('romance')) values.add('romance');
  return values.size > 0 ? Array.from(values) : undefined;
}

function StyledInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors, spacing, radius } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      style={{
        backgroundColor: colors.backgroundSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        color: colors.textPrimary,
        fontSize: 15,
      }}
      {...props}
    />
  );
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatRecommendedDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function futureIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
