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
  estimateBudget,
  generateItinerary,
  rankPlacesNearLodging,
  suggestQueerNeighborhoods,
} from '@gayi/domain';
import type { BudgetEngineInput, ItineraryInput } from '@gayi/domain';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth, useTrips } from '../../../src/providers/AppProviders';
import { useDestinations } from '../../../src/providers/AppProviders';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { PhotoCarousel } from '../../../components/ui/PhotoCarousel';
import { GlamourSelector } from '../../../components/ui/GlamourSelector';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import type { GlamourLevel } from '@gayi/shared';
import type {
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
  getGooglePlacesApiKey,
  type NearbyPlaceResult,
} from '../../../src/lib/googlePlaces';
import { getApiKeyStatus } from '../../../src/lib/apiKeys';
import {
  loadDestinationExperiences,
  type MobileExperience,
} from '../../../src/lib/experiences';
import {
  fetchTravelLegs,
  itineraryStopsForDay,
  type TravelLeg,
  type TravelMode,
} from '../../../src/lib/travelTimes';
import { TripMap, type TripMapMarker } from '../../../components/maps/TripMap';

type SectionKey =
  | 'overview'
  | 'itinerary'
  | 'budget'
  | 'polls'
  | 'members'
  | 'places'
  | 'map'
  | 'comments';

type GeocodeStatus = 'idle' | 'locating' | 'located' | 'failed';

type MergedNearStayPlace = {
  id: string;
  name: string;
  category: string;
  source: 'google_places' | 'editorial';
  sourceLabel: 'Google Places' | 'Gay-i editorial';
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
};

type MarkerItem = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'lodging' | 'itinerary' | 'experience' | 'nearby';
  detail?: string;
  saveKey?: string;
};

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'budget', label: 'Budget' },
  { key: 'polls', label: 'Polls' },
  { key: 'members', label: 'Members' },
  { key: 'places', label: 'Places' },
  { key: 'map', label: 'Map' },
  { key: 'comments', label: 'Chat' },
];

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
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { getTrip, updateTrip, deleteTrip } = useTrips();
  const { user } = useAuth();
  const { getBySlug, getScoringBySlug } = useDestinations();

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
  const [destinationExperiences, setDestinationExperiences] = useState<MobileExperience[]>(
    [],
  );
  const [destinationExperienceSource, setDestinationExperienceSource] = useState<
    'viator_live' | 'editorial_fallback'
  >('editorial_fallback');
  const [travelMode, setTravelMode] = useState<TravelMode>('walking');
  const [travelLegsByDay, setTravelLegsByDay] = useState<Record<number, TravelLeg[]>>({});
  const [selectedMapMarkerId, setSelectedMapMarkerId] = useState<string | null>(null);
  const lastGeocodeAttemptKeyRef = useRef<string | null>(null);
  const lastNearbyFetchKeyRef = useRef<string | null>(null);

  const trip = getTrip(tripId ?? '');
  const hasLodgingCoords = hasNumericCoords(trip?.lodgingLat, trip?.lodgingLng);
  const hasGooglePlacesApiKey = Boolean(getGooglePlacesApiKey());
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
    const destinationSlug = trip?.destinationSlug;
    if (!destinationSlug) {
      setDestinationExperiences([]);
      setDestinationExperienceSource('editorial_fallback');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { experiences, source } = await loadDestinationExperiences(destinationSlug, 3);
        if (cancelled) return;
        setDestinationExperiences(experiences);
        setDestinationExperienceSource(source);
      } catch {
        if (cancelled) return;
        setDestinationExperiences([]);
        setDestinationExperienceSource('editorial_fallback');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trip?.destinationSlug]);

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

  const destination = useMemo<Destination | null>(() => {
    if (!destScoring) return null;
    return destScoring as unknown as Destination;
  }, [destScoring]);

  const glamour = (savedGlamour ?? trip?.glamourLevel ?? 'comfortably_fabulous') as GlamourLevel;

  const catalogPlaces = useMemo(
    () => (catalogDestination?.places ?? []) as Array<Record<string, unknown>>,
    [catalogDestination],
  );

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
    if (!destination || !trip || !blendedPreferences) return null;
    try {
      const input: ItineraryInput = {
        destination,
        places: domainPlaces,
        preferences: blendedPreferences,
        tripDurationDays: getDuration(trip.startDate, trip.endDate),
      };
      return generateItinerary(input);
    } catch {
      return null;
    }
  }, [blendedPreferences, destination, domainPlaces, trip]);

  useEffect(() => {
    if (!itinerary || itinerary.length === 0) {
      setTravelLegsByDay({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const days = Array.from(new Set(itinerary.map((item) => item.day))).sort((a, b) => a - b);
      const next: Record<number, TravelLeg[]> = {};
      for (const day of days) {
        const stops = itineraryStopsForDay(itinerary, day);
        if (stops.length < 2) {
          next[day] = [];
          continue;
        }
        next[day] = await fetchTravelLegs(stops, travelMode);
      }
      if (!cancelled) setTravelLegsByDay(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [itinerary, travelMode]);

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
    const byId = new Map<string, { imageUrls: string[]; imageAttribution?: string }>();
    for (const place of catalogPlaces) {
      const id = String(place.id ?? '');
      if (!id) continue;
      const imageUrls = Array.isArray(place.imageUrls)
        ? place.imageUrls.filter((url): url is string => typeof url === 'string')
        : typeof place.imageUrl === 'string'
          ? [place.imageUrl]
          : [];
      byId.set(id, {
        imageUrls,
        imageAttribution:
          typeof place.imageAttribution === 'string' ? place.imageAttribution : undefined,
      });
    }
    return byId;
  }, [catalogPlaces]);

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
        sourceLabel: 'Gay-i editorial',
        saveKey: String(place.id),
        distanceKm: place.distanceKm,
        lgbtqRelevance: place.lgbtqRelevance,
        imageUrls: photos?.imageUrls ?? [],
        imageAttribution: photos?.imageAttribution,
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
      (itinerary ?? [])
        .filter(
          (item) =>
            !item.placeId.startsWith('free-') &&
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
        })),
    [itinerary],
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
        if (hasNumericCoords(catalogDestination?.lat, catalogDestination?.lng)) {
          return [
            {
              id: `experience-${experience.id}`,
              label: experience.title,
              lat: Number(catalogDestination?.lat),
              lng: Number(catalogDestination?.lng),
              kind: 'experience' as const,
              detail: experience.summary,
              saveKey: experience.id,
            },
          ];
        }
        return [];
      }),
    [catalogDestination?.lat, catalogDestination?.lng, destinationExperiences],
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
    if (!itinerary) return [];
    const day1 = itineraryStopsForDay(itinerary, 1);
    if (day1.length >= 2) {
      return day1.map((stop) => ({ latitude: stop.lat, longitude: stop.lng }));
    }
    return itineraryMarkers.map((marker) => ({
      latitude: marker.lat,
      longitude: marker.lng,
    }));
  }, [itinerary, itineraryMarkers]);

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

  const openMapMarker = async (marker: MarkerItem) => {
    await Linking.openURL(googleMapsPlaceUrl(marker.lat, marker.lng, marker.label));
  };

  const exportMultiStop = async () => {
    if (exportStops.length === 0) return;
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

            <Card>
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: spacing.xs }}>
                  <Text variant="labelLg">Phase 1 planning intel</Text>
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
              <Button variant="danger" style={{ flex: 1 }} onPress={() => {
                Alert.alert('Delete trip?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTrip(trip.tripId); router.back(); } },
                ]);
              }}>
                Delete
              </Button>
            </View>

            {destinationExperiences.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="h3">Suggested experiences</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  <Badge
                    label={apiKeys.viator ? 'Viator keyed' : 'Viator offline'}
                    variant={apiKeys.viator ? 'success' : 'warning'}
                  />
                  <Badge
                    label={
                      destinationExperienceSource === 'viator_live'
                        ? 'Live results'
                        : 'Editorial fallback'
                    }
                    variant={destinationExperienceSource === 'viator_live' ? 'info' : 'default'}
                  />
                </View>
                {destinationExperiences.map((experience) => (
                  <Card key={experience.id} elevated>
                    <View style={{ gap: spacing.sm }}>
                      <PhotoCarousel
                        urls={experience.imageUrls ?? []}
                        height={140}
                        attribution={
                          experience.provider === 'editorial' ? 'Photo via Unsplash' : undefined
                        }
                      />
                      <Text variant="labelLg">{experience.title}</Text>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                        {experience.summary}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        {destinationExperienceSource === 'viator_live' ||
                        experience.provider === 'viator' ? (
                          <Badge label="Viator" variant="warning" />
                        ) : null}
                        {experience.tags?.slice(0, 4).map((tag) => (
                          <Badge key={tag} label={tag} variant="default" />
                        ))}
                      </View>
                      {typeof experience.affiliateUrl === 'string' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => Linking.openURL(experience.affiliateUrl as string)}
                        >
                          Open experience
                        </Button>
                      ) : null}
                    </View>
                  </Card>
                ))}
                {hasExternalExperienceBookings ? (
                  <Text variant="caption" style={{ color: colors.textTertiary }}>
                    Partner bookings open on Viator. Gay-i may earn a commission.
                  </Text>
                ) : null}
              </View>
            ) : null}
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
              <>
                {itineraryMarkers.length > 0 ? (
                  <TripMap
                    markers={itineraryMarkers.map((marker) => ({
                      id: marker.id,
                      label: marker.label,
                      lat: marker.lat,
                      lng: marker.lng,
                      kind: 'itinerary' as const,
                    }))}
                    routeCoords={itineraryRouteCoords}
                    height={240}
                  />
                ) : null}

                <View style={{ gap: spacing.sm }}>
                  <Text variant="labelMd" style={{ color: colors.textSecondary }}>
                    Travel time between stops
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {(
                      [
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
                  {!hasGooglePlacesApiKey ? (
                    <Text variant="caption" style={{ color: colors.textTertiary }}>
                      Enable Distance Matrix API on your Google key to show live travel times.
                    </Text>
                  ) : null}
                </View>

                {blendedPreferences ? (
                  <Card>
                    <View style={{ gap: spacing.sm }}>
                      <Text variant="labelLg">Blended group preferences</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        <Badge label={`Pace: ${formatPaceLabel(blendedPreferences.activityPace ?? 'balanced')}`} variant="accent" />
                        <Badge label={`Nightlife: ${Math.round(blendedPreferences.nightlifeImportance * 100)}%`} variant="default" />
                        <Badge label={`Group size: ${blendedPreferences.groupSize}`} variant="default" />
                      </View>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>
                        Interests: {blendedPreferences.interests.map((interest) => formatTokenLabel(interest)).join(', ')}
                      </Text>
                    </View>
                  </Card>
                ) : null}

                {groupByDay(itinerary).map(({ day, items }) => {
                  const dayLegs = travelLegsByDay[day] ?? [];
                  return (
                    <View key={day}>
                      <Text variant="labelLg" style={{ marginBottom: spacing.sm, color: colors.accent }}>Day {day}</Text>
                      {items.map((item, i) => {
                        const legAfter = dayLegs.find((leg) => leg.fromLabel === item.title);
                        return (
                          <View key={`${item.placeId}-${item.time}`}>
                            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
                              <View style={{ width: 44, alignItems: 'center' }}>
                                <Text variant="caption" style={{ color: colors.textTertiary }}>{item.time}</Text>
                                {i < items.length - 1 && (
                                  <View style={{ flex: 1, width: 1, backgroundColor: colors.border, marginTop: spacing.xs }} />
                                )}
                              </View>
                              <Card style={{ flex: 1 }}>
                                <View style={{ gap: spacing.xs }}>
                                  <Text variant="labelLg">{item.title}</Text>
                                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                                    {item.category} · {item.duration}min
                                  </Text>
                                  {item.lgbtqRelevance ? (
                                    <Text variant="caption" style={{ color: colors.accent }}>
                                      ✦ {item.lgbtqRelevance}
                                    </Text>
                                  ) : null}
                                  <Text variant="caption" style={{ color: colors.textTertiary }}>
                                    {item.whySelected}
                                  </Text>
                                </View>
                              </Card>
                            </View>
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
                                  → {legAfter.durationText} {travelMode} · {legAfter.distanceText} to next
                                </Text>
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
            <Text variant="h3">Near stay & neighborhoods</Text>
            <Text variant="caption" style={{ color: colors.textTertiary }}>
              Suggestions highlight queer venue density and neighborhood vibe tags. They are not a universal safety claim.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Badge
                label={apiKeys.places ? 'Places API keyed' : 'Places API offline'}
                variant={apiKeys.places ? 'success' : 'warning'}
              />
              <Badge
                label={liveNearbyPlaces.length > 0 ? `${liveNearbyPlaces.length} live nearby` : 'Editorial nearby'}
                variant={liveNearbyPlaces.length > 0 ? 'info' : 'default'}
              />
            </View>
            {trip.lodgingStatus === 'booked' && !hasGooglePlacesApiKey ? (
              <Text variant="caption" style={{ color: colors.textTertiary }}>
                Add GOOGLE_PLACES_API_KEY (or EXPO_PUBLIC_*) to the repo-root `.env`, then restart Expo with `--clear`.
              </Text>
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

function groupByDay(items: Array<{
  day: number;
  time: string;
  title: string;
  category: string;
  duration: number;
  placeId: string;
  lgbtqRelevance?: string;
  whySelected: string;
  coords?: { lat: number; lng: number };
}>) {
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
  },
  destination: Destination,
  glamour: GlamourLevel,
): TravelPreferences {
  const destinationInterests = normalizeInterests(destination.interests as string[]);
  const nightlifeImportance = Math.max(
    0.2,
    Math.min(0.95, Math.round((destination.nightlifeScore / 100) * 100) / 100),
  );
  const lookingFor = deriveLookingFor(trip, nightlifeImportance);

  return {
    budgetLevel: glamour,
    departureAirports: trip.origin ? [trip.origin] : [],
    travelMonths: [getCurrentMonth(trip.startDate)],
    tripDurationDays: getDuration(trip.startDate, trip.endDate),
    groupSize: trip.travelers,
    interests:
      destinationInterests.length > 0 ? destinationInterests : ['culture', 'food'],
    accessibilityNeeds: [],
    nightlifeImportance,
    weatherPreference: 'any',
    lgbtqSafetyPriority: 0.8,
    soloTravel: trip.travelers === 1,
    lookingFor,
    activityPace: trip.activityPace ?? 'balanced',
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
    category,
    coords: { lat, lng },
    durationMinutes:
      typeof place.durationMinutes === 'number' ? place.durationMinutes : 90,
    estimatedCostPerPerson:
      typeof place.estimatedCostUsd === 'number' ? place.estimatedCostUsd : 0,
    bookingRequired: category === 'tour' || category === 'event',
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

  return interests.size > 0 ? Array.from(interests) : ['culture'];
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

function hasNumericCoords(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
}

function formatPaceLabel(pace: ActivityPace): string {
  return pace === 'packed' ? 'Packed' : pace === 'downtime' ? 'Downtime' : 'Balanced';
}

function formatTokenLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
