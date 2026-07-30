import React, { useMemo, useState } from 'react';
import {
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
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
  attributions?: Array<{ text: string; url?: string } | undefined>;
};

export function PhotoCarousel({ urls, height = 180, attribution, attributions }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(320);
  const [failed, setFailed] = useState<string[]>([]);
  const valid = useMemo(() => {
    const seen = new Set<string>();
    return (urls ?? [])
      .map((url, originalIndex) => ({ url, attribution: attributions?.[originalIndex] }))
      .filter((item) => {
        if (!item.url || failed.includes(item.url) || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, 5);
  }, [attributions, failed, urls]);

  if (valid.length === 0) return null;
  const activeAttribution = valid[Math.min(index, valid.length - 1)]?.attribution;

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
        {valid.map(({ url: uri }) => (
          <Image
            key={uri}
            source={{ uri }}
            style={{ width, height, backgroundColor: colors.backgroundTertiary }}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
            accessibilityLabel="Place photo"
            onError={() => setFailed((current) => [...current, uri])}
          />
        ))}
      </ScrollView>
      {valid.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {valid.map((item, i) => (
            <View
              key={item.url}
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
      {activeAttribution?.url ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${activeAttribution.text}; open photo source`}
          onPress={() => Linking.openURL(activeAttribution.url!).catch(() => undefined)}
        >
          <Text variant="caption" style={{ color: colors.textTertiary, textDecorationLine: 'underline' }}>
            {activeAttribution.text}
          </Text>
        </Pressable>
      ) : activeAttribution?.text || attribution ? (
        <Text variant="caption" style={{ color: colors.textTertiary }}>
          {activeAttribution?.text ?? attribution}
        </Text>
      ) : null}
    </View>
  );
}
