import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { ItineraryItem, TripPlan, TripPlanItemEditAction } from '@gayi/domain';
import { useAuth, useDestinations, useTrips } from '../../../../src/providers/AppProviders';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import {
  itinerarySearchContext,
  itineraryItemRouteId,
  itineraryTimingConflicts,
  rankItineraryPlaceRecommendations,
  clearTripPlanItemToOpenSlot,
  createItineraryItemEditProposal,
  resolveItineraryItem,
  insertTripPlanItemAfter,
  scheduledItineraryTimestamps,
  shiftItineraryClock,
  updateTripPlanItem,
  type ItineraryPlaceRecommendation,
} from '../../../../src/lib/itinerary-item-actions';
import {
  lookupPlaceByName,
  searchPlacesNearContext,
  type NearbyPlaceResult,
} from '../../../../src/lib/googlePlaces';
import { Text } from '../../../../components/ui/Text';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { OutingIcon, type OutingIconName } from '../../../../components/ui/OutingIcon';
import { RouteLine } from '../../../../components/ui/RouteLine';
import { formatClockRange, formatClockTime, normalizeClockInput } from '../../../../src/lib/display-format';
import { useDisplayPreferences } from '../../../../src/lib/display-preferences';

type DetailMode = 'details' | 'timing' | 'replace' | 'review' | 'custom';
type PriceFilter = 'any' | '1' | '2' | '3' | '4';

const CUISINES = ['Any cuisine', 'Local favorites', 'Italian', 'Mexican', 'Japanese', 'Thai', 'Mediterranean', 'Vegetarian'];
const ACTIVITY_SEARCHES = ['Highlights', 'Art & culture', 'Outdoors', 'Shopping', 'Coffee', 'Nightlife'];
const PRICE_FILTERS: Array<{ value: PriceFilter; label: string }> = [
  { value: 'any', label: 'Any price' }, { value: '1', label: '$' }, { value: '2', label: '$$' },
  { value: '3', label: '$$$' }, { value: '4', label: '$$$$' },
];

const MEAL_PREFERENCE_LABELS: Record<string, string> = {
  local_specialties: 'Local specialties',
  casual_gems: 'Casual gems',
  fine_dining: 'Destination dining',
  markets_cafes: 'Markets & cafés',
  dietary_friendly: 'Dietary friendly',
  food_low_priority: 'Keep it easy',
};

function mealSearchHint(preferences: string[]): string {
  if (preferences.includes('fine_dining')) return 'destination dining';
  if (preferences.includes('casual_gems')) return 'casual neighborhood';
  if (preferences.includes('markets_cafes')) return 'market cafe';
  if (preferences.includes('local_specialties')) return 'local specialties';
  if (preferences.includes('dietary_friendly')) return 'dietary friendly';
  return '';
}

function priceNumber(value?: string): number | undefined {
  if (!value) return undefined;
  if (/inexpensive|free|level_?1|^1$/i.test(value)) return 1;
  if (/moderate|level_?2|^2$/i.test(value)) return 2;
  if (/very_expensive|level_?4|^4$/i.test(value)) return 4;
  if (/expensive|level_?3|^3$/i.test(value)) return 3;
  return undefined;
}

function priceLabel(value?: string): string | undefined {
  const number = priceNumber(value);
  return number ? '$'.repeat(number) : undefined;
}

function formatCategory(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isOpenSlot(item: ItineraryItem): boolean {
  return item.kind === 'meal' || item.kind === 'downtime';
}

export default function ItineraryItemScreen() {
  const { tripId, itemId } = useLocalSearchParams<{ tripId: string; itemId: string }>();
  const router = useRouter();
  const { getTrip, updateTrip } = useTrips();
  const { user } = useAuth();
  const { getBySlug } = useDestinations();
  const { colors, spacing, radius, shadows } = useTheme();
  const [displayPreferences] = useDisplayPreferences();
  const trip = getTrip(tripId);
  const plan = trip?.tripPlan;
  const item = plan ? resolveItineraryItem(plan.items, itemId) : undefined;
  const canonicalItemId = item ? itineraryItemRouteId(item) : itemId;
  const destination = trip?.destinationSlug ? getBySlug(trip.destinationSlug) : undefined;
  const openSlot = item ? isOpenSlot(item) : false;
  const [mode, setMode] = useState<DetailMode>(openSlot ? 'replace' : 'details');
  const [cuisine, setCuisine] = useState(CUISINES[0]!);
  const [activitySearch, setActivitySearch] = useState(ACTIVITY_SEARCHES[0]!);
  const [price, setPrice] = useState<PriceFilter>('any');
  const [customTitle, setCustomTitle] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [customTime, setCustomTime] = useState(item ? formatClockTime(item.time, displayPreferences.timeFormat) : displayPreferences.timeFormat === '12h' ? '12:00 PM' : '12:00');
  const [customDuration, setCustomDuration] = useState('60');
  const [customPlacement, setCustomPlacement] = useState<'replace' | 'after'>(openSlot ? 'replace' : 'after');
  const [saving, setSaving] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<ItineraryPlaceRecommendation>();
  const [undoPlan, setUndoPlan] = useState<TripPlan>();
  const [freeWindowWishDraft, setFreeWindowWishDraft] = useState('');
  const [freeWindowWish, setFreeWindowWish] = useState('');

  const context = useMemo(
    () => item && plan ? itinerarySearchContext(plan.items, item) : undefined,
    [item, plan],
  );
  const day = plan?.days.find((candidate) => candidate.day === item?.day);
  const catalogPlace = destination?.places.find((place) =>
    place.id === item?.placeId || place.name.toLowerCase() === item?.title.toLowerCase());

  const liveDetails = useQuery({
    queryKey: ['itinerary-place-detail', tripId, itemId, item?.title],
    queryFn: () => lookupPlaceByName(item!.title, trip?.destinationName ?? destination?.name ?? '', {
      center: item!.coords,
      ...(catalogPlace?.address ? { address: catalogPlace.address } : {}),
    }),
    enabled: Boolean(item && trip && !openSlot),
    staleTime: 30 * 60_000,
  });

  const tripMealPreferences = trip?.planningPreferences?.mealPreferences ?? [];
  const preferenceHint = mealSearchHint(tripMealPreferences);
  const searchQuery = openSlot && item?.kind === 'meal'
    ? cuisine === 'Any cuisine'
      ? `${preferenceHint} restaurant`.trim()
      : `${cuisine} ${preferenceHint} restaurant`.trim()
    : freeWindowWish.trim() || (activitySearch === 'Highlights' ? 'top things to do' : activitySearch);
  const nearby = useQuery({
    queryKey: ['itinerary-context-search', tripId, itemId, searchQuery, price, context?.center.lat, context?.center.lng],
    queryFn: () => searchPlacesNearContext({
      lat: context!.center.lat,
      lng: context!.center.lng,
      query: `${searchQuery} in ${trip?.destinationName ?? destination?.name ?? ''}`,
      limit: 16,
      radiusMeters: 4_000,
    }),
    enabled: Boolean(mode === 'replace' && context && trip),
    staleTime: 10 * 60_000,
  });
  const recommendations = useMemo(() => {
    if (!item || !context) return [];
    const priceMatches = (nearby.data ?? []).filter((place) =>
      price === 'any' || priceNumber(place.priceLevel) === Number(price));
    return rankItineraryPlaceRecommendations(priceMatches, item, context, {
      startDate: trip?.startDate,
      mealPreferences: tripMealPreferences,
      avoidances: trip?.planningPreferences?.avoidances ?? [],
      preferredTransportMode: trip?.preferredTransportMode,
    }).slice(0, 10);
  }, [context, item, nearby.data, price, trip?.planningPreferences?.avoidances, trip?.preferredTransportMode, trip?.startDate, tripMealPreferences]);

  if (!trip || !plan || !item || !context) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
        <Stack.Screen options={{ headerShown: true, title: 'Itinerary' }} />
        <Text variant="h1">This stop isn’t available</Text>
        <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>It may have changed since you opened the itinerary.</Text>
        <Button onPress={() => router.replace(`/trips/${tripId}`)}>Back to trip</Button>
      </View>
    );
  }

  const heroUrl = liveDetails.data?.imageUrls[0] ?? catalogPlace?.imageUrl ?? catalogPlace?.imageUrls?.[0] ?? destination?.heroImageUrl;
  const liveAddress = liveDetails.data?.address ?? liveDetails.data?.vicinity ?? catalogPlace?.address;
  const summary = item.summary ?? catalogPlace?.summary ?? (openSlot
    ? item.kind === 'meal'
      ? 'Choose a meal that fits the flow of this day, your preferred cuisine, and how much you want to spend.'
      : 'Keep this breathing room, or turn it into one more memorable stop without disrupting the rest of the day.'
    : `${item.title} is part of this day because it complements the pace, interests, and route of your trip.`);

  const commitPlanChange = async (
    nextPlan: TripPlan,
    action: TripPlanItemEditAction,
    changeSummary: string,
  ): Promise<boolean> => {
    const role = trip.members?.find((member) => member.id === user?.id)?.role;
    const groupSize = Math.max(trip.travelers, trip.members?.length ?? 0);
    const requiresVote = groupSize > 1 && role !== 'owner' && role !== 'organizer';
    if (requiresVote) {
      const proposal = createItineraryItemEditProposal(
        plan,
        nextPlan,
        item.day,
        action,
        changeSummary,
        trip.tripId,
      );
      await updateTrip(tripId, {
        tripPlanProposals: [...(trip.tripPlanProposals ?? []), proposal],
        polls: [...(trip.polls ?? []), {
          id: `item-edit-${Date.now()}`,
          question: changeSummary,
          options: [
            { id: `${proposal.proposalId}-yes`, label: 'Use this change', votes: [] },
            { id: `${proposal.proposalId}-no`, label: 'Keep the current plan', votes: [] },
          ],
          createdAt: new Date().toISOString(),
          planProposalId: proposal.proposalId,
        }],
      });
      if (process.env.EXPO_OS === 'ios') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sent to the group', 'The itinerary will change if this option wins the vote. An organizer can resolve a tie.');
      router.back();
      return false;
    }
    await updateTrip(tripId, { tripPlan: nextPlan, itineraryItems: nextPlan.items as unknown as Array<Record<string, unknown>> });
    setUndoPlan(plan);
    if (process.env.EXPO_OS === 'ios') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  };

  const saveUpdates = async (
    updates: Partial<ItineraryItem>,
    action: TripPlanItemEditAction = 'replace_item',
    changeSummary = `Update ${item.title} on Day ${item.day}`,
  ): Promise<boolean> => {
    setSaving(true);
    try {
      const schedule = updates.time
        ? scheduledItineraryTimestamps(trip.startDate, updates.day ?? item.day, updates.time, updates.duration ?? item.duration)
        : {};
      const nextPlan = updateTripPlanItem(plan, canonicalItemId, { ...updates, ...schedule });
      return await commitPlanChange(nextPlan, action, changeSummary);
    } catch (error) {
      Alert.alert('That change didn’t save', error instanceof Error ? error.message : 'Please try again.');
      return false;
    } finally { setSaving(false); }
  };

  const requestTimeChange = (nextTime: string) => {
    const conflicts = itineraryTimingConflicts(plan, canonicalItemId, nextTime, item.duration);
    if (!conflicts.length) {
      void saveUpdates({ time: nextTime }, 'move_item', `Move ${item.title} to ${nextTime} on Day ${item.day}`);
      return;
    }
    Alert.alert(
      'This overlaps another plan',
      `${conflicts[0]!.title} is already scheduled then. You can move this anyway and adjust the other stop next.`,
      [
        { text: 'Keep current time', style: 'cancel' },
        { text: 'Move anyway', onPress: () => void saveUpdates({ time: nextTime }, 'move_item', `Move ${item.title} to ${nextTime} on Day ${item.day}`) },
      ],
    );
  };

  const applyFreeWindowWish = () => {
    const wish = freeWindowWishDraft.trim();
    if (!wish) return;
    setFreeWindowWish(wish);
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
  };

  const choosePlace = (place: NearbyPlaceResult) => {
    const apply = () => void saveUpdates({
      title: place.name,
      summary: [place.category ? formatCategory(place.category) : undefined, place.vicinity].filter(Boolean).join(' · '),
      category: place.category,
      placeId: place.placeId,
      coords: { lat: place.lat, lng: place.lng },
      estimatedCost: (priceNumber(place.priceLevel) ?? 2) * 20,
      source: 'google_places',
      confidence: place.rating ? Math.min(0.98, 0.65 + place.rating / 20) : 0.75,
      whySelected: `${context.label}. Chosen by you from current nearby recommendations.`,
      kind: 'place',
      ...((item.slotRole ?? (item.kind === 'meal' ? 'meal' : item.kind === 'downtime' ? 'free_time' : undefined))
        ? { slotRole: item.slotRole ?? (item.kind === 'meal' ? 'meal' as const : 'free_time' as const) }
        : {}),
      scheduleStatus: 'verified',
    }, openSlot ? 'fill_open_slot' : 'replace_item', `${openSlot ? 'Add' : 'Replace with'} ${place.name} at ${formatClockTime(item.time, displayPreferences.timeFormat)} on Day ${item.day}`).then((applied) => {
      if (!applied) return;
      setSelectedRecommendation(undefined);
      setMode('details');
    });
    if (openSlot) apply();
    else Alert.alert(`Replace ${item.title}?`, `${place.name} will use the same place in your itinerary.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', onPress: apply },
    ]);
  };

  const addCustomIdea = async () => {
    if (!customTitle.trim()) return;
    const normalizedCustomTime = normalizeClockInput(customTime);
    if (!normalizedCustomTime) {
      Alert.alert('Check the start time', displayPreferences.timeFormat === '12h' ? 'Use a time such as 2:30 PM.' : 'Use a 24-hour time such as 14:30.');
      return;
    }
    setSaving(true);
    const duration = Math.max(15, Math.min(720, Number(customDuration) || 60));
    try {
      const resolvedPlace = await lookupPlaceByName(
        customTitle.trim(),
        trip.destinationName ?? destination?.name ?? '',
        { center: context.center },
      );
      const resolvedTitle = resolvedPlace?.name ?? customTitle.trim();
      const resolvedSummary = customNotes.trim() || resolvedPlace?.vicinity || 'An idea added by you.';
      const resolvedPlaceId = resolvedPlace?.placeId ?? `custom-${Date.now()}`;
      const resolvedCoords = resolvedPlace
        ? { lat: resolvedPlace.lat, lng: resolvedPlace.lng }
        : context.center;
      if (customPlacement === 'after' && !openSlot) {
        const customId = `custom-${Date.now()}`;
        const customItem: ItineraryItem = {
          itemId: customId,
          day: item.day,
          time: normalizedCustomTime,
          title: resolvedTitle,
          summary: resolvedSummary,
          category: resolvedPlace?.category ?? 'custom',
          placeId: resolvedPlaceId,
          duration,
          estimatedCost: resolvedPlace ? (priceNumber(resolvedPlace.priceLevel) ?? 2) * 20 : 0,
          bookingRequired: false,
          source: resolvedPlace ? 'google_places' : 'traveler',
          confidence: 1,
          coords: resolvedCoords,
          whySelected: resolvedPlace ? 'Added by you and verified with Google Places.' : 'Added directly by you.',
          kind: 'place',
          locked: true,
          scheduleStatus: resolvedPlace ? 'verified' : 'estimated',
          ...scheduledItineraryTimestamps(trip.startDate, item.day, normalizedCustomTime, duration),
        };
        const nextPlan = insertTripPlanItemAfter(plan, canonicalItemId, customItem);
        const applied = await commitPlanChange(nextPlan, 'add_custom_item', `Add ${resolvedTitle} after ${item.title} on Day ${item.day}`);
        if (applied) router.back();
      } else {
        const nextPlan = updateTripPlanItem(plan, canonicalItemId, {
          time: normalizedCustomTime,
          title: resolvedTitle,
          summary: resolvedSummary,
          category: resolvedPlace?.category ?? (item.kind === 'meal' ? 'restaurant' : 'custom'),
          placeId: resolvedPlaceId,
          duration,
          estimatedCost: resolvedPlace ? (priceNumber(resolvedPlace.priceLevel) ?? 2) * 20 : 0,
          source: resolvedPlace ? 'google_places' : 'traveler',
          confidence: 1,
          coords: resolvedCoords,
          whySelected: resolvedPlace ? 'Added by you and verified with Google Places.' : 'Added directly by you.',
          kind: 'place',
          ...((item.slotRole ?? (item.kind === 'meal' ? 'meal' : item.kind === 'downtime' ? 'free_time' : undefined))
            ? { slotRole: item.slotRole ?? (item.kind === 'meal' ? 'meal' as const : 'free_time' as const) }
            : {}),
          locked: true,
          scheduleStatus: resolvedPlace ? 'verified' : 'estimated',
          ...scheduledItineraryTimestamps(trip.startDate, item.day, normalizedCustomTime, duration),
        });
        const applied = await commitPlanChange(nextPlan, openSlot ? 'fill_open_slot' : 'replace_item', `${openSlot ? 'Add' : 'Replace with'} ${resolvedTitle} at ${formatClockTime(normalizedCustomTime, displayPreferences.timeFormat)} on Day ${item.day}`);
        if (applied) router.back();
      }
    } catch (error) {
      Alert.alert('That idea didn’t save', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{
        headerShown: true,
        title: openSlot ? item.kind === 'meal' ? 'Choose a meal' : 'Shape this free time' : item.title,
        headerTransparent: true,
        headerTintColor: colors.white,
        headerBackTitle: 'Plan',
      }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: spacing['5xl'], gap: spacing.xl }}
      >
        <View style={{ height: 430, backgroundColor: colors.ink700, overflow: 'hidden' }}>
          {heroUrl ? <Image source={{ uri: heroUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={240} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(19,12,29,0.38)' }]} />
          {!heroUrl ? <View style={{ position: 'absolute', right: -20, top: 80, opacity: 0.5 }}><RouteLine color={colors.coral300} width={280} /></View> : null}
          <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <View style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.92)' }}>
                <Text variant="labelSm" style={{ color: colors.ink700 }}>DAY {item.day} · {formatClockTime(item.time, displayPreferences.timeFormat)}</Text>
              </View>
              {item.anchor ? <Badge label="Shared anchor" variant="accent" /> : null}
            </View>
            <Text variant="displayMd" style={{ color: colors.white }}>{openSlot ? item.kind === 'meal' ? 'What sounds good?' : 'A little room to wander' : item.title}</Text>
            <Text variant="bodySm" style={{ color: 'rgba(255,255,255,0.84)' }}>{day?.title ?? `Day ${item.day}`} · {context.label}</Text>
          </View>
        </View>

        <Animated.View entering={FadeInUp.duration(240)} style={{ paddingHorizontal: spacing.lg, gap: spacing.xl }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ActionButton icon="route" label="Change time" active={mode === 'timing'} onPress={() => setMode('timing')} />
            <ActionButton icon="discover" label={openSlot ? item.kind === 'meal' ? 'Find food' : 'Find an idea' : 'Change place'} active={mode === 'replace'} onPress={() => setMode('replace')} />
            <ActionButton icon="spark" label="Add your own" active={mode === 'custom'} onPress={() => setMode('custom')} />
          </View>

          {undoPlan ? (
            <Animated.View entering={FadeInUp.duration(180)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.poolLight, borderCurve: 'continuous' }}>
              <OutingIcon name="spark" size={20} color={colors.pool} />
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="labelMd">Itinerary updated</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>The map, timing, and trip estimate will use this choice.</Text>
              </View>
              <Pressable onPress={() => void updateTrip(tripId, { tripPlan: undoPlan, itineraryItems: undoPlan.items as unknown as Array<Record<string, unknown>> }).then(() => setUndoPlan(undefined))}>
                <Text variant="labelMd" style={{ color: colors.accent }}>Undo</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {mode === 'timing' ? (
            <Section title="Make the timing yours" eyebrow="IN YOUR ITINERARY">
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>Move this stop without rebuilding the rest of the day.</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button fullWidth style={{ flex: 1 }} variant="secondary" loading={saving} onPress={() => requestTimeChange(shiftItineraryClock(item.time, -30))}>30 min earlier</Button>
                <Button fullWidth style={{ flex: 1 }} variant="secondary" loading={saving} onPress={() => requestTimeChange(shiftItineraryClock(item.time, 30))}>30 min later</Button>
              </View>
              <Text variant="caption" style={{ color: colors.textTertiary }}>Currently {formatClockRange(item.time, item.windowEndTime, displayPreferences.timeFormat)} · {item.duration} minutes</Text>
            </Section>
          ) : null}

          {mode === 'replace' ? (
            <Section
              title={item.kind === 'meal' ? 'Find the right table' : openSlot ? 'Use this free window' : 'Choose a different stop'}
              eyebrow={context.label.toUpperCase()}
            >
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                {item.kind === 'meal'
                  ? 'Recommendations are centered on the stops before and after this meal, so lunch or dinner fits the actual route.'
                  : 'These ideas are close to where this day already takes you, helping you add something without creating a cross-city detour.'}
              </Text>
              <View style={{ padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, gap: spacing.xs, borderCurve: 'continuous' }}>
                <Text variant="labelMd">{formatClockTime(item.time, displayPreferences.timeFormat)} · {item.duration} minutes</Text>
                <Text variant="bodySm" style={{ color: colors.textSecondary }}>{context.label}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {tripMealPreferences.filter((preference) => MEAL_PREFERENCE_LABELS[preference]).slice(0, 3).map((preference) => (
                    <Badge key={preference} label={MEAL_PREFERENCE_LABELS[preference]!} variant="info" />
                  ))}
                  {trip?.planningPreferences?.avoidances.includes('long_walks') ? <Badge label="Shorter travel preferred" variant="default" /> : null}
                  {trip?.planningPreferences?.avoidances.includes('expensive_surprises') ? <Badge label="Price clarity preferred" variant="default" /> : null}
                </View>
              </View>
              {item.kind === 'downtime' ? (
                <View style={{ padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm, borderCurve: 'continuous' }}>
                  <View style={{ gap: spacing.xxs }}>
                    <Text variant="labelMd">What would feel good here?</Text>
                    <Text variant="bodySm" style={{ color: colors.textSecondary }}>Describe the mood, budget, energy, or kind of place you want.</Text>
                  </View>
                  <TextInput
                    value={freeWindowWishDraft}
                    onChangeText={setFreeWindowWishDraft}
                    onSubmitEditing={applyFreeWindowWish}
                    placeholder="A relaxed wine bar, easy walk, somewhere locals love…"
                    placeholderTextColor={colors.textTertiary}
                    returnKeyType="search"
                    style={{ minHeight: 78, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: 'Manrope_400Regular', fontSize: 15, textAlignVertical: 'top' }}
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    {freeWindowWish ? <Button style={{ flex: 1 }} variant="ghost" onPress={() => { setFreeWindowWish(''); setFreeWindowWishDraft(''); }}>Clear</Button> : null}
                    <Button style={{ flex: 1 }} disabled={!freeWindowWishDraft.trim()} onPress={applyFreeWindowWish}>{freeWindowWish ? 'Update ideas' : 'Find ideas'}</Button>
                  </View>
                  {freeWindowWish ? <Text variant="caption" style={{ color: colors.pool }}>Searching for: “{freeWindowWish}”</Text> : null}
                </View>
              ) : null}
              <FilterRow
                values={item.kind === 'meal' ? CUISINES : ACTIVITY_SEARCHES}
                selected={item.kind === 'meal' ? cuisine : activitySearch}
                onSelect={item.kind === 'meal' ? setCuisine : setActivitySearch}
              />
              {item.kind === 'meal' ? (
                <FilterRow values={PRICE_FILTERS.map((filter) => filter.label)} selected={PRICE_FILTERS.find((filter) => filter.value === price)?.label ?? 'Any price'} onSelect={(label) => setPrice(PRICE_FILTERS.find((filter) => filter.label === label)?.value ?? 'any')} />
              ) : null}
              {nearby.isLoading ? <RecommendationSkeleton /> : nearby.isError ? (
                <View style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, gap: spacing.sm }}>
                  <Text variant="h3">Live ideas are taking a moment</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>You can retry or add your own place without waiting.</Text>
                  <Button variant="secondary" onPress={() => void nearby.refetch()}>Try again</Button>
                </View>
              ) : recommendations.length ? recommendations.map((recommendation) => (
                <PlaceOption
                  key={recommendation.place.placeId}
                  recommendation={recommendation}
                  onPress={() => {
                    setSelectedRecommendation(recommendation);
                    setMode('review');
                  }}
                />
              )) : (
                <View style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, gap: spacing.sm }}>
                  <Text variant="h3">No exact matches yet</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>Try another cuisine or price point, or add the place you already have in mind.</Text>
                  <Button variant="secondary" onPress={() => setMode('custom')}>Add your own idea</Button>
                </View>
              )}
              <Button variant="secondary" onPress={() => router.push({
                pathname: '/trips/[tripId]/ask',
                params: {
                  tripId,
                  focusKind: 'item',
                  focusAction: 'nearby',
                  itemId: canonicalItemId,
                  prompt: item.kind === 'meal'
                    ? `Help me choose a ${cuisine.toLowerCase()} meal around ${formatClockTime(item.time, displayPreferences.timeFormat)} that fits this day`
                    : `Help me choose something to do during this free window around ${formatClockTime(item.time, displayPreferences.timeFormat)}${(freeWindowWish || freeWindowWishDraft).trim() ? ` — I’m looking for ${(freeWindowWish || freeWindowWishDraft).trim()}` : ''}`,
                },
              })}>Ask Outing to narrow it down</Button>
            </Section>
          ) : null}

          {mode === 'review' && selectedRecommendation ? (
            <PlaceReview
              recommendation={selectedRecommendation}
              contextLabel={context.label}
              slotTime={formatClockTime(item.time, displayPreferences.timeFormat)}
              saving={saving}
              onBack={() => setMode('replace')}
              onChoose={() => choosePlace(selectedRecommendation.place)}
            />
          ) : null}

          {mode === 'custom' ? (
            <Section title="Add what you have in mind" eyebrow="YOUR IDEA">
              {!openSlot ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {(['after', 'replace'] as const).map((placement) => (
                    <Pressable key={placement} onPress={() => setCustomPlacement(placement)} style={{ flex: 1, padding: spacing.md, borderRadius: radius.lg, backgroundColor: customPlacement === placement ? colors.accentLight : colors.backgroundSecondary, borderWidth: 1, borderColor: customPlacement === placement ? colors.accent : colors.border }}>
                      <Text variant="labelMd" style={{ textAlign: 'center', color: customPlacement === placement ? colors.accent : colors.textPrimary }}>{placement === 'after' ? 'Add after this stop' : 'Replace this stop'}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Field label="Place or idea" value={customTitle} onChangeText={setCustomTitle} placeholder="A gallery, café, walk, or reservation" />
              <Field label="A note for the trip" value={customNotes} onChangeText={setCustomNotes} placeholder="Why you want to go, reservation details, or an address" multiline />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><Field label="Start time" value={customTime} onChangeText={setCustomTime} placeholder={displayPreferences.timeFormat === '12h' ? '2:30 PM' : '14:30'} /></View>
                <View style={{ flex: 1 }}><Field label="Minutes" value={customDuration} onChangeText={setCustomDuration} placeholder="60" keyboardType="number-pad" /></View>
              </View>
              <Button loading={saving} disabled={!customTitle.trim()} onPress={() => void addCustomIdea()}>{customPlacement === 'after' && !openSlot ? 'Add to this day' : 'Use this time'}</Button>
            </Section>
          ) : null}

          {mode === 'details' ? (
            <>
              <Section title="Why it belongs in your day" eyebrow={formatCategory(item.category)}>
                <Text selectable variant="bodyLg" style={{ color: colors.textPrimary, lineHeight: 26 }}>{summary}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  <Badge label={`${item.duration} min`} variant="default" />
                  {item.estimatedCost > 0 ? <Badge label={`About $${Math.round(item.estimatedCost)}`} variant="info" /> : null}
                  {liveDetails.data?.rating ? <Badge label={`${liveDetails.data.rating.toFixed(1)} ★`} variant="success" /> : null}
                  {liveDetails.data?.userRatingsTotal ? <Badge label={`${liveDetails.data.userRatingsTotal.toLocaleString()} reviews`} variant="default" /> : null}
                  {priceLabel(liveDetails.data?.priceLevel) ? <Badge label={priceLabel(liveDetails.data?.priceLevel)!} variant="default" /> : null}
                </View>
                <Text selectable variant="bodySm" style={{ color: colors.textSecondary }}>{item.whySelected}</Text>
              </Section>

              <Section title="Know before you go" eyebrow="PLACE DETAILS">
                {liveAddress ? <DetailLine icon="pin" title="Where" value={liveAddress} /> : null}
                <DetailLine icon="route" title="In the plan" value={`Day ${item.day} at ${formatClockTime(item.time, displayPreferences.timeFormat)} · ${context.label}`} />
                {item.bookingRequired ? <DetailLine icon="bookmark" title="Planning note" value="A reservation or advance ticket is recommended." /> : null}
                {item.accessibilityNotes ? <DetailLine icon="spark" title="Accessibility" value={item.accessibilityNotes} /> : null}
                {item.lgbtqRelevance ? <DetailLine icon="spark" title="Outing context" value={item.lgbtqRelevance} /> : null}
                {liveDetails.data?.googleMapsUri ? <Button variant="secondary" onPress={() => void Linking.openURL(liveDetails.data!.googleMapsUri!)}>Open in Google Maps</Button> : null}
                {item.bookingOffer ? (
                  <View style={{ gap: spacing.xs }}>
                    <Button onPress={() => void Linking.openURL(item.bookingOffer!.url)}>View on {formatCategory(item.bookingOffer.provider)}</Button>
                    {item.bookingOffer.disclosure ? <Text variant="caption" style={{ color: colors.textTertiary }}>{item.bookingOffer.disclosure}</Text> : null}
                  </View>
                ) : null}
              </Section>
              <Button variant="secondary" onPress={() => router.push({ pathname: '/trips/[tripId]/ask', params: { tripId, focusKind: 'item', itemId: canonicalItemId, prompt: `Tell me more about ${item.title} and what fits nearby` } })}>Ask Outing about this stop</Button>
              <Button variant="ghost" textStyle={{ color: colors.error }} onPress={() => Alert.alert(item.slotRole === 'meal' ? 'Remove this restaurant?' : 'Clear this time?', 'The time will stay open so you can choose something else later.', [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Make time open', style: 'destructive', onPress: () => {
                  const nextPlan = clearTripPlanItemToOpenSlot(plan, canonicalItemId);
                  void commitPlanChange(nextPlan, 'clear_item', `Leave ${formatClockTime(item.time, displayPreferences.timeFormat)} open on Day ${item.day}`).then((applied) => {
                    if (applied) router.back();
                  });
                } },
              ])}>{item.slotRole === 'meal' ? 'Remove restaurant' : 'Clear this time'}</Button>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>
    </>
  );
}

function ActionButton({ icon, label, active, onPress }: { icon: OutingIconName; label: string; active: boolean; onPress: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 92, padding: spacing.sm, borderRadius: radius.xl, backgroundColor: active ? colors.ink700 : colors.surface, borderWidth: 1, borderColor: active ? colors.ink700 : colors.border, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, opacity: pressed ? 0.76 : 1, borderCurve: 'continuous' })}>
      <OutingIcon name={icon} size={21} color={active ? colors.coral300 : colors.accent} />
      <Text variant="caption" style={{ color: active ? colors.white : colors.textPrimary, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return <View style={{ gap: spacing.md }}><View style={{ gap: spacing.xxs }}><Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1 }}>{eyebrow}</Text><Text variant="h1">{title}</Text></View>{children}</View>;
}

function FilterRow({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
  const { colors, spacing, radius } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: value === selected ? colors.ink700 : colors.surface, borderWidth: 1, borderColor: value === selected ? colors.ink700 : colors.border }}><Text variant="labelSm" style={{ color: value === selected ? colors.white : colors.textPrimary }}>{value}</Text></Pressable>)}</ScrollView>;
}

function PlaceOption({ recommendation, onPress }: { recommendation: ItineraryPlaceRecommendation; onPress: () => void }) {
  const { colors, spacing, radius, shadows } = useTheme();
  const { place } = recommendation;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ borderRadius: radius.xl, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1, ...shadows.sm, borderCurve: 'continuous' })}>
      {place.imageUrls[0] ? <Image source={{ uri: place.imageUrls[0] }} style={{ width: '100%', height: 180 }} contentFit="cover" transition={180} /> : null}
      <View style={{ padding: spacing.md, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}><Text variant="h3" style={{ flex: 1 }}>{place.name}</Text><OutingIcon name="arrow" size={18} color={colors.accent} /></View>
        <Text variant="bodySm" numberOfLines={2} style={{ color: colors.textSecondary }}>{place.vicinity ?? place.address ?? formatCategory(place.category)}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          {place.rating ? <Badge label={`${place.rating.toFixed(1)} ★`} variant="success" /> : null}
          {priceLabel(place.priceLevel) ? <Badge label={priceLabel(place.priceLevel)!} variant="default" /> : null}
          <Badge label={formatCategory(place.category)} variant="info" />
          {recommendation.openAtSlot ? <Badge label="Open then" variant="success" /> : <Badge label="Check hours" variant="default" />}
        </View>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {recommendation.fromPreviousMinutes !== undefined ? `≈${recommendation.fromPreviousMinutes} min from before` : ''}
          {recommendation.fromPreviousMinutes !== undefined && recommendation.toNextMinutes !== undefined ? ' · ' : ''}
          {recommendation.toNextMinutes !== undefined ? `≈${recommendation.toNextMinutes} min to next` : ''}
        </Text>
        <Text variant="labelSm" style={{ color: colors.pool }}>{recommendation.fitReasons.join(' · ')}</Text>
      </View>
    </Pressable>
  );
}

function PlaceReview({
  recommendation,
  contextLabel,
  slotTime,
  saving,
  onBack,
  onChoose,
}: {
  recommendation: ItineraryPlaceRecommendation;
  contextLabel: string;
  slotTime: string;
  saving: boolean;
  onBack: () => void;
  onChoose: () => void;
}) {
  const { colors, spacing, radius, shadows } = useTheme();
  const { place } = recommendation;
  return (
    <Animated.View entering={FadeInUp.duration(220)} style={{ gap: spacing.lg }}>
      <View style={{ borderRadius: radius['2xl'], backgroundColor: colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.sm, borderCurve: 'continuous' }}>
        {place.imageUrls[0] ? <Image source={{ uri: place.imageUrls[0] }} style={{ width: '100%', height: 260 }} contentFit="cover" transition={180} /> : null}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="labelSm" style={{ color: colors.accent }}>REVIEW THIS CHOICE</Text>
            <Text selectable variant="h1">{place.name}</Text>
            <Text selectable variant="bodySm" style={{ color: colors.textSecondary }}>{place.address ?? contextLabel}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {place.rating ? <Badge label={`${place.rating.toFixed(1)} ★`} variant="success" /> : null}
            {place.userRatingsTotal ? <Badge label={`${place.userRatingsTotal.toLocaleString()} reviews`} variant="default" /> : null}
            {priceLabel(place.priceLevel) ? <Badge label={priceLabel(place.priceLevel)!} variant="default" /> : null}
            <Badge label={recommendation.openAtSlot ? `Open around ${slotTime}` : 'Confirm hours'} variant={recommendation.openAtSlot ? 'success' : 'warning'} />
          </View>
          <View style={{ padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, gap: spacing.sm, borderCurve: 'continuous' }}>
            <Text variant="labelMd">How it fits the day</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>{contextLabel}</Text>
            <Text variant="bodySm" style={{ color: colors.textSecondary }}>
              {recommendation.fromPreviousMinutes !== undefined ? `About ${recommendation.fromPreviousMinutes} minutes from the prior stop. ` : ''}
              {recommendation.toNextMinutes !== undefined ? `About ${recommendation.toNextMinutes} minutes to the next stop.` : ''}
            </Text>
            {recommendation.fitReasons.map((reason) => <DetailLine key={reason} icon="spark" title="Fit" value={reason} />)}
          </View>
          {place.googleMapsUri ? <Button variant="secondary" onPress={() => void Linking.openURL(place.googleMapsUri!)}>View in Google Maps</Button> : null}
          <Button loading={saving} onPress={onChoose}>Add at {slotTime}</Button>
          <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>Place details and live metadata provided by Google Places. Travel times are estimates.</Text>
        </View>
      </View>
      <Button variant="ghost" onPress={onBack}>Keep looking</Button>
    </Animated.View>
  );
}

function RecommendationSkeleton() {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ height: 250, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.backgroundSecondary, justifyContent: 'flex-end', gap: spacing.sm }}><View style={{ width: '62%', height: 22, borderRadius: radius.sm, backgroundColor: colors.border }} /><View style={{ width: '88%', height: 14, borderRadius: radius.sm, backgroundColor: colors.border }} /><Text variant="caption" style={{ color: colors.textTertiary }}>Finding places that fit this part of your day…</Text></View>;
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ gap: spacing.xs }}><Text variant="labelSm" style={{ color: colors.textSecondary }}>{label}</Text><TextInput {...props} placeholderTextColor={colors.textTertiary} style={[{ minHeight: props.multiline ? 108 : 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, color: colors.textPrimary, padding: spacing.md, fontFamily: 'Manrope_400Regular', fontSize: 15, textAlignVertical: props.multiline ? 'top' : 'center' }, props.style]} /></View>;
}

function DetailLine({ icon, title, value }: { icon: OutingIconName; title: string; value: string }) {
  const { colors, spacing } = useTheme();
  return <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}><View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' }}><OutingIcon name={icon} size={17} color={colors.accent} /></View><View style={{ flex: 1, gap: spacing.xxs }}><Text variant="labelMd">{title}</Text><Text selectable variant="bodySm" style={{ color: colors.textSecondary }}>{value}</Text></View></View>;
}
