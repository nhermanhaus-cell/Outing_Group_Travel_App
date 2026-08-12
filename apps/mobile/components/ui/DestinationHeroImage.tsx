import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Image } from 'expo-image';
import {
  useDestinationImages,
  type DestinationImageInput,
} from '../../src/lib/destinationImages';
import { useTheme } from '../../src/theme/ThemeProvider';

type Props = {
  destination?: DestinationImageInput | null;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export function DestinationHeroImage({
  destination,
  style,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const { candidates, isLoading } = useDestinationImages(destination);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);

  useEffect(() => setFailedUrls([]), [destination?.slug]);

  const active = useMemo(
    () => candidates.find((candidate) => !failedUrls.includes(candidate.url)),
    [candidates, failedUrls],
  );
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: colors.backgroundTertiary }]}>
      {active ? (
        <Image
          source={{ uri: active.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          accessibilityLabel={accessibilityLabel ?? `${destination?.name ?? 'Destination'} photo`}
          onError={() => setFailedUrls((current) => current.includes(active.url)
            ? current
            : [...current, active.url])}
        />
      ) : isLoading ? (
        <View style={StyleSheet.absoluteFill} />
      ) : null}
    </View>
  );
}
