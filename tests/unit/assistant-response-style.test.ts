import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const agentConfig = JSON.parse(readFileSync('config/mistral-agent.json', 'utf8')) as {
  version: string;
  instructions: string;
  completionArgs: { maxTokens: number };
};
const edgeSource = readFileSync('supabase/functions/travel-assistant/index.ts', 'utf8');

describe('Ask Outing response style', () => {
  it('keeps the Studio Agent concise by default', () => {
    expect(agentConfig.version).toContain('concise-responses');
    expect(agentConfig.instructions).toContain('60 to 120 words');
    expect(agentConfig.instructions).toContain('at most three compact bullets');
    expect(agentConfig.instructions).toContain('plain text without Markdown');
    expect(agentConfig.instructions).toContain('itinerary-item place searches');
    expect(agentConfig.completionArgs.maxTokens).toBeLessThanOrEqual(500);
  });

  it('applies the same response budget to the Edge Function and direct-model fallback', () => {
    expect(edgeSource).toContain('const ASSISTANT_MAX_TOKENS = 500');
    expect(edgeSource).toContain('max_tokens: ASSISTANT_MAX_TOKENS');
    expect(edgeSource).toContain('normally 60 to 120 words');
    expect(edgeSource).toContain('plainAssistantText');
  });
});
