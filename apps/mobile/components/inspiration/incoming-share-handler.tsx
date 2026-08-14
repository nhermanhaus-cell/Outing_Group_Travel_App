import { useEffect, useRef } from 'react';
import { type Href, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useShareIntentContext } from 'expo-share-intent';
import { posthog } from '../../src/config/posthog';
import {
  makeUrlSource,
  queueGuestInspiration,
  type InspirationSourceInput,
} from '../../src/lib/inspiration-imports';

function sourcesFromText(text: string | null | undefined): InspirationSourceInput[] {
  const matches = text?.match(/https:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(matches)].flatMap((url) => {
    try { return [makeUrlSource(url.replace(/[),.;]+$/, ''))]; }
    catch { return []; }
  });
}

export function IncomingShareHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const router = useRouter();
  const processing = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || processing.current) return;
    processing.current = true;
    const fileSources = (shareIntent.files ?? []).flatMap((file) => {
      if (file.mimeType.startsWith('video/')) return [];
      const isImage = file.mimeType.startsWith('image/');
      const supportedPlaceFile = ['application/json', 'text/plain', 'text/csv', 'text/xml', 'application/xml', 'application/vnd.google-earth.kml+xml'].includes(file.mimeType.toLowerCase());
      if (!isImage && !supportedPlaceFile) return [];
      return [{
        id: Crypto.randomUUID(),
        kind: isImage ? 'image' as const : 'place_file' as const,
        uri: file.path,
        label: file.fileName,
        mimeType: file.mimeType,
        ...(file.size !== null ? { size: file.size } : {}),
      }];
    });
    const links = [
      ...sourcesFromText(shareIntent.webUrl),
      ...sourcesFromText(shareIntent.text),
    ];
    const sources: InspirationSourceInput[] = [...fileSources, ...links];
    const uniqueSources = sources
      .filter((source, index, values) => values.findIndex((value) => value.uri === source.uri && value.url === source.url) === index)
      .slice(0, 10);
    void queueGuestInspiration(uniqueSources)
      .then(() => {
        posthog.capture('inspiration_share_received', {
          source_count: uniqueSources.length,
          has_image: uniqueSources.some((source) => source.kind === 'image'),
          has_link: uniqueSources.some((source) => Boolean(source.url)),
        });
        resetShareIntent();
        router.push('/inspiration/new' as Href);
      })
      .catch(() => {
        posthog.capture('inspiration_share_failed', { stage: 'local_queue' });
        resetShareIntent();
      })
      .finally(() => { processing.current = false; });
  }, [hasShareIntent, resetShareIntent, router, shareIntent.files, shareIntent.text, shareIntent.webUrl]);

  useEffect(() => {
    if (error) posthog.capture('inspiration_share_failed', { stage: 'native_receiver' });
  }, [error]);

  return null;
}
