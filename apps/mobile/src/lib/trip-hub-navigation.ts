export type TripHubSectionKey =
  | 'overview'
  | 'itinerary'
  | 'budget'
  | 'polls'
  | 'members'
  | 'places'
  | 'map'
  | 'comments';

export const TRIP_PRIMARY_AREAS = [
  { key: 'plan', label: 'Plan', section: 'itinerary' },
  { key: 'explore', label: 'Explore', section: 'places' },
  { key: 'group', label: 'Group', section: 'polls' },
] as const;

export const TRIP_GROUP_SECTIONS = [
  { key: 'polls', label: 'Decisions' },
  { key: 'members', label: 'People' },
  { key: 'comments', label: 'Chat' },
] as const;

const DIRECT_SECTIONS = new Set<TripHubSectionKey>([
  'overview',
  'itinerary',
  'budget',
  'polls',
  'members',
  'places',
  'map',
  'comments',
]);

export function resolveInitialTripSection(
  requestedSection?: string,
  building?: string,
): TripHubSectionKey {
  if (building === '1') return 'itinerary';
  if (requestedSection === 'plan') return 'itinerary';
  if (requestedSection === 'explore') return 'places';
  if (requestedSection === 'group') return 'polls';
  if (DIRECT_SECTIONS.has(requestedSection as TripHubSectionKey)) {
    return requestedSection as TripHubSectionKey;
  }
  return 'itinerary';
}
