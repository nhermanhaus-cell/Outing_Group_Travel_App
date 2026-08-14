-- Personalized assistant insights and provisional global destination discovery.

alter table public.assistant_conversations
  add column if not exists agent_id text,
  add column if not exists agent_version text,
  add column if not exists context_fingerprint text;

create unique index if not exists user_preferences_user_unique
  on public.user_preferences(user_id);
create unique index if not exists user_privacy_settings_user_unique
  on public.user_privacy_settings(user_id);

alter table public.user_privacy_settings
  add column if not exists personalization_enabled boolean not null default true;

drop policy if exists user_preferences_own_select on public.user_preferences;
drop policy if exists user_preferences_own_insert on public.user_preferences;
drop policy if exists user_preferences_own_update on public.user_preferences;
create policy user_preferences_own_select on public.user_preferences for select using (user_id = auth.uid());
create policy user_preferences_own_insert on public.user_preferences for insert with check (user_id = auth.uid());
create policy user_preferences_own_update on public.user_preferences for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_privacy_settings_own_select on public.user_privacy_settings;
drop policy if exists user_privacy_settings_own_insert on public.user_privacy_settings;
drop policy if exists user_privacy_settings_own_update on public.user_privacy_settings;
create policy user_privacy_settings_own_select on public.user_privacy_settings for select using (user_id = auth.uid());
create policy user_privacy_settings_own_insert on public.user_privacy_settings for insert with check (user_id = auth.uid());
create policy user_privacy_settings_own_update on public.user_privacy_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.destination_candidates (
  id uuid primary key default gen_random_uuid(),
  canonical_place_id text not null unique,
  slug text not null unique,
  name text not null,
  country text not null,
  country_code text,
  status text not null default 'researching'
    check (status in ('researching', 'provisional', 'in_review', 'published', 'rejected', 'stale')),
  summary text,
  payload jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  demand_count int not null default 0 check (demand_count >= 0),
  confidence numeric(6,5) not null default 0 check (confidence between 0 and 1),
  researched_at timestamptz,
  expires_at timestamptz,
  published_destination_id uuid references public.destinations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists destination_candidates_review_idx
  on public.destination_candidates(status, demand_count desc, updated_at desc);

create table if not exists public.destination_candidate_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.destination_candidates(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null check (char_length(query) <= 400),
  created_at timestamptz not null default now(),
  unique (candidate_id, user_id)
);

alter table public.destination_candidates enable row level security;
alter table public.destination_candidate_requests enable row level security;

create policy destination_candidates_requester_read
  on public.destination_candidates for select
  using (
    exists (
      select 1 from public.destination_candidate_requests r
      where r.candidate_id = destination_candidates.id and r.user_id = auth.uid()
    )
  );

create policy destination_candidate_requests_own_read
  on public.destination_candidate_requests for select using (user_id = auth.uid());

create table if not exists public.assistant_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  destination_slug text,
  surface text not null check (surface in ('home', 'destination', 'trip', 'ask')),
  kind text not null check (kind in ('destination_matches', 'timing', 'trip_decision', 'activity_options', 'starter_prompts')),
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  context_fingerprint text not null,
  status text not null default 'active' check (status in ('active', 'dismissed', 'expired')),
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_insights_lookup_idx
  on public.assistant_insights(user_id, surface, status, expires_at desc);

alter table public.assistant_insights enable row level security;
create policy assistant_insights_own_read
  on public.assistant_insights for select using (user_id = auth.uid());
create policy assistant_insights_own_update
  on public.assistant_insights for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.assistant_insight_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  destination_slug text,
  trigger text not null,
  context_fingerprint text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, trigger, context_fingerprint)
);

alter table public.assistant_insight_jobs enable row level security;

create or replace function public.reset_personalization_signals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_preference_signals where user_id = auth.uid();
  update public.assistant_insights
    set status = 'expired', updated_at = now()
    where user_id = auth.uid() and status = 'active';
end;
$$;

revoke all on function public.reset_personalization_signals() from public;
grant execute on function public.reset_personalization_signals() to authenticated;
