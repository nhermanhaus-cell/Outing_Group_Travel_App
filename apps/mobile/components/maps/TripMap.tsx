import React, { useMemo, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';

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
};

export function TripMap({
  markers,
  routeCoords,
  height = 280,
  onSelectMarker,
}: Props) {
  const { colors, radius } = useTheme();
  const mapRef = useRef<MapView>(null);

  const region = useMemo(() => {
    if (markers.length === 0) {
      return {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    const lats = markers.map((m) => m.lat);
    const lngs = markers.map((m) => m.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latitude = (minLat + maxLat) / 2;
    const longitude = (minLng + maxLng) / 2;
    const latitudeDelta = Math.max(0.02, (maxLat - minLat) * 1.4 || 0.04);
    const longitudeDelta = Math.max(0.02, (maxLng - minLng) * 1.4 || 0.04);
    return { latitude, longitude, latitudeDelta, longitudeDelta };
  }, [markers]);

  if (markers.length === 0) {
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
        region={region}
        showsUserLocation={false}
        showsCompass
        loadingEnabled
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.lat, longitude: marker.lng }}
            title={marker.label}
            pinColor={PIN[marker.kind]}
            onPress={() => onSelectMarker?.(marker)}
          />
        ))}
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
