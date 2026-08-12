import { describe, it, expect } from 'vitest';
import {
  blendGroupPreferences,
  createTripPlanReworkPreview,
  decodeTripPlan,
  generateTripPlan,
  generateItinerary,
  rankPlacesNearLodging,
  refineTripPlan,
  suggestQueerNeighborhoods,
} from '@gayi/domain';
import type { Destination, Place, TravelPreferences } from '@gayi/shared';

const basePrefs: TravelPreferences = {
  budgetLevel: 'comfortably_fabulous',
  departureAirports: ['SFO'],
  travelMonths: [6, 7],
  tripDurationDays: 3,
  groupSize: 2,
  interests: ['nightlife', 'food', 'culture'],
  accessibilityNeeds: [],
  nightlifeImportance: 0.8,
  weatherPreference: 'any',
  lgbtqSafetyPriority: 0.8,
  soloTravel: false,
  lookingFor: ['community', 'dancing'],
  activityPace: 'balanced',
};

describe('blendGroupPreferences', () => {
  it('returns owner prefs when no members', () => {
    const blended = blendGroupPreferences(basePrefs, []);
    expect(blended.interests).toEqual(basePrefs.interests);
    expect(blended.activityPace).toBe('balanced');
  });

  it('intersects shared interests when all members share some', () => {
    const blended = blendGroupPreferences(basePrefs, [
      {
        memberId: 'm1',
        interests: ['nightlife', 'beach'],
        nightlifeImportance: 0.4,
        activityPace: 'downtime',
      },
    ]);
    expect(blended.interests).toContain('nightlife');
    expect(blended.nightlifeImportance).toBeCloseTo(0.6, 5);
    expect(blended.activityPace).toBe('balanced'); // avg of packed? balanced+downtime -> balanced
  });
});

describe('rankPlacesNearLodging', () => {
  it('orders places by distance', () => {
    const ranked = rankPlacesNearLodging(
      { lat: 37.76, lng: -122.435 },
      [
        { id: 'far', name: 'Far', lat: 37.8, lng: -122.4 },
        { id: 'near', name: 'Near', lat: 37.761, lng: -122.436 },
      ],
    );
    expect(ranked[0]?.id).toBe('near');
    expect(ranked[0]!.distanceKm).toBeLessThan(ranked[1]!.distanceKm);
  });
});

describe('suggestQueerNeighborhoods', () => {
  it('scores queer-tagged neighborhoods higher', () => {
    const suggestions = suggestQueerNeighborhoods([
      { id: '1', name: 'Financial', vibeTags: ['business'], placeCount: 1 },
      { id: '2', name: 'Castro', vibeTags: ['queer', 'nightlife'], placeCount: 4 },
    ]);
    expect(suggestions[0]?.name).toBe('Castro');
  });
});

describe('generateItinerary pace', () => {
  const destination = {
    slug: 'test',
    name: 'Test',
    country: 'US',
    continentCode: 'NA',
    nearestAirportCodes: ['SFO'],
    legalStatus: 'marriage_equality',
    safetyScore: 80,
    communityScore: 80,
    nightlifeScore: 80,
    bestMonths: [6],
    avgTempCByMonth: { 6: 22 },
    interests: ['nightlife', 'food'],
    upcomingEvents: [],
    accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: '' },
    costPerDay: { budget: 50, mid: 100, luxury: 200 },
    lastUpdated: '2026-06-01',
  } as Destination;

  const places: Place[] = Array.from({ length: 12 }, (_, i) => ({
    placeId: `p${i}`,
    name: `Place ${i}`,
    category: i % 2 === 0 ? 'restaurant' : 'bar',
    coords: { lat: 37.7 + i * 0.01, lng: -122.4 },
    durationMinutes: 90,
    estimatedCostPerPerson: 30,
    bookingRequired: false,
    interests: ['food', 'nightlife'],
    source: 'editorial',
    lgbtqRelevance: 'Welcoming venue',
  }));

  it('inserts free downtime blocks for downtime pace', () => {
    const items = generateItinerary({
      destination,
      places,
      preferences: { ...basePrefs, activityPace: 'downtime', nightlifeImportance: 0.2 },
      tripDurationDays: 1,
    });
    expect(items.some((i) => i.title === 'Open downtime')).toBe(true);
  });

  it('schedules more slots for packed pace than downtime', () => {
    const packed = generateItinerary({
      destination,
      places,
      preferences: { ...basePrefs, activityPace: 'packed', nightlifeImportance: 0.8 },
      tripDurationDays: 1,
    });
    const downtime = generateItinerary({
      destination,
      places: places.map((p, i) => ({ ...p, placeId: `d${i}` })),
      preferences: { ...basePrefs, activityPace: 'downtime', nightlifeImportance: 0.8 },
      tripDurationDays: 1,
    });
    const packedActivities = packed.filter((i) => i.title !== 'Open downtime').length;
    const downtimeActivities = downtime.filter((i) => i.title !== 'Open downtime').length;
    expect(packedActivities).toBeGreaterThanOrEqual(downtimeActivities);
  });

  it('moves the day later for travelers who prefer slow mornings', () => {
    const early = generateItinerary({
      destination,
      places,
      preferences: { ...basePrefs, dayRhythm: 'early' },
      tripDurationDays: 1,
    });
    const late = generateItinerary({
      destination,
      places: places.map((place, index) => ({ ...place, placeId: `late-${index}` })),
      preferences: { ...basePrefs, dayRhythm: 'late' },
      tripDurationDays: 1,
    });
    expect(late[0]?.time.localeCompare(early[0]?.time ?? '')).toBeGreaterThan(0);
  });

  it('respects known opening hours, travel time, buffers, and fixed starts', () => {
    const items = generateItinerary({
      destination,
      places: [
        { ...places[0]!, placeId: 'closed', name: 'Closed Monday', openingHours: [{ dayOfWeek: 2, open: '09:00', close: '23:00' }] },
        { ...places[1]!, placeId: 'fixed', name: 'Fixed tour', category: 'tour', bookingRequired: true, fixedStartTimes: ['11:00'], openingHours: [{ dayOfWeek: 1, open: '10:00', close: '14:00' }] },
      ],
      preferences: { ...basePrefs, preferredTransportMode: 'transit' },
      tripDurationDays: 1,
      startDate: '2026-06-01',
      lodging: { placeId: 'hotel', label: 'Hotel', coords: { lat: 37.7, lng: -122.4 } },
      routeEstimates: [{ fromPlaceId: 'hotel', toPlaceId: 'fixed', mode: 'transit', durationMinutes: 25, distanceMeters: 4000 }],
    });
    expect(items.some((item) => item.placeId === 'closed')).toBe(false);
    const fixed = items.find((item) => item.placeId === 'fixed');
    expect(fixed?.time).toBe('11:00');
    expect(fixed?.arrivalBufferMinutes).toBe(15);
    expect(fixed?.travelFromPrevious?.durationMinutes).toBe(25);
    expect(fixed?.scheduleStatus).toBe('verified');
  });

  it('keeps a coordinate-resolved Viator experience and exact booking handoff in the itinerary', () => {
    const items = generateItinerary({
      destination,
      places: [{
        placeId: 'experience-479P1',
        name: 'Architecture walk',
        summary: 'A provider-backed guided walk with a verified meeting point.',
        category: 'tour',
        coords: { lat: 48.861, lng: 2.335 },
        durationMinutes: 120,
        estimatedCostPerPerson: 85,
        bookingRequired: true,
        interests: ['culture', 'history'],
        source: 'viator',
        rating: 4.9,
        reviewCount: 320,
        bookingOffer: {
          provider: 'viator',
          url: 'https://www.viator.com/tours/example',
          affiliate: true,
          disclosure: 'Outing may earn a commission if you book through this link.',
          price: 85,
          currency: 'USD',
        },
      }],
      preferences: { ...basePrefs, interests: ['culture', 'history'] },
      tripDurationDays: 1,
      lodging: { placeId: 'hotel', coords: { lat: 48.86, lng: 2.34 } },
    });
    const experience = items.find((item) => item.placeId === 'experience-479P1');
    expect(experience).toMatchObject({
      kind: 'experience',
      source: 'viator',
      bookingRequired: true,
      bookingOffer: { provider: 'viator', affiliate: true, price: 85, currency: 'USD' },
    });
  });

  it('preserves locked items and never overlaps generated stops with them', () => {
    const locked = {
      day: 1, time: '12:00', title: 'Booked lunch', category: 'restaurant', placeId: 'locked',
      duration: 120, estimatedCost: 40, bookingRequired: true, source: 'viator', confidence: 1,
      coords: { lat: 37.7, lng: -122.4 }, whySelected: 'User choice', locked: true,
    } as const;
    const items = generateItinerary({
      destination,
      places,
      preferences: basePrefs,
      tripDurationDays: 1,
      lockedItems: [locked],
    });
    expect(items.find((item) => item.placeId === 'locked')).toEqual(locked);
    const windows = items.map((item) => ({ item, start: Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)), end: Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)) + item.duration }));
    for (let index = 1; index < windows.length; index += 1) expect(windows[index]!.start).toBeGreaterThanOrEqual(windows[index - 1]!.end);
  });

  it('protects at least a two-hour free block for downtime pace', () => {
    const items = generateItinerary({ destination, places, preferences: { ...basePrefs, activityPace: 'downtime' }, tripDurationDays: 2 });
    for (const day of [1, 2]) expect(items.find((item) => item.day === day && item.kind === 'downtime')?.duration).toBeGreaterThanOrEqual(120);
  });

  it('handles timezone-labelled overnight nightlife hours', () => {
    const items = generateItinerary({
      destination,
      places: [{ ...places[1]!, placeId: 'late-bar', name: 'Late Bar', category: 'bar', durationMinutes: 90, openingHours: [{ dayOfWeek: 1, open: '20:00', close: '02:00' }] }],
      preferences: { ...basePrefs, activityPace: 'balanced', nightlifeImportance: 1 },
      tripDurationDays: 1,
      startDate: '2026-06-01',
      timezone: 'America/Los_Angeles',
    });
    const late = items.find((item) => item.placeId === 'late-bar');
    expect(late?.time >= '20:00').toBe(true);
    expect(late?.timezone).toBe('America/Los_Angeles');
    expect(late?.endsAt).toMatch(/^2026-06-0[12]T/);
  });
});

describe('generateTripPlan', () => {
  const destination = {
    slug: 'plan-test',
    name: 'Plan Test',
    country: 'US',
    continentCode: 'NA',
    nearestAirportCodes: ['LAX'],
    legalStatus: 'marriage_equality',
    safetyScore: 80,
    communityScore: 80,
    nightlifeScore: 75,
    bestMonths: [6],
    avgTempCByMonth: { 6: 24 },
    interests: ['food', 'culture'],
    upcomingEvents: [],
    accessibility: { wheelchairFriendly: true, brailleAvailable: false, notes: '' },
    costPerDay: { budget: 70, mid: 140, luxury: 300 },
    lastUpdated: '2026-07-01',
  } as Destination;

  const planPlaces: Place[] = [
    ...Array.from({ length: 14 }, (_, index): Place => ({
      placeId: `plan-place-${index}`,
      name: `Plan Place ${index}`,
      category:
        index % 4 === 0
          ? 'tour'
          : index % 4 === 1
            ? 'restaurant'
            : index % 4 === 2
              ? 'museum'
              : 'bar',
      coords: { lat: 34.05 + index * 0.001, lng: -118.25 + index * 0.001 },
      durationMinutes: index % 4 === 0 ? 120 : 75,
      estimatedCostPerPerson: 20 + index,
      bookingRequired: index % 4 === 0,
      interests: index % 4 === 3 ? ['nightlife'] : ['food', 'culture'],
      source: index % 4 === 0 ? 'viator' : 'google_places',
      ...(index % 4 === 0
        ? {
            bookingOffer: {
              provider: 'viator',
              url: `https://www.viator.com/tours/Example/d1-ABC${index}`,
              affiliate: true,
              disclosure: 'Outing may earn a commission if you book through this link.',
            },
          }
        : {}),
    })),
    {
      placeId: 'member-wellness',
      name: 'Member Wellness Studio',
      category: 'other',
      coords: { lat: 34.052, lng: -118.252 },
      durationMinutes: 60,
      estimatedCostPerPerson: 25,
      bookingRequired: false,
      interests: ['wellness'],
      source: 'google_places',
    },
  ];

  const makePlan = (overrides: Partial<Parameters<typeof generateTripPlan>[0]> = {}) =>
    generateTripPlan({
      destination,
      places: planPlaces,
      preferences: {
        ...basePrefs,
        departureAirports: ['SFO'],
        groupSize: 2,
        activityPace: 'downtime',
      },
      owner: {
        memberId: 'owner',
        displayName: 'Owner',
        preferences: {
          interests: basePrefs.interests,
          lookingFor: basePrefs.lookingFor,
          nightlifeImportance: basePrefs.nightlifeImportance,
          activityPace: 'downtime',
        },
      },
      members: [{
        memberId: 'member',
        displayName: 'Member',
        interests: ['wellness'],
        lookingFor: ['relaxation'],
        activityPace: 'downtime',
      }],
      tripDurationDays: 2,
      startDate: '2026-08-10',
      ...overrides,
    });

  it('builds themed days around at most two shared anchors', () => {
    const plan = makePlan();
    expect(plan.schemaVersion).toBe(2);
    expect(plan.days).toHaveLength(2);
    for (const day of plan.days) {
      expect(day.title.length).toBeGreaterThan(0);
      expect(day.sharedAnchorItemIds.length).toBeLessThanOrEqual(2);
      for (const anchorId of day.sharedAnchorItemIds) {
        expect(plan.items.find((item) => item.itemId === anchorId)?.anchor).toBe(true);
      }
      expect(day.rationale).toBeTruthy();
      expect(day.pace).toBe('light');
      expect(day.estimatedTravelMinutes).toBeGreaterThanOrEqual(0);
      expect(day.reservationRisk).toMatch(/low|medium|high/);
      expect(day.freshness).toBeTruthy();
    }
  });

  it('keeps solo/subgroup ideas optional and inside a group free window', () => {
    const plan = makePlan({ minorityFavoriteMemberIdsByPlace: { 'member-wellness': ['member'] } });
    const suggestion = plan.days.flatMap((day) => day.freeWindowSuggestions)
      .find((candidate) => candidate.placeId === 'member-wellness');
    expect(suggestion).toBeDefined();
    expect(suggestion?.attendance).toBe('solo');
    expect(suggestion?.acceptedByMemberIds).toEqual([]);
    const window = plan.items.find((item) => item.itemId === suggestion?.windowItemId);
    expect(window?.kind).toBe('downtime');
    expect(suggestion!.suggestedStartTime >= window!.time).toBe(true);
    expect(suggestion!.returnBy).toBe(window!.windowEndTime);
    expect(plan.items.some((item) => item.placeId === 'member-wellness')).toBe(false);
  });

  it('creates day reworks as previews and preserves schema-v1 decoding', () => {
    const initial = makePlan();
    const preview = createTripPlanReworkPreview({
      destination,
      places: planPlaces,
      preferences: { ...basePrefs, departureAirports: ['SFO'], groupSize: 2, activityPace: 'downtime' },
      tripDurationDays: 2,
      startDate: '2026-08-10',
    }, initial, 1, 'rainy_day', 'trip-1');
    expect(preview.status).toBe('preview');
    expect(preview.preview.revision).toBe(initial.revision + 1);
    expect(initial.revision).toBe(1);
    const legacy = { ...initial, schemaVersion: 1 as const, algorithmVersion: 'legacy-import-v1' };
    expect(decodeTripPlan(legacy)?.schemaVersion).toBe(1);
    expect(decodeTripPlan({ schemaVersion: 3 })).toBeUndefined();
  });

  it('preserves unaffected days and removes a vetoed place when refining', () => {
    const initial = makePlan();
    const target = initial.items.find((item) => item.day === 1 && item.kind !== 'downtime' && item.itemId);
    expect(target).toBeDefined();
    const dayTwoIds = initial.items.filter((item) => item.day === 2).map((item) => item.itemId);
    const feedback = [{
      itemId: target!.itemId!,
      placeId: target!.placeId,
      day: 1,
      memberId: 'member',
      reaction: 'veto' as const,
      createdAt: '2026-07-29T12:00:00Z',
    }];
    const refined = refineTripPlan(
      {
        destination,
        places: planPlaces,
        preferences: {
          ...basePrefs,
          departureAirports: ['SFO'],
          groupSize: 2,
          activityPace: 'downtime',
        },
        tripDurationDays: 2,
        startDate: '2026-08-10',
      },
      initial,
      feedback,
      [1],
    );
    expect(refined.items.some((item) => item.placeId === target!.placeId)).toBe(false);
    expect(refined.items.filter((item) => item.day === 2).map((item) => item.itemId)).toEqual(dayTwoIds);
    expect(refined.revision).toBe(initial.revision + 1);
  });

  it('does not let affiliate metadata change ranking', () => {
    const withOffer = makePlan();
    const withoutOffer = makePlan({
      places: planPlaces.map((place) => {
        const { bookingOffer: _bookingOffer, ...candidate } = place;
        return candidate;
      }),
    });
    expect(withOffer.items.map((item) => item.placeId)).toEqual(
      withoutOffer.items.map((item) => item.placeId),
    );
    expect(withOffer.bookingTimeline.find((action) => action.provider === 'viator')?.disclosure)
      .toMatch(/commission/i);
  });

  it('only labels fares below recent observations with sufficient history', () => {
    const insufficient = makePlan({
      flightPriceContext: {
        currentPrice: 180,
        baselinePrice: 240,
        currency: 'USD',
        observationCount: 4,
      },
    });
    expect(insufficient.flightPriceGuidance?.status).toBe('insufficient_history');

    const supported = makePlan({
      flightPriceContext: {
        currentPrice: 180,
        baselinePrice: 240,
        currency: 'USD',
        savingsPercent: 25,
        observationCount: 5,
      },
    });
    expect(supported.flightPriceGuidance?.status).toBe('below_recent_observations');
    expect(supported.flightPriceGuidance?.message).not.toMatch(/guarantee|best time/i);
  });
});
