-- Persistent, reusable provisional destinations and their generation progress.

alter table public.destination_candidates
  add column if not exists generation_status text not null default 'ready'
    check (generation_status in ('queued', 'generating', 'ready', 'failed')),
  add column if not exists generation_stage text not null default 'complete'
    check (generation_stage in ('identity', 'places', 'experiences', 'timing', 'context', 'finalizing', 'complete')),
  add column if not exists completed_sections text[] not null default '{}',
  add column if not exists generation_version text not null default 'legacy',
  add column if not exists is_discoverable boolean not null default false,
  add column if not exists last_generated_at timestamptz,
  add column if not exists refresh_after timestamptz,
  add column if not exists generation_error_category text;

create index if not exists destination_candidates_discovery_idx
  on public.destination_candidates(is_discoverable, status, name, country)
  where is_discoverable = true;

create table if not exists public.destination_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.destination_candidates(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'complete', 'failed')),
  generation_version text not null,
  attempts int not null default 0 check (attempts >= 0),
  error_category text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists destination_generation_jobs_active_unique
  on public.destination_generation_jobs(candidate_id)
  where status in ('queued', 'running');

alter table public.destination_generation_jobs enable row level security;

create policy destination_generation_jobs_requester_read
  on public.destination_generation_jobs for select
  using (requested_by = auth.uid());

create table if not exists public.destination_lookup_rate_limits (
  lookup_key text not null,
  bucket timestamptz not null,
  request_count int not null default 0,
  primary key (lookup_key, bucket)
);

alter table public.destination_lookup_rate_limits enable row level security;

create or replace function public.check_destination_lookup_rate_limit(p_key text, p_limit int default 12)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_count int;
begin
  if char_length(p_key) < 16 then return false; end if;
  insert into public.destination_lookup_rate_limits(lookup_key, bucket, request_count)
  values (p_key, v_bucket, 1)
  on conflict (lookup_key, bucket) do update
    set request_count = destination_lookup_rate_limits.request_count + 1
  returning request_count into v_count;
  delete from public.destination_lookup_rate_limits where bucket < now() - interval '1 day';
  return v_count <= greatest(1, least(p_limit, 30));
end;
$$;

revoke all on function public.check_destination_lookup_rate_limit(text, int) from public;
grant execute on function public.check_destination_lookup_rate_limit(text, int) to service_role;

alter table public.trips
  add column if not exists destination_candidate_id uuid
    references public.destination_candidates(id) on delete set null;

alter table public.saved_destinations
  alter column destination_slug drop not null;

alter table public.saved_destinations
  add column if not exists destination_candidate_id uuid
    references public.destination_candidates(id) on delete cascade;

create unique index if not exists saved_destinations_user_candidate_unique
  on public.saved_destinations(user_id, destination_candidate_id)
  where destination_candidate_id is not null;

alter table public.saved_destinations
  drop constraint if exists saved_destinations_reference_check;

alter table public.saved_destinations
  add constraint saved_destinations_reference_check check (
    (destination_slug is not null and destination_candidate_id is null)
    or (destination_slug is null and destination_candidate_id is not null)
  );

create or replace function public.can_read_destination_candidate(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.destination_candidates c
    where c.id = p_candidate_id
      and (
        c.is_discoverable = true
        or exists (
          select 1 from public.destination_candidate_requests r
          where r.candidate_id = c.id and r.user_id = auth.uid()
        )
        or exists (
          select 1 from public.trips t
          where t.destination_candidate_id = c.id and public.is_trip_member(t.id)
        )
      )
  );
$$;

revoke all on function public.can_read_destination_candidate(uuid) from public;
grant execute on function public.can_read_destination_candidate(uuid) to anon, authenticated;

drop policy if exists destination_candidates_requester_read on public.destination_candidates;
create policy destination_candidates_public_or_member_read
  on public.destination_candidates for select
  using (public.can_read_destination_candidate(id));

create or replace function public.publish_destination_candidate(
  p_candidate_id uuid,
  p_destination_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  select slug into v_slug
  from public.destinations
  where id = p_destination_id and published = true and deleted_at is null;
  if v_slug is null then raise exception 'Published destination required'; end if;
  if not exists (
    select 1 from public.destination_candidates
    where id = p_candidate_id and status = 'in_review'
  ) then raise exception 'Candidate must be in editorial review'; end if;

  delete from public.saved_destinations provisional
  where provisional.destination_candidate_id = p_candidate_id
    and exists (
      select 1 from public.saved_destinations reviewed
      where reviewed.user_id = provisional.user_id
        and reviewed.destination_slug = v_slug
    );

  update public.saved_destinations
    set destination_slug = v_slug,
        destination_candidate_id = null,
        updated_at = now()
    where destination_candidate_id = p_candidate_id;

  update public.trips
    set destination_slug = v_slug,
        destination_candidate_id = null,
        updated_at = now()
    where destination_candidate_id = p_candidate_id;

  update public.destination_candidates
    set status = 'published',
        published_destination_id = p_destination_id,
        is_discoverable = false,
        updated_at = now()
    where id = p_candidate_id;
  return true;
end;
$$;

revoke all on function public.publish_destination_candidate(uuid, uuid) from public;
grant execute on function public.publish_destination_candidate(uuid, uuid) to service_role;
