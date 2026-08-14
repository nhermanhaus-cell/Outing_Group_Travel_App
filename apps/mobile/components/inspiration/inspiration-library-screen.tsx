import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { InspirationImport } from '@gayi/shared';
import { useAuth } from '../../src/providers/AppProviders';
import { loadInspirationLibrary } from '../../src/lib/inspiration-imports';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { OutingIcon } from '../ui/OutingIcon';

export function InspirationLibraryScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user, loading } = useAuth();
  const router = useRouter();
  const library = useQuery({
    queryKey: ['inspiration-library', user?.id],
    queryFn: ({ signal }) => loadInspirationLibrary(signal),
    enabled: Boolean(user),
    staleTime: 20_000,
  });
  const imports = library.data ?? [];
  const confirmedCount = useMemo(
    () => imports.reduce((total, item) => total + item.items.filter((place) => place.status === 'confirmed').length, 0),
    [imports],
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'], gap: spacing.xl }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}>
          <OutingIcon name="arrow" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="labelSm" style={{ color: colors.plum, letterSpacing: 1.2 }}>YOUR PRIVATE FOLDER</Text>
          <Text variant="displaySm">Inspiration</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add inspiration"
          onPress={() => router.push('/inspiration/new' as Href)}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.plum, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="h2" style={{ color: colors.white }}>+</Text>
        </Pressable>
      </View>

      <View style={{ padding: spacing.xl, borderRadius: radius['2xl'], borderCurve: 'continuous', backgroundColor: colors.plumLight, gap: spacing.md, overflow: 'hidden' }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <OutingIcon name="spark" size={25} color={colors.plum} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text variant="h2">Share what catches your eye.</Text>
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>
            Send Outing screenshots, articles, Google Maps links, Instagram or TikTok posts, and YouTube videos. We’ll find the real places, organize them here, and help turn the patterns into trip ideas.
          </Text>
        </View>
        <Button onPress={() => router.push('/inspiration/new' as Href)}>Add inspiration</Button>
      </View>

      {!loading && !user ? (
        <View style={{ padding: spacing.lg, borderRadius: radius.xl, borderCurve: 'continuous', backgroundColor: colors.backgroundSecondary, gap: spacing.md }}>
          <Text variant="h3">Keep your folder private and synced</Text>
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>You can queue ideas on this phone. Sign in when you’re ready for Outing to read them, verify the places, and ask you what it may remember.</Text>
          <Button variant="secondary" onPress={() => router.push('/auth/login?returnTo=/inspiration')}>Sign in</Button>
        </View>
      ) : null}

      {user && imports.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text variant="h2">Saved ideas</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>{confirmedCount} confirmed place{confirmedCount === 1 ? '' : 's'} · {imports.length} import{imports.length === 1 ? '' : 's'}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/ask', params: { inspirationLibrary: '1', prompt: 'Look across my inspiration and suggest the strongest destinations or trip ideas for me. Explain the patterns you notice.' } })}
            >
              <Text variant="labelMd" style={{ color: colors.accent }}>Ask Outing →</Text>
            </Pressable>
          </View>
          <View style={{ gap: spacing.md }}>
            {imports.map((item) => <InspirationFolderCard key={item.id} value={item} />)}
          </View>
        </>
      ) : user && !library.isLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
          <Text variant="h3">Your folder is ready</Text>
          <Text variant="bodySm" style={{ color: colors.textSecondary, textAlign: 'center' }}>Add the first thing you’ve saved elsewhere. Outing will pull out the places for your review.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function InspirationFolderCard({ value }: { value: InspirationImport }) {
  const { colors, spacing, radius, shadows } = useTheme();
  const router = useRouter();
  const visibleItems = value.items.filter((item) => item.status !== 'dismissed' && item.status !== 'invalid').slice(0, 3);
  const destinations = [...new Set(visibleItems.flatMap((item) => item.destinationName ? [item.destinationName] : []))];
  const pending = value.items.filter((item) => item.status === 'candidate').length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open inspiration from ${formatLibraryDate(value.createdAt)}`}
      onPress={() => router.push(`/inspiration/${value.id}` as Href)}
      style={({ pressed }) => ({
        padding: spacing.md,
        minHeight: 118,
        borderRadius: radius.xl,
        borderCurve: 'continuous',
        backgroundColor: colors.cardBackground,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        flexDirection: 'row',
        gap: spacing.md,
        opacity: pressed ? 0.78 : 1,
        ...shadows.sm,
      })}
    >
      <View style={{ width: 82, minHeight: 88, borderRadius: 22, borderCurve: 'continuous', backgroundColor: colors.poolLight, alignItems: 'center', justifyContent: 'center' }}>
        <OutingIcon name={visibleItems.some((item) => item.inputKind === 'image') ? 'image' : 'bookmark'} size={30} color={colors.pool} />
        <Text variant="labelSm" style={{ color: colors.pool, paddingTop: spacing.xs }}>{value.sourceCount} source{value.sourceCount === 1 ? '' : 's'}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xs }}>
        <Text variant="h3" numberOfLines={1}>{destinations[0] ?? visibleItems[0]?.title ?? 'Travel inspiration'}</Text>
        <Text variant="caption" style={{ color: colors.textTertiary }}>{formatLibraryDate(value.createdAt)}</Text>
        {visibleItems.length ? (
          <Text variant="bodySm" numberOfLines={2} style={{ color: colors.textSecondary }}>{visibleItems.map((item) => item.title).join(' · ')}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {value.confirmedCount > 0 ? <Badge label={`${value.confirmedCount} saved`} variant="success" /> : null}
          {pending > 0 ? <Badge label={`${pending} to review`} variant="accent" /> : null}
          {value.status === 'failed' ? <Badge label="Needs another try" variant="warning" /> : null}
        </View>
      </View>
      <View style={{ justifyContent: 'center' }}><OutingIcon name="arrow" size={17} color={colors.textTertiary} /></View>
    </Pressable>
  );
}

function formatLibraryDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
