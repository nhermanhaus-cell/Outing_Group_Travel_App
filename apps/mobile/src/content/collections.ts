import type { EditorialCollection } from '@gayi/shared';

export const editorialCollections: EditorialCollection[] = [
  {
    id: 'weekend-escapes',
    title: 'Weekend escapes from your home area',
    kicker: 'Near enough to say yes',
    whyVisit: 'A change of scene with enough queer community, good food, and restorative time to feel like a real trip.',
    highlights: [
      { title: 'Easy arrivals', description: 'Spend less of a short trip in transit.' },
      { title: 'A social anchor', description: 'Start with a neighborhood where community is visible.' },
      { title: 'One excellent meal', description: 'Leave room for the reservation you will remember.' },
    ],
    bestFor: ['long weekends', 'couples', 'friends'],
    travelRanges: ['road_trip', 'short_flight'], bestMonths: [3, 4, 5, 9, 10],
    seasonGuidance: 'Personalized by your saved airport and selected travel range.',
    destinationSlugs: ['palm-springs', 'guerneville', 'provincetown', 'las-vegas'],
    heroImageUrl: '',
    attribution: 'Outing editorial; destination imagery credited on each destination.',
  },
  {
    id: 'queer-history', title: 'Queer history worth the trip', kicker: 'Walk where we became visible',
    whyVisit: 'These cities hold living archives, gathering places, protest routes, and museums that make queer history tangible.',
    highlights: [
      { title: 'Living landmarks', description: 'Pair major sites with the neighborhoods around them.' },
      { title: 'Local voices', description: 'Look for community-led tours and cultural institutions.' },
      { title: 'History after dark', description: 'See how legacy venues still shape the social scene.' },
    ],
    bestFor: ['history', 'culture', 'community'], seasonGuidance: 'Year-round; check museum hours and local events.',
    travelRanges: ['short_flight', 'long_domestic', 'international'], bestMonths: [3, 4, 5, 9, 10, 11],
    destinationSlugs: ['san-francisco', 'new-york-city', 'berlin', 'london', 'amsterdam'], heroImageUrl: '',
    attribution: 'Outing editorial; destination imagery credited on each destination.',
  },
  {
    id: 'sun-social', title: 'Sun, sand, and a social scene', kicker: 'Beach days, chosen family nights',
    whyVisit: 'Warm-water afternoons and lively queer neighborhoods make these places easy to enjoy without over-scheduling.',
    highlights: [
      { title: 'Queer beach culture', description: 'Find the social stretch of sand, not just the famous one.' },
      { title: 'Golden-hour rituals', description: 'Build in sunset time before dinner.' },
      { title: 'Late starts welcome', description: 'Protect a slow morning after the big night.' },
    ],
    bestFor: ['beach', 'nightlife', 'downtime'], seasonGuidance: 'Favor shoulder seasons for softer heat and fewer crowds.',
    travelRanges: ['short_flight', 'long_domestic', 'international'], bestMonths: [2, 3, 4, 5, 10, 11],
    destinationSlugs: ['puerto-vallarta', 'miami', 'barcelona', 'palm-springs'], heroImageUrl: '',
    attribution: 'Outing editorial; destination imagery credited on each destination.',
  },
  {
    id: 'food-first', title: 'Food-first city breaks', kicker: 'Book the table, build around it',
    whyVisit: 'Markets, neighborhood kitchens, serious dining rooms, and late-night bites can tell a city’s story in a weekend.',
    highlights: [
      { title: 'Market mornings', description: 'Start close to the ingredients and makers.' },
      { title: 'One destination dinner', description: 'Anchor the day around a reservation worth planning for.' },
      { title: 'Local afters', description: 'Finish near a queer bar or relaxed night café.' },
    ],
    bestFor: ['food', 'culture', 'city breaks'], seasonGuidance: 'Year-round; reserve headline restaurants early.',
    travelRanges: ['short_flight', 'long_domestic', 'international'], bestMonths: [1, 3, 4, 5, 9, 10, 11],
    destinationSlugs: ['mexico-city', 'tokyo', 'lisbon', 'madrid', 'montreal'], heroImageUrl: '',
    attribution: 'Outing editorial; destination imagery credited on each destination.',
  },
  {
    id: 'big-night-out', title: 'Big-night-out capitals', kicker: 'For the night you plan the trip around',
    whyVisit: 'Deep club calendars, drag institutions, and dense queer districts reward travelers who make space for the night itself.',
    highlights: [
      { title: 'Choose the right night', description: 'Check the actual event calendar before locking dates.' },
      { title: 'Stay connected', description: 'Base yourself where the late-night route home is realistic.' },
      { title: 'Recovery is an activity', description: 'Keep the following afternoon deliberately open.' },
    ],
    bestFor: ['nightlife', 'music', 'friends'], seasonGuidance: 'Check venue calendars; opening patterns change by season.',
    travelRanges: ['short_flight', 'long_domestic', 'international'], bestMonths: [4, 5, 6, 7, 8, 9, 10],
    destinationSlugs: ['berlin', 'new-york-city', 'london', 'madrid', 'los-angeles'], heroImageUrl: '',
    attribution: 'Outing editorial; destination imagery credited on each destination.',
  },
  {
    id: 'soft-life', title: 'Soft-life wellness escapes', kicker: 'Less itinerary, more exhale',
    whyVisit: 'Beautiful surroundings, thoughtful hotels, spa time, and protected blank space make rest the point rather than the leftover.',
    highlights: [
      { title: 'A two-hour nothing block', description: 'Protect it before adding optional plans.' },
      { title: 'Gentle movement', description: 'Choose one scenic walk, swim, or restorative class.' },
      { title: 'Ease over optimization', description: 'Keep meals and treatments close to where you stay.' },
    ],
    bestFor: ['wellness', 'couples', 'downtime'], seasonGuidance: 'Choose weather that supports the kind of rest you want.',
    travelRanges: ['road_trip', 'short_flight', 'long_domestic', 'international'], bestMonths: [2, 3, 4, 5, 9, 10, 11],
    destinationSlugs: ['palm-springs', 'guerneville', 'lisbon', 'puerto-vallarta'], heroImageUrl: '',
    attribution: 'Outing editorial; destination imagery credited on each destination.',
  },
];

export function getCollection(id: string) {
  return editorialCollections.find((collection) => collection.id === id);
}
