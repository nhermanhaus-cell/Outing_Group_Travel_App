export const ITINERARY_BUILD_MINIMUM_MS = 6_500;
export const ITINERARY_BUILD_MAXIMUM_MS = 10_000;

export function itineraryBuildRemainingMs(
  elapsedMs: number,
  itineraryReady: boolean,
): number {
  const target = itineraryReady
    ? ITINERARY_BUILD_MINIMUM_MS
    : ITINERARY_BUILD_MAXIMUM_MS;
  return Math.max(0, target - Math.max(0, elapsedMs));
}
