import type { AssistantSearchIntent } from '@gayi/shared';

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

const INTEREST_TERMS: Record<string, string[]> = {
  beach: ['beach', 'coast', 'ocean', 'island'],
  food: ['food', 'restaurant', 'restaurants', 'dining', 'culinary', 'markets'],
  nightlife: ['nightlife', 'clubs', 'club', 'bars', 'dancing', 'party'],
  art: ['art', 'galleries', 'gallery', 'museums', 'museum'],
  culture: ['culture', 'history', 'architecture', 'historic'],
  hiking: ['hiking', 'hikes', 'mountains', 'nature', 'outdoors'],
  wellness: ['wellness', 'spa', 'relax', 'recharge'],
  music: ['music', 'concert', 'concerts', 'festival'],
  pride: ['pride', 'queer', 'lgbtq'],
};

export function parseTravelSearchIntent(query: string): AssistantSearchIntent {
  const normalized = query.trim().toLowerCase();
  const month = Object.entries(MONTHS).find(([label]) => new RegExp(`\\b${label}\\b`).test(normalized))?.[1];
  const interests = Object.entries(INTEREST_TERMS).flatMap(([interest, terms]) =>
    terms.some((term) => new RegExp(`\\b${term}\\b`).test(normalized)) ? [interest] : []);
  const budgetLevel = /cheap|cheapest|budget|affordable|inexpensive/.test(normalized)
    ? 'shoestring_slay'
    : /luxury|splurge|five.star/.test(normalized)
      ? 'luxury_gaycation'
      : undefined;
  const climate = /\b(warm|hot|sunny|tropical)\b/.test(normalized)
    ? 'warm' as const
    : /\b(cool|cold|snow|ski)\b/.test(normalized)
      ? 'cool' as const
      : /\b(mild|temperate)\b/.test(normalized) ? 'mild' as const : undefined;
  const destinationMatch = normalized.match(/\b(?:near|around|outside|in)\s+([a-z][a-z .'-]{2,40})(?:\s+(?:for|with|in|under|during)\b|$)/i);
  const destinationHint = destinationMatch?.[1]?.trim();
  const hardConstraints = [
    ...(/wheelchair|step.free|mobility access/.test(normalized) ? ['wheelchair access'] : []),
    ...(/\bno nightlife\b|\bavoid nightlife\b|\bquiet nights\b/.test(normalized) ? ['avoid: nightlife'] : []),
    ...(/\bno beach\b|\bavoid beaches\b/.test(normalized) ? ['avoid: beach'] : []),
  ];
  return {
    query: query.trim(),
    interests: [...new Set(interests)],
    ...(month ? { month } : {}),
    ...(budgetLevel ? { budgetLevel } : {}),
    ...(climate ? { climate } : {}),
    ...(destinationHint && !MONTHS[destinationHint] ? { destinationHint } : {}),
    hardConstraints,
  };
}

export function isConversationalTravelSearch(intent: AssistantSearchIntent): boolean {
  return intent.interests.length > 0 || intent.month !== undefined || intent.budgetLevel !== undefined ||
    intent.climate !== undefined || intent.hardConstraints.length > 0 || intent.query.trim().split(/\s+/).length >= 4;
}

export function travelSearchChips(intent: AssistantSearchIntent): string[] {
  return [
    ...intent.interests.map((interest) => interest.replaceAll('_', ' ')),
    ...(intent.month ? [Object.keys(MONTHS).find((key) => MONTHS[key] === intent.month && key.length > 3) ?? `month ${intent.month}`] : []),
    ...(intent.budgetLevel ? [intent.budgetLevel === 'shoestring_slay' ? 'affordable' : 'luxury'] : []),
    ...(intent.climate ? [intent.climate] : []),
    ...intent.hardConstraints.map((constraint) => constraint.replace(/^avoid:\s*/i, 'avoid ')),
  ];
}

export function destinationMatchesSearchIntent(destination: {
  interests: readonly string[];
  bestMonths: readonly number[];
  costPerDay: { budget: number; luxury: number };
  avgTempCByMonth: Partial<Record<number, number>>;
  accessibility: { wheelchairFriendly: boolean };
}, intent: AssistantSearchIntent): boolean {
  if (intent.interests.length && !intent.interests.some((interest) =>
    destination.interests.some((value) => value === interest ||
      (interest === 'culture' && value === 'art') ||
      (interest === 'hiking' && value === 'outdoors')))) return false;
  if (intent.month && !destination.bestMonths.includes(intent.month)) return false;
  if (intent.budgetLevel === 'shoestring_slay' && destination.costPerDay.budget > 100) return false;
  if (intent.budgetLevel === 'luxury_gaycation' && destination.costPerDay.luxury < 180) return false;
  if (intent.climate && intent.climate !== 'any') {
    const month = intent.month ?? new Date().getMonth() + 1;
    const temperature = destination.avgTempCByMonth[month];
    if (temperature !== undefined && intent.climate === 'warm' && temperature < 20) return false;
    if (temperature !== undefined && intent.climate === 'cool' && temperature > 18) return false;
    if (temperature !== undefined && intent.climate === 'mild' && (temperature < 14 || temperature > 25)) return false;
  }
  if (intent.hardConstraints.includes('wheelchair access') && !destination.accessibility.wheelchairFriendly) return false;
  if (intent.hardConstraints.includes('avoid: nightlife') && destination.interests.includes('nightlife')) return false;
  if (intent.hardConstraints.includes('avoid: beach') && destination.interests.includes('beach')) return false;
  return true;
}
