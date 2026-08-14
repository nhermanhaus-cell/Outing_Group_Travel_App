import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { clusterOverlappingMapMarkers, nextClusterMarker } from '../../src/lib/map-marker-overlap';

export type TripMapMarker = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'lodging' | 'itinerary' | 'experience' | 'nearby' | 'place';
};

const PIN: Record<TripMapMarker['kind'], string> = {
  lodging: '#E4572E',
  itinerary: '#2A9D8F',
  experience: '#E9C46A',
  nearby: '#264653',
  place: '#8B7355',
};

type Props = {
  markers: TripMapMarker[];
  /** Optional route polyline (itinerary order) */
  routeCoords?: Array<{ latitude: number; longitude: number }>;
  height?: number;
  onSelectMarker?: (marker: TripMapMarker) => void;
  selectedMarkerId?: string | null;
  fitTrigger?: string | number;
};

export function TripMap({
  markers,
  routeCoords,
  height = 280,
  onSelectMarker,
  selectedMarkerId,
  fitTrigger,
}: Props) {
  const { colors, radius } = useTheme();
  const mapRef = useRef<MapView>(null);
  const validMarkers = useMemo(
    () => markers.filter((marker) =>
      Number.isFinite(marker.lat)
      && Number.isFinite(marker.lng)
      && Math.abs(marker.lat) <= 90
      && Math.abs(marker.lng) <= 180
      && !(marker.lat === 0 && marker.lng === 0)),
    [markers],
  );
  const markerClusters = useMemo(
    () => clusterOverlappingMapMarkers(validMarkers),
    [validMarkers],
  );

  const region = useMemo(() => {
    if (validMarkers.length === 0) {
      return {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    const lats = validMarkers.map((m) => m.lat);
    const lngs = validMarkers.map((m) => m.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latitude = (minLat + maxLat) / 2;
    const longitude = (minLng + maxLng) / 2;
    const latitudeDelta = Math.max(0.02, (maxLat - minLat) * 1.4 || 0.04);
    const longitudeDelta = Math.max(0.02, (maxLng - minLng) * 1.4 || 0.04);
    return { latitude, longitude, latitudeDelta, longitudeDelta };
  }, [validMarkers]);

  useEffect(() => {
    if (validMarkers.length === 0) return;
    mapRef.current?.fitToCoordinates(
      validMarkers.map((marker) => ({ latitude: marker.lat, longitude: marker.lng })),
      { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: true },
    );
  }, [fitTrigger, validMarkers]);

  useEffect(() => {
    const selected = validMarkers.find((marker) => marker.id === selectedMarkerId);
    if (!selected) return;
    mapRef.current?.animateCamera(
      { center: { latitude: selected.lat, longitude: selected.lng }, zoom: 15 },
      { duration: 350 },
    );
  }, [selectedMarkerId, validMarkers]);

  if (validMarkers.length === 0) {
    return (
      <View
        style={{
          height,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.backgroundSecondary,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
          Add lodging or itinerary stops to see them on the map.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        height,
        borderRadius: radius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation={false}
        showsCompass
        loadingEnabled
      >
        {markerClusters.map((cluster, clusterIndex) => {
          const selectedMember = cluster.members.find((member) => member.id === selectedMarkerId);
          const representative = selectedMember ?? cluster.members[0]!;
          const hasLodging = cluster.members.some((member) => member.kind === 'lodging');
          const label = cluster.members.length > 1
            ? `${cluster.members.length} stops at this location`
            : representative.label;
          return (
            <Marker
              key={cluster.key}
              coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
              title={label}
              tracksViewChanges={false}
              zIndex={selectedMember ? 10_000 : markerClusters.length - clusterIndex}
              onPress={() => onSelectMarker?.(nextClusterMarker(cluster, selectedMarkerId))}
            >
              <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: PIN[representative.kind], borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="captionBold" style={{ color: '#fff', fontVariant: ['tabular-nums'] }}>
                    {hasLodging ? '⌂' : representative.originalIndex + 1}
                  </Text>
                </View>
                {cluster.members.length > 1 ? (
                  <View style={{ position: 'absolute', right: 0, top: 0, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: colors.textPrimary, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <Text variant="captionBold" style={{ color: colors.background, fontVariant: ['tabular-nums'] }}>
                      {cluster.members.length}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Marker>
          );
        })}
        {routeCoords && routeCoords.length > 1 ? (
          <Polyline
            coordinates={routeCoords}
            strokeColor={colors.accent}
            strokeWidth={3}
          />
        ) : null}
      </MapView>
    </View>
  );
}
