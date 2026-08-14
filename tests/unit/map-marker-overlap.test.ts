import { describe, expect, it } from 'vitest';
import {
  clusterOverlappingMapMarkers,
  nextClusterMarker,
} from '../../apps/mobile/src/lib/map-marker-overlap';

const markers = [
  { id: 'museum-morning', lat: 40.779437, lng: -73.963244, label: 'Museum morning' },
  { id: 'museum-afternoon', lat: 40.779437, lng: -73.963244, label: 'Museum afternoon' },
  { id: 'dinner', lat: 40.7681, lng: -73.9819, label: 'Dinner' },
];

describe('overlapping itinerary map markers', () => {
  it('renders exact coordinate overlaps as one stable cluster', () => {
    const clusters = clusterOverlappingMapMarkers(markers);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.members.map((marker) => marker.id)).toEqual(['museum-morning', 'museum-afternoon']);
    expect(clusters[0]?.key).toBe('cluster:museum-afternoon|museum-morning');
  });

  it('clusters pins only a few meters apart but keeps distinct places separate', () => {
    const clusters = clusterOverlappingMapMarkers([
      markers[0]!,
      { ...markers[1]!, lat: 40.77946, lng: -73.96325 },
      markers[2]!,
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.members).toHaveLength(2);
  });

  it('cycles deterministically through the stops represented by one pin', () => {
    const cluster = clusterOverlappingMapMarkers(markers)[0]!;

    expect(nextClusterMarker(cluster, null).id).toBe('museum-morning');
    expect(nextClusterMarker(cluster, 'museum-morning').id).toBe('museum-afternoon');
    expect(nextClusterMarker(cluster, 'museum-afternoon').id).toBe('museum-morning');
  });

  it('drops duplicate IDs before constructing native marker keys', () => {
    const clusters = clusterOverlappingMapMarkers([markers[0]!, markers[0]!]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members).toHaveLength(1);
  });
});
