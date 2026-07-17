import { describe, it, expect } from 'vitest';
import { computePulse, PULSE_MIN_THRESHOLDS } from '@gayi/domain';
import type { PulseInputs } from '@gayi/domain';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInputs(overrides: Partial<PulseInputs> = {}): PulseInputs {
  return {
    eventCount30d: 12,
    venueDensityPer100k: 8,
    reviewCount: 45,
    activeContributors30d: 20,
    publicTripsCount: 15,
    aggregateCheckins30d: 120,
    responseRate: 0.72,
    verifiedVenueCount: 18,
    prideEventThisYear: true,
    ...overrides,
  };
}

const emptyInputs: PulseInputs = {
  eventCount30d: 0,
  venueDensityPer100k: 0,
  reviewCount: 0,
  activeContributors30d: 0,
  publicTripsCount: 0,
  aggregateCheckins30d: 0,
  responseRate: 0,
  verifiedVenueCount: 0,
  prideEventThisYear: false,
};

// ─── Structural tests ─────────────────────────────────────────────────────────

describe('computePulse - structure', () => {
  it('returns a score between 0 and 100', () => {
    const result = computePulse(makeInputs());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('confidence is between 0 and 1', () => {
    const result = computePulse(makeInputs());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('all component breakdown values are between 0 and 100', () => {
    const result = computePulse(makeInputs());
    for (const [key, val] of Object.entries(result.componentBreakdown)) {
      expect(val, `componentBreakdown.${key}`).toBeGreaterThanOrEqual(0);
      expect(val, `componentBreakdown.${key}`).toBeLessThanOrEqual(100);
    }
  });

  it('explanation mentions "platform estimate"', () => {
    const result = computePulse(makeInputs());
    expect(result.explanation.toLowerCase()).toContain('platform estimate');
  });

  it('returns a valid label', () => {
    const validLabels = ['Quiet', 'Emerging', 'Connected', 'Very active', 'Major queer hub'];
    const result = computePulse(makeInputs());
    expect(validLabels).toContain(result.label);
  });
});

// ─── Label assignment ─────────────────────────────────────────────────────────

describe('computePulse - label assignment', () => {
  it('returns "Quiet" for empty inputs', () => {
    const result = computePulse(emptyInputs);
    expect(result.label).toBe('Quiet');
  });

  it('returns "Quiet" or "Emerging" for sparse inputs', () => {
    const result = computePulse({
      ...emptyInputs,
      eventCount30d: PULSE_MIN_THRESHOLDS.events,
      verifiedVenueCount: PULSE_MIN_THRESHOLDS.venues,
      activeContributors30d: PULSE_MIN_THRESHOLDS.contributors,
    });
    expect(['Quiet', 'Emerging']).toContain(result.label);
  });

  it('score increases with more activity', () => {
    const low = computePulse(emptyInputs);
    const high = computePulse(makeInputs());
    expect(high.score).toBeGreaterThan(low.score);
  });

  it('pride event increases score vs identical inputs without pride', () => {
    const withPride = computePulse(makeInputs({ prideEventThisYear: true }));
    const withoutPride = computePulse(makeInputs({ prideEventThisYear: false }));
    expect(withPride.score).toBeGreaterThan(withoutPride.score);
  });
});

// ─── Minimum aggregation thresholds ──────────────────────────────────────────

describe('computePulse - minimum aggregation thresholds', () => {
  it('sub-threshold eventCount does not increase score vs zero events', () => {
    const atZero = computePulse({ ...emptyInputs });
    const subThreshold = computePulse({
      ...emptyInputs,
      eventCount30d: PULSE_MIN_THRESHOLDS.events - 1,
    });
    expect(subThreshold.score).toBe(atZero.score);
  });

  it('sub-threshold venues do not increase score vs zero venues', () => {
    const atZero = computePulse({ ...emptyInputs });
    const subThreshold = computePulse({
      ...emptyInputs,
      verifiedVenueCount: PULSE_MIN_THRESHOLDS.venues - 1,
    });
    expect(subThreshold.score).toBe(atZero.score);
  });

  it('sub-threshold contributors do not increase score vs zero contributors', () => {
    const atZero = computePulse({ ...emptyInputs });
    const subThreshold = computePulse({
      ...emptyInputs,
      activeContributors30d: PULSE_MIN_THRESHOLDS.contributors - 1,
    });
    expect(subThreshold.score).toBe(atZero.score);
  });

  it('at-threshold values do contribute to score', () => {
    const atZero = computePulse({ ...emptyInputs });
    const atThreshold = computePulse({
      ...emptyInputs,
      eventCount30d: PULSE_MIN_THRESHOLDS.events,
      verifiedVenueCount: PULSE_MIN_THRESHOLDS.venues,
      venueDensityPer100k: 5,
    });
    expect(atThreshold.score).toBeGreaterThan(atZero.score);
  });
});

// ─── Confidence ───────────────────────────────────────────────────────────────

describe('computePulse - confidence', () => {
  it('confidence is lower for empty inputs than for rich inputs', () => {
    const sparse = computePulse(emptyInputs);
    const rich = computePulse(makeInputs());
    expect(rich.confidence).toBeGreaterThan(sparse.confidence);
  });

  it('confidence is never 0 (always positive)', () => {
    const result = computePulse(emptyInputs);
    expect(result.confidence).toBeGreaterThan(0);
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('computePulse - determinism', () => {
  it('same input always produces the same result', () => {
    const inputs = makeInputs();
    const a = computePulse(inputs);
    const b = computePulse(inputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
