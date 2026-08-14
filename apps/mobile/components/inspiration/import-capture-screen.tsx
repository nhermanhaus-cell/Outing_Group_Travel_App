import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useAuth } from '../../src/providers/AppProviders';
import { useTheme } from '../../src/theme/ThemeProvider';
import {
  clearGuestInspirationQueue,
  loadGuestInspirationQueue,
  makeUrlSource,
  processInspirationImport,
  replaceGuestInspirationQueue,
  type InspirationSourceInput,
} from '../../src/lib/inspiration-imports';
import { posthog } from '../../src/config/posthog';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { OutingIcon } from '../ui/OutingIcon';

const STAGES = [
  'Reading the details you shared',
  'Finding the places mentioned',
  'Checking identities with Google Places',
  'Preparing your review',
];

function labelFor(source: InspirationSourceInput): string {
  if (source.kind === 'image') return source.label ?? 'Screenshot or photo';
  if (source.kind === 'place_file') return source.label ?? 'Exported place file';
  return source.url ? new URL(source.url).hostname : source.label ?? 'Travel inspiration';
}

export function ImportCaptureScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [sources, setSources] = useState<InspirationSourceInput[]>([]);
  const [url, setUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState(0);
  const remaining = Math.max(0, 10 - sources.length);

  useEffect(() => { void loadGuestInspirationQueue().then(setSources); }, []);
  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(() => setStage((value) => Math.min(STAGES.length - 1, value + 1)), 1_350);
    return () => clearInterval(interval);
  }, [processing]);

  const persist = useCallback(async (next: InspirationSourceInput[]) => {
    await replaceGuestInspirationQueue(next);
    setSources(await loadGuestInspirationQueue());
  }, []);

  const addPhotos = useCallback(async () => {
    if (!remaining) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access is off', 'Choose photo access in Settings, or paste a public link instead.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.9,
    });
    if (result.canceled) return;
    const additions = result.assets.map((asset) => ({
      id: Crypto.randomUUID(), kind: 'image' as const, uri: asset.uri,
      label: asset.fileName ?? 'Travel screenshot', mimeType: asset.mimeType ?? 'image/jpeg',
      ...(asset.fileSize !== undefined ? { size: asset.fileSize } : {}),
    }));
    await persist([...sources, ...additions].slice(0, 10));
  }, [persist, remaining, sources]);

  const addFile = useCallback(async () => {
    if (!remaining) return;
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ['application/json', 'text/plain', 'text/csv', 'text/xml', 'application/xml', 'application/vnd.google-earth.kml+xml'],
    });
    if (result.canceled) return;
    const additions = result.assets.slice(0, remaining).map((asset) => ({
      id: Crypto.randomUUID(), kind: 'place_file' as const, uri: asset.uri,
      label: asset.name, mimeType: asset.mimeType ?? 'application/json',
      ...(asset.size !== undefined ? { size: asset.size } : {}),
    }));
    await persist([...sources, ...additions].slice(0, 10));
  }, [persist, remaining, sources]);

  const addUrl = useCallback(async () => {
    try {
      const next = makeUrlSource(url);
      await persist([...sources, next].slice(0, 10));
      setUrl('');
      if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    } catch (error) {
      Alert.alert('That link can’t be added', error instanceof Error ? error.message : 'Use a public HTTPS link.');
    }
  }, [persist, sources, url]);

  const processSources = useCallback(async () => {
    if (!sources.length || processing) return;
    if (!user) {
      router.push({ pathname: '/auth/login', params: { returnTo: '/inspiration/new' } });
      return;
    }
    setProcessing(true);
    setStage(0);
    try {
      const result = await processInspirationImport(sources);
      await clearGuestInspirationQueue();
      posthog.capture('inspiration_import_processed', {
        source_count: sources.length,
        candidate_count: result.items.length,
        source_kinds: [...new Set(sources.map((source) => source.kind))],
      });
      router.replace(`/inspiration/${result.id}` as Href);
    } catch (error) {
      posthog.capture('inspiration_import_failed', { stage: 'server_processing' });
      Alert.alert('Outing couldn’t finish the import', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [processing, router, sources, user]);

  const sourceKinds = useMemo(() => [...new Set(sources.map((source) => source.kind.replaceAll('_', ' ')))], [sources]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'], gap: spacing.xl }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close import" onPress={() => router.back()}>
          <OutingIcon name="close" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="labelSm" style={{ color: colors.accent, letterSpacing: 1.2 }}>INSPIRATION IMPORT</Text>
          <Text variant="h2">Bring the idea into Outing</Text>
        </View>
      </View>

      {processing ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={{ minHeight: 480, justifyContent: 'center', gap: spacing.xl }}>
          <View style={{ alignItems: 'center', gap: spacing.lg }}>
            <Animated.View
              style={{ width: 156, height: 156, borderRadius: 78, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight }}
            >
              <OutingIcon name="spark" size={52} color={colors.accent} />
            </Animated.View>
            <View style={{ gap: spacing.sm, alignItems: 'center' }}>
              <Text variant="displaySm" style={{ textAlign: 'center' }}>Turning inspiration into places</Text>
              <Animated.View key={stage} entering={FadeIn.duration(240)}>
                <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>{STAGES[stage]}</Text>
              </Animated.View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {STAGES.map((_, index) => (
              <View key={index} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: index <= stage ? colors.accent : colors.backgroundTertiary }} />
            ))}
          </View>
        </Animated.View>
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <Text variant="displaySm">Save the place, not the clutter.</Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Add up to ten screenshots, photos, public links, or exported place files. Outing reads them, validates real places, then asks you what to keep.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <SourceButton icon="image" title="Photos" detail="Screenshots too" onPress={() => void addPhotos()} />
            <SourceButton icon="route" title="Place file" detail="JSON, CSV, KML" onPress={() => void addFile()} />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text variant="labelMd">Paste a public link</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="Google Maps, article, Instagram, TikTok, YouTube…"
                placeholderTextColor={colors.textTertiary}
                style={{ flex: 1, minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, color: colors.textPrimary, backgroundColor: colors.surface }}
                onSubmitEditing={() => void addUrl()}
              />
              <Button disabled={!url.trim() || !remaining} onPress={() => void addUrl()}>Add</Button>
            </View>
          </View>

          {sources.length ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="h3">Ready to review</Text>
                <Text variant="caption" style={{ color: colors.textTertiary }}>{sources.length}/10</Text>
              </View>
              {sources.map((source) => (
                <Animated.View key={source.id} layout={LinearTransition} entering={FadeIn} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <OutingIcon name={source.kind === 'image' ? 'image' : 'link'} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text variant="labelMd" numberOfLines={1}>{labelFor(source)}</Text>
                    <Text variant="caption" style={{ color: colors.textTertiary }}>{source.kind.replaceAll('_', ' ')}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${labelFor(source)}`} onPress={() => void persist(sources.filter((item) => item.id !== source.id))}>
                    <OutingIcon name="close" size={18} color={colors.textTertiary} />
                  </Pressable>
                </Animated.View>
              ))}
              <Text variant="caption" style={{ color: colors.textTertiary }}>
                {sourceKinds.join(' · ')} · Raw files and OCR are deleted after processing.
              </Text>
            </View>
          ) : null}

          <Button size="lg" disabled={!sources.length} onPress={() => void processSources()}>
            {user ? 'Find the places' : 'Sign in to process'}
          </Button>
          {!user && sources.length ? (
            <Text variant="caption" style={{ color: colors.textSecondary, textAlign: 'center' }}>
              Your selections stay queued on this device until you sign in.
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function SourceButton({ icon, title, detail, onPress }: { icon: 'image' | 'route'; title: string; detail: string; onPress: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.plumLight, gap: spacing.sm }}>
      <OutingIcon name={icon} color={colors.plum} size={26} />
      <View>
        <Text variant="h3">{title}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>{detail}</Text>
      </View>
    </Pressable>
  );
}
