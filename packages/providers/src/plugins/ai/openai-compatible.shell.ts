import { defineProviderPlugin } from '../../registry.js';
import type { AiReq, AiRes } from '../../interfaces.js';

export const aiOpenAiShell = defineProviderPlugin<AiReq, AiRes>({
  id: 'ai:openai-compatible',
  slot: 'ai',
  label: 'OpenAI-Compatible LLM',
  description: 'Calls any OpenAI-compatible chat completions endpoint (OpenAI, Together, Groq, etc.).',
  requiredEnv: ['OPENAI_API_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<AiRes> {
        throw new Error('ai:openai-compatible — not configured');
      },
    };
  },
});
