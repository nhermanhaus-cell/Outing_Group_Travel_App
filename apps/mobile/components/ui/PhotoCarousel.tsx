import React, { useMemo, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';

type Props = {
  urls: string[];
  height?: number;
  attribution?: string;
};

export function PhotoCarousel({ urls, height = 180, attribution }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(320);
  const [failed, setFailed] = useState<string[]>([]);
  const valid = useMemo(
    () => [...new Set((urls ?? []).filter((url) => Boolean(url) && !failed.includes(url)))].slice(0, 5),
    [failed, urls],
  );

  if (valid.length === 0) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setIndex(Math.round(x / Math.max(width, 1)));
  };

  return (
    <View
      style={{ gap: spacing.xs }}
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ borderRadius: radius.lg, overflow: 'hidden' }}
      >
        {valid.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            style={{ width, height, backgroundColor: colors.backgroundTertiary }}
            contentFit="cover"
            transition={180}
            cachePolicy="memory"
            accessibilityLabel="Place photo"
            onError={() => setFailed((current) => [...current, uri])}
          />
        ))}
      </ScrollView>
      {valid.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {valid.map((_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? colors.accent : colors.border,
              }}
            />
          ))}
        </View>
      ) : null}
      {attribution ? (
        <Text variant="caption" style={{ color: colors.textTertiary }}>
          {attribution}
        </Text>
      ) : null}
    </View>
  );
}
