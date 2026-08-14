-- Structured decision intelligence, semantic retrieval, and thresholded
-- community recommendation signals. Model content remains server-only.

create extension if not exists vector with schema extensions;

alter table public.assistant_insights
  drop constraint if exists assistant_insights_kind_check;

alter table public.assistant_insights
  add constraint assistant_insights_kind_check check (kind in (
    'destination_matches', 'timing', 'trip_decision', 'activity_options', 'starter_prompts',
    'decision_brief', 'comparison', 'trip_audit', 'search_relaxation', 'group_brief'
  ));

alter table public.assistant_insights
  add column if not exists payload_version text not null default 'v1',
  add column if not exists source_freshness text not null default 'cached'
    check (source_freshness in ('live', 'recent', 'cached', 'stale', 'limited')),
  add column if not exists decision_key text;

create index if not exists assistant_insights_decision_idx
  on public.assistant_insights(user_id, surface, decision_key, status, expires_at desc);

create table if not exists public.assistant_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'destination', 'destination_context', 'place', 'event', 'experience', 'neighborhood', 'editorial'
  )),
  entity_id text not null,
  destination_slug text,
  chunk_kind text not null,
  approved_text text not null check (char_length(approved_text) between 1 and 8000),
  content_hash text not null,
  source_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  data_freshness timestamptz,
  published boolean not null default true,
  embedding extensions.vector(1024),
  embedding_model text,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, chunk_kind)
);

create index if not exists assistant_knowledge_destination_idx
  on public.assistant_knowledge_chunks(destination_slug, entity_type)
  where published = true;

create index if not exists assistant_knowledge_embedding_idx
  on public.assistant_knowledge_chunks
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 40)
  where embedding is not null and published = true;

alter table public.assistant_knowledge_chunks enable row level security;
revoke all on public.assistant_knowledge_chunks from anon, authenticated;

create or replace function public.match_assistant_knowledge(
  query_embedding extensions.vector(1024),
  match_count int default 20,
  filter_destination_slug text default null,
  filter_entity_types text[] default null
)
returns table (
  id uuid,
  entity_type text,
  entity_id text,
  destination_slug text,
  chunk_kind text,
  approved_text text,
  source_ids jsonb,
  metadata jsonb,
  data_freshness timestamptz,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    chunk.id,
    chunk.entity_type,
    chunk.entity_id,
    chunk.destination_slug,
    chunk.chunk_kind,
    chunk.approved_text,
    chunk.source_ids,
    chunk.metadata,
    chunk.data_freshness,
    1 - (chunk.embedding <=> query_embedding) as similarity
  from public.assistant_knowledge_chunks chunk
  where chunk.published = true
    and chunk.embedding is not null
    and (filter_destination_slug is null or chunk.destination_slug = filter_destination_slug)
    and (filter_entity_types is null or chunk.entity_type = any(filter_entity_types))
  order by chunk.embedding <=> query_embedding
  limit greatest(1, least(match_count, 40));
$$;

revoke all on function public.match_assistant_knowledge(extensions.vector, int, text, text[]) from public, anon, authenticated;
grant execute on function public.match_assistant_knowledge(extensions.vector, int, text, text[]) to service_role;

create table if not exists public.community_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('destination', 'activity_category', 'provider')),
  subject_key text not null check (char_length(subject_key) between 1 and 160),
  signal_type text not null check (signal_type in (
    'saved', 'dismissed', 'voted', 'feedback_positive', 'feedback_negative', 'proposal_accepted'
  )),
  value smallint not null check (value in (-1, 1)),
  occurred_at timestamptz not null default now(),
  unique (user_id, subject_type, subject_key, signal_type)
);

create index if not exists community_recommendation_events_subject_idx
  on public.community_recommendation_events(subject_type, subject_key, occurred_at desc);

alter table public.community_recommendation_events enable row level security;
revoke all on public.community_recommendation_events from anon, authenticated;

create or replace view public.community_recommendation_aggregates
with (security_invoker = true)
as
select
  subject_type,
  subject_key,
  count(distinct user_id)::int as distinct_users,
  count(*)::int as signal_count,
  greatest(-1, least(1, avg(value::numeric)))::numeric(6,5) as score,
  max(occurred_at) as last_observed_at
from public.community_recommendation_events
where occurred_at >= now() - interval '365 days'
group by subject_type, subject_key
having count(distinct user_id) >= 25;

revoke all on public.community_recommendation_aggregates from public, anon, authenticated;
grant select on public.community_recommendation_aggregates to service_role;

create or replace function public.record_community_recommendation_event(
  p_subject_type text,
  p_subject_key text,
  p_signal_type text,
  p_value smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.user_privacy_settings
    where user_id = auth.uid() and personalization_enabled = false
  ) then return; end if;
  if p_subject_type not in ('destination', 'activity_category', 'provider') then
    raise exception 'Unsupported community signal subject';
  end if;
  if p_signal_type not in ('saved', 'dismissed', 'voted', 'feedback_positive', 'feedback_negative', 'proposal_accepted') then
    raise exception 'Unsupported community signal type';
  end if;
  if p_value not in (-1, 1) then raise exception 'Signal value must be -1 or 1'; end if;
  if char_length(trim(p_subject_key)) not between 1 and 160 then raise exception 'Invalid subject key'; end if;

  insert into public.community_recommendation_events (
    user_id, subject_type, subject_key, signal_type, value, occurred_at
  ) values (
    auth.uid(), p_subject_type, lower(trim(p_subject_key)), p_signal_type, p_value, now()
  )
  on conflict (user_id, subject_type, subject_key, signal_type)
  do update set value = excluded.value, occurred_at = excluded.occurred_at;
end;
$$;

revoke all on function public.record_community_recommendation_event(text, text, text, smallint) from public;
grant execute on function public.record_community_recommendation_event(text, text, text, smallint) to authenticated;

create or replace function public.reset_personalization_signals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_preference_signals where user_id = auth.uid();
  delete from public.community_recommendation_events where user_id = auth.uid();
  update public.assistant_insights
    set status = 'expired', updated_at = now()
    where user_id = auth.uid() and status = 'active';
end;
$$;

revoke all on function public.reset_personalization_signals() from public;
grant execute on function public.reset_personalization_signals() to authenticated;

comment on view public.community_recommendation_aggregates is
  'Thresholded non-sensitive recommendation signals. Cohorts below 25 users are never returned.';
