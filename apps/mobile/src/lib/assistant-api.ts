import { fetch as expoFetch } from 'expo/fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  assistantConversationSummarySchema,
  assistantInsightRequestSchema,
  assistantInsightSchema,
  assistantStreamEventSchema,
  type AssistantConversationSummary,
  type AssistantInsight,
  type AssistantInsightRequest,
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

function localCacheToken(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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

async function authenticatedFunctionResponse(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  if (!supabase) throw new AssistantApiError('Outing needs Supabase configured before Ask can connect.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AssistantApiError('Sign in to use Ask Outing.', 401);
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new AssistantApiError('Ask Outing is not configured.');
  const response = await expoFetch(`${supabaseUrl}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({})) as { error?: string };
    throw new AssistantApiError(value.error ?? 'Ask Outing could not load personalized insights.', response.status);
  }
  return response;
}

export async function loadAssistantInsights(
  input: AssistantInsightRequest,
  signal?: AbortSignal,
): Promise<{ insights: AssistantInsight[]; cached: boolean }> {
  const request = assistantInsightRequestSchema.parse(input);
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const cacheKey = `outing:assistant-insights:v2:${data.session?.user.id ?? 'guest'}:${localCacheToken(JSON.stringify(request))}`;
  try {
    const response = await authenticatedFunctionResponse('assistant-insights', request, signal);
    const body = await response.json() as { insights?: unknown[]; cached?: boolean };
    const result = {
      insights: (body.insights ?? []).map((value) => assistantInsightSchema.parse(value)),
      cached: Boolean(body.cached),
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(result)).catch(() => undefined);
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    const stored = await AsyncStorage.getItem(cacheKey).catch(() => null);
    if (!stored) throw error;
    const body = JSON.parse(stored) as { insights?: unknown[] };
    return {
      insights: (body.insights ?? []).map((value) => {
        const insight = assistantInsightSchema.parse(value);
        return insight.decisionCard
          ? { ...insight, decisionCard: { ...insight.decisionCard, sourceFreshness: 'stale' as const } }
          : insight;
      }),
      cached: true,
    };
  }
}

export interface StoredAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: unknown[];
  createdAt: string;
}

export async function listAssistantConversations(limit = 8): Promise<AssistantConversationSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select('id,title,scope_kind,destination_slug,trip_id,visibility,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new AssistantApiError(error.message);
  return (data ?? []).map((row) => assistantConversationSummarySchema.parse({
    id: row.id,
    title: row.title,
    scope: row.scope_kind === 'trip'
      ? { kind: 'trip', tripId: row.trip_id }
      : row.scope_kind === 'destination'
        ? { kind: 'destination', destinationSlug: row.destination_slug }
        : { kind: 'general' },
    visibility: row.visibility,
    updatedAt: row.updated_at,
  }));
}

export async function loadAssistantConversationMessages(conversationId: string): Promise<StoredAssistantMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id,role,content,sources,created_at')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(60);
  if (error) throw new AssistantApiError(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    sources: Array.isArray(row.sources) ? row.sources : [],
    createdAt: row.created_at,
  }));
}

export async function setAssistantPersonalizationEnabled(enabled: boolean): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new AssistantApiError('Sign in to change personalization.');
  const { error } = await supabase.from('user_privacy_settings').upsert({
    user_id: userId,
    personalization_enabled: enabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw new AssistantApiError(error.message);
}

export async function resetAssistantPersonalization(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('reset_personalization_signals');
  if (error) throw new AssistantApiError(error.message);
}

export async function recordCommunityRecommendationSignal(input: {
  subjectType: 'destination' | 'activity_category' | 'provider';
  subjectKey: string;
  signalType: 'saved' | 'dismissed' | 'voted' | 'feedback_positive' | 'feedback_negative' | 'proposal_accepted';
  value: -1 | 1;
}): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('record_community_recommendation_event', {
    p_subject_type: input.subjectType,
    p_subject_key: input.subjectKey,
    p_signal_type: input.signalType,
    p_value: input.value,
  });
  if (error) throw new AssistantApiError(error.message);
}
