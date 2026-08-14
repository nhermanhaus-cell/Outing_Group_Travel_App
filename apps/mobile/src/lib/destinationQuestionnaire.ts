import type { Interest } from '@gayi/shared';

export interface DestinationQuestionnaireSource {
  slug: string;
  name: string;
  interests?: string[] | null;
  heroImageUrl?: string | null;
  galleryImageUrls?: string[] | null;
  places?: Array<{
    id?: string;
    name?: string;
    category?: string;
    summary?: string;
    lgbtqRelevance?: string | null;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
  }> | null;
  events?: Array<{
    id?: string;
    title?: string;
    category?: string;
    summary?: string;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
  }> | null;
}

export interface DestinationInterestOption {
  key: Interest;
  label: string;
  reason: string;
}

export interface DestinationHallmarkOption {
  id: string;
  label: string;
  kind: 'place' | 'event';
  category?: string;
  description: string;
  imageUrl?: string;
  imageAttribution?: string;
  imageProvider?: 'google_places' | 'editorial';
  providerPlaceId?: string;
}

export interface DestinationHallmarkMedia {
  hallmarkId: string;
  providerPlaceId: string;
  imageUrl?: string;
  imageAttribution?: string;
}

const INTEREST_LABELS: Record<Interest, string> = {
  beach: 'Beaches & waterfront',
  hiking: 'Parks & outdoors',
  culture: 'Local culture',
  nightlife: 'Nightlife',
  food: 'Food & drink',
  art: 'Art, design & museums',
  history: 'History & architecture',
  shopping: 'Shopping & design',
  wellness: 'Wellness & slow time',
  adventure: 'Active adventures',
  pride: 'Pride & festivals',
  sports: 'Sports',
  music: 'Live music',
  lgbtq_venues: 'Queer venues & community',
  drag: 'Drag & performance',
};

const SAFE_DISCOVERY_INTERESTS: Interest[] = [
  'food',
  'culture',
  'nightlife',
  'art',
  'history',
  'shopping',
  'wellness',
  'music',
  'lgbtq_venues',
];

function normalizedTokens(values: Array<string | undefined>): Set<string> {
  return new Set(values.flatMap((value) => (value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)));
}

function addMappedInterest(interests: Set<Interest>, value: string) {
  const token = value.toLowerCase().replace(/[\s-]+/g, '_');
  const mappings: Record<string, Interest[]> = {
    architecture: ['history', 'culture'],
    art_culture: ['art', 'culture'],
    arts: ['art'],
    bar: ['nightlife', 'lgbtq_venues'],
    beach: ['beach'],
    cafe: ['food'],
    club: ['nightlife', 'lgbtq_venues'],
    culture: ['culture'],
    drag: ['drag', 'nightlife'],
    event: ['pride', 'music'],
    festival: ['pride', 'music'],
    food: ['food'],
    gallery: ['art'],
    hiking: ['hiking', 'adventure'],
    history: ['history'],
    landmark: ['history', 'culture'],
    local_immersion: ['culture', 'food'],
    luxury: ['shopping', 'wellness'],
    market: ['food', 'shopping'],
    museum: ['art', 'history'],
    music: ['music'],
    nightlife: ['nightlife'],
    outdoors: ['hiking', 'adventure'],
    park: ['hiking', 'wellness'],
    party: ['nightlife', 'music'],
    pride: ['pride', 'lgbtq_venues'],
    relaxed_queer: ['wellness', 'lgbtq_venues'],
    restaurant: ['food'],
    sex_positive: ['nightlife', 'lgbtq_venues'],
    shop: ['shopping'],
    shopping: ['shopping'],
    spa: ['wellness'],
    sports: ['sports'],
    wellness: ['wellness'],
  };
  (mappings[token] ?? []).forEach((interest) => interests.add(interest));
  if (Object.prototype.hasOwnProperty.call(INTEREST_LABELS, token)) {
    interests.add(token as Interest);
  }
}

export function getDiscoveryInterestOptions(): DestinationInterestOption[] {
  return SAFE_DISCOVERY_INTERESTS.map((key) => ({
    key,
    label: INTEREST_LABELS[key],
    reason: 'Used to find destinations that fit this interest.',
  }));
}

export function getDestinationInterestOptions(
  destination?: DestinationQuestionnaireSource | null,
): DestinationInterestOption[] {
  if (!destination) return getDiscoveryInterestOptions();
  const supported = new Set<Interest>();
  (destination.interests ?? []).forEach((interest) => addMappedInterest(supported, interest));
  (destination.places ?? []).forEach((place) => {
    addMappedInterest(supported, place.category ?? '');
    const words = normalizedTokens([place.name, place.summary]);
    if (words.has('drag')) supported.add('drag');
    if (words.has('music') || words.has('concert')) supported.add('music');
    if (words.has('beach') || words.has('waterfront')) supported.add('beach');
  });
  (destination.events ?? []).forEach((event) => {
    addMappedInterest(supported, event.category ?? '');
    const words = normalizedTokens([event.title, event.summary]);
    if (words.has('drag')) supported.add('drag');
    if (words.has('music') || words.has('concert')) supported.add('music');
  });

  // These are useful in any city, but nature/coast options remain evidence-based.
  for (const fallback of SAFE_DISCOVERY_INTERESTS) {
    if (supported.size >= 8) break;
    supported.add(fallback);
  }

  return Array.from(supported).map((key) => ({
    key,
    label: INTEREST_LABELS[key],
    reason: `${destination.name} has matching ${INTEREST_LABELS[key].toLowerCase()} options.`,
  }));
}

export function getDestinationHallmarks(
  destination?: DestinationQuestionnaireSource | null,
): DestinationHallmarkOption[] {
  if (!destination) return [];
  const fallbackImages = [
    ...(destination.galleryImageUrls ?? []),
    destination.heroImageUrl,
  ].filter((url): url is string => Boolean(url));
  const fallbackDescription = (kind: 'place' | 'event', category?: string) => kind === 'event'
    ? `A signature local event that offers a memorable way to experience ${destination.name}.`
    : `A signature ${category?.replace(/_/g, ' ') ?? 'place'} that helps tell the story of ${destination.name}.`;
  const conciseDescription = (values: Array<string | null | undefined>, fallback: string) => {
    const clean = values
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return fallback;
    const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];
    const firstTwo = sentences.slice(0, 2).map((sentence) => sentence.trim()).join(' ');
    return firstTwo.length <= 240 ? firstTwo : `${firstTwo.slice(0, 237).trimEnd()}…`;
  };
  const places = (destination.places ?? []).flatMap((place, index) =>
    place.id && place.name
      ? [{
          id: place.id,
          label: place.name,
          kind: 'place' as const,
          category: place.category,
          description: conciseDescription(
            [place.summary, place.lgbtqRelevance],
            fallbackDescription('place', place.category),
          ),
          imageUrl: place.imageUrls?.[0] ?? place.imageUrl ?? fallbackImages[index % fallbackImages.length],
        }]
      : []);
  const events = (destination.events ?? []).flatMap((event, index) =>
    event.id && event.title
      ? [{
          id: event.id,
          label: event.title,
          kind: 'event' as const,
          category: event.category,
          description: conciseDescription(
            [event.summary],
            fallbackDescription('event', event.category),
          ),
          imageUrl: event.imageUrls?.[0]
            ?? event.imageUrl
            ?? fallbackImages[(places.length + index) % fallbackImages.length],
        }]
      : []);
  return [...places.slice(0, 6), ...events.slice(0, 3)];
}

export function mergeDestinationHallmarkMedia(
  hallmarks: DestinationHallmarkOption[],
  media: DestinationHallmarkMedia[],
): DestinationHallmarkOption[] {
  const byHallmarkId = new Map(media.map((item) => [item.hallmarkId, item]));
  return hallmarks.map((hallmark) => {
    const match = hallmark.kind === 'place' ? byHallmarkId.get(hallmark.id) : undefined;
    if (!match?.imageUrl) return hallmark;
    return {
      ...hallmark,
      imageUrl: match.imageUrl,
      imageAttribution: match.imageAttribution,
      imageProvider: 'google_places',
      providerPlaceId: match.providerPlaceId,
    };
  });
}
