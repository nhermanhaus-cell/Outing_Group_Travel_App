import { fetch as expoFetch } from 'expo/fetch';
import {
  assistantStreamEventSchema,
  type AssistantRequest,
  type AssistantStreamEvent,
} from '@gayi/shared';
import { supabase } from './supabase';

export class AssistantApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'AssistantApiError';
  }
}

function parseEvent(raw: string): AssistantStreamEvent | null {
  const data = raw
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice(5)
    .trim();
  if (!data || data === '[DONE]') return null;
  return assistantStreamEventSchema.parse(JSON.parse(data));
}

export async function streamAssistant(
  request: AssistantRequest,
  onEvent: (event: AssistantStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!supabase) throw new AssistantApiError('Outing needs Supabase configured before Ask can connect.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AssistantApiError('Sign in to use Ask Outing.', 401);

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new AssistantApiError('Ask Outing is not configured.');

  const response = await expoFetch(`${supabaseUrl}/functions/v1/travel-assistant`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = 'Ask Outing could not complete that request.';
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      if (body) message = body.slice(0, 240);
    }
    throw new AssistantApiError(message, response.status);
  }

  if (!response.body) {
    for (const block of (await response.text()).split('\n\n')) {
      const event = parseEvent(block);
      if (event) onEvent(event);
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = parseEvent(block);
      if (event) onEvent(event);
    }
  }
  if (buffer.trim()) {
    const event = parseEvent(buffer);
    if (event) onEvent(event);
  }
}

export async function reviewAssistantProposal(
  proposalId: string,
  action: 'apply' | 'dismiss' | 'submit_poll',
): Promise<'applied' | 'dismissed' | 'polling'> {
  if (!supabase) throw new AssistantApiError('Outing is not connected.');
  const { data, error } = await supabase.rpc('review_assistant_proposal', {
    p_proposal_id: proposalId,
    p_action: action,
  });
  if (error) throw new AssistantApiError(error.message);
  if (data !== 'applied' && data !== 'dismissed' && data !== 'polling') {
    throw new AssistantApiError('Proposal review returned an unexpected result.');
  }
  return data;
}
