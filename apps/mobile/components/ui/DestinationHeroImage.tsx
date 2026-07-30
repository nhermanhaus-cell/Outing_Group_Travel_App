import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
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
import { Text } from './Text';

type Props = {
  destination?: DestinationImageInput | null;
  style: StyleProp<ImageStyle>;
  showAttribution?: boolean;
  attributionTop?: number;
  accessibilityLabel?: string;
};

export function DestinationHeroImage({
  destination,
  style,
  showAttribution = true,
  attributionTop,
  accessibilityLabel,
}: Props) {
  const { colors, radius, spacing } = useTheme();
  const { candidates, isLoading } = useDestinationImages(destination);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);

  useEffect(() => setFailedUrls([]), [destination?.slug]);

  const active = useMemo(
    () => candidates.find((candidate) => !failedUrls.includes(candidate.url)),
    [candidates, failedUrls],
  );
  const credit = active?.image
    ? `Photo by ${active.image.author ?? 'a contributor'} on Pexels`
    : undefined;

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
      {showAttribution && credit && active?.image?.sourcePage ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${credit}; open photo source`}
          onPress={(event) => {
            event.stopPropagation();
            void Linking.openURL(active.image!.sourcePage);
          }}
          style={{
            position: 'absolute',
            ...(attributionTop === undefined
              ? { bottom: spacing.xs }
              : { top: attributionTop }),
            right: spacing.xs,
            maxWidth: '78%',
            backgroundColor: 'rgba(15,13,10,0.68)',
            borderRadius: radius.sm,
            paddingHorizontal: spacing.xs,
            paddingVertical: 3,
          }}
        >
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: colors.white, textDecorationLine: 'underline' }}
          >
            {credit}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
