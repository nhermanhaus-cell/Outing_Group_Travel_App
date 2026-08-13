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

function readable(value: string): string {
  return value.replaceAll('_', ' ');
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
    900,
  );

  const preferenceLead = matchingPreferences.length
    ? `Your interest in ${joinNatural(matchingPreferences.slice(0, 3).map(readable))} lines up especially well here.`
    : `The strongest reasons to consider ${destination.name} are ${joinNatural(highlights.length ? highlights : ['its local character and signature experiences'])}.`;
  const neighborhoodDetail = neighborhoods.length
    ? ` Neighborhoods such as ${joinNatural(neighborhoods)} give the trip distinct moods instead of one generic city experience.`
    : destination.sampleItineraryHint
      ? ` ${destination.sampleItineraryHint}`
      : '';

  return {
    overview,
    personalizedReason: clampCopy(`${preferenceLead}${neighborhoodDetail}`, 300),
  };
}
