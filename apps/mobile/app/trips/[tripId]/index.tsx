import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  blendGroupPreferences,
  buildActivityPreferenceSignals,
  estimateBudget,
  generateTripPlan,
  rankPlacesNearLodging,
  refineTripPlan,
  replaceTripPlanItems,
  suggestQueerNeighborhoods,
} from '@gayi/domain';
import type {
  BudgetEngineInput,
  FreeWindowSuggestion,
  ItineraryItem,
  TripPlan,
  TripPlanFeedback,
  TripPlanInput,
  TripPlanReaction,
} from '@gayi/domain';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth, useTravelProfile, useTrips } from '../../../src/providers/AppProviders';
import { useDestinations } from '../../../src/providers/AppProviders';
import { canDeleteTrip } from '../../../src/lib/tripPermissions';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { PhotoCarousel } from '../../../components/ui/PhotoCarousel';
import { GlamourSelector } from '../../../components/ui/GlamourSelector';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import {
  ANALYTICS_EVENTS,
  decideProposalVote,
  type GlamourLevel,
} from '@gayi/shared';
import type {
  ActivityPreferenceVote,
  ActivityPace,
  Destination,
  Interest,
  LookingFor,
  MemberPreferenceSnapshot,
  Place,
  TravelPreferences,
} from '@gayi/shared';
import {
  googleMapsMultiStopUrl,
  googleMapsPlaceUrl,
} from '../../../src/lib/mapsLinks';
import {
  fetchNearbyHighlyRated,
  geocodeLodgingAddress,
  searchPlacesForInterests,
  type NearbyPlaceResult,
} from '../../../src/lib/googlePlaces';
import { getApiKeyStatus } from '../../../src/lib/apiKeys';
import {
  loadDestinationExperiences,
  type MobileExperience,
} from '../../../src/lib/experiences';
import {
  fetchCandidateRouteMatrix,
  fetchTravelLegs,
  itineraryStopsForDay,
  type TravelLeg,
  type TravelMode,
} from '../../../src/lib/travelTimes';
import { TripMap, type TripMapMarker } from '../../../components/maps/TripMap';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  loadBookingStays,
  loadIndicativeFlightDeals,
  searchLocationImages,
  type ApiFlightDeal,
} from '../../../src/lib/travel-api';
import { nearestAirports } from '../../../src/content/airports';
import { CalendarExportSheet } from '../../../components/trips/CalendarExportSheet';
import { openItineraryItemInCalendar } from '../../../src/lib/calendarExport';
import { useAnalytics } from '../../../src/analytics/analytics-provider';
import { OutingIcon } from '../../../components/ui/OutingIcon';
import { featureFlags } from '../../../src/lib/featureFlags';
import { loadAssistantInsights } from '../../../src/lib/assistant-api';
import { applyAssistantProposalToTrip } from '../../../src/lib/assistantProposals';
import { reviewAssistantProposal } from '../../../src/lib/assistant-api';
import { DecisionBriefCard } from '../../../components/assistant/DecisionBriefCard';
import { ActivityPreferenceDeck } from '../../../components/trips/activity-preference-deck';

type SectionKey =
  | 'overview'
  | 'itinerary'
  | 'budget'
  | 'polls'
  | 'members'
  | 'places'
  | 'map'
  | 'comments';

type HubSectionKey = 'plan' | 'explore' | 'group';

type GeocodeStatus = 'idle' | 'locating' | 'located' | 'failed';

type MergedNearStayPlace = {
  id: string;
  name: string;
  category: string;
  source: 'google_places' | 'editorial';
  sourceLabel: 'Google Places' | 'Outing editorial';
  saveKey: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  rating?: number;
  userRatingsTotal?: number;
  vicinity?: string;
  lgbtqRelevance?: string;
  imageUrls?: string[];
  imageAttribution?: string;
  imageAttributions?: Array<{ text: string; url?: string } | undefined>;
};

type MarkerItem = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'lodging' | 'itinerary' | 'experience' | 'nearby';
  detail?: string;
  saveKey?: string;
  day?: number;
};

const HUB_SECTIONS: Record<HubSectionKey, Array<{ key: SectionKey; label: string }>> = {
  plan: [
    { key: 'overview', label: 'Details' },
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'map', label: 'Daily map' },
    { key: 'budget', label: 'Budget' },
  ],
  explore: [{ key: 'places', label: 'Places & experiences' }],
  group: [
    { key: 'polls', label: 'Decisions' },
    { key: 'members', label: 'People' },
    { key: 'comments', label: 'Chat' },
  ],
};

const INTEREST_OPTIONS: Interest[] = [
  'food',
  'nightlife',
  'art',
  'history',
  'culture',
  'beach',
  'wellness',
  'drag',
];

const VALID_INTERESTS = new Set<Interest>([
  'beach',
  'hiking',
  'culture',
  'nightlife',
  'food',
  'art',
  'history',
  'shopping',
  'wellness',
  'adventure',
  'pride',
  'sports',
  'music',
  'lgbtq_venues',
  'drag',
]);

const VALID_LOOKING_FOR = new Set<LookingFor>([
  'community',
  'romance',
  'friendship',
  'dancing',
  'relaxation',
  'exploration',
  'activism',
]);

const INTEREST_ALIASES: Record<string, Interest[]> = {
  architecture: ['art'],
  art_culture: ['art', 'culture'],
  daytime: ['culture'],
  design: ['art'],
  festivals: ['music', 'pride'],
  local_immersion: ['culture'],
  neighborhoods: ['culture'],
  outdoors: ['hiking'],
  poolside: ['wellness'],
  relaxation: ['wellness'],
  rooftop: ['nightlife'],
  rooftops: ['nightlife'],
  shopping: ['shopping'],
  sunset: ['wellness'],
};

export default function TripHubScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId, section: requestedSection } = useLocalSearchParams<{ tripId: string; section?: string }>();
  const { getTrip, updateTrip, deleteTrip } = useTrips();
  const { user } = useAuth();
  const { profile } = useTravelProfile();
  const { getBySlug, getScoringBySlug } = useDestinations();
  const { track, observePreference, preferenceSignals } = useAnalytics();
  const trackedGeneratedPlanRef = useRef('');
  const trackedBookingImpressionsRef = useRef('');

  const [section, setSection] = useState<SectionKey>('overview');
  const [comment, setComment] = useState('');
  const [savedGlamour, setSavedGlamour] = useState<GlamourLevel | null>(null);
  const [lodgingAddressDraft, setLodgingAddressDraft] = useState('');
  const [lodgingStatusDraft, setLodgingStatusDraft] = useState<'none' | 'booked'>(
    'none',
  );
  const [memberNameDraft, setMemberNameDraft] = useState('');
  const [memberNightlifeDraft, setMemberNightlifeDraft] = useState<number | null>(
    null,
  );
  const [memberPaceDraft, setMemberPaceDraft] = useState<ActivityPace>('balanced');
  const [memberInterestsDraft, setMemberInterestsDraft] = useState<Interest[]>([]);
  const [lodgingGeocodeStatus, setLodgingGeocodeStatus] = useState<GeocodeStatus>('idle');
  const [liveNearbyPlaces, setLiveNearbyPlaces] = useState<NearbyPlaceResult[]>([]);
  const [liveInterestPlaces, setLiveInterestPlaces] = useState<NearbyPlaceResult[]>([]);
  const [travelMode, setTravelMode] = useState<TravelMode | 'auto'>(profile.preferredTransportMode ?? 'auto');
  const [legModeOverrides, setLegModeOverrides] = useState<Record<string, TravelMode>>({});
  const [travelLegsByDay, setTravelLegsByDay] = useState<Record<number, TravelLeg[]>>({});
  const [selectedItineraryDay, setSelectedItineraryDay] = useState(1);
  const [selectedMapMarkerId, setSelectedMapMarkerId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [calendarExportVisible, setCalendarExportVisible] = useState(false);
  const [activityDeckVisible, setActivityDeckVisible] = useState(false);
  const lastGeocodeAttemptKeyRef = useRef<string | null>(null);
  const lastNearbyFetchKeyRef = useRef<string | null>(null);
  const activeHub = (Object.entries(HUB_SECTIONS).find(([, items]) =>
    items.some((item) => item.key === section),
  )?.[0] ?? 'plan') as HubSectionKey;

  useEffect(() => {
    if (requestedSection === 'plan') setSection('overview');
    if (requestedSection === 'explore') setSection('places');
    if (requestedSection === 'group') setSection('polls');
  }, [requestedSection]);

  useEffect(() => {
    track(ANALYTICS_EVENTS.TRIP_SECTION_VIEWED, { section });
  }, [section, track]);

  const trip = getTrip(tripId ?? '');
  const assistantTripInsights = useQuery({
    queryKey: ['assistant-insights', 'trip', trip?.tripId, user?.id],
    queryFn: ({ signal }) => loadAssistantInsights({
      surface: 'trip',
      tripId: trip!.tripId,
      trigger: 'screen',
      force: false,
    }, signal),
    enabled: Boolean(user && trip && featureFlags.proactiveInsightsV1),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const assistantTripAudit = useQuery({
    queryKey: ['assistant-insights', 'trip-audit-v1', trip?.tripId, user?.id, trip?.tripPlan?.revision],
    queryFn: ({ signal }) => loadAssistantInsights({
      surface: 'trip',
      tripId: trip!.tripId,
      trigger: 'screen',
      intent: { kind: 'audit' },
      force: false,
    }, signal),
    enabled: Boolean(user && trip && featureFlags.tripAuditV1),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const assistantGroupBrief = useQuery({
    queryKey: ['assistant-insights', 'group-brief-v1', trip?.tripId, user?.id, trip?.polls?.length, trip?.members?.length],
    queryFn: ({ signal }) => loadAssistantInsights({
      surface: 'trip',
      tripId: trip!.tripId,
      trigger: 'screen',
      intent: { kind: 'group' },
      force: false,
    }, signal),
    enabled: Boolean(user && trip && (trip.members?.length ?? trip.travelers) > 1 && featureFlags.decisionBriefsV1),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const activityInsight = assistantTripInsights.data?.insights.find((insight) => insight.kind === 'activity_options');
  const auditInsight = assistantTripAudit.data?.insights.find((insight) => insight.kind === 'trip_audit');
  const groupInsight = assistantGroupBrief.data?.insights.find((insight) => insight.kind === 'group_brief');
  const hasLodgingCoords = hasNumericCoords(trip?.lodgingLat, trip?.lodgingLng);
  const apiKeys = getApiKeyStatus();

  const fetchAndSetLiveNearby = useCallback(async (lat: number, lng: number) => {
    const nearby = await fetchNearbyHighlyRated(lat, lng, 6);
    lastNearbyFetchKeyRef.current = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    setLiveNearbyPlaces(nearby);
    return nearby;
  }, []);

  useEffect(() => {
    if (!trip) return;
    setLodgingAddressDraft(trip.lodgingAddress ?? '');
    setLodgingStatusDraft(trip.lodgingStatus ?? 'none');
  }, [trip?.tripId, trip?.lodgingAddress, trip?.lodgingStatus]);

  useEffect(() => {
    const address = trip?.lodgingAddress?.trim();
    if (!trip?.tripId || !address) {
      setLodgingGeocodeStatus('idle');
      lastGeocodeAttemptKeyRef.current = null;
      return;
    }
    if (hasLodgingCoords) return;

    const geocodeAttemptKey = `${trip.tripId}:${address.toLowerCase()}`;
    if (lastGeocodeAttemptKeyRef.current === geocodeAttemptKey) return;
    lastGeocodeAttemptKeyRef.current = geocodeAttemptKey;

    let cancelled = false;
    void (async () => {
      setLodgingGeocodeStatus('locating');
      try {
        const geocoded = await geocodeLodgingAddress(address);
        if (cancelled) return;
        if (!geocoded) {
          setLodgingGeocodeStatus('failed');
          return;
        }
        await updateTrip(trip.tripId, {
          lodgingAddress: geocoded.formattedAddress || address,
          lodgingLat: geocoded.lat,
          lodgingLng: geocoded.lng,
        });
        if (cancelled) return;
        setLodgingGeocodeStatus('located');
        await fetchAndSetLiveNearby(geocoded.lat, geocoded.lng);
      } catch {
        if (!cancelled) setLodgingGeocodeStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    fetchAndSetLiveNearby,
    hasLodgingCoords,
    trip?.lodgingAddress,
    trip?.tripId,
    updateTrip,
  ]);

  useEffect(() => {
    if (!hasLodgingCoords) {
      setLiveNearbyPlaces([]);
      lastNearbyFetchKeyRef.current = null;
      return;
    }

    const lat = Number(trip?.lodgingLat);
    const lng = Number(trip?.lodgingLng);
    const nearbyKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (lastNearbyFetchKeyRef.current === nearbyKey) return;

    let cancelled = false;
    void (async () => {
      const nearby = await fetchNearbyHighlyRated(lat, lng, 6);
      if (cancelled) return;
      lastNearbyFetchKeyRef.current = nearbyKey;
      setLiveNearbyPlaces(nearby);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasLodgingCoords, trip?.lodgingLat, trip?.lodgingLng]);

  const destScoring = useMemo(
    () => (trip?.destinationSlug ? getScoringBySlug(trip.destinationSlug) : null),
    [trip?.destinationSlug, getScoringBySlug],
  );

  const catalogDestination = useMemo(
    () => (trip?.destinationSlug ? getBySlug(trip.destinationSlug) : null),
    [trip?.destinationSlug, getBySlug],
  );
  const destinationAirport = useMemo(() => catalogDestination
    ? nearestAirports(catalogDestination.lat, catalogDestination.lng, 1)[0]?.airport
    : undefined, [catalogDestination]);
  const bookingStaysQuery = useQuery({
    queryKey: ['booking-stays-v1', trip?.tripId, destinationAirport?.iata, trip?.startDate, trip?.endDate, trip?.travelers],
    queryFn: () => loadBookingStays({
      airportIata: destinationAirport!.iata,
      checkin: trip!.startDate!,
      checkout: trip!.endDate!,
      adults: trip!.travelers,
      rooms: Math.max(1, Math.ceil(trip!.travelers / 2)),
      limit: 6,
    }),
    enabled: Boolean(trip?.lodgingStatus !== 'booked' && destinationAirport && trip?.startDate && trip?.endDate && trip.startDate < trip.endDate),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const flightDealsQuery = useQuery({
    queryKey: [
      'trip-flight-guidance-v1',
      trip?.origin,
      destinationAirport?.iata,
      trip?.startDate?.slice(0, 7),
    ],
    queryFn: () =>
      loadIndicativeFlightDeals({
        originIata: trip!.origin!,
        departureMonth: trip!.startDate!.slice(0, 7),
        returnMonth: trip!.endDate?.slice(0, 7),
        limit: 30,
      }),
    enabled: Boolean(trip?.origin && destinationAirport?.iata && trip?.startDate),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
  const destinationFlightDeal = useMemo<ApiFlightDeal | undefined>(
    () =>
      flightDealsQuery.data?.deals.find(
        (deal) => deal.destinationIata?.toUpperCase() === destinationAirport?.iata.toUpperCase(),
      ),
    [destinationAirport?.iata, flightDealsQuery.data?.deals],
  );

  const destination = useMemo<Destination | null>(() => {
    if (!destScoring) return null;
    return destScoring as unknown as Destination;
  }, [destScoring]);

  const glamour = (savedGlamour ?? trip?.glamourLevel ?? 'comfortably_fabulous') as GlamourLevel;

  const catalogPlaces = useMemo(
    () => (catalogDestination?.places ?? []) as Array<Record<string, unknown>>,
    [catalogDestination],
  );
  const catalogPlaceImageQueries = useQueries({
    queries: catalogPlaces.slice(0, 12).map((place, index) => ({
      queryKey: [
        'pexels-trip-place-images-v1',
        catalogDestination?.slug,
        String(place.id ?? place.name ?? ''),
      ],
      queryFn: () => searchLocationImages({
        subject: String(place.name ?? 'Destination highlight'),
        destination: catalogDestination!.name,
        category: typeof place.category === 'string' ? place.category : undefined,
        kind: 'place',
        limit: 3,
        variant: index,
      }),
      enabled: Boolean(catalogDestination?.name && place.name),
      staleTime: 14 * 24 * 60 * 60_000,
      retry: 1,
    })),
  });

  const domainPlaces = useMemo<Place[]>(
    () => catalogPlaces.map((place) => mapCatalogPlaceToDomainPlace(place)),
    [catalogPlaces],
  );

  const memberPreferenceSnapshots = useMemo<MemberPreferenceSnapshot[]>(
    () =>
      (trip?.memberPrefs ?? []).map((member) => ({
        memberId: member.memberId,
        displayName: member.displayName,
        interests: normalizeInterests(member.interests),
        nightlifeImportance: member.nightlifeImportance,
        activityPace: member.activityPace,
        lookingFor: normalizeLookingFor(member.lookingFor),
      })),
    [trip?.memberPrefs],
  );

  const ownerPreferences = useMemo<TravelPreferences | null>(() => {
    if (!trip || !destination) return null;
    return buildOwnerPreferences(trip, destination, glamour);
  }, [destination, glamour, trip]);

  const blendedPreferences = useMemo<TravelPreferences | null>(() => {
    if (!ownerPreferences) return null;
    return blendGroupPreferences(ownerPreferences, memberPreferenceSnapshots);
  }, [memberPreferenceSnapshots, ownerPreferences]);

  useEffect(() => {
    if (!catalogDestination || !blendedPreferences) {
      setLiveInterestPlaces([]);
      return;
    }
    if (!hasNumericCoords(catalogDestination.lat, catalogDestination.lng)) {
      setLiveInterestPlaces([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const places = await searchPlacesForInterests(
        Number(catalogDestination.lat),
        Number(catalogDestination.lng),
        [...new Set([...blendedPreferences.interests, 'food', 'culture'])],
        Math.min(48, Math.max(24, getDuration(trip?.startDate, trip?.endDate) * 7)),
      );
      if (!cancelled) setLiveInterestPlaces(places);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    blendedPreferences?.interests,
    catalogDestination?.lat,
    catalogDestination?.lng,
    trip?.destinationSlug,
  ]);

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
  const experienceBudgetCap = budget
    ? Math.max(50, Math.round(budget.perPerson.categories.activities.high * 0.65))
    : undefined;
  const experienceDurationCap = blendedPreferences?.activityPace === 'downtime'
    ? 180
    : blendedPreferences?.activityPace === 'packed'
      ? 480
      : 300;

  const destinationExperiencesQuery = useQuery({
    queryKey: [
      'destination-experiences-v4',
      catalogDestination?.slug,
      blendedPreferences?.interests ?? [],
      trip?.startDate,
      trip?.endDate,
      experienceBudgetCap,
      experienceDurationCap,
    ],
    queryFn: ({ signal }) => loadDestinationExperiences({
      destinationSlug: catalogDestination!.slug,
      destinationName: catalogDestination!.name,
      country: catalogDestination!.country,
      lat: catalogDestination!.lat,
      lng: catalogDestination!.lng,
      destinationType: catalogDestination!.destinationType,
      currency: 'USD',
      interests: blendedPreferences!.interests,
      startDate: trip?.startDate,
      endDate: trip?.endDate,
      maxPrice: experienceBudgetCap,
      maxDurationMinutes: experienceDurationCap,
      minRating: 3.5,
      preferFreeCancellation: true,
      limit: 12,
      signal,
    }),
    enabled: Boolean(catalogDestination && blendedPreferences),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
  const destinationExperiences = destinationExperiencesQuery.data?.experiences ?? [];
  const destinationExperienceSource = destinationExperiencesQuery.data?.source ?? 'editorial_fallback';

  const itineraryPlaces = useMemo<Place[]>(() => {
    const livePlaces = liveInterestPlaces.map((place) =>
      mapGooglePlaceToDomainPlace(place, blendedPreferences?.interests ?? []),
    );
    const experiencePlaces = destinationExperiences
      .map((experience) =>
        mapExperienceToDomainPlace(
          experience,
          catalogDestination,
          blendedPreferences?.interests ?? [],
        ),
      )
      .filter((place): place is Place => place != null);

    const seen = new Set<string>();
    return [...domainPlaces, ...livePlaces, ...experiencePlaces].filter((place) => {
      const key = place.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [
    blendedPreferences?.interests,
    catalogDestination,
    destinationExperiences,
    domainPlaces,
    liveInterestPlaces,
  ]);

  const activityCandidates = useMemo(() => {
    const byCategory = new Map<string, Place[]>();
    for (const place of itineraryPlaces
      .filter((candidate) => candidate.businessStatus !== 'closed_permanently')
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))) {
      byCategory.set(place.category, [...(byCategory.get(place.category) ?? []), place]);
    }
    const interleaved: Place[] = [];
    while (interleaved.length < 36 && [...byCategory.values()].some((values) => values.length > 0)) {
      for (const values of byCategory.values()) {
        const next = values.shift();
        if (next) interleaved.push(next);
        if (interleaved.length >= 36) break;
      }
    }
    return interleaved;
  }, [itineraryPlaces]);

  const activityPreferenceSignals = useMemo(
    () => buildActivityPreferenceSignals(
      trip?.activityPreferences ?? [],
      Math.max(1, trip?.members?.length ?? 0, trip?.travelers ?? 1),
    ),
    [trip?.activityPreferences, trip?.members?.length, trip?.travelers],
  );
  const activityPreferenceMemberId = user?.id ?? (trip ? `owner-${trip.tripId}` : 'owner');
  const currentMemberActivityVotes = useMemo(
    () => (trip?.activityPreferences ?? []).filter((vote) => vote.memberId === activityPreferenceMemberId),
    [activityPreferenceMemberId, trip?.activityPreferences],
  );

  const routeCandidatePoints = useMemo(() => {
    const lodging = trip && hasNumericCoords(trip.lodgingLat, trip.lodgingLng)
      ? [{ placeId: 'lodging', lat: Number(trip.lodgingLat), lng: Number(trip.lodgingLng) }]
      : [];
    const candidates = itineraryPlaces.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 10).map((place) => ({ placeId: place.placeId, lat: place.coords.lat, lng: place.coords.lng }));
    return [...lodging, ...candidates];
  }, [itineraryPlaces, trip]);

  const inferredScoreAdjustments = useMemo(() => {
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const categorySignals = new Map(
      preferenceSignals
        .filter((signal) =>
          signal.subjectType === 'activity_category' &&
          new Date(signal.lastObservedAt).getTime() >= cutoff
        )
        .map((signal) => [signal.subjectKey, signal]),
    );
    const hallmarkIds = new Set(trip?.planningPreferences?.hallmarkIds ?? []);
    const goals = new Set(trip?.planningPreferences?.goals ?? []);
    const styles = new Set(trip?.planningPreferences?.vacationStyles ?? []);
    const mealPreferences = new Set(trip?.planningPreferences?.mealPreferences ?? []);
    return Object.fromEntries(itineraryPlaces.map((place) => {
      const signal = categorySignals.get(place.category);
      const preferenceAdjustment = signal
        ? Math.max(-10, Math.min(10, signal.score * signal.confidence * 10))
        : 0;
      const hallmarkAdjustment = hallmarkIds.has(place.placeId) ? 25 : 0;
      let questionnaireAdjustment = 0;
      if (styles.has('iconic_highlights') && ['landmark', 'museum', 'event'].includes(place.category)) questionnaireAdjustment += 8;
      if (styles.has('local_neighborhoods') && ['cafe', 'restaurant', 'bar', 'shop'].includes(place.category)) questionnaireAdjustment += 6;
      if (styles.has('reservation_worthy') && place.bookingRequired) questionnaireAdjustment += 6;
      if (goals.has('recharge') && ['spa', 'park', 'beach'].includes(place.category)) questionnaireAdjustment += 8;
      if (goals.has('learn') && ['museum', 'landmark', 'tour'].includes(place.category)) questionnaireAdjustment += 8;
      if (goals.has('celebrate') && ['bar', 'club', 'event'].includes(place.category)) questionnaireAdjustment += 8;
      if (goals.has('connect') && place.lgbtqRelevance) questionnaireAdjustment += 8;
      if (goals.has('indulge') && ['spa', 'restaurant', 'shop'].includes(place.category)) questionnaireAdjustment += 6;
      if (
        !mealPreferences.has('food_low_priority')
        && mealPreferences.size > 0
        && ['restaurant', 'cafe'].includes(place.category)
      ) questionnaireAdjustment += 6;
      const adjustment = preferenceAdjustment + hallmarkAdjustment + questionnaireAdjustment;
      return [place.placeId, adjustment];
    }));
  }, [itineraryPlaces, preferenceSignals, trip?.planningPreferences]);

  const routeMatrix = useQuery({
    queryKey: ['candidate-route-matrix', trip?.tripId, routeCandidatePoints.map((point) => `${point.placeId}:${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join('|')],
    queryFn: () => fetchCandidateRouteMatrix(routeCandidatePoints, 'transit'),
    enabled: apiKeys.places && routeCandidatePoints.length > 1,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  const tripPlanInput = useMemo<TripPlanInput | null>(() => {
    if (!destination || !trip || !blendedPreferences || !ownerPreferences) return null;
    return {
      destination,
      places: itineraryPlaces,
      preferences: blendedPreferences,
      tripDurationDays: getDuration(trip.startDate, trip.endDate),
      ...(trip.startDate !== undefined && { startDate: trip.startDate }),
      ...(catalogDestination?.timezone !== undefined && { timezone: catalogDestination.timezone }),
      ...(hasNumericCoords(trip.lodgingLat, trip.lodgingLng)
        ? {
            lodging: {
              placeId: 'lodging',
              label: trip.lodgingAddress?.trim() || 'Your stay',
              coords: { lat: Number(trip.lodgingLat), lng: Number(trip.lodgingLng) },
            },
          }
        : {}),
      lockedItems: (trip.tripPlan?.items ?? trip.itineraryItems ?? []) as unknown as ItineraryItem[],
      routeEstimates: routeMatrix.data ?? [],
      owner: {
        memberId: user?.id ?? `owner-${trip.tripId}`,
        ...(user?.displayName !== undefined && { displayName: user.displayName }),
        preferences: {
          interests: ownerPreferences.interests,
          lookingFor: ownerPreferences.lookingFor,
          nightlifeImportance: ownerPreferences.nightlifeImportance,
          activityPace: ownerPreferences.activityPace ?? 'balanced',
        },
      },
      members: memberPreferenceSnapshots,
      ...(budget !== null && { budget }),
      feedback: trip.itineraryFeedback ?? trip.tripPlan?.feedback ?? [],
      excludedPlaceIds: activityPreferenceSignals.excludedPlaceIds,
      scoreAdjustments: {
        ...inferredScoreAdjustments,
        ...Object.fromEntries(Object.entries(activityPreferenceSignals.scoreAdjustments).map(
          ([placeId, adjustment]) => [placeId, (inferredScoreAdjustments[placeId] ?? 0) + adjustment],
        )),
      },
      ...(destinationFlightDeal !== undefined && {
        flightPriceContext: {
          currentPrice: destinationFlightDeal.price,
          ...(destinationFlightDeal.baselinePrice !== undefined && {
            baselinePrice: destinationFlightDeal.baselinePrice,
          }),
          currency: destinationFlightDeal.currency,
          ...(destinationFlightDeal.savingsPercent !== undefined && {
            savingsPercent: destinationFlightDeal.savingsPercent,
          }),
          observationCount: destinationFlightDeal.observationCount ?? 0,
          observedAt: destinationFlightDeal.observedAt,
        },
      }),
    };
  }, [
    blendedPreferences,
    budget,
    catalogDestination?.timezone,
    destination,
    destinationFlightDeal,
    activityPreferenceSignals,
    itineraryPlaces,
    inferredScoreAdjustments,
    memberPreferenceSnapshots,
    ownerPreferences,
    routeMatrix.data,
    trip,
    user?.displayName,
    user?.id,
  ]);

  const generatedTripPlan = useMemo(() => {
    if (!tripPlanInput) return null;
    try {
      return generateTripPlan(tripPlanInput);
    } catch {
      return null;
    }
  }, [tripPlanInput]);

  const activeTripPlan = trip?.tripPlan ?? generatedTripPlan;
  const itinerary = activeTripPlan?.items ??
    (trip?.itineraryItems?.length
      ? trip.itineraryItems as unknown as ItineraryItem[]
      : null);
  const routableItinerary = useMemo(() => {
    if (!itinerary) return null;
    const verifiedPlaceIds = new Set(itineraryPlaces.map((place) => place.placeId));
    return itinerary.filter((item) =>
      !item.placeId.startsWith('experience-') || verifiedPlaceIds.has(item.placeId));
  }, [itinerary, itineraryPlaces]);

  useEffect(() => {
    if (!generatedTripPlan || trip?.tripPlan) return;
    if (trackedGeneratedPlanRef.current === generatedTripPlan.planId) return;
    trackedGeneratedPlanRef.current = generatedTripPlan.planId;
    track(ANALYTICS_EVENTS.ITINERARY_GENERATED, {
      itemCount: generatedTripPlan.items.length,
      dayCount: generatedTripPlan.days.length,
      algorithmVersion: generatedTripPlan.algorithmVersion,
    });
  }, [generatedTripPlan, track, trip?.tripPlan]);

  useEffect(() => {
    if (!activeTripPlan) return;
    const offers = [
      ...activeTripPlan.items.flatMap((item) => item.bookingOffer ? [{
        provider: item.bookingOffer.provider,
        category: item.category ?? item.kind ?? 'activity',
      }] : []),
      ...activeTripPlan.days.flatMap((day) =>
        day.freeWindowSuggestions.flatMap((suggestion) => suggestion.bookingOffer ? [{
          provider: suggestion.bookingOffer.provider,
          category: suggestion.category,
        }] : []),
      ),
    ];
    const key = `${activeTripPlan.planId}:${activeTripPlan.revision}:${offers.length}`;
    if (trackedBookingImpressionsRef.current === key) return;
    trackedBookingImpressionsRef.current = key;
    offers.slice(0, 20).forEach((offer, index) => {
      track(ANALYTICS_EVENTS.AFFILIATE_OFFER_IMPRESSION, {
        provider: offer.provider,
        productCategory: offer.category,
        rank: index + 1,
      });
    });
  }, [activeTripPlan, track]);

  const saveTripPlan = useCallback(async (plan: TripPlan) => {
    if (!trip) return;
    await updateTrip(trip.tripId, {
      tripPlan: plan,
      itineraryFeedback: plan.feedback,
      itineraryItems: plan.items as unknown as Array<Record<string, unknown>>,
    });
  }, [trip, updateTrip]);

  const saveActivityPreferences = useCallback(async (
    sessionVotes: ActivityPreferenceVote[],
    completed: boolean,
  ) => {
    if (!trip) return;
    const memberId = user?.id ?? `owner-${trip.tripId}`;
    const replacements = new Set(sessionVotes.map((vote) => `${vote.placeId}:${memberId}`));
    const merged = [
      ...(trip.activityPreferences ?? []).filter((vote) => !replacements.has(`${vote.placeId}:${vote.memberId}`)),
      ...sessionVotes,
    ];
    for (const vote of sessionVotes) {
      const place = itineraryPlaces.find((candidate) => candidate.placeId === vote.placeId);
      track(ANALYTICS_EVENTS.ACTIVITY_CANDIDATE_RATED, {
        category: vote.category,
        choice: vote.choice,
        source: place?.source ?? 'unknown',
      });
      observePreference({
        subjectType: 'activity_category',
        subjectKey: vote.category,
        value: vote.choice === 'interested' ? 0.7 : -0.6,
        weight: 1,
        source: 'activity_deck',
        observedAt: vote.createdAt,
      });
    }

    if (completed && tripPlanInput) {
      const signals = buildActivityPreferenceSignals(
        merged,
        Math.max(1, trip.members?.length ?? 0, trip.travelers),
      );
      const plan = generateTripPlan({
        ...tripPlanInput,
        excludedPlaceIds: signals.excludedPlaceIds,
        scoreAdjustments: {
          ...(tripPlanInput.scoreAdjustments ?? {}),
          ...Object.fromEntries(Object.entries(signals.scoreAdjustments).map(
            ([placeId, adjustment]) => [placeId, (inferredScoreAdjustments[placeId] ?? 0) + adjustment],
          )),
        },
      });
      await updateTrip(trip.tripId, {
        activityPreferences: merged,
        tripPlan: plan,
        itineraryFeedback: plan.feedback,
        itineraryItems: plan.items as unknown as Array<Record<string, unknown>>,
      });
      track(ANALYTICS_EVENTS.ACTIVITY_DECK_COMPLETED, {
        ratedCount: merged.filter((vote) => vote.memberId === memberId).length,
        candidateCount: activityCandidates.length,
        groupSize: Math.max(1, trip.members?.length ?? 0, trip.travelers),
      });
    } else {
      await updateTrip(trip.tripId, { activityPreferences: merged });
    }
    setActivityDeckVisible(false);
  }, [activityCandidates.length, inferredScoreAdjustments, itineraryPlaces, observePreference, track, trip, tripPlanInput, updateTrip, user?.id]);

  const saveItinerary = useCallback(async (items: ItineraryItem[]) => {
    if (!trip) return;
    if (activeTripPlan) {
      await saveTripPlan(replaceTripPlanItems(activeTripPlan, items));
      return;
    }
    await updateTrip(trip.tripId, {
      itineraryItems: items as unknown as Array<Record<string, unknown>>,
    });
  }, [activeTripPlan, saveTripPlan, trip, updateTrip]);

  const editItineraryItem = useCallback((target: ItineraryItem, updates: Partial<ItineraryItem> | null) => {
    if (!itinerary) return;
    const category = target.category || target.kind || 'activity';
    if (updates === null) {
      track(ANALYTICS_EVENTS.ITINERARY_ITEM_REMOVED, {
        category,
        source: target.source,
        attendance: target.attendance ?? 'group',
      });
      observePreference({
        subjectType: 'activity_category',
        subjectKey: category,
        value: -0.6,
        weight: 1,
        source: 'remove',
        observedAt: new Date().toISOString(),
      });
    } else if (updates.locked !== undefined) {
      track(ANALYTICS_EVENTS.ITINERARY_ITEM_LOCKED, {
        category,
        locked: updates.locked,
      });
    } else if (updates.day !== undefined || updates.time !== undefined) {
      track(ANALYTICS_EVENTS.ITINERARY_ITEM_MOVED, {
        category,
        ...(updates.day !== undefined ? { dayDelta: updates.day - target.day } : {}),
      });
    }
    const next = updates === null
      ? itinerary.filter((item) => item !== target)
      : itinerary.map((item) => {
          if (item !== target) return item;
          const updated = { ...item, ...updates };
          if (trip?.startDate && (updates.time !== undefined || updates.day !== undefined)) {
            const schedule = scheduledLocalTimestamps(trip.startDate, updated.day, updated.time, updated.duration);
            return { ...updated, ...schedule };
          }
          return updated;
        });
    void saveItinerary(next);
  }, [itinerary, observePreference, saveItinerary, track, trip?.startDate]);

  const reactToItineraryItem = useCallback(async (
    item: ItineraryItem,
    reaction: TripPlanReaction,
  ) => {
    if (!trip || !activeTripPlan || !tripPlanInput || !item.itemId) return;
    const memberId = user?.id ?? `owner-${trip.tripId}`;
    const prior = trip.itineraryFeedback ?? activeTripPlan.feedback;
    const existing = prior.find(
      (feedback) => feedback.itemId === item.itemId && feedback.memberId === memberId,
    );
    const withoutExisting = prior.filter(
      (feedback) => !(feedback.itemId === item.itemId && feedback.memberId === memberId),
    );
    const nextFeedback: TripPlanFeedback[] =
      existing?.reaction === reaction
        ? withoutExisting
        : [
            ...withoutExisting,
            {
              itemId: item.itemId,
              placeId: item.placeId,
              day: item.day,
              memberId,
              reaction,
              createdAt: new Date().toISOString(),
            },
          ];
    const refined = refineTripPlan(
      tripPlanInput,
      activeTripPlan,
      nextFeedback,
      [item.day],
    );
    await saveTripPlan(refined);
    const cleared = existing?.reaction === reaction;
    track(ANALYTICS_EVENTS.ITINERARY_FEEDBACK_SUBMITTED, {
      category: item.category || item.kind || 'activity',
      reaction: cleared ? 'cleared' : reaction,
    });
    if (!cleared) {
      observePreference({
        subjectType: 'activity_category',
        subjectKey: item.category || item.kind || 'activity',
        value: reaction === 'like' ? 1 : -1,
        weight: 2,
        source: reaction,
        observedAt: new Date().toISOString(),
      });
    }
  }, [activeTripPlan, observePreference, saveTripPlan, track, trip, tripPlanInput, user?.id]);

  const toggleFreeWindowSuggestion = useCallback(async (
    suggestion: FreeWindowSuggestion,
  ) => {
    if (!trip || !activeTripPlan) return;
    const memberId = user?.id ?? `owner-${trip.tripId}`;
    const wasAccepted = suggestion.acceptedByMemberIds.includes(memberId);
    const nextPlan: TripPlan = {
      ...activeTripPlan,
      revision: activeTripPlan.revision + 1,
      generatedAt: new Date().toISOString(),
      days: activeTripPlan.days.map((day) => ({
        ...day,
        freeWindowSuggestions: day.freeWindowSuggestions.map((candidate) => {
          if (candidate.suggestionId !== suggestion.suggestionId) return candidate;
          const accepted = candidate.acceptedByMemberIds.includes(memberId);
          return {
            ...candidate,
            acceptedByMemberIds: accepted
              ? candidate.acceptedByMemberIds.filter((id) => id !== memberId)
              : [...candidate.acceptedByMemberIds, memberId],
          };
        }),
      })),
    };
    await saveTripPlan(nextPlan);
    if (wasAccepted) {
      track(ANALYTICS_EVENTS.RECOMMENDATION_DISMISSED, {
        recommendationType: 'free_window_suggestion',
        category: suggestion.category,
        reasonCode: 'unsaved',
      });
      observePreference({
        subjectType: 'activity_category',
        subjectKey: suggestion.category,
        value: -0.6,
        weight: 1,
        source: 'dismiss',
        observedAt: new Date().toISOString(),
      });
    } else {
      track(ANALYTICS_EVENTS.FREE_WINDOW_SUGGESTION_ACCEPTED, {
        category: suggestion.category,
        attendance: suggestion.attendance,
      });
      observePreference({
        subjectType: 'activity_category',
        subjectKey: suggestion.category,
        value: 0.8,
        weight: 1,
        source: 'accept',
        observedAt: new Date().toISOString(),
      });
    }
  }, [activeTripPlan, observePreference, saveTripPlan, track, trip, user?.id]);

  const lodgingStop = useMemo(() => {
    if (!trip || !hasNumericCoords(trip.lodgingLat, trip.lodgingLng)) return undefined;
    return {
      id: 'lodging',
      label: trip.lodgingAddress?.trim() || 'Your stay',
      lat: Number(trip.lodgingLat),
      lng: Number(trip.lodgingLng),
    };
  }, [trip]);

  useEffect(() => {
    if (!routableItinerary || routableItinerary.length === 0) {
      setTravelLegsByDay({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const days = Array.from(new Set(routableItinerary.map((item) => item.day))).sort((a, b) => a - b);
      const next: Record<number, TravelLeg[]> = {};
      for (const day of days) {
        const stops = itineraryStopsForDay(
          routableItinerary,
          day,
          lodgingStop,
        );
        if (stops.length < 2) {
          next[day] = [];
          continue;
        }
        const legs: TravelLeg[] = [];
        for (let index = 0; index < stops.length - 1; index += 1) {
          const pair = [stops[index]!, stops[index + 1]!];
          const key = `${day}:${pair[0].label}->${pair[1].label}`;
          legs.push(...await fetchTravelLegs(pair, legModeOverrides[key] ?? travelMode));
        }
        next[day] = legs;
      }
      if (!cancelled) setTravelLegsByDay(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [legModeOverrides, lodgingStop, routableItinerary, travelMode]);

  const nearStayPlaces = useMemo(() => {
    if (!hasLodgingCoords || catalogPlaces.length === 0) {
      return [];
    }
    return rankPlacesNearLodging(
      { lat: Number(trip?.lodgingLat), lng: Number(trip?.lodgingLng) },
      catalogPlaces
        .filter((place) => hasNumericCoords(place.lat, place.lng))
        .map((place) => ({
          id: String(place.id ?? place.name ?? ''),
          name: String(place.name ?? 'Place'),
          lat: Number(place.lat),
          lng: Number(place.lng),
          category: String(place.category ?? 'other'),
          lgbtqRelevance:
            typeof place.lgbtqRelevance === 'string' ? place.lgbtqRelevance : undefined,
          estimatedCostUsd:
            typeof place.estimatedCostUsd === 'number' ? place.estimatedCostUsd : undefined,
        })),
      6,
    );
  }, [catalogPlaces, hasLodgingCoords, trip?.lodgingLat, trip?.lodgingLng]);

  const catalogPlacePhotos = useMemo(() => {
    const byId = new Map<string, {
      imageUrls: string[];
      imageAttribution?: string;
      imageAttributions?: Array<{ text: string; url?: string } | undefined>;
    }>();
    for (const [index, place] of catalogPlaces.entries()) {
      const id = String(place.id ?? '');
      if (!id) continue;
      const pexelsImages = catalogPlaceImageQueries[index]?.data?.images ?? [];
      const imageUrls = Array.isArray(place.imageUrls)
        ? place.imageUrls.filter((url): url is string => typeof url === 'string')
        : typeof place.imageUrl === 'string'
          ? [place.imageUrl]
          : [];
      byId.set(id, {
        imageUrls: pexelsImages.length
          ? pexelsImages.map((image) => image.url)
          : imageUrls,
        imageAttribution:
          pexelsImages.length
            ? undefined
            : typeof place.imageAttribution === 'string' ? place.imageAttribution : undefined,
        imageAttributions: pexelsImages.length
          ? pexelsImages.map((image) => ({
              text: image.matchType === 'destination_fallback'
                ? `${catalogDestination?.name ?? 'Destination'} fallback · Photo by ${image.author ?? 'a contributor'} on Pexels`
                : `Photo by ${image.author ?? 'a contributor'} on Pexels`,
              url: image.sourcePage,
            }))
          : undefined,
      });
    }
    return byId;
  }, [catalogDestination?.name, catalogPlaceImageQueries, catalogPlaces]);

  const mergedNearStayPlaces = useMemo<MergedNearStayPlace[]>(() => {
    const seen = new Set<string>();
    const merged: MergedNearStayPlace[] = [];

    liveNearbyPlaces.forEach((place) => {
      const key = place.name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push({
        id: `google-${place.placeId}`,
        name: place.name,
        category: place.category,
        source: 'google_places',
        sourceLabel: 'Google Places',
        saveKey: place.placeId,
        lat: place.lat,
        lng: place.lng,
        rating: place.rating,
        userRatingsTotal: place.userRatingsTotal,
        vicinity: place.vicinity,
        imageUrls: place.imageUrls ?? [],
      });
    });

    nearStayPlaces.forEach((place) => {
      const key = place.name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      const photos = catalogPlacePhotos.get(String(place.id));
      merged.push({
        id: `editorial-${place.id}`,
        name: place.name,
        category: place.category ?? 'other',
        source: 'editorial',
        sourceLabel: 'Outing editorial',
        saveKey: String(place.id),
        distanceKm: place.distanceKm,
        lgbtqRelevance: place.lgbtqRelevance,
        imageUrls: photos?.imageUrls ?? [],
        imageAttribution: photos?.imageAttribution,
        imageAttributions: photos?.imageAttributions,
      });
    });

    return merged;
  }, [catalogPlacePhotos, liveNearbyPlaces, nearStayPlaces]);

  const hasExternalExperienceBookings = useMemo(
    () =>
      destinationExperiences.some(
        (experience) =>
          experience.bookingMode === 'external' || Boolean(experience.affiliateUrl),
      ),
    [destinationExperiences],
  );

  const neighborhoodSuggestions = useMemo(() => {
    const neighborhoods = (catalogDestination?.neighborhoods ??
      []) as Array<Record<string, unknown>>;
    if (neighborhoods.length === 0) return [];

    return suggestQueerNeighborhoods(
      neighborhoods.map((neighborhood) => {
        const nearbyCount =
          hasNumericCoords(neighborhood.lat, neighborhood.lng) && catalogPlaces.length > 0
            ? rankPlacesNearLodging(
                { lat: Number(neighborhood.lat), lng: Number(neighborhood.lng) },
                catalogPlaces
                  .filter((place) => hasNumericCoords(place.lat, place.lng))
                  .map((place) => ({
                    id: String(place.id ?? ''),
                    name: String(place.name ?? ''),
                    lat: Number(place.lat),
                    lng: Number(place.lng),
                  })),
                catalogPlaces.length,
              ).filter((place) => place.distanceKm <= 1.5).length
            : 0;

        return {
          id: String(neighborhood.id ?? neighborhood.slug ?? neighborhood.name ?? ''),
          name: String(neighborhood.name ?? 'Neighborhood'),
          summary:
            typeof neighborhood.summary === 'string' ? neighborhood.summary : undefined,
          vibeTags: Array.isArray(neighborhood.vibeTags)
            ? neighborhood.vibeTags.filter(
                (tag): tag is string => typeof tag === 'string',
              )
            : undefined,
          lat:
            typeof neighborhood.lat === 'number' ? neighborhood.lat : undefined,
          lng:
            typeof neighborhood.lng === 'number' ? neighborhood.lng : undefined,
          placeCount: nearbyCount,
        };
      }),
    );
  }, [catalogDestination?.neighborhoods, catalogPlaces]);

  const itineraryMarkers = useMemo<MarkerItem[]>(
    () =>
      (routableItinerary ?? [])
        .filter(
          (item) =>
            !item.placeId.startsWith('free-') && !item.placeId.startsWith('meal-') &&
            hasNumericCoords(item.coords?.lat, item.coords?.lng),
        )
        .map((item) => ({
          id: `itinerary-${item.placeId}-${item.day}-${item.time}`,
          label: `${item.title} · Day ${item.day} ${item.time}`,
          lat: item.coords.lat,
          lng: item.coords.lng,
          kind: 'itinerary' as const,
          detail: item.whySelected,
          saveKey: item.placeId,
          day: item.day,
        })),
    [routableItinerary],
  );

  const selectedDayItineraryMarkers = useMemo(
    () => itineraryMarkers.filter((marker) => marker.day === selectedItineraryDay),
    [itineraryMarkers, selectedItineraryDay],
  );

  const experienceMarkers = useMemo<MarkerItem[]>(
    () =>
      destinationExperiences.flatMap((experience) => {
        if (hasNumericCoords(experience.lat, experience.lng)) {
          return [
            {
              id: `experience-${experience.id}`,
              label: experience.title,
              lat: Number(experience.lat),
              lng: Number(experience.lng),
              kind: 'experience' as const,
              detail: experience.summary,
              saveKey: experience.id,
            },
          ];
        }
        return [];
      }),
    [destinationExperiences],
  );

  const liveNearbyMarkers = useMemo<MarkerItem[]>(
    () =>
      liveNearbyPlaces.map((place) => ({
        id: `nearby-${place.placeId}`,
        label: place.name,
        lat: place.lat,
        lng: place.lng,
        kind: 'nearby' as const,
        detail:
          typeof place.rating === 'number'
            ? `Google Places · ${place.rating.toFixed(1)}★${place.vicinity ? ` · ${place.vicinity}` : ''}`
            : place.vicinity,
        saveKey: place.placeId,
      })),
    [liveNearbyPlaces],
  );

  const lodgingMarker = useMemo<MarkerItem | null>(() => {
    if (!trip || !hasNumericCoords(trip.lodgingLat, trip.lodgingLng)) return null;
    return {
      id: 'lodging',
      label: trip.lodgingAddress?.trim() || 'Your stay',
      lat: Number(trip.lodgingLat),
      lng: Number(trip.lodgingLng),
      kind: 'lodging',
      detail: trip.lodgingStatus === 'booked' ? 'Booked stay' : 'Potential stay',
    };
  }, [trip]);

  const mapMarkers = useMemo(
    () => [
      ...(lodgingMarker ? [lodgingMarker] : []),
      ...liveNearbyMarkers,
      ...itineraryMarkers,
      ...experienceMarkers,
    ],
    [experienceMarkers, itineraryMarkers, liveNearbyMarkers, lodgingMarker],
  );

  const tripMapMarkers = useMemo<TripMapMarker[]>(
    () =>
      mapMarkers.map((marker) => ({
        id: marker.id,
        label: marker.label,
        lat: marker.lat,
        lng: marker.lng,
        kind: marker.kind,
      })),
    [mapMarkers],
  );

  const itineraryRouteCoords = useMemo(() => {
    const routed = (travelLegsByDay[selectedItineraryDay] ?? []).flatMap((leg) => leg.routeCoords ?? []);
    if (routed.length > 1) return routed;
    if (!routableItinerary) return [];
    const stops = itineraryStopsForDay(
      routableItinerary,
      selectedItineraryDay,
      lodgingMarker ? { id: lodgingMarker.id, label: lodgingMarker.label, lat: lodgingMarker.lat, lng: lodgingMarker.lng } : undefined,
    );
    if (stops.length >= 2) return stops.map((stop) => ({ latitude: stop.lat, longitude: stop.lng }));
    return selectedDayItineraryMarkers.map((marker) => ({
      latitude: marker.lat,
      longitude: marker.lng,
    }));
  }, [lodgingMarker, routableItinerary, selectedDayItineraryMarkers, selectedItineraryDay, travelLegsByDay]);

  const exportStops = useMemo(() => {
    const stops = [
      ...liveNearbyMarkers.map(({ lat, lng, label }) => ({ lat, lng, label })),
      ...itineraryMarkers.map(({ lat, lng, label }) => ({ lat, lng, label })),
      ...experienceMarkers.map(({ lat, lng, label }) => ({ lat, lng, label })),
    ];
    if (lodgingMarker) {
      stops.push({
        lat: lodgingMarker.lat,
        lng: lodgingMarker.lng,
        label: lodgingMarker.label,
      });
    }
    return stops;
  }, [experienceMarkers, itineraryMarkers, liveNearbyMarkers, lodgingMarker]);

  const savedPlaces = new Set(trip?.savedPlaces ?? []);

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

  const saveLodging = async () => {
    if (!trip) return;
    const trimmedAddress = lodgingAddressDraft.trim();

    await updateTrip(trip.tripId, {
      lodgingAddress: trimmedAddress || undefined,
      lodgingStatus: lodgingStatusDraft,
      lodgingLat: undefined,
      lodgingLng: undefined,
    });

    if (!trimmedAddress) {
      lastGeocodeAttemptKeyRef.current = null;
      lastNearbyFetchKeyRef.current = null;
      setLodgingGeocodeStatus('idle');
      setLiveNearbyPlaces([]);
      return;
    }

    const geocodeAttemptKey = `${trip.tripId}:${trimmedAddress.toLowerCase()}`;
    lastGeocodeAttemptKeyRef.current = geocodeAttemptKey;
    setLodgingGeocodeStatus('locating');
    try {
      const geocoded = await geocodeLodgingAddress(trimmedAddress);
      if (!geocoded) {
        setLodgingGeocodeStatus('failed');
        return;
      }
      await updateTrip(trip.tripId, {
        lodgingAddress: geocoded.formattedAddress || trimmedAddress,
        lodgingStatus: lodgingStatusDraft,
        lodgingLat: geocoded.lat,
        lodgingLng: geocoded.lng,
      });
      setLodgingGeocodeStatus('located');
      await fetchAndSetLiveNearby(geocoded.lat, geocoded.lng);
    } catch {
      setLodgingGeocodeStatus('failed');
    }
  };

  const addMemberPreference = async () => {
    if (!trip || !memberNameDraft.trim()) return;

    const displayName = memberNameDraft.trim();
    const existingMember = (trip.members ?? []).find(
      (member) => member.displayName.toLowerCase() === displayName.toLowerCase(),
    );

    const nextPreference = {
      memberId: existingMember?.id ?? `member-pref-${Date.now()}`,
      displayName,
      interests: memberInterestsDraft.length > 0 ? memberInterestsDraft : undefined,
      nightlifeImportance:
        memberNightlifeDraft === null ? undefined : memberNightlifeDraft / 5,
      activityPace: memberPaceDraft,
    };

    const priorPrefs = trip.memberPrefs ?? [];
    const existingIndex = priorPrefs.findIndex(
      (member) =>
        member.memberId === nextPreference.memberId ||
        member.displayName?.toLowerCase() === displayName.toLowerCase(),
    );

    const memberPrefs =
      existingIndex >= 0
        ? priorPrefs.map((member, index) =>
            index === existingIndex ? nextPreference : member,
          )
        : [...priorPrefs, nextPreference];

    await updateTrip(trip.tripId, { memberPrefs });
    setMemberNameDraft('');
    setMemberNightlifeDraft(null);
    setMemberPaceDraft('balanced');
    setMemberInterestsDraft([]);
  };

  const toggleSavedPlace = async (saveKey: string) => {
    if (!trip) return;
    const nextSavedPlaces = new Set(trip.savedPlaces ?? []);
    if (nextSavedPlaces.has(saveKey)) nextSavedPlaces.delete(saveKey);
    else nextSavedPlaces.add(saveKey);
    await updateTrip(trip.tripId, { savedPlaces: Array.from(nextSavedPlaces) });
  };

  const openBookingLink = async (
    url: string,
    provider: string,
    productCategory: string,
  ) => {
    const properties = { provider, productCategory };
    track(ANALYTICS_EVENTS.AFFILIATE_CLICKED, properties);
    track(ANALYTICS_EVENTS.BOOKING_HANDOFF, properties);
    observePreference({
      subjectType: 'activity_category',
      subjectKey: productCategory,
      value: 0.4,
      weight: 1,
      source: 'affiliate_handoff',
      observedAt: new Date().toISOString(),
    });
    await Linking.openURL(url);
  };

  const openMapMarker = async (marker: MarkerItem) => {
    track(ANALYTICS_EVENTS.EXTERNAL_LINK_OPENED, {
      linkType: 'map',
      provider: 'google_maps',
      sourceScreen: '/trips/[tripId]',
    });
    await Linking.openURL(googleMapsPlaceUrl(marker.lat, marker.lng, marker.label));
  };

  const exportMultiStop = async () => {
    if (exportStops.length === 0) return;
    track(ANALYTICS_EVENTS.EXTERNAL_LINK_OPENED, {
      linkType: 'multi_stop_map',
      provider: 'google_maps',
      sourceScreen: '/trips/[tripId]',
    });
    await Linking.openURL(googleMapsMultiStopUrl(exportStops));
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
    track(ANALYTICS_EVENTS.POLL_CREATED, { optionCount: poll.options.length });
  };

  const votePoll = async (pollId: string, optionId: string) => {
    if (!trip || !user) return;
    const currentPoll = (trip.polls ?? []).find((poll) => poll.id === pollId);
    const changedVote = Boolean(
      currentPoll?.options.some((option) => option.votes.includes(user.id)),
    );
    let polls = (trip.polls ?? []).map((poll) => {
      if (poll.id !== pollId) return poll;
      return {
        ...poll,
        options: poll.options.map((opt) => {
          if (opt.id !== optionId) return { ...opt, votes: opt.votes.filter((v) => v !== user.id) };
          return { ...opt, votes: opt.votes.includes(user.id) ? opt.votes.filter((v) => v !== user.id) : [...opt.votes, user.id] };
        }),
      };
    });
    const nextPoll = polls.find((poll) => poll.id === pollId);
    let proposalUpdates = {};
    if (nextPoll?.assistantProposal) {
      const memberIds = (trip.members ?? []).map((member) => member.id);
      const votes = nextPoll.options.flatMap((option, index) =>
        option.votes.map((userId) => ({
          userId,
          choice: index === 0 ? 'accept' as const : 'dismiss' as const,
        })),
      );
      const decision = decideProposalVote({ memberIds, votes });
      if (decision.result === 'accepted') {
        proposalUpdates = applyAssistantProposalToTrip(trip, nextPoll.assistantProposal);
        polls = polls.map((poll) => poll.id === pollId ? { ...poll, resolution: 'accepted' as const } : poll);
      } else if (decision.result === 'dismissed') {
        polls = polls.map((poll) => poll.id === pollId ? { ...poll, resolution: 'dismissed' as const } : poll);
      } else if (decision.result === 'tie') {
        polls = polls.map((poll) => poll.id === pollId ? { ...poll, resolution: 'tie' as const } : poll);
      }
    }
    await updateTrip(trip.tripId, { polls, ...proposalUpdates });
    track(ANALYTICS_EVENTS.POLL_VOTE_SUBMITTED, {
      optionCount: currentPoll?.options.length ?? 0,
      changedVote,
    });
  };

  const resolveAssistantPollTie = async (
    pollId: string,
    choice: 'accept' | 'dismiss',
  ) => {
    if (!trip || !user) return;
    const poll = (trip.polls ?? []).find((item) => item.id === pollId);
    if (!poll?.assistantProposal) return;
    const role = trip.members?.find((member) => member.id === user.id)?.role;
    if (role !== 'owner' && role !== 'organizer') return;
    const polls = (trip.polls ?? []).map((item) =>
      item.id === pollId
        ? { ...item, resolution: choice === 'accept' ? 'accepted' as const : 'dismissed' as const }
        : item,
    );
    await updateTrip(trip.tripId, {
      polls,
      ...(choice === 'accept'
        ? applyAssistantProposalToTrip(trip, poll.assistantProposal)
        : {}),
    });
    await reviewAssistantProposal(
      poll.assistantProposal.id,
      choice === 'accept' ? 'apply' : 'dismiss',
    ).catch(() => undefined);
  };

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: spacing.md }}>
        <Text variant="h3" style={{ color: colors.textTertiary }}>Trip not found</Text>
        <Button variant="secondary" onPress={() => router.back()}>Back</Button>
      </View>
    );
  }

  const mayDeleteTrip = canDeleteTrip(trip, user?.id);
  const confirmDeleteTrip = () => {
    Alert.alert(
      `Delete “${trip.name}”?`,
      user
        ? 'This removes the trip for everyone in the group. This cannot be undone.'
        : 'This removes the trip from this phone. This cannot be undone.',
      [
        { text: 'Keep trip', style: 'cancel' },
        {
          text: 'Delete trip',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingTrip(true);
              try {
                await deleteTrip(trip.tripId);
                router.replace('/trips');
              } catch (caught) {
                Alert.alert(
                  'Trip wasn’t deleted',
                  caught instanceof Error ? caught.message : 'Please check your connection and try again.',
                );
              } finally {
                setDeletingTrip(false);
              }
            })();
          },
        },
      ],
    );
  };

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
            {renaming ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <TextInput value={nameDraft} onChangeText={setNameDraft} autoFocus selectTextOnFocus style={{ flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: '700', borderBottomWidth: 1.5, borderBottomColor: colors.accent }} />
                <Pressable onPress={async () => { const name = nameDraft.trim(); if (!name) return; await updateTrip(trip.tripId, { name }); setRenaming(false); }}><Text variant="labelMd" style={{ color: colors.accent }}>Save</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setNameDraft(trip.name); setRenaming(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{trip.name}</Text><Text style={{ color: colors.accent }}>✎</Text>
              </Pressable>
            )}
            {trip.destinationName ? (
              <Text variant="caption" style={{ color: colors.textSecondary }}>{trip.destinationName}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => router.push(`/share/${trip.tripId}`)}>
            <Text style={{ fontSize: 18, color: colors.accent }}>⬆</Text>
          </Pressable>
        </View>

        {featureFlags.tripHubV2 ? (
          <View style={{ flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.sm }}>
            {([
              { key: 'plan', label: 'Plan' },
              { key: 'explore', label: 'Explore' },
              { key: 'group', label: 'Group' },
            ] as const).map((hub) => (
              <Pressable
                key={hub.key}
                onPress={() => setSection(HUB_SECTIONS[hub.key][0]!.key)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 2,
                  borderBottomColor: activeHub === hub.key ? colors.accent : 'transparent',
                }}
              >
                <Text variant="labelLg" style={{ color: activeHub === hub.key ? colors.accent : colors.textSecondary }}>
                  {hub.label}
                </Text>
              </Pressable>
            ))}
            {featureFlags.assistantV1 ? (
              <Pressable
                testID="ask-outing-trip"
                accessibilityLabel="Ask Outing about this trip"
                onPress={() => router.push(`/trips/${trip.tripId}/ask`)}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.plumLight, alignItems: 'center', justifyContent: 'center' }}
              >
                <OutingIcon name="ask" size={20} color={colors.plum} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.xs }}>
          {HUB_SECTIONS[activeHub].map((s) => (
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

            {currentMemberActivityVotes.length === 0 ? (
              <Card elevated>
                <View style={{ gap: spacing.md }}>
                  <Badge label="NEXT STEP" variant="accent" />
                  <View style={{ gap: spacing.xs }}>
                    <Text variant="h3">Pick what sounds good</Text>
                    <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                      Make quick interested/not-interested choices, then Outing will spread the strongest group matches across every day.
                    </Text>
                  </View>
                  <Button disabled={activityCandidates.length === 0} onPress={() => setActivityDeckVisible(true)}>
                    Start choosing activities
                  </Button>
                </View>
              </Card>
            ) : null}

            {(bookingStaysQuery.data?.stays.length ?? 0) > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ gap: spacing.xxs }}>
                  <Text variant="h3">Stay ideas for your dates</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>Live availability near {trip.destinationName} via Booking.com.</Text>
                </View>
                {bookingStaysQuery.data!.stays.slice(0, 4).map((stay) => (
                  <Card key={stay.id} elevated>
                    <View style={{ gap: spacing.sm }}>
                      {stay.imageUrls.length > 0 ? <PhotoCarousel urls={stay.imageUrls} height={150} /> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text variant="labelLg" style={{ flex: 1 }}>{stay.name}</Text>
                        {stay.travelProud ? <Badge label="Travel Proud" variant="accent" /> : null}
                      </View>
                      {stay.address ? <Text variant="caption" style={{ color: colors.textTertiary }}>{stay.address}</Text> : null}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        {stay.reviewScore != null ? <Badge label={`${stay.reviewScore.toFixed(1)} guest rating`} variant="info" /> : null}
                        {stay.price != null && stay.currency ? <Badge label={`${new Intl.NumberFormat(undefined, { style: 'currency', currency: stay.currency, maximumFractionDigits: 0 }).format(stay.price)} total`} variant="default" /> : null}
                      </View>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => void openBookingLink(stay.url, 'booking', 'lodging')}
                      >
                        Check this stay
                      </Button>
                    </View>
                  </Card>
                ))}
                <Text variant="caption" style={{ color: colors.textTertiary }}>Live Booking.com results; prices and availability can change. “Travel Proud” is Booking.com’s training-based program, not a universal safety claim. Outing may earn a commission.</Text>
              </View>
            ) : null}

            <Card>
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelLg">How this trip should feel</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    <Badge
                      label={`Pace: ${formatPaceLabel(trip.activityPace ?? blendedPreferences?.activityPace ?? 'balanced')}`}
                      variant="accent"
                    />
                    <Badge
                      label={`Stay: ${lodgingStatusDraft === 'booked' ? 'Booked' : 'Not booked yet'}`}
                      variant={lodgingStatusDraft === 'booked' ? 'success' : 'default'}
                    />
                  </View>
                </View>

                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                    Lodging status
                  </Text>
                  <ChoiceChips
                    options={[
                      { key: 'none', label: 'Need a stay' },
                      { key: 'booked', label: 'Booked' },
                    ]}
                    value={lodgingStatusDraft}
                    onChange={(value) => setLodgingStatusDraft(value as 'none' | 'booked')}
                  />
                </View>

                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                    Lodging address
                  </Text>
                  <StyledInput
                    value={lodgingAddressDraft}
                    onChangeText={setLodgingAddressDraft}
                    placeholder="Hotel, Airbnb, or neighborhood anchor"
                  />
                  <Button size="sm" variant="secondary" onPress={saveLodging}>
                    Save stay details
                  </Button>
                  {lodgingGeocodeStatus !== 'idle' ? (
                    <Text variant="caption" style={{ color: colors.textTertiary }}>
                      {lodgingGeocodeStatus === 'locating'
                        ? 'Locating stay…'
                        : lodgingGeocodeStatus === 'located'
                          ? 'Stay located'
                          : "Couldn't geocode — check address"}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/trips/${trip.tripId}/invite`)}>
                Invite
              </Button>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/share/${trip.tripId}`)}>
                Share
              </Button>
              {mayDeleteTrip ? (
                <Button variant="danger" loading={deletingTrip} style={{ flex: 1 }} onPress={confirmDeleteTrip}>
                  Delete trip
                </Button>
              ) : null}
            </View>

          </View>
        )}

        {/* ─── Itinerary ─── */}
        {section === 'itinerary' && (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <Text variant="h3" style={{ flex: 1 }}>Suggested itinerary</Text>
              <Button size="sm" variant="secondary" disabled={!trip.startDate || !itinerary?.length} onPress={() => setCalendarExportVisible(true)}>Add to calendar</Button>
            </View>
            <Card elevated>
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelSm" style={{ color: colors.accent }}>ACTIVITY PICKS</Text>
                  <Text variant="h3">Tell Outing what belongs in this trip</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                    Review museums, food, architecture, nightlife, outdoor stops, and experiences. Each traveler can make their own picks; group interest shapes shared anchors and the full day-by-day plan.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  <Badge label={`${activityCandidates.length} ideas`} variant="default" />
                  <Badge label={`${currentMemberActivityVotes.length} rated by you`} variant={currentMemberActivityVotes.length ? 'success' : 'default'} />
                  {(trip.members?.length ?? trip.travelers) > 1 ? <Badge label="Group-aware" variant="info" /> : null}
                </View>
                <Button disabled={activityCandidates.length === 0} onPress={() => setActivityDeckVisible(true)}>
                  {currentMemberActivityVotes.length ? 'Continue choosing activities' : 'Choose activities'}
                </Button>
              </View>
            </Card>
            {auditInsight?.decisionCard ? (
              <DecisionBriefCard
                card={auditInsight.decisionCard}
                surface="trip"
                onAction={(card) => router.push({ pathname: '/trips/[tripId]/ask', params: { tripId: trip.tripId, prompt: card.action?.value } })}
              />
            ) : null}
            {activityInsight?.recommendations.length ? (
              <Card elevated>
                <View style={{ gap: spacing.md }}>
                  <View style={{ gap: spacing.xs }}>
                    <Text variant="labelSm" style={{ color: colors.plum }}>ASK OUTING PICKS</Text>
                    <Text variant="h3">{activityInsight.title}</Text>
                    <Text variant="bodySm" style={{ color: colors.textSecondary }}>{activityInsight.summary}</Text>
                  </View>
                  {activityInsight.recommendations.slice(0, 3).map((recommendation, index) => (
                    <Pressable
                      key={recommendation.id}
                      onPress={() => router.push(`/trips/${trip.tripId}/ask`)}
                      style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary, gap: spacing.xs }}
                    >
                      <Text variant="labelSm" style={{ color: colors.pool }}>OPTION {index + 1}</Text>
                      <Text variant="labelLg">{recommendation.title}</Text>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>{recommendation.summary}</Text>
                      <Text variant="caption" style={{ color: colors.pool }}>{recommendation.fitReasons.join(' · ')}</Text>
                    </Pressable>
                  ))}
                  <Button size="sm" variant="secondary" onPress={() => router.push(`/trips/${trip.tripId}/ask`)}>Compare these with Ask Outing</Button>
                </View>
              </Card>
            ) : null}
            {itinerary?.length && !trip.startDate ? <Text variant="caption" style={{ color: colors.textTertiary }}>Add trip dates before exporting calendar events.</Text> : null}
            {!destination ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                Set a destination to generate an itinerary.
              </Text>
            ) : itinerary === null || itinerary.length === 0 ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                Not enough place data to generate an itinerary yet.
              </Text>
            ) : (
              <>
                {activeTripPlan ? (
                  <Card elevated>
                    <View style={{ gap: spacing.sm }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                        <Text variant="labelLg" style={{ flex: 1 }}>Your group-first trip plan</Text>
                        <Badge label={`Plan ${activeTripPlan.revision}`} variant="accent" />
                      </View>
                      <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                        {activeTripPlan.summary}
                      </Text>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>
                        Shared anchors stay fixed in the group plan. Solo and subgroup ideas are optional suggestions inside free windows.
                      </Text>
                      {activeTripPlan.flightPriceGuidance ? (
                        <View style={{ gap: spacing.xs, paddingTop: spacing.xs }}>
                          <Text variant="labelMd">Flight guidance</Text>
                          {activeTripPlan.flightPriceGuidance.currentPrice !== undefined ? (
                            <Text variant="bodyMd">
                              {activeTripPlan.flightPriceGuidance.currency ?? 'USD'} {activeTripPlan.flightPriceGuidance.currentPrice.toLocaleString()}
                              {' · indicative'}
                            </Text>
                          ) : null}
                          <Text variant="caption" style={{ color: colors.textTertiary }}>
                            {activeTripPlan.flightPriceGuidance.message}
                          </Text>
                          {activeTripPlan.flightPriceGuidance.trackingUrl ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={() => void Linking.openURL(activeTripPlan.flightPriceGuidance!.trackingUrl!).catch(() => Alert.alert('Couldn’t open flight tracking'))}
                            >
                              Track on Google Flights
                            </Button>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </Card>
                ) : null}

                {activeTripPlan?.bookingTimeline.some((action) => action.status === 'open') ? (
                  <Card>
                    <View style={{ gap: spacing.sm }}>
                      <Text variant="labelLg">Book and prepare</Text>
                      {activeTripPlan.bookingTimeline
                        .filter((action) => action.status === 'open')
                        .map((action) => (
                          <View key={action.actionId} style={{ gap: spacing.xxs }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                              <Badge label={formatTokenLabel(action.timing)} variant={action.timing === 'watch' ? 'info' : 'warning'} />
                              <Text variant="labelMd" style={{ flex: 1 }}>{action.title}</Text>
                            </View>
                            <Text variant="caption" style={{ color: colors.textTertiary }}>{action.reason}</Text>
                            {action.url ? (
                              <Pressable onPress={() => void openBookingLink(
                                action.url!,
                                action.provider ?? 'direct',
                                action.category,
                              ).catch(() => Alert.alert('Couldn’t open booking link'))}>
                                <Text variant="labelSm" style={{ color: colors.accent }}>
                                  Open {action.provider ? formatTokenLabel(action.provider) : 'booking option'} →
                                </Text>
                              </Pressable>
                            ) : null}
                            {action.disclosure ? (
                              <Text variant="caption" style={{ color: colors.textTertiary }}>{action.disclosure}</Text>
                            ) : null}
                          </View>
                        ))}
                    </View>
                  </Card>
                ) : null}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                  {Array.from(new Set(itinerary.map((item) => item.day))).map((day) => (
                    <Pressable key={day} onPress={() => setSelectedItineraryDay(day)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: selectedItineraryDay === day ? colors.accent : colors.backgroundSecondary }}>
                      <Text variant="labelSm" style={{ color: selectedItineraryDay === day ? colors.textOnAccent : colors.textSecondary }}>Day {day}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {itineraryMarkers.length > 0 ? (
                  <TripMap
                    markers={[...(lodgingMarker ? [lodgingMarker] : []), ...selectedDayItineraryMarkers].map((marker) => ({
                      id: marker.id,
                      label: marker.label,
                      lat: marker.lat,
                      lng: marker.lng,
                      kind: marker.kind === 'lodging' ? 'lodging' as const : 'itinerary' as const,
                    }))}
                    routeCoords={itineraryRouteCoords}
                    height={240}
                    fitTrigger={selectedItineraryDay}
                    selectedMarkerId={selectedMapMarkerId}
                    onSelectMarker={(marker) => setSelectedMapMarkerId(marker.id)}
                  />
                ) : null}

                <View style={{ gap: spacing.sm }}>
                  <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                    Travel time between stops
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {(
                      [
                        { key: 'auto' as const, label: 'Auto' },
                        { key: 'walking' as const, label: 'Walk' },
                        { key: 'transit' as const, label: 'Transit' },
                        { key: 'driving' as const, label: 'Drive' },
                      ]
                    ).map((opt) => {
                      const active = travelMode === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => setTravelMode(opt.key)}
                          style={{
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderRadius: 999,
                            borderWidth: 1.5,
                            borderColor: active ? colors.accent : colors.border,
                            backgroundColor: active ? colors.accentLight : colors.cardBackground,
                          }}
                        >
                          <Text
                            variant="labelMd"
                            style={{ color: active ? colors.accent : colors.textPrimary }}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Button
                  variant="secondary"
                  onPress={() => {
                    if (!generatedTripPlan) return;
                    track(ANALYTICS_EVENTS.ITINERARY_REGENERATED, {
                      itemCount: generatedTripPlan.items.length,
                      dayCount: generatedTripPlan.days.length,
                      reasonCode: 'manual_reoptimize',
                    });
                    void saveTripPlan(generatedTripPlan);
                  }}
                >
                  Re-optimize unlocked stops
                </Button>

                {blendedPreferences ? (
                  <Card>
                    <View style={{ gap: spacing.sm }}>
                      <Text variant="labelLg">Blended group preferences</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        <Badge label={`Pace: ${formatPaceLabel(blendedPreferences.activityPace ?? 'balanced')}`} variant="accent" />
                        <Badge label={`Nightlife: ${Math.round(blendedPreferences.nightlifeImportance * 100)}%`} variant="default" />
                        <Badge label={`Group size: ${blendedPreferences.groupSize}`} variant="default" />
                        <Badge label={`${liveInterestPlaces.length} Google matches`} variant={liveInterestPlaces.length > 0 ? 'info' : 'default'} />
                        <Badge label={`${destinationExperiences.length} excursions`} variant={destinationExperiences.length > 0 ? 'warning' : 'default'} />
                      </View>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>
                        Interests: {blendedPreferences.interests.map((interest) => formatTokenLabel(interest)).join(', ')}
                      </Text>
                    </View>
                  </Card>
                ) : null}

                {groupByDay(itinerary).filter(({ day }) => day === selectedItineraryDay).map(({ day, items }) => {
                  const dayLegs = travelLegsByDay[day] ?? [];
                  const dayPlan = activeTripPlan?.days.find((candidate) => candidate.day === day);
                  return (
                    <View key={day}>
                      <View style={{ gap: spacing.xxs, marginBottom: spacing.sm }}>
                        <Text variant="labelLg" style={{ color: colors.accent }}>
                          Day {day}{dayPlan ? ` · ${dayPlan.title}` : ''}
                        </Text>
                        {dayPlan ? (
                          <Text variant="caption" style={{ color: colors.textTertiary }}>
                            {dayPlan.summary}
                          </Text>
                        ) : null}
                      </View>
                      {items.map((item, i) => {
                        const legAfter = dayLegs.find((leg) => leg.fromLabel === item.title);
                        const markerId = `itinerary-${item.placeId}-${item.day}-${item.time}`;
                        const memberId = user?.id ?? `owner-${trip.tripId}`;
                        const currentReaction = (trip.itineraryFeedback ?? activeTripPlan?.feedback ?? []).find(
                          (feedback) => feedback.itemId === item.itemId && feedback.memberId === memberId,
                        )?.reaction;
                        const freeWindowSuggestions = dayPlan?.freeWindowSuggestions.filter(
                          (suggestion) => suggestion.windowItemId === item.itemId,
                        ) ?? [];
                        return (
                          <View key={`${item.placeId}-${item.time}`}>
                            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
                              <View style={{ width: 44, alignItems: 'center' }}>
                                <Text variant="caption" style={{ color: colors.textTertiary }}>{item.time}</Text>
                                {i < items.length - 1 && (
                                  <View style={{ flex: 1, width: 1, backgroundColor: colors.border, marginTop: spacing.xs }} />
                                )}
                              </View>
                              <Pressable style={{ flex: 1 }} onPress={() => setSelectedMapMarkerId(markerId)}>
                              <Card elevated={selectedMapMarkerId === markerId} style={selectedMapMarkerId === markerId ? { borderColor: colors.accent, borderWidth: 1.5 } : undefined}>
                                <View style={{ gap: spacing.xs }}>
                                  <Text variant="labelLg">{item.title}</Text>
                                  {item.summary ? (
                                    <Text variant="bodySm" style={{ color: colors.textSecondary }}>{item.summary}</Text>
                                  ) : null}
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                                    {item.anchor ? <Badge label="Shared anchor" variant="accent" /> : null}
                                    {item.kind === 'downtime' ? <Badge label="Group free window" variant="info" /> : null}
                                    {item.attendance === 'group' ? <Badge label="Group plan" variant="default" /> : null}
                                  </View>
                                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                                    {item.category} · {item.duration}min
                                    {item.windowEndTime ? ` · until ${item.windowEndTime}` : ''}
                                    {' · '}{item.scheduleStatus ?? 'estimated'}
                                  </Text>
                                  {item.arrivalBufferMinutes ? <Text variant="caption" style={{ color: colors.textSecondary }}>{item.arrivalBufferMinutes} min arrival buffer</Text> : null}
                                  {item.lgbtqRelevance ? (
                                    <Text variant="caption" style={{ color: colors.accent }}>
                                      ✦ {item.lgbtqRelevance}
                                    </Text>
                                  ) : null}
                                  <Text variant="caption" style={{ color: colors.textTertiary }}>
                                    {item.whySelected}
                                  </Text>
                                  {item.bookingOffer ? (
                                    <View style={{ gap: spacing.xxs }}>
                                      <Pressable onPress={() => void openBookingLink(
                                        item.bookingOffer!.url,
                                        item.bookingOffer!.provider,
                                        item.category,
                                      ).catch(() => Alert.alert('Couldn’t open booking link'))}>
                                        <Text variant="labelSm" style={{ color: colors.accent }}>
                                          View on {formatTokenLabel(item.bookingOffer.provider)} →
                                        </Text>
                                      </Pressable>
                                      {item.bookingOffer.disclosure ? (
                                        <Text variant="caption" style={{ color: colors.textTertiary }}>{item.bookingOffer.disclosure}</Text>
                                      ) : null}
                                    </View>
                                  ) : null}
                                  {item.kind !== 'downtime' && item.kind !== 'meal' && item.itemId ? (
                                    <View style={{ gap: spacing.xs, paddingTop: spacing.xs }}>
                                      <Text variant="caption" style={{ color: colors.textSecondary }}>Help refine this day</Text>
                                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                                        {([
                                          ['like', 'Like', 'success'],
                                          ['dislike', 'Not for me', 'default'],
                                          ['veto', 'Veto', 'warning'],
                                        ] as Array<[TripPlanReaction, string, 'success' | 'default' | 'warning']>).map(([reaction, label, variant]) => (
                                          <Pressable key={reaction} onPress={() => void reactToItineraryItem(item, reaction)}>
                                            <Badge
                                              label={label}
                                              variant={currentReaction === reaction ? variant : 'default'}
                                            />
                                          </Pressable>
                                        ))}
                                      </View>
                                    </View>
                                  ) : null}
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
                                    <Pressable onPress={() => editItineraryItem(item, { locked: !item.locked })}><Badge label={item.locked ? 'Unlock' : 'Lock'} variant={item.locked ? 'accent' : 'default'} /></Pressable>
                                    <Pressable onPress={() => editItineraryItem(item, { time: shiftClock(item.time, -30) })}><Badge label="−30 min" /></Pressable>
                                    <Pressable onPress={() => editItineraryItem(item, { time: shiftClock(item.time, 30) })}><Badge label="+30 min" /></Pressable>
                                    {day > 1 ? <Pressable onPress={() => editItineraryItem(item, { day: day - 1 })}><Badge label="Previous day" /></Pressable> : null}
                                    {day < getDuration(trip.startDate, trip.endDate) ? <Pressable onPress={() => editItineraryItem(item, { day: day + 1 })}><Badge label="Next day" /></Pressable> : null}
                                    {trip.startDate ? <Pressable onPress={() => void openItineraryItemInCalendar(item, { tripId: trip.tripId, tripName: trip.name, startDate: trip.startDate, destinationName: trip.destinationName, lodgingAddress: trip.lodgingAddress }).catch((error) => Alert.alert('Couldn’t open calendar', error instanceof Error ? error.message : 'Please try again.'))}><Badge label="Calendar" variant="info" /></Pressable> : null}
                                    <Pressable onPress={() => editItineraryItem(item, null)}><Badge label="Remove" variant="warning" /></Pressable>
                                  </View>
                                </View>
                              </Card>
                              </Pressable>
                            </View>
                            {freeWindowSuggestions.length > 0 ? (
                              <View style={{ marginLeft: 52, marginBottom: spacing.md, gap: spacing.sm }}>
                                <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                                  Optional ideas during this free window
                                </Text>
                                {freeWindowSuggestions.map((suggestion) => {
                                  const accepted = suggestion.acceptedByMemberIds.includes(memberId);
                                  const suggestedFor = suggestion.suggestedFor
                                    .map((person) => person.displayName ?? 'a traveler')
                                    .join(', ');
                                  return (
                                    <Card key={suggestion.suggestionId}>
                                      <View style={{ gap: spacing.xs }}>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                                          <Badge
                                            label={suggestion.attendance === 'solo' ? 'Solo option' : 'Subgroup option'}
                                            variant="info"
                                          />
                                          <Badge label={`Return by ${suggestion.returnBy}`} variant="default" />
                                        </View>
                                        <Text variant="labelLg">{suggestion.title}</Text>
                                        <Text variant="caption" style={{ color: colors.textSecondary }}>
                                          Suggested for {suggestedFor} · start around {suggestion.suggestedStartTime}
                                        </Text>
                                        <Text variant="caption" style={{ color: colors.textTertiary }}>
                                          {suggestion.durationMinutes} min there · {suggestion.outboundTravelMinutes + suggestion.returnTravelMinutes} min estimated round-trip travel
                                        </Text>
                                        <Text variant="caption" style={{ color: colors.textTertiary }}>
                                          {suggestion.whySuggested}
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                                          <Pressable onPress={() => void toggleFreeWindowSuggestion(suggestion)}>
                                            <Badge
                                              label={accepted ? 'Saved for me' : 'Save for me'}
                                              variant={accepted ? 'success' : 'default'}
                                            />
                                          </Pressable>
                                          {suggestion.bookingOffer ? (
                                            <Pressable onPress={() => void openBookingLink(
                                              suggestion.bookingOffer!.url,
                                              suggestion.bookingOffer!.provider,
                                              suggestion.category,
                                            ).catch(() => Alert.alert('Couldn’t open booking link'))}>
                                              <Badge label={`View on ${formatTokenLabel(suggestion.bookingOffer.provider)}`} variant="warning" />
                                            </Pressable>
                                          ) : null}
                                        </View>
                                        {suggestion.bookingOffer?.disclosure ? (
                                          <Text variant="caption" style={{ color: colors.textTertiary }}>
                                            {suggestion.bookingOffer.disclosure}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </Card>
                                  );
                                })}
                              </View>
                            ) : null}
                            {legAfter ? (
                              <View
                                style={{
                                  marginLeft: 52,
                                  marginBottom: spacing.md,
                                  paddingVertical: spacing.xs,
                                  paddingHorizontal: spacing.sm,
                                }}
                              >
                                <Text variant="caption" style={{ color: colors.accent }}>
                                  → {legAfter.durationText} {legAfter.mode} · {legAfter.distanceText} to next{legAfter.estimated ? ' · estimated' : ''}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
                                  {(['walking', 'transit', 'driving'] as TravelMode[]).map((mode) => (
                                    <Pressable key={mode} onPress={() => setLegModeOverrides((current) => ({ ...current, [`${day}:${legAfter.fromLabel}->${legAfter.toLabel}`]: mode }))}>
                                      <Badge label={mode} variant={legAfter.mode === mode ? 'accent' : 'default'} />
                                    </Pressable>
                                  ))}
                                </View>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </>
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
            {groupInsight?.decisionCard ? (
              <DecisionBriefCard
                card={groupInsight.decisionCard}
                surface="trip"
                onAction={(card) => router.push({ pathname: '/trips/[tripId]/ask', params: { tripId: trip.tripId, prompt: card.action?.value } })}
              />
            ) : null}
            {(trip.polls ?? []).length === 0 ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>No polls yet. Create one!</Text>
            ) : (
              (trip.polls ?? []).map((poll) => (
                <Card key={poll.id} elevated>
                  {poll.assistantProposal ? (
                    <Badge label="Ask Outing proposal" variant="info" />
                  ) : null}
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
                  {poll.resolution === 'accepted' ? (
                    <Text variant="labelMd" style={{ color: colors.pool }}>Majority accepted · added to the plan</Text>
                  ) : poll.resolution === 'dismissed' ? (
                    <Text variant="labelMd" style={{ color: colors.textSecondary }}>Group dismissed this change</Text>
                  ) : poll.resolution === 'tie' ? (
                    (() => {
                      const role = trip.members?.find((member) => member.id === user?.id)?.role;
                      const isOrganizer = role === 'owner' || role === 'organizer';
                      return isOrganizer ? (
                        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                          <Text variant="caption" style={{ color: colors.textSecondary }}>The vote is tied. An organizer makes the call.</Text>
                          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                            <Button size="sm" onPress={() => void resolveAssistantPollTie(poll.id, 'accept')}>Accept</Button>
                            <Button size="sm" variant="ghost" onPress={() => void resolveAssistantPollTie(poll.id, 'dismiss')}>Dismiss</Button>
                          </View>
                        </View>
                      ) : (
                        <Text variant="caption" style={{ color: colors.textSecondary }}>Tie · waiting for an organizer</Text>
                      );
                    })()
                  ) : null}
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

            <Card elevated>
              <View style={{ gap: spacing.md }}>
                <Text variant="labelLg">Add group preference snapshot</Text>
                <StyledInput
                  value={memberNameDraft}
                  onChangeText={setMemberNameDraft}
                  placeholder="Display name"
                />
                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                    Activity pace
                  </Text>
                  <ChoiceChips
                    options={[
                      { key: 'packed', label: 'Packed' },
                      { key: 'balanced', label: 'Balanced' },
                      { key: 'downtime', label: 'Downtime' },
                    ]}
                    value={memberPaceDraft}
                    onChange={(value) => setMemberPaceDraft(value as ActivityPace)}
                  />
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                    Interests
                  </Text>
                  <MultiSelectChips
                    options={INTEREST_OPTIONS}
                    values={memberInterestsDraft}
                    onToggle={(interest) =>
                      setMemberInterestsDraft((current) =>
                        current.includes(interest)
                          ? current.filter((value) => value !== interest)
                          : [...current, interest],
                      )
                    }
                  />
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                    Nightlife importance (optional)
                  </Text>
                  <NightlifeRating
                    value={memberNightlifeDraft}
                    onChange={setMemberNightlifeDraft}
                  />
                </View>
                <Button size="sm" variant="secondary" onPress={addMemberPreference}>
                  Save member preferences
                </Button>
              </View>
            </Card>

            {(trip.memberPrefs ?? []).length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="labelLg">Saved preference snapshots</Text>
                {(trip.memberPrefs ?? []).map((member) => (
                  <Card key={member.memberId}>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="labelMd">{member.displayName ?? 'Unnamed member'}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        {member.activityPace ? (
                          <Badge label={`Pace: ${formatPaceLabel(member.activityPace)}`} variant="default" />
                        ) : null}
                        {typeof member.nightlifeImportance === 'number' ? (
                          <Badge
                            label={`Nightlife: ${Math.round(member.nightlifeImportance * 100)}%`}
                            variant="default"
                          />
                        ) : null}
                      </View>
                      {(member.interests ?? []).length > 0 ? (
                        <Text variant="caption" style={{ color: colors.textTertiary }}>
                          Interests: {(member.interests ?? []).map((interest) => formatTokenLabel(interest)).join(', ')}
                        </Text>
                      ) : null}
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {/* ─── Places ─── */}
        {section === 'places' && (
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Explore this destination</Text>
            <Text variant="caption" style={{ color: colors.textTertiary }}>
              Restaurants, places, neighborhoods, and bookable experiences that fit the trip. Context is not a universal safety claim.
            </Text>
            {destinationExperiencesQuery.isPending ? (
              <Card>
                <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                  Finding bookable experiences that fit this group…
                </Text>
              </Card>
            ) : destinationExperiences.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="labelLg">Experiences</Text>
                {destinationExperiences.map((experience) => (
                  <Card key={experience.id} elevated>
                    <View style={{ gap: spacing.sm }}>
                      <PhotoCarousel
                        urls={experience.imageUrls ?? []}
                        height={140}
                        attributions={experience.imageAttributions}
                        attribution={experience.provider === 'editorial' ? 'Photo via Unsplash' : undefined}
                      />
                      <Text variant="labelLg">{experience.title}</Text>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>{experience.summary}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        {destinationExperienceSource === 'viator_live' || experience.provider === 'viator'
                          ? <Badge label="Viator" variant="warning" />
                          : null}
                        {experience.rating ? <Badge label={`${experience.rating.toFixed(1)} ★`} variant="success" /> : null}
                        {experience.priceFrom !== undefined ? <Badge label={`From ${experience.currency ?? ''} ${Math.round(experience.priceFrom)}`} variant="accent" /> : null}
                        {experience.freeCancellation ? <Badge label="Free cancellation" variant="success" /> : null}
                        {experience.tags?.slice(0, 4).map((tag) => <Badge key={tag} label={tag} variant="default" />)}
                      </View>
                      <Button size="sm" variant="secondary" onPress={() => router.push({ pathname: '/experiences/[productCode]', params: { productCode: experience.productCode ?? experience.id, destinationSlug: trip.destinationSlug ?? '', seed: JSON.stringify(experience) } })}>
                        View details
                      </Button>
                    </View>
                  </Card>
                ))}
                {hasExternalExperienceBookings ? (
                  <Text variant="caption" style={{ color: colors.textTertiary }}>Partner bookings open on Viator. Outing may earn a commission.</Text>
                ) : null}
              </View>
            ) : (
              <Card>
                <View style={{ gap: spacing.sm }}>
                  <Text variant="labelLg">No destination-matched Viator options yet</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                    Outing will keep building the itinerary from verified places and events for this destination.
                  </Text>
                  {destinationExperiencesQuery.isError ? (
                    <Button size="sm" variant="secondary" onPress={() => void destinationExperiencesQuery.refetch()}>
                      Try again
                    </Button>
                  ) : null}
                </View>
              </Card>
            )}
            {(catalogDestination?.events ?? []).length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="labelLg">Events</Text>
                {(catalogDestination?.events ?? []).map((event) => (
                  <Card key={event.id}>
                    <View style={{ gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                        <Text variant="h4" style={{ flex: 1 }}>{event.title}</Text>
                        <Badge label={formatTokenLabel(event.category ?? 'event')} variant="accent" />
                      </View>
                      <Text variant="caption" style={{ color: colors.pool }}>
                        {event.startDate}{event.endDate && event.endDate !== event.startDate ? ` – ${event.endDate}` : ''}
                      </Text>
                      {event.summary ? <Text variant="bodySm" style={{ color: colors.textSecondary }}>{event.summary}</Text> : null}
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}
            {liveNearbyPlaces.length > 0 ? (
              <Badge
                label={`${liveNearbyPlaces.length} current suggestions nearby`}
                variant="info"
              />
            ) : null}

            {!catalogDestination ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                Pick a destination to unlock place and neighborhood guidance.
              </Text>
            ) : hasLodgingCoords ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="labelLg">Near your stay</Text>
                {mergedNearStayPlaces.length === 0 ? (
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                    No live or editorial nearby suggestions yet.
                  </Text>
                ) : (
                  mergedNearStayPlaces.map((place) => (
                    <Card key={place.id} elevated>
                      <View style={{ gap: spacing.sm }}>
                        <PhotoCarousel
                          urls={place.imageUrls ?? []}
                          height={140}
                          attributions={place.imageAttributions}
                          attribution={
                            place.source === 'editorial'
                              ? place.imageAttribution ?? 'Photo via Unsplash'
                              : undefined
                          }
                        />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                          <Text variant="labelLg" style={{ flex: 1 }}>
                            {place.name}
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'flex-end' }}>
                            {typeof place.rating === 'number' ? (
                              <Badge label={`${place.rating.toFixed(1)}★`} variant="success" />
                            ) : null}
                            {typeof place.distanceKm === 'number' ? (
                              <Badge
                                label={`${place.distanceKm.toFixed(1)} km`}
                                variant="info"
                              />
                            ) : null}
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                          <Badge
                            label={place.sourceLabel}
                            variant={place.source === 'google_places' ? 'info' : 'default'}
                          />
                          <Badge
                            label={formatTokenLabel(place.category ?? 'other')}
                            variant="outline"
                          />
                          {typeof place.userRatingsTotal === 'number' ? (
                            <Badge label={`${place.userRatingsTotal} ratings`} variant="outline" />
                          ) : null}
                        </View>
                        {place.vicinity ? (
                          <Text variant="caption" style={{ color: colors.textSecondary }}>
                            {place.vicinity}
                          </Text>
                        ) : null}
                        {place.lgbtqRelevance ? (
                          <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                            {place.lgbtqRelevance}
                          </Text>
                        ) : null}
                      </View>
                    </Card>
                  ))
                )}
              </View>
            ) : trip.lodgingAddress ? (
              <Card>
                <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                  {lodgingGeocodeStatus === 'locating'
                    ? 'Locating your stay for live nearby recommendations.'
                    : lodgingGeocodeStatus === 'failed'
                      ? "Couldn't geocode this stay yet — check the address to unlock live nearby and map markers."
                      : 'Add or confirm your stay address to unlock live nearby and map markers.'}
                </Text>
              </Card>
            ) : null}

            {catalogPlaces.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="labelLg">Destination highlights</Text>
                {catalogPlaces.map((place) => {
                  const photos = catalogPlacePhotos.get(String(place.id ?? ''));
                  return (
                    <Card key={String(place.id ?? place.name)} elevated>
                      <View style={{ gap: spacing.sm }}>
                        <PhotoCarousel
                          urls={photos?.imageUrls ?? []}
                          height={140}
                          attributions={photos?.imageAttributions}
                          attribution={photos?.imageAttribution ?? 'Photo via Unsplash'}
                        />
                        <Text variant="labelLg">{String(place.name ?? 'Place')}</Text>
                        <Text variant="caption" style={{ color: colors.textSecondary }}>
                          {formatTokenLabel(String(place.category ?? 'other'))}
                        </Text>
                        {typeof place.summary === 'string' ? (
                          <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                            {place.summary}
                          </Text>
                        ) : null}
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : null}

            {neighborhoodSuggestions.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="labelLg">
                  {trip.lodgingAddress && !hasLodgingCoords
                    ? 'Nearby-feeling neighborhood options'
                    : 'Neighborhood suggestions'}
                </Text>
                {neighborhoodSuggestions.map((neighborhood) => (
                  <Card key={neighborhood.id}>
                    <View style={{ gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                        <Text variant="labelLg" style={{ flex: 1 }}>
                          {neighborhood.name}
                        </Text>
                        <Badge label={`${neighborhood.score}`} variant="accent" />
                      </View>
                      {neighborhood.summary ? (
                        <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                          {neighborhood.summary}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        {(neighborhood.vibeTags ?? []).map((tag) => (
                          <Badge key={tag} label={tag} variant="default" />
                        ))}
                      </View>
                      {neighborhood.reasons.map((reason) => (
                        <Text key={reason} variant="caption" style={{ color: colors.textTertiary }}>
                          ◦ {reason}
                        </Text>
                      ))}
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {/* ─── Map ─── */}
        {section === 'map' && (
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Trip map</Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Lodging, itinerary stops, nearby places, and experiences — in-app.
            </Text>

            <TripMap
              markers={tripMapMarkers}
              routeCoords={itineraryRouteCoords}
              height={320}
              onSelectMarker={(marker) => setSelectedMapMarkerId(marker.id)}
              selectedMarkerId={selectedMapMarkerId}
              fitTrigger={selectedItineraryDay}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Badge label="Stay" variant="info" />
              <Badge label="Itinerary" variant="success" />
              <Badge label="Nearby" variant="default" />
              <Badge label="Experience" variant="warning" />
            </View>

            {selectedMapMarkerId ? (
              <Card>
                <Text variant="labelLg">
                  {mapMarkers.find((marker) => marker.id === selectedMapMarkerId)?.label ?? 'Selected place'}
                </Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {mapMarkers.find((marker) => marker.id === selectedMapMarkerId)?.detail}
                </Text>
              </Card>
            ) : null}

            {mapMarkers.length === 0 ? (
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                Add a destination, itinerary stops, or lodging to populate the map.
              </Text>
            ) : (
              mapMarkers.map((marker) => {
                const isSaved = marker.saveKey ? savedPlaces.has(marker.saveKey) : false;
                const selected = selectedMapMarkerId === marker.id;
                return (
                  <Card
                    key={marker.id}
                    elevated={selected}
                    style={selected ? { borderColor: colors.accent, borderWidth: 1.5 } : undefined}
                  >
                    <Pressable onPress={() => setSelectedMapMarkerId(marker.id)}>
                      <View style={{ gap: spacing.sm }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                          <View style={{ flex: 1, gap: spacing.xxs }}>
                            <Text variant="labelLg">{marker.label}</Text>
                            <Text variant="caption" style={{ color: colors.textSecondary }}>
                              {formatTokenLabel(marker.kind)}
                            </Text>
                          </View>
                          <Badge
                            label={formatTokenLabel(marker.kind)}
                            variant={
                              marker.kind === 'lodging'
                                ? 'info'
                                : marker.kind === 'experience'
                                  ? 'warning'
                                  : marker.kind === 'nearby'
                                    ? 'success'
                                    : 'default'
                            }
                          />
                        </View>
                        {marker.detail ? (
                          <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                            {marker.detail}
                          </Text>
                        ) : null}
                        {marker.saveKey ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() => toggleSavedPlace(marker.saveKey as string)}
                          >
                            {isSaved ? 'Remove saved place' : 'Save place'}
                          </Button>
                        ) : null}
                      </View>
                    </Pressable>
                  </Card>
                );
              })
            )}
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
      <ActivityPreferenceDeck
        visible={activityDeckVisible}
        destinationName={trip.destinationName ?? catalogDestination?.name ?? 'this destination'}
        candidates={activityCandidates}
        memberId={activityPreferenceMemberId}
        existingVotes={trip.activityPreferences ?? []}
        groupVotes={trip.activityPreferences ?? []}
        onSave={saveActivityPreferences}
      />
      <CalendarExportSheet
        visible={calendarExportVisible}
        itinerary={itinerary ?? []}
        trip={{ tripId: trip.tripId, tripName: trip.name, startDate: trip.startDate, destinationName: trip.destinationName, lodgingAddress: trip.lodgingAddress }}
        onClose={() => setCalendarExportVisible(false)}
      />
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

function ChoiceChips({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.full,
              borderWidth: 1.5,
              borderColor: active ? colors.accent : colors.border,
              backgroundColor: active ? colors.accentLight : colors.cardBackground,
            }}
          >
            <Text variant="labelMd" style={{ color: active ? colors.accent : colors.textPrimary }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiSelectChips({
  options,
  values,
  onToggle,
}: {
  options: Interest[];
  values: Interest[];
  onToggle: (value: Interest) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((option) => {
        const active = values.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.full,
              borderWidth: 1.5,
              borderColor: active ? colors.accent : colors.border,
              backgroundColor: active ? colors.accentLight : colors.cardBackground,
            }}
          >
            <Text variant="labelMd" style={{ color: active ? colors.accent : colors.textPrimary }}>
              {formatTokenLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NightlifeRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { colors, spacing } = useTheme();
  const activeValue = value ?? -1;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <Pressable
            key={level}
            onPress={() => onChange(level)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 1.5,
              borderColor: level <= activeValue ? colors.accent : colors.border,
              backgroundColor: level <= activeValue ? colors.accentLight : colors.cardBackground,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="h4" style={{ color: level <= activeValue ? colors.accent : colors.textTertiary }}>
              {level}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md }}>
        <Text variant="caption" style={{ color: colors.textTertiary }}>
          {value === null
            ? 'Optional'
            : value === 0
            ? 'Not important'
            : value <= 2
            ? 'Some nightlife'
            : value <= 4
            ? 'Important'
            : 'Central to the trip'}
        </Text>
        {value !== null ? (
          <Pressable onPress={() => onChange(null)}>
            <Text variant="captionBold" style={{ color: colors.accent }}>
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>
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

function groupByDay(items: ItineraryItem[]) {
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

function normalizeInterests(values?: string[]): Interest[] {
  if (!values || values.length === 0) return [];
  const normalized = new Set<Interest>();

  values.forEach((value) => {
    const token = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (VALID_INTERESTS.has(token as Interest)) {
      normalized.add(token as Interest);
      return;
    }
    (INTEREST_ALIASES[token] ?? []).forEach((interest) => normalized.add(interest));
  });

  return Array.from(normalized);
}

function normalizeLookingFor(values?: string[]): LookingFor[] {
  if (!values || values.length === 0) return [];
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'))
        .filter((value): value is LookingFor => VALID_LOOKING_FOR.has(value as LookingFor)),
    ),
  );
}

function buildOwnerPreferences(
  trip: {
    origin?: string;
    startDate?: string;
    endDate?: string;
    travelers: number;
    activityPace?: ActivityPace;
    lodgingStatus?: 'none' | 'booked';
    lodgingAddress?: string;
    lodgingLat?: number;
    lodgingLng?: number;
    interests?: Interest[];
    nightlifeImportance?: number;
    lookingFor?: LookingFor[];
    planningPreferences?: {
      dayRhythm?: TravelPreferences['dayRhythm'];
      avoidances?: string[];
    };
    travelRanges?: TravelPreferences['travelRanges'];
    preferredTransportMode?: TravelPreferences['preferredTransportMode'];
  },
  destination: Destination,
  glamour: GlamourLevel,
): TravelPreferences {
  const destinationInterests = normalizeInterests(destination.interests as string[]);
  const reportedNightlifeImportance = trip.nightlifeImportance ?? Math.max(
    0.2,
    Math.min(0.95, Math.round((destination.nightlifeScore / 100) * 100) / 100),
  );
  const nightlifeImportance = trip.planningPreferences?.avoidances?.includes('late_nights')
    ? Math.min(0.25, reportedNightlifeImportance)
    : reportedNightlifeImportance;
  const lookingFor = trip.lookingFor?.length
    ? trip.lookingFor
    : deriveLookingFor(trip, nightlifeImportance);

  return {
    budgetLevel: glamour,
    departureAirports: trip.origin ? [trip.origin] : [],
    travelRanges: trip.travelRanges ?? [],
    preferredTransportMode: trip.planningPreferences?.avoidances?.includes('long_walks')
      ? 'transit'
      : trip.preferredTransportMode ?? 'auto',
    travelMonths: [getCurrentMonth(trip.startDate)],
    tripDurationDays: getDuration(trip.startDate, trip.endDate),
    groupSize: trip.travelers,
    interests: trip.interests?.length
      ? trip.interests
      : destinationInterests.length > 0 ? destinationInterests : ['culture', 'food'],
    accessibilityNeeds: [],
    nightlifeImportance,
    weatherPreference: 'any',
    lgbtqSafetyPriority: 0.8,
    soloTravel: trip.travelers === 1,
    lookingFor,
    activityPace: trip.activityPace ?? 'balanced',
    dayRhythm: trip.planningPreferences?.avoidances?.includes('early_mornings')
      ? 'late'
      : trip.planningPreferences?.dayRhythm ?? 'flexible',
    lodgingStatus: trip.lodgingStatus,
    lodgingAddress: trip.lodgingAddress,
    lodgingLat: trip.lodgingLat,
    lodgingLng: trip.lodgingLng,
  };
}

function deriveLookingFor(
  trip: { travelers: number; activityPace?: ActivityPace },
  nightlifeImportance: number,
): LookingFor[] {
  const values = new Set<LookingFor>(['exploration']);
  if (trip.travelers > 1) values.add('friendship');
  if (nightlifeImportance >= 0.65) {
    values.add('community');
    values.add('dancing');
  }
  if ((trip.activityPace ?? 'balanced') === 'downtime') {
    values.add('relaxation');
  }
  return Array.from(values);
}

function mapCatalogPlaceToDomainPlace(place: Record<string, unknown>): Place {
  const name = typeof place.name === 'string' ? place.name : 'Place';
  const lat = typeof place.lat === 'number' ? place.lat : 0;
  const lng = typeof place.lng === 'number' ? place.lng : 0;
  const category = normalizeCategory(place.category);

  return {
    placeId: typeof place.id === 'string' ? place.id : name,
    name,
    ...(typeof place.summary === 'string' ? { summary: place.summary } : {}),
    category,
    coords: { lat, lng },
    durationMinutes:
      typeof place.durationMinutes === 'number' ? place.durationMinutes : 90,
    estimatedCostPerPerson:
      typeof place.estimatedCostUsd === 'number' ? place.estimatedCostUsd : 0,
    bookingRequired: category === 'tour' || category === 'event',
    ...(typeof place.address === 'string' ? { address: place.address } : {}),
    ...(typeof place.providerPlaceId === 'string' ? { providerPlaceId: place.providerPlaceId } : {}),
    photos: (Array.isArray(place.imageUrls) ? place.imageUrls : typeof place.imageUrl === 'string' ? [place.imageUrl] : [])
      .filter((url): url is string => typeof url === 'string')
      .map((url) => ({ url, provider: 'editorial' })),
    interests: inferPlaceInterests(
      category,
      typeof place.summary === 'string' ? place.summary : '',
      typeof place.lgbtqRelevance === 'string' ? place.lgbtqRelevance : undefined,
    ),
    lgbtqRelevance:
      typeof place.lgbtqRelevance === 'string' ? place.lgbtqRelevance : undefined,
    source: 'catalog_seed',
  };
}

function inferPlaceInterests(
  category: Place['category'],
  summary: string,
  lgbtqRelevance?: string,
  fallbackInterests: Interest[] = [],
): Interest[] {
  const interests = new Set<Interest>();
  const text = `${summary} ${lgbtqRelevance ?? ''}`.toLowerCase();

  if (category === 'bar' || category === 'club') interests.add('nightlife');
  if (category === 'restaurant' || category === 'cafe') interests.add('food');
  if (category === 'museum' || category === 'landmark') {
    interests.add('history');
    interests.add('culture');
  }
  if (category === 'shop') interests.add('shopping');
  if (category === 'park') interests.add('wellness');
  if (category === 'beach') interests.add('beach');
  if (category === 'spa') interests.add('wellness');
  if (text.includes('drag')) interests.add('drag');
  if (text.includes('pride')) interests.add('pride');
  if (lgbtqRelevance) interests.add('lgbtq_venues');

  if (interests.size > 0) return Array.from(interests);
  return fallbackInterests.length > 0 ? fallbackInterests.slice(0, 3) : ['culture'];
}

function categoryLabelForSummary(category: Place['category']): string {
  const article = ['event', 'other'].includes(category) ? 'An' : 'A';
  return `${article} ${category.replaceAll('_', ' ')}`;
}

function normalizeCategory(value: unknown): Place['category'] {
  const token = typeof value === 'string' ? value : 'other';
  const categories: Place['category'][] = [
    'bar',
    'club',
    'restaurant',
    'cafe',
    'museum',
    'park',
    'beach',
    'spa',
    'hotel',
    'tour',
    'event',
    'shop',
    'landmark',
    'other',
  ];

  return categories.includes(token as Place['category'])
    ? (token as Place['category'])
    : 'other';
}

function mapGooglePlaceToDomainPlace(
  place: NearbyPlaceResult,
  interests: Interest[],
): Place {
  const category = normalizeCategory(place.category);
  return {
    placeId: `google-${place.placeId}`,
    providerPlaceId: place.placeId,
    name: place.name,
    summary: place.vicinity
      ? `${categoryLabelForSummary(category)} listed near ${place.vicinity}. Check current hours and details before adding it to the day.`
      : `${categoryLabelForSummary(category)} currently listed by Google Places near the destination center. Check current hours before visiting.`,
    category,
    coords: { lat: place.lat, lng: place.lng },
    durationMinutes:
      category === 'restaurant' ? 90 : category === 'bar' || category === 'club' ? 120 : 75,
    estimatedCostPerPerson:
      category === 'restaurant' ? 35 : category === 'bar' || category === 'club' ? 25 : 0,
    bookingRequired: false,
    address: place.vicinity,
    rating: place.rating,
    reviewCount: place.userRatingsTotal,
    photos: (place.imageUrls ?? []).map((url) => ({ url, attribution: place.imageAttributions?.[0] ?? 'Google', provider: 'google_places' })),
    businessStatus: normalizeBusinessStatus(place.businessStatus),
    priceLevel: normalizePriceLevel(place.priceLevel),
    openingHours: place.openingHours as Place['openingHours'],
    verifiedAt: place.verifiedAt,
    interests: inferPlaceInterests(category, place.vicinity ?? '', undefined, interests),
    lgbtqRelevance:
      category === 'bar' || category === 'club'
        ? 'Live Google Places match for the group nightlife/community interests; verify current vibe and events before going.'
        : undefined,
    source: 'google_places',
  };
}

function mapExperienceToDomainPlace(
  experience: MobileExperience,
  _catalogDestination: { lat?: unknown; lng?: unknown } | null | undefined,
  _interests: Interest[],
): Place | null {
  const hasExperienceCoords = hasNumericCoords(experience.lat, experience.lng);
  if (!hasExperienceCoords) return null;

  return {
    placeId: `experience-${experience.id}`,
    name: experience.title,
    summary: experience.summary,
    category: normalizeCategory(experience.category ?? 'tour'),
    coords: {
      lat: Number(experience.lat),
      lng: Number(experience.lng),
    },
    durationMinutes: experience.durationMinutes ?? Math.round((experience.durationHours ?? 2.5) * 60),
    estimatedCostPerPerson: experience.priceFrom ?? 60,
    bookingRequired: experience.bookingMode === 'external',
    rating: experience.rating,
    reviewCount: experience.reviewCount,
    photos: experience.imageUrls.map((url, index) => ({
      url,
      attribution: experience.imageAttributions?.[index]?.text
        ?? (experience.provider === 'viator' ? 'Viator' : 'Outing editorial'),
      provider: experience.provider,
    })),
    fixedStartTimes: experience.availabilityStartTimes,
    interests: normalizeInterests(experience.tags),
    address: experience.address,
    lgbtqRelevance: experience.lgbtqRelevance,
    source: experience.provider === 'viator' ? 'viator' : 'editorial_experience',
    ...(experience.affiliateUrl
      ? {
          bookingOffer: {
            provider: experience.provider === 'editorial' ? 'direct' : experience.provider,
            url: experience.affiliateUrl,
            affiliate: experience.provider !== 'editorial',
            ...(experience.provider !== 'editorial'
              ? { disclosure: 'Outing may earn a commission if you book through this link.' }
              : {}),
            ...(experience.priceFrom !== undefined ? { price: experience.priceFrom } : {}),
            ...(experience.currency !== undefined ? { currency: experience.currency } : {}),
            ...(experience.freeCancellation ? { cancellationSummary: 'Free cancellation available' } : {}),
          },
        }
      : {}),
  };
}

function hasNumericCoords(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
}

function formatPaceLabel(pace: ActivityPace): string {
  return pace === 'packed' ? 'Packed' : pace === 'downtime' ? 'Downtime' : 'Balanced';
}

function formatTokenLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function shiftClock(value: string, offsetMinutes: number): string {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  const shifted = Math.max(0, Math.min(23 * 60 + 59, hours * 60 + minutes + offsetMinutes));
  return `${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`;
}

function scheduledLocalTimestamps(startDate: string, day: number, time: string, durationMinutes: number) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return {};
  start.setUTCDate(start.getUTCDate() + Math.max(0, day - 1));
  start.setUTCHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + Math.max(1, durationMinutes) * 60_000);
  return {
    startsAt: start.toISOString().slice(0, 19),
    endsAt: end.toISOString().slice(0, 19),
  };
}

function normalizeBusinessStatus(value?: string): Place['businessStatus'] {
  if (value === 'OPERATIONAL') return 'operational';
  if (value === 'CLOSED_TEMPORARILY') return 'closed_temporarily';
  if (value === 'CLOSED_PERMANENTLY') return 'closed_permanently';
  return value ? 'unknown' : undefined;
}

function normalizePriceLevel(value?: string): number | undefined {
  if (!value) return undefined;
  const levels: Record<string, number> = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
  return levels[value];
}
