import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { forwardRowsToPostHog, type AnalyticsRow } from '../_shared/analytics.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);
  const expectedSecret = Deno.env.get('ANALYTICS_FORWARD_SECRET')?.trim();
  if (!expectedSecret || request.headers.get('x-analytics-secret') !== expectedSecret) {
    return errorResponse('Unauthorized', 401);
  }

  const response = await serviceFetch(
    'analytics_events?forwarded_at=is.null&order=received_at.asc&limit=100&select=*',
  );
  if (!response.ok) return errorResponse('Unable to load analytics events', 500);
  const rows = await response.json() as AnalyticsRow[];
  if (rows.length === 0) return json({ forwarded: 0 });

  try {
    const forwarded = await forwardRowsToPostHog(rows);
    if (!forwarded) return errorResponse('PostHog is not configured', 503);
    const ids = rows.map((row) => row.event_id).join(',');
    await serviceFetch(`analytics_events?event_id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({
        forwarded_at: new Date().toISOString(),
        last_forward_error: null,
      }),
    });
    return json({ forwarded: rows.length });
  } catch (error) {
    const ids = rows.map((row) => row.event_id).join(',');
    await serviceFetch(`analytics_events?event_id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({
        forward_attempts: Math.max(...rows.map((row) =>
          typeof (row as unknown as { forward_attempts?: number }).forward_attempts === 'number'
            ? (row as unknown as { forward_attempts: number }).forward_attempts + 1
            : 1
        )),
        last_forward_error: error instanceof Error ? error.message.slice(0, 160) : 'forward_failed',
      }),
    });
    return errorResponse('PostHog forwarding failed', 502);
  }
});

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
