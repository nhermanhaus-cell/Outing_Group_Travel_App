import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  destinationCandidateSchema,
  destinationDiscoveryRequestSchema,
  destinationDiscoveryResponseSchema,
} from '@gayi/shared';

const candidate = {
  id: '10000000-0000-4000-8000-000000000070',
  slug: 'porto-portugal-abcd123',
  canonicalPlaceId: 'google-porto',
  name: 'Porto',
  country: 'Portugal',
  status: 'researching',
  sources: [],
  demandCount: 1,
  confidence: 0.5,
  generationStatus: 'generating',
  generationStage: 'places',
  completedSections: ['identity'],
  generationVersion: 'destination-v1',
  isDiscoverable: false,
};

describe('persistent destination discovery contracts', () => {
  it('accepts bounded lookup, claim, generation, and public-read requests', () => {
    expect(destinationDiscoveryRequestSchema.safeParse({ action: 'lookup', query: 'Porto' }).success).toBe(true);
    expect(destinationDiscoveryRequestSchema.safeParse({ action: 'lookup', query: 'P' }).success).toBe(false);
    expect(destinationDiscoveryRequestSchema.safeParse({ action: 'claim', canonicalPlaceId: 'google-porto', originalQuery: 'Porto' }).success).toBe(true);
    expect(destinationDiscoveryRequestSchema.safeParse({ action: 'generate', candidateId: candidate.id }).success).toBe(true);
    expect(destinationDiscoveryRequestSchema.safeParse({ action: 'get', candidateId: 'not-a-uuid' }).success).toBe(false);
  });

  it('persists real stage progress and defaults legacy candidates safely', () => {
    expect(destinationCandidateSchema.parse(candidate)).toMatchObject({
      generationStatus: 'generating',
      generationStage: 'places',
      completedSections: ['identity'],
    });
    const legacy = destinationCandidateSchema.parse({
      ...candidate,
      generationStatus: undefined,
      generationStage: undefined,
      completedSections: undefined,
      generationVersion: undefined,
      isDiscoverable: undefined,
    });
    expect(legacy).toMatchObject({
      generationStatus: 'ready',
      generationStage: 'complete',
      generationVersion: 'legacy',
      isDiscoverable: false,
    });
  });

  it('validates a reusable generated overview without requester data', () => {
    const parsed = destinationDiscoveryResponseSchema.parse({
      candidate: {
        ...candidate,
        generationStatus: 'ready',
        generationStage: 'complete',
        isDiscoverable: true,
        payload: {
          editorialSummary: 'A provider-backed first look at Porto.',
          galleryImageUrls: [],
          bestMonths: [],
          interests: ['food', 'culture'],
          neighborhoods: [{ name: 'Ribeira', summary: 'A riverfront area.' }],
          places: [],
          events: [],
          experiences: [],
          practical: {},
          verification: { identity: 'verified', safety: 'not_verified' },
        },
      },
    });
    expect(parsed.candidate?.payload?.verification.safety).toBe('not_verified');
    expect(JSON.stringify(parsed)).not.toContain('userId');
    expect(JSON.stringify(parsed)).not.toContain('originalQuery');
  });

  it('includes canonical deduplication, one active job, and atomic publication migration', () => {
    const sql = readFileSync('supabase/migrations/0008_destination_generation.sql', 'utf8');
    const candidateSql = readFileSync('supabase/migrations/0007_personalized_assistant_intelligence.sql', 'utf8');
    expect(sql).toContain('destination_generation_jobs_active_unique');
    expect(candidateSql).toContain('canonical_place_id text not null unique');
    expect(sql).toContain('publish_destination_candidate');
    expect(sql).toContain('destination_candidate_id');
  });

  it('routes Ask Outing through the reusable generator and starts generation in the background', () => {
    const assistant = readFileSync('supabase/functions/travel-assistant/index.ts', 'utf8');
    const discovery = readFileSync('supabase/functions/destination-discovery/index.ts', 'utf8');
    expect(assistant).toContain("action: 'lookup'");
    expect(assistant).toContain("action: 'claim'");
    expect(assistant).toContain('/functions/v1/destination-discovery');
    expect(discovery).toContain('EdgeRuntime.waitUntil(task)');
    expect(discovery).toContain("action: 'generate', candidateId");
    expect(discovery).toContain(".in('generation_status', claimableStatuses)");
  });

  it('uses the current Google Places locality type for city lookup', () => {
    const discovery = readFileSync('supabase/functions/destination-discovery/index.ts', 'utf8');
    expect(discovery).toContain("includedType: 'locality'");
    expect(discovery).not.toContain("includedType: '(cities)'");
    expect(discovery).toContain('strictTypeFiltering: true');
  });
});
