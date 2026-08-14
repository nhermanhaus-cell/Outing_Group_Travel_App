import type { Interest } from '@gayi/shared';

type DestinationOverviewInput = {
  name: string;
  editorialSummary?: string;
  interests?: readonly string[];
  neighborhoods?: ReadonlyArray<{ name: string; summary?: string }>;
  sampleItineraryHint?: string;
};

const INTEREST_ALIASES: Partial<Record<Interest, string[]>> = {
  art: ['art', 'art_culture', 'museums'],
  culture: ['culture', 'art_culture', 'architecture', 'history'],
  hiking: ['hiking', 'outdoors', 'nature'],
  lgbtq_venues: ['lgbtq_venues', 'pride', 'nightlife'],
  pride: ['pride', 'lgbtq_venues'],
  adventure: ['adventure', 'outdoors'],
  beach: ['beach', 'coast'],
  food: ['food', 'culinary'],
  nightlife: ['nightlife', 'drag', 'music'],
  music: ['music', 'nightlife'],
  wellness: ['wellness', 'spa'],
};

const INTEREST_COPY: Record<string, string> = {
  adventure: 'adventure',
  architecture: 'architecture',
  art: 'art',
  art_culture: 'art and culture',
  beach: 'beach time',
  circuit_parties: 'big dance weekends',
  coast: 'coastal time',
  culture: 'culture',
  culinary: 'food-led days',
  drag: 'drag and performance',
  festivals: 'festivals',
  food: 'food-led days',
  hiking: 'hiking',
  history: 'history',
  local_immersion: 'neighborhood wandering',
  lgbtq_venues: 'queer community and nightlife',
  luxury: 'polished stays',
  museums: 'museums',
  music: 'live music',
  nightlife: 'late nights',
  outdoors: 'outdoor time',
  pride: 'queer history and community',
  quiet_retreat: 'quiet escapes',
  relaxed_queer: 'a relaxed queer social scene',
  romance: 'romantic time away',
  sex_positive: 'sex-positive nightlife',
  shopping: 'shopping and design',
  spa: 'spa time',
  tropical_escape: 'tropical downtime',
  wellness: 'slow, restorative days',
};

function readable(value: string): string {
  return INTEREST_COPY[value] ?? value.replaceAll('_', ' ');
}

function capitalize(value: string): string {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function templateIndex(value: string, templateCount: number): number {
  const total = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return total % templateCount;
}

function joinNatural(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function clampCopy(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const clipped = clean.slice(0, maxLength - 1);
  const sentence = clipped.lastIndexOf('. ');
  if (sentence >= Math.floor(maxLength * 0.55)) return clipped.slice(0, sentence + 1);
  const word = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, Math.max(0, word))}…`;
}

export function buildDestinationOverview(
  destination: DestinationOverviewInput,
  preferredInterests: readonly Interest[] = [],
): { overview: string; personalizedReason: string } {
  const destinationInterests = new Set((destination.interests ?? []).map((interest) => interest.toLowerCase()));
  const matchingPreferences = [...new Set(preferredInterests)].filter((interest) =>
    (INTEREST_ALIASES[interest] ?? [interest]).some((alias) => destinationInterests.has(alias)),
  );
  const highlights = [...destinationInterests].slice(0, 3).map(readable);
  const neighborhoods = (destination.neighborhoods ?? []).slice(0, 2).map((neighborhood) => neighborhood.name);
  const overview = clampCopy(
    destination.editorialSummary
      ?? destination.sampleItineraryHint
      ?? `${destination.name} works best as a mix of ${joinNatural(highlights.length ? highlights : ['local neighborhoods', 'food', 'culture'])}.`,
    360,
  );

  const signature = highlights.length ? highlights : ['local character', 'signature experiences'];
  const primary = signature[0]!;
  const secondary = signature[1] ?? 'neighborhood character';
  const neighborhood = neighborhoods[0];
  const matched = joinNatural(matchingPreferences.slice(0, 3).map(readable));
  const preferenceTemplates = [
    `A natural match for your interest in ${matched}.`,
    `${destination.name} pairs well with your interest in ${matched}.`,
    `Start with ${matched}; leave room for ${primary}.`,
    `Your taste for ${matched} fits the rhythm here.`,
    `${capitalize(matched)} can anchor this trip without making it feel one-note.`,
    `This is an easy place to build around ${matched}.`,
  ];
  const generalTemplates = [
    `Expect ${primary} up front, with ${secondary} adding range.`,
    `${destination.name} stands out for ${joinNatural(signature)}.`,
    `Come for ${primary}; stay for ${secondary}.`,
    `${capitalize(joinNatural(signature))} shape the appeal.`,
    `${destination.name} makes it easy to mix ${primary} with ${secondary}.`,
    `Best for travelers drawn to ${joinNatural(signature)}.`,
  ];
  const lead = matchingPreferences.length
    ? preferenceTemplates[templateIndex(destination.name, preferenceTemplates.length)]!
    : generalTemplates[templateIndex(destination.name, generalTemplates.length)]!;
  const neighborhoodDetail = neighborhood
    ? ` ${neighborhood} ${templateIndex(destination.name, 2) === 0 ? 'is an easy place to start' : 'adds a distinct local angle'}.`
    : '';

  return {
    overview,
    personalizedReason: clampCopy(`${lead}${neighborhoodDetail}`, 190),
  };
}
