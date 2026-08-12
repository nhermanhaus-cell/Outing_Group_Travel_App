import { describe, expect, it } from 'vitest';
import {
  auditTripRow,
  communitySignalAdjustment,
  compareDestinationRows,
  rankDestinationRows,
  safeConstraintRelaxations,
  type PersonalizationContext,
} from '../../supabase/functions/_shared/assistant-intelligence';
import {
  assistantInsightSchema,
  assistantStreamEventSchema,
} from '@gayi/shared';
import {
  isConversationalTravelSearch,
  parseTravelSearchIntent,
} from '../../apps/mobile/src/lib/smartSearch';
import scoring from '../../fixtures/seed/destinations.scoring.json';
import catalog from '../../fixtures/seed/destinations.json';

function context(overrides: Partial<PersonalizationContext['explicit']> = {}): PersonalizationContext {
  return {
    version: 'v1',
    explicit: {
      interests: ['food', 'culture'], tripGoals: ['explore'], vacationStyles: ['local'],
      preferredMonths: [3], departureAirports: ['LAX'], homeCountryCodes: ['US'],
      preferredTravelRanges: [], transportModes: ['plane'], travelScope: 'either',
      budgetLevel: 'comfortably_fabulous', tripLengthDays: 5, groupSize: 2,
      mealPreferences: [], avoidances: [], accessibilityNeeds: [],
      lgbtqSafetyPriority: 0.8, nightlifeImportance: 0.4,
      ...overrides,
    },
    inferred: [],
    savedDestinationSlugs: [],
    explanationSignals: [],
    contextFingerprint: 'decision-test-v1',
  };
}

const catalogBySlug = new Map(catalog.map((destination) => [destination.slug, destination]));
const rows = scoring.map((destination) => {
  const detail = catalogBySlug.get(destination.slug)!;
  return {
    slug: destination.slug,
    name: destination.name,
    country: destination.country,
    editorial_summary: detail.editorialSummary,
    payload: { ...detail, scoring: destination },
  };
});

describe('Mistral decision intelligence', () => {
  it('hides community signals below 25 users and caps eligible influence at five points', () => {
    expect(communitySignalAdjustment([
      { subjectType: 'destination', subjectKey: 'lisbon', distinctUsers: 24, score: 1 },
    ], 'destination', 'lisbon')).toBe(0);
    expect(communitySignalAdjustment([
      { subjectType: 'destination', subjectKey: 'lisbon', distinctUsers: 25, score: 5 },
    ], 'destination', 'lisbon')).toBe(5);
  });

  it('keeps hard accessibility constraints above community popularity', () => {
    const baseRow = rows[0]!;
    const row = {
      ...baseRow,
      payload: {
        ...baseRow.payload,
        scoring: {
          ...baseRow.payload.scoring,
          accessibility: { ...baseRow.payload.scoring.accessibility, wheelchairFriendly: false },
        },
      },
    };
    const ranked = rankDestinationRows([row], context({ accessibilityNeeds: ['wheelchair access'] }), {
      communitySignals: [{ subjectType: 'destination', subjectKey: row.slug, distinctUsers: 200, score: 1 }],
    });
    expect(ranked[0]?.fitScore).toBeLessThanOrEqual(20);
  });

  it('builds a source-backed comparison across the same dimensions', () => {
    const comparison = compareDestinationRows(rows, context(), ['lisbon', 'madrid']);
    expect(comparison?.options).toHaveLength(2);
    expect(comparison?.dimensions.map((item) => item.key)).toEqual(expect.arrayContaining([
      'fit', 'budget', 'timing', 'pace', 'community', 'accessibility', 'bookability',
    ]));
    expect(comparison?.dimensions.every((item) => item.values.length === 2)).toBe(true);
    expect(comparison?.sourceIds).toContain('outing-catalog');
  });

  it('detects overlap, avoidance, accessibility, reservation, pace, and repetition issues', () => {
    const audit = auditTripRow({
      id: '11111111-1111-4111-8111-111111111111',
      payload: {
        planningPreferences: { avoidances: ['club'], accessibilityNeeds: ['wheelchair access'] },
        tripPlan: {
          days: [{
            dayId: 'day-1',
            items: Array.from({ length: 7 }, (_, index) => ({
              itemId: `item-${index}`,
              title: index === 0 ? 'Late club' : `Museum ${index}`,
              category: index < 3 ? 'museum' : 'food',
              startTime: index === 1 ? '10:30' : `${String(9 + index).padStart(2, '0')}:00`,
              endTime: index === 0 ? '11:00' : `${String(10 + index).padStart(2, '0')}:00`,
              accessibilityVerified: false,
              requiresBooking: index === 2,
            })),
          }],
        },
      },
    });
    const categories = new Set(audit.issues.map((item) => item.category));
    expect(categories.has('pace')).toBe(true);
    expect(categories.has('repetition')).toBe(true);
    expect(categories.has('avoidance')).toBe(true);
    expect(categories.has('accessibility')).toBe(true);
    expect(categories.has('reservation')).toBe(true);
    expect(categories.has('hours')).toBe(true);
    expect(audit.score).toBeLessThan(80);
  });

  it('audits the production trip-plan shape for route, budget, weather, and group pace', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      itemId: `real-${index}`,
      day: 1,
      time: `${String(9 + index).padStart(2, '0')}:00`,
      title: index === 0 ? 'Beach walk' : `Stop ${index}`,
      category: index === 0 ? 'beach' : 'museum',
      duration: 45,
      estimatedCost: 40,
      bookingRequired: false,
      coords: index < 1 ? { lat: 34.05, lng: -118.25 } : { lat: 34.5, lng: -117.6 },
      travelFromPrevious: index === 1 ? { durationMinutes: 120 } : undefined,
    }));
    const audit = auditTripRow({
      id: '22222222-2222-4222-8222-222222222222',
      start_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      payload: {
        memberPrefs: [{ activityPace: 'relaxed' }, { activityPace: 'packed' }],
        tripPlan: {
          items,
          days: [{ day: 1, itemIds: items.map((item) => item.itemId) }],
          budget: { perPerson: { total: { high: 100 } } },
          bookingTimeline: [],
        },
      },
    });
    const categories = new Set(audit.issues.map((item) => item.category));
    expect(categories.has('route')).toBe(true);
    expect(categories.has('budget')).toBe(true);
    expect(categories.has('weather')).toBe(true);
    expect(categories.has('group_conflict')).toBe(true);
  });

  it('offers only consent-required flexible-dimension relaxations', () => {
    const relaxations = safeConstraintRelaxations({
      query: 'wheelchair accessible beach trip in March', resultCount: 0,
      hasDates: true, hasBudget: true, hasDestinationHint: true,
    });
    expect(relaxations.map((item) => item.dimension)).toEqual(['dates', 'nearby_destination', 'budget']);
    expect(relaxations.every((item) => item.requiresConsent)).toBe(true);
    expect(relaxations.map((item) => item.dimension)).not.toEqual(expect.arrayContaining(['accessibility', 'safety', 'avoidance']));
  });

  it('extracts visible conversational filters without sending a user profile', () => {
    const intent = parseTravelSearchIntent('Warm affordable wheelchair-accessible beach trip in March with no nightlife');
    expect(isConversationalTravelSearch(intent)).toBe(true);
    expect(intent.interests).toContain('beach');
    expect(intent.month).toBe(3);
    expect(intent.budgetLevel).toBe('shoestring_slay');
    expect(intent.climate).toBe('warm');
    expect(intent.hardConstraints).toEqual(expect.arrayContaining(['wheelchair access', 'avoid: nightlife']));
    expect(intent).not.toHaveProperty('userId');
  });

  it('validates structured decision stream events and cached insights', () => {
    const generatedAt = new Date().toISOString();
    const card = {
      version: 'v1' as const, id: 'decision-1', kind: 'decision_brief' as const,
      title: 'Lisbon fits now', summary: 'A grounded summary.', fitReasons: ['Food fit'], tradeoffs: [],
      sourceIds: ['outing-catalog'], confidence: 0.8, sourceFreshness: 'cached' as const,
      generatedAt, action: { type: 'open_destination' as const, value: 'lisbon', label: 'Open Lisbon' },
    };
    expect(assistantStreamEventSchema.parse({ type: 'decision', card }).type).toBe('decision');
    expect(assistantInsightSchema.parse({
      id: '11111111-1111-4111-8111-111111111111', surface: 'home', kind: 'decision_brief',
      title: card.title, summary: card.summary, recommendations: [], prompts: [], decisionCard: card,
      relaxations: [], contextFingerprint: 'fingerprint-v1', generatedAt, expiresAt: generatedAt,
    }).decisionCard?.id).toBe('decision-1');
  });
});
