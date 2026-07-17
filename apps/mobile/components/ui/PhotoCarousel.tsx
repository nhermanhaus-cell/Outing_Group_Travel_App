import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';
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
  const [width, setWidth] = useState(Dimensions.get('window').width - spacing.base * 2);
  const valid = (urls ?? []).filter(Boolean);

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
            resizeMode="cover"
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
