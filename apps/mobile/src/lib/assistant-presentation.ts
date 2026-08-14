import type { AssistantFocus, AssistantRecommendation, AssistantScope } from '@gayi/shared';

function compactLine(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const clipped = clean.slice(0, maxLength - 1);
  const sentenceEnd = clipped.lastIndexOf('. ');
  if (sentenceEnd >= Math.floor(maxLength * 0.55)) return clipped.slice(0, sentenceEnd + 1);
  const wordEnd = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, Math.max(0, wordEnd))}…`;
}

export function recommendationCardSummary(value: string): string {
  return compactLine(value, 135);
}

export function recommendationCardFit(reasons: string[]): string | undefined {
  const reason = reasons.find((value) => value.trim().length > 0);
  return reason ? compactLine(reason, 92) : undefined;
}

export type AssistantHeroCopy = {
  eyebrow: string;
  title: string;
  summary: string;
};

function firstSentences(value: string, count: number): string {
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [value];
  return sentences.slice(0, count).map((sentence) => sentence.trim()).join(' ').trim();
}

export function assistantDisplayText(value: string, compact = false): string {
  const cleaned = value
    .replace(/\[([^\]]+)]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!compact) return cleaned;
  const concise = firstSentences(cleaned, 2);
  if (concise.length <= 280) return concise;
  const truncated = concise.slice(0, 277).replace(/\s+\S*$/, '').trim();
  return `${truncated}…`;
}

function normalizedWords(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function recommendationRequestedForItinerary(
  message: string,
  recommendations: AssistantRecommendation[],
): AssistantRecommendation | undefined {
  if (!/\b(add|put|schedule|choose|use)\b/i.test(message)) return undefined;
  const places = recommendations.filter((recommendation) => recommendation.kind === 'place');
  if (!places.length) return undefined;
  const normalized = normalizedWords(message);
  const ordinal = [
    { pattern: /\b(first|1st|number 1)\b/, index: 0 },
    { pattern: /\b(second|2nd|number 2)\b/, index: 1 },
    { pattern: /\b(third|3rd|number 3)\b/, index: 2 },
    { pattern: /\b(fourth|4th|number 4)\b/, index: 3 },
  ].find(({ pattern }) => pattern.test(normalized));
  if (ordinal && places[ordinal.index]) return places[ordinal.index];
  if (/\blast\b/.test(normalized)) return places.at(-1);
  const named = places.find((recommendation) => normalized.includes(normalizedWords(recommendation.title)));
  if (named) return named;
  if (places.length === 1 && /\b(it|this|that|one|option|place)\b/.test(normalized)) return places[0];
  return undefined;
}

export function assistantHeroCopy(scope: AssistantScope, focus?: AssistantFocus): AssistantHeroCopy {
  if (focus?.kind === 'today') {
    return {
      eyebrow: 'TODAY, WITH CONTEXT',
      title: 'What would make today better?',
      summary: 'Ask for a nearby option, a lighter pace, or a useful backup. Nothing changes without your review.',
    };
  }
  if (focus?.kind === 'itinerary_day') {
    return {
      eyebrow: `DAY ${focus.day}, IN FOCUS`,
      title: 'Tune this day with me.',
      summary: 'We can rebalance the pace, route, cost, or activity mix without starting the itinerary over.',
    };
  }
  if (scope.kind === 'trip') {
    return {
      eyebrow: 'YOUR TRIP, IN CONTEXT',
      title: 'What should we make better?',
      summary: 'Ask about the plan, compare options, or draft a change for you or the group to review.',
    };
  }
  if (scope.kind === 'destination') {
    return {
      eyebrow: 'DESTINATION, IN CONTEXT',
      title: 'Get beyond the highlight reel.',
      summary: 'Ask what fits your taste, when to go, where to stay, or what deserves a place in the plan.',
    };
  }
  return {
    eyebrow: 'PERSONALIZED TRAVEL INTELLIGENCE',
    title: 'Where should we go next?',
    summary: 'Start with a feeling, a season, or a constraint. Outing will turn it into grounded options that fit you.',
  };
}

export function starterCategory(prompt: string, index = 0): string {
  const normalized = prompt.toLowerCase();
  if (/compare|versus| vs\.? /.test(normalized)) return 'COMPARE';
  if (/when|month|october|march|summer|winter|date|season/.test(normalized)) return 'TIMING';
  if (/day|itinerary|plan|lighter|near|dinner|stop/.test(normalized)) return 'TRIP';
  if (/food|museum|nightlife|activity|experience|things to do/.test(normalized)) return 'DO';
  return ['DISCOVER', 'TIMING', 'COMPARE', 'TRIP'][index % 4]!;
}
