import { describe, expect, it } from 'vitest';
import {
  buildPlaceKnowledgeChunks,
  placeMetadataCompleteness,
  placeSourceIds,
} from '../../scripts/lib/place-intelligence.mjs';

describe('place intelligence indexing', () => {
  const place = {
    id: 'place-1',
    name: 'Harbor Table',
    category: 'restaurant',
    primaryType: 'seafood_restaurant',
    neighborhood: 'Waterfront',
    address: '10 Pier Way',
    lat: 37.1,
    lng: -122.1,
    summary: 'A relaxed waterfront dining room centered on local seafood.',
    lgbtqRelevance: 'Near the neighborhood’s queer-owned bars and evening venues.',
    estimatedCostUsd: 48,
    durationMinutes: 90,
    accessibilityNotes: 'Step-free main entrance; call ahead for patio seating.',
    providerPlaceId: 'google-123',
    websiteUri: 'https://example.com/harbor-table',
    googleMapsUri: 'https://maps.google.com/?cid=123',
    rating: 4.6,
    reviewCount: 812,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    businessStatus: 'OPERATIONAL',
    weekdayDescriptions: ['Monday: 5:00 PM – 10:00 PM'],
    accessibilityOptions: { wheelchairAccessibleEntrance: true, wheelchairAccessibleRestroom: true },
    attributes: { reservable: true, outdoorSeating: true, servesVegetarianFood: true },
    interests: ['food', 'waterfront'],
    verifiedAt: '2026-08-01T00:00:00.000Z',
  };

  it('separates editorial, planning, and accessibility evidence', () => {
    const chunks = buildPlaceKnowledgeChunks(place, {
      destinationSourceIds: ['outing-editorial'],
      freshness: '2026-07-01T00:00:00.000Z',
    });

    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual([
      'place_experience',
      'place_planning',
      'place_accessibility_amenities',
    ]);
    expect(chunks[0]?.text).toContain('relaxed waterfront dining room');
    expect(chunks[0]?.text).toContain('Why it may matter to LGBTQ+ travelers');
    expect(chunks[1]?.text).toContain('Typical visit: 90 minutes');
    expect(chunks[1]?.text).toContain('Estimated cost: 48 USD');
    expect(chunks[1]?.text).toContain('4.6 from 812 reviews');
    expect(chunks[2]?.text).toContain('Wheelchair Accessible Entrance');
    expect(chunks[2]?.text).toContain('Outdoor Seating');
    expect(chunks[0]?.metadata.evidenceClass).toBe('outing_editorial');
    expect(chunks[2]?.metadata.evidenceClass).toBe('provider_accessibility_and_amenities');
  });

  it('scores metadata coverage without treating missing fields as positive evidence', () => {
    expect(placeMetadataCompleteness(place)).toBeGreaterThan(0.85);
    expect(placeMetadataCompleteness({ name: 'Sparse Place', category: 'park' })).toBeLessThan(0.25);
  });

  it('deduplicates editorial and provider source identifiers', () => {
    expect(placeSourceIds(place, ['outing-editorial', 'outing-editorial'])).toEqual([
      'outing-editorial',
      'google-place:google-123',
      'https://example.com/harbor-table',
      'https://maps.google.com/?cid=123',
    ]);
  });
});
