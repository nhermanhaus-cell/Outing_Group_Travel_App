import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
export type TripMapMarker = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'lodging' | 'itinerary' | 'experience' | 'nearby' | 'place';
};

type Props = {
  markers: TripMapMarker[];
  routeCoords?: Array<{ latitude: number; longitude: number }>;
  height?: number;
  onSelectMarker?: (marker: TripMapMarker) => void;
  selectedMarkerId?: string | null;
  fitTrigger?: string | number;
};

export function TripMap({ markers, height = 280, onSelectMarker, selectedMarkerId }: Props) {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ minHeight: height, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSecondary, padding: spacing.base, gap: spacing.sm, justifyContent: markers.length ? 'flex-start' : 'center' }}>
    <Text variant="labelLg">Itinerary map</Text>
    {markers.length === 0 ? <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>Add lodging or itinerary stops to see this day.</Text> : markers.map((marker, index) => <Pressable key={marker.id} onPress={() => onSelectMarker?.(marker)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: selectedMarkerId === marker.id ? colors.accentLight : colors.cardBackground }}><View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: marker.kind === 'lodging' ? '#E4572E' : colors.accent, alignItems: 'center', justifyContent: 'center' }}><Text variant="captionBold" style={{ color: '#fff' }}>{marker.kind === 'lodging' ? '⌂' : index + 1}</Text></View><Text variant="bodyMd" style={{ flex: 1 }}>{marker.label}</Text></Pressable>)}
    <Text variant="caption" style={{ color: colors.textTertiary }}>Interactive Google route maps are available in the iOS and Android app.</Text>
  </View>;
}
