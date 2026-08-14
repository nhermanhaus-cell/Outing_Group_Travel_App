export interface CoordinateMarker {
  id: string;
  lat: number;
  lng: number;
}

export interface MapMarkerCluster<T extends CoordinateMarker> {
  key: string;
  members: Array<T & { originalIndex: number }>;
  lat: number;
  lng: number;
}

function distanceMeters(left: CoordinateMarker, right: CoordinateMarker): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(right.lat - left.lat);
  const longitudeDelta = toRadians(right.lng - left.lng);
  const leftLatitude = toRadians(left.lat);
  const rightLatitude = toRadians(right.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/** Groups pins that would visually fight for the same map position. */
export function clusterOverlappingMapMarkers<T extends CoordinateMarker>(
  markers: T[],
  thresholdMeters = 8,
): Array<MapMarkerCluster<T>> {
  const clusters: Array<MapMarkerCluster<T>> = [];
  const seenIds = new Set<string>();

  markers.forEach((marker, originalIndex) => {
    if (seenIds.has(marker.id)) return;
    seenIds.add(marker.id);
    const member = { ...marker, originalIndex };
    const cluster = clusters.find((candidate) =>
      distanceMeters({ id: candidate.key, lat: candidate.lat, lng: candidate.lng }, marker) <= thresholdMeters);
    if (cluster) {
      cluster.members.push(member);
      cluster.key = `cluster:${cluster.members.map((item) => item.id).sort().join('|')}`;
      return;
    }
    clusters.push({
      key: `cluster:${marker.id}`,
      members: [member],
      lat: marker.lat,
      lng: marker.lng,
    });
  });

  return clusters;
}

export function nextClusterMarker<T extends CoordinateMarker>(
  cluster: MapMarkerCluster<T>,
  selectedMarkerId: string | null | undefined,
): T & { originalIndex: number } {
  const selectedIndex = cluster.members.findIndex((member) => member.id === selectedMarkerId);
  return cluster.members[(selectedIndex + 1) % cluster.members.length]!;
}
