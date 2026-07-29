import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENTS,
  AnalyticsBatchRequestSchema,
  applyPreferenceObservation,
  normalizeAnalyticsRoute,
  sanitizeAnalyticsProperties,
  type PreferenceObservation,
} from '@gayi/shared';

describe('analytics contracts', () => {
  it('normalizes dynamic routes without retaining identifiers', () => {
    expect(normalizeAnalyticsRoute('/destinations/mexico-city?from=home'))
      .toBe('/destinations/[slug]');
    expect(normalizeAnalyticsRoute('/trips/65ed0f44-95e0-481f-81b6-44a236c33281/invite'))
      .toBe('/trips/[tripId]/invite');
    expect(normalizeAnalyticsRoute('/experiences/VIATOR-123'))
      .toBe('/experiences/[productCode]');
    expect(normalizeAnalyticsRoute('/discover')).toBe('/discover');
  });

  it('keeps only allowlisted primitive properties', () => {
    expect(sanitizeAnalyticsProperties(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
      searchContext: 'destination_discovery',
      queryLengthBucket: '4-10',
      rawQuery: 'private search text',
      email: 'traveler@example.com',
      nested: { unsafe: true },
    })).toEqual({
      searchContext: 'destination_discovery',
      queryLengthBucket: '4-10',
    });
  });

  it('rejects invalid event batches', () => {
    expect(AnalyticsBatchRequestSchema.safeParse({ events: [] }).success).toBe(false);
    expect(AnalyticsBatchRequestSchema.safeParse({
      events: [{
        eventId: 'not-a-uuid',
        eventName: ANALYTICS_EVENTS.DESTINATION_VIEWED,
      }],
    }).success).toBe(false);
  });
});

describe('preference aggregation', () => {
  const observation = (
    value: number,
    weight: number,
    source: PreferenceObservation['source'],
  ): PreferenceObservation => ({
    subjectType: 'activity_category',
    subjectKey: 'museum',
    value,
    weight,
    source,
    observedAt: '2026-07-29T12:00:00.000Z',
  });

  it('weights explicit feedback more heavily than passive views', () => {
    const passive = applyPreferenceObservation(
      undefined,
      observation(0.1, 0.25, 'passive_view'),
    );
    const liked = applyPreferenceObservation(
      passive,
      observation(1, 2, 'like'),
    );

    expect(liked.score).toBeGreaterThan(0.85);
    expect(liked.evidenceWeight).toBe(2.25);
    expect(liked.confidence).toBe(0.45);
  });

  it('clamps values, evidence, and confidence', () => {
    let aggregate;
    for (let index = 0; index < 20; index += 1) {
      aggregate = applyPreferenceObservation(
        aggregate,
        observation(5, 5, 'like'),
      );
    }
    expect(aggregate?.score).toBe(1);
    expect(aggregate?.evidenceWeight).toBe(20);
    expect(aggregate?.confidence).toBe(1);
  });
});
