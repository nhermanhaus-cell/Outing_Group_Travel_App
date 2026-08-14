import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/http.ts';

type Json = Record<string, unknown>;

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: corsHeaders });
}

function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function localParts(timezone: string): { weekday: number; hour: number; weekKey: string } {
  const now = new Date();
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const localDate = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  const yearStart = Date.UTC(localDate.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((localDate.getTime() - yearStart) / 86_400_000 + new Date(yearStart).getUTCDay() + 1) / 7);
  return { weekday: weekdays[values.weekday] ?? -1, hour: Number(values.hour), weekKey: `${values.year}-W${String(week).padStart(2, '0')}` };
}

function inQuietHours(hour: number, start: number, end: number): boolean {
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (request.headers.get('x-outing-cron-secret') !== env('DISCOVERY_CRON_SECRET')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const service = createClient<any>(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: preferences, error } = await service.from('notification_preferences')
    .select('id,user_id,preferences,last_discovery_digest_at').limit(2_000);
  if (error) return json({ error: 'Could not load notification preferences' }, 500);
  let sent = 0;
  let skipped = 0;
  for (const row of preferences ?? []) {
    const preference = record(row.preferences);
    if (preference.discoveryDigestEnabled !== true) { skipped += 1; continue; }
    const timezone = typeof preference.timezone === 'string' ? preference.timezone : 'UTC';
    let local: ReturnType<typeof localParts>;
    try { local = localParts(timezone); } catch { skipped += 1; continue; }
    const weekday = typeof preference.digestWeekday === 'number' ? preference.digestWeekday : 3;
    const hour = typeof preference.digestLocalHour === 'number' ? preference.digestLocalHour : 18;
    const quietStart = typeof preference.quietHoursStart === 'number' ? preference.quietHoursStart : 21;
    const quietEnd = typeof preference.quietHoursEnd === 'number' ? preference.quietHoursEnd : 8;
    if (local.weekday !== weekday || local.hour !== hour || inQuietHours(local.hour, quietStart, quietEnd)) {
      skipped += 1; continue;
    }
    const dedupeKey = `discovery:${local.weekKey}`;
    const { data: claimed } = await service.from('notification_deliveries').insert({
      user_id: row.user_id, kind: 'discovery_digest', dedupe_key: dedupeKey, status: 'skipped',
    }).select('id').maybeSingle();
    if (!claimed) { skipped += 1; continue; }
    const [{ data: tokenRows }, { data: insightRows }] = await Promise.all([
      service.from('device_push_tokens').select('expo_push_token').eq('user_id', row.user_id).eq('enabled', true).limit(5),
      service.from('assistant_insights').select('title,summary,payload')
        .eq('user_id', row.user_id).eq('status', 'active').gt('expires_at', new Date().toISOString())
        .in('kind', ['destination_matches', 'timing', 'decision_brief'])
        .order('generated_at', { ascending: false }).limit(1),
    ]);
    const insight = insightRows?.[0];
    if (!insight || !tokenRows?.length) { skipped += 1; continue; }
    const messages = tokenRows.map((token) => ({
      to: token.expo_push_token,
      sound: 'default',
      title: String(insight.title ?? 'A fresh Outing idea').slice(0, 120),
      body: String(insight.summary ?? 'See what fits your next trip.').slice(0, 220),
      data: { route: '/discover', kind: 'weekly_discovery' },
    }));
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages),
      signal: AbortSignal.timeout(8_000),
    });
    await service.from('notification_deliveries').update({ status: response.ok ? 'sent' : 'failed', sent_at: new Date().toISOString() }).eq('id', claimed.id);
    if (response.ok) {
      await service.from('notification_preferences').update({ last_discovery_digest_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
      sent += 1;
    }
  }
  return json({ sent, skipped });
});
