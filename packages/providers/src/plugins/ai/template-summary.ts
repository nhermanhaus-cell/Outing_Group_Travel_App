import { defineProviderPlugin } from '../../registry.js';
import type { AiReq, AiRes } from '../../interfaces.js';

/** Simple template-based response builder for common Gay-i prompts. */
function buildSummary(req: AiReq): string {
  const { prompt, context } = req;
  const lower = prompt.toLowerCase();

  if (lower.includes('itinerary') && context?.destinationSlug) {
    return (
      `Here is a suggested itinerary for ${context.destinationName ?? context.destinationSlug}:\n` +
      `Day 1: Arrive, settle in, explore the LGBTQ+ neighbourhood.\n` +
      `Day 2: Cultural highlights and local cuisine.\n` +
      `Day 3: Day trip or relaxation.\n` +
      `(This is a template summary — connect an AI provider for personalised results.)`
    );
  }

  if (lower.includes('budget') || lower.includes('cost')) {
    return (
      `Budget estimation for this trip will depend on your glamour level, group size, and duration. ` +
      `Consider mid-range accommodation in LGBTQ+-welcoming areas for the best balance of comfort and community. ` +
      `(Template summary — connect an AI provider for personalised results.)`
    );
  }

  return (
    `Thank you for your question about "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}". ` +
    `This is a template AI response. Connect an OpenAI-compatible provider for real answers.`
  );
}

export const aiTemplateSummary = defineProviderPlugin<AiReq, AiRes>({
  id: 'ai:template-summary',
  slot: 'ai',
  label: 'Template Summary AI',
  description: 'Returns template-based text responses without an external LLM.',
  isMock: true,
  create() {
    return {
      async call(req) {
        return {
          text: buildSummary(req),
          model: 'template-v1',
          tokensUsed: 0,
        };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
