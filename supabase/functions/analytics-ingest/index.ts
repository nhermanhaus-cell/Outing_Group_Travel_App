import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import {
  DEFAULT_ANALYTICS_POLICY,
  forwardRowsToPostHog,
  publicPolicy,
  validateAnalyticsEvent,
  type AnalyticsPolicyRow,
  type AnalyticsRow,
} from '../_shared/analytics.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);
  try {
    const body = await readJson(request);
    if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 25) {
      return errorResponse('events must contain between 1 and 25 items', 400);
    }

    const [policy, user] = await Promise.all([
      loadPolicy(),
      authenticatedUser(request),
    ]);
    if (!policy.semantic_analytics_enabled) {
      return json({
        acceptedEventIds: body.events.flatMap((event) => {
          const id = event && typeof event === 'object' && typeof (event as Record<string, unknown>).eventId === 'string'
            ? (event as Record<string, unknown>).eventId as string
            : undefined;
          return id ? [id] : [];
        }),
        rejected: [],
        policy: publicPolicy(policy),
      });
    }

    const accountSubjectId = user ? await pseudonymousAccountId(user.id) : undefined;
    const validated = body.events.map((event) => {
      const result = validateAnalyticsEvent(event, user?.id);
      if (result.row && accountSubjectId) result.row.subject_id = accountSubjectId;
      return result;
    });
    const rejected = validated.flatMap((result) =>
      result.reason ? [{ ...(result.eventId ? { eventId: result.eventId } : {}), reason: result.reason }] : [],
    );
    const rows = validated.flatMap((result) => result.row ? [result.row] : []);
    if (rows.length === 0) {
      return json({ acceptedEventIds: [], rejected, policy: publicPolicy(policy) }, 400);
    }
    if (new Set(rows.map((row) => row.subject_id)).size !== 1) {
      return errorResponse('A batch must contain one subject', 400);
    }
    if (!(await withinRateLimit(rows[0]!.subject_id, rows.length))) {
      return errorResponse('Analytics rate limit exceeded', 429);
    }

    const insertResponse = await serviceFetch('analytics_events?on_conflict=event_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(rows),
    });
    if (!insertResponse.ok) throw new Error(`Analytics insert HTTP ${insertResponse.status}`);
    const inserted = await insertResponse.json() as AnalyticsRow[];

    if (inserted.length > 0) {
      try {
        if (await forwardRowsToPostHog(inserted)) {
          await markForwarded(inserted.map((row) => row.event_id));
        }
      } catch {
        // The retry function will pick up unforwarded rows.
      }
    }

    return json({
      acceptedEventIds: rows.map((row) => row.event_id),
      rejected,
      policy: publicPolicy(policy),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Analytics ingest failed', 400);
  }
});

async function loadPolicy(): Promise<AnalyticsPolicyRow> {
  const response = await serviceFetch('analytics_policy?policy_key=eq.global&select=*');
  if (!response.ok) return DEFAULT_ANALYTICS_POLICY;
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] as AnalyticsPolicyRow : DEFAULT_ANALYTICS_POLICY;
}

async function authenticatedUser(request: Request): Promise<{ id: string } | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const value = await response.json();
  return typeof value?.id === 'string' ? { id: value.id } : null;
}

async function withinRateLimit(subjectId: string, incoming: number): Promise<boolean> {
  const since = encodeURIComponent(new Date(Date.now() - 60_000).toISOString());
  const response = await serviceFetch(
    `analytics_events?subject_id=eq.${encodeURIComponent(subjectId)}&received_at=gte.${since}&select=event_id`,
    { method: 'HEAD', headers: { Prefer: 'count=exact' } },
  );
  const range = response.headers.get('content-range') ?? '*/0';
  const count = Number(range.split('/')[1] ?? 0);
  return Number.isFinite(count) && count + incoming <= 120;
}

async function markForwarded(eventIds: string[]): Promise<void> {
  const values = eventIds.join(',');
  await serviceFetch(`analytics_events?event_id=in.(${values})`, {
    method: 'PATCH',
    body: JSON.stringify({
      forwarded_at: new Date().toISOString(),
      last_forward_error: null,
    }),
  });
}

function serviceFetch(path: string, init: RequestInit = {}) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function pseudonymousAccountId(userId: string): Promise<string> {
  const secret = Deno.env.get('ANALYTICS_HASH_SECRET')?.trim() || serviceKey;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${userId}`),
  );
  const chars = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .split('');
  chars[12] = '5';
  chars[16] = 'a';
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
