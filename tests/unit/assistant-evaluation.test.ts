import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type EvaluationCase = {
  id: string;
  category: string;
  prompt: string;
  expectedTools: string[];
  requirements: string[];
};

const cases = JSON.parse(
  readFileSync(new URL('../evals/assistant-cases.json', import.meta.url), 'utf8'),
) as EvaluationCase[];

describe('Ask Outing evaluation set', () => {
  it('covers discovery, live providers, trip changes, safety, and provenance', () => {
    expect(new Set(cases.map((item) => item.category))).toEqual(new Set([
      'destination_discovery',
      'restaurants',
      'events',
      'fares',
      'itinerary_edits',
      'group_conflicts',
      'prompt_injection',
      'provenance',
      'lgbtq_context',
    ]));
  });

  it('requires every scenario to declare tool expectations and policy assertions', () => {
    for (const item of cases) {
      expect(item.id.length).toBeGreaterThan(3);
      expect(item.prompt.length).toBeGreaterThan(10);
      expect(Array.isArray(item.expectedTools)).toBe(true);
      expect(item.requirements.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('requires mutation and group cases to remain reviewable', () => {
    const edit = cases.find((item) => item.category === 'itinerary_edits');
    const group = cases.find((item) => item.category === 'group_conflicts');
    expect(edit?.expectedTools).toContain('draft_trip_change');
    expect(edit?.requirements).toContain('proposal only');
    expect(group?.requirements).toContain('majority vote');
    expect(group?.requirements).toContain('organizer tie-break');
  });
});
