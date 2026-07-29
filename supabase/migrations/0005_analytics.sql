-- First-party behavioral analytics, administrative policy, and preference signals.

create table if not exists public.analytics_policy (
  policy_key text primary key default 'global',
  semantic_analytics_enabled boolean not null default true,
  personalization_enabled boolean not null default true,
  session_replay_enabled boolean not null default false,
  session_replay_sample_rate numeric(4,3) not null default 0.100
    check (session_replay_sample_rate between 0 and 1),
  policy_version text not null default 'v1-global-default-on',
  updated_at timestamptz not null default now()
);

insert into public.analytics_policy(policy_key)
values ('global')
on conflict (policy_key) do nothing;

alter table public.analytics_policy enable row level security;

create table if not exists public.analytics_events (
  event_id uuid primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  subject_id uuid not null,
  session_id uuid not null,
  event_name text not null,
  schema_version int not null check (schema_version > 0),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  screen_name text,
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  app_version text,
  properties jsonb not null default '{}'::jsonb,
  forward_attempts int not null default 0,
  forwarded_at timestamptz,
  last_forward_error text
);

create index if not exists analytics_events_received_idx
  on public.analytics_events(received_at desc);
create index if not exists analytics_events_name_idx
  on public.analytics_events(event_name, occurred_at desc);
create index if not exists analytics_events_session_idx
  on public.analytics_events(session_id, occurred_at);
create index if not exists analytics_events_unforwarded_idx
  on public.analytics_events(received_at)
  where forwarded_at is null;

alter table public.analytics_events enable row level security;

create table if not exists public.user_preference_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (
    subject_type in ('destination', 'destination_region', 'activity_category', 'pace', 'provider')
  ),
  subject_key text not null,
  score numeric(6,5) not null default 0 check (score between -1 and 1),
  evidence_weight numeric(7,3) not null default 0 check (evidence_weight between 0 and 20),
  confidence numeric(6,5) not null default 0 check (confidence between 0 and 1),
  last_source text not null check (
    last_source in (
      'passive_view',
      'save',
      'accept',
      'affiliate_handoff',
      'like',
      'dislike',
      'veto',
      'dismiss',
      'remove'
    )
  ),
  last_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject_type, subject_key)
);

create index if not exists user_preference_signals_user_idx
  on public.user_preference_signals(user_id, last_observed_at desc);

alter table public.user_preference_signals enable row level security;

create policy user_preference_signals_own_select
  on public.user_preference_signals for select
  using (user_id = auth.uid());
create policy user_preference_signals_own_insert
  on public.user_preference_signals for insert
  with check (user_id = auth.uid());
create policy user_preference_signals_own_update
  on public.user_preference_signals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy user_preference_signals_own_delete
  on public.user_preference_signals for delete
  using (user_id = auth.uid());

create or replace function public.purge_expired_analytics_events()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare deleted_count bigint;
begin
  delete from public.analytics_events
  where received_at < now() - interval '60 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_analytics_events() from public;
revoke all on function public.purge_expired_analytics_events() from anon;
revoke all on function public.purge_expired_analytics_events() from authenticated;
