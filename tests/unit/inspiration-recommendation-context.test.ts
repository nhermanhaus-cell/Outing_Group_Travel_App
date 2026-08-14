import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspirationItemSchema } from '@gayi/shared';

const captureSource = readFileSync('apps/mobile/components/inspiration/import-capture-screen.tsx', 'utf8');
const shareHandlerSource = readFileSync('apps/mobile/components/inspiration/incoming-share-handler.tsx', 'utf8');
const assistantSource = readFileSync('supabase/functions/travel-assistant/index.ts', 'utf8');
const importSource = readFileSync('supabase/functions/inspiration-import/index.ts', 'utf8');

describe('inspiration navigation and recommendation consent', () => {
  it('does not redirect an import back to Discover while the runtime flag loads', () => {
    expect(captureSource).not.toContain("router.replace('/discover')");
    expect(shareHandlerSource).not.toContain('featureFlags.outingFullExperienceV1');
  });

  it('allows a confirmed inspiration place to be attached to a trip', () => {
    const item = inspirationItemSchema.parse({
      id: '2a6d6bf7-c4d4-49f1-85ea-51b0bd8fabd2',
      importId: '985447d0-12fa-4ab0-a6c0-d61dff631be4',
      tripId: 'bbdf00e6-11b6-4a41-a1d0-521b94674a06',
      inputKind: 'image',
      title: 'Museum of Modern Art',
      confidence: 0.94,
      status: 'confirmed',
      createdAt: '2026-08-13T20:00:00.000Z',
    });
    expect(item.tripId).toBe('bbdf00e6-11b6-4a41-a1d0-521b94674a06');
    expect(importSource).toContain("status === 'confirmed'");
    expect(importSource).toContain('trip_id: input.tripId ?? null');
  });

  it('uses only confirmed library items for automatic Mistral taste context', () => {
    expect(assistantSource).toContain(".eq('status', 'confirmed')");
    expect(assistantSource).toContain('inspirationSignals');
    expect(assistantSource).toContain('raw OCR');
    expect(assistantSource).not.toContain(".in('status', ['confirmed', 'candidate'])");
  });

  it('keeps link failures isolated and gives users an actionable retry state', () => {
    expect(importSource).toContain('fetchSocialMetadata');
    expect(importSource).toContain('No recognizable place found');
    expect(importSource).toContain('sourceIndex');
  });
});
