import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/http.ts';

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405, headers: corsHeaders });
  if (request.headers.get('x-outing-cron-secret') !== env('DISCOVERY_CRON_SECRET')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }
  const service = createClient<any>(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: expired } = await service.from('inspiration_imports')
    .select('id,storage_prefix').lt('expires_at', new Date().toISOString())
    .in('status', ['queued', 'uploading', 'processing', 'failed']).limit(500);
  let removed = 0;
  for (const row of expired ?? []) {
    if (row.storage_prefix) {
      const { data: objects } = await service.storage.from('inspiration-imports').list(row.storage_prefix, { limit: 100 });
      const paths = (objects ?? []).map((item) => `${row.storage_prefix}/${item.name}`);
      if (paths.length) await service.storage.from('inspiration-imports').remove(paths);
    }
    await service.from('inspiration_imports').update({
      status: 'expired', storage_prefix: null, failure_code: 'expired', updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    removed += 1;
  }
  return Response.json({ expired: removed }, { headers: corsHeaders });
});
