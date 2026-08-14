-- Versioned end-to-end trip plans and per-member itinerary feedback.

create table if not exists public.trip_plan_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  revision int not null check (revision > 0),
  plan_id text not null,
  algorithm_version text not null,
  input_hash text not null,
  plan jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, revision)
);

create index if not exists trip_plan_versions_current_idx
  on public.trip_plan_versions(trip_id, is_current, revision desc);

alter table public.trip_plan_versions enable row level security;

create policy trip_plan_versions_member on public.trip_plan_versions for all
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create or replace function public.keep_one_current_trip_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_current then
    update public.trip_plan_versions
      set is_current = false, updated_at = now()
      where trip_id = new.trip_id
        and id <> new.id
        and is_current;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_plan_versions_keep_current on public.trip_plan_versions;
create trigger trip_plan_versions_keep_current
after insert or update of is_current on public.trip_plan_versions
for each row execute procedure public.keep_one_current_trip_plan();

create table if not exists public.trip_item_feedback (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  plan_id text,
  item_id text not null,
  place_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike', 'veto')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, item_id, user_id)
);

create index if not exists trip_item_feedback_trip_idx
  on public.trip_item_feedback(trip_id, item_id);

alter table public.trip_item_feedback enable row level security;

create policy trip_item_feedback_member_read on public.trip_item_feedback for select
  using (public.is_trip_member(trip_id));
create policy trip_item_feedback_own_insert on public.trip_item_feedback for insert
  with check (public.is_trip_member(trip_id) and user_id = auth.uid());
create policy trip_item_feedback_own_update on public.trip_item_feedback for update
  using (public.is_trip_member(trip_id) and user_id = auth.uid())
  with check (public.is_trip_member(trip_id) and user_id = auth.uid());
create policy trip_item_feedback_own_delete on public.trip_item_feedback for delete
  using (public.is_trip_member(trip_id) and user_id = auth.uid());

create or replace function public.update_trip_collaboration_payload(p_trip_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_allowed jsonb;
begin
  if not public.is_trip_member(p_trip_id) then raise exception 'Trip membership required'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_allowed
  from jsonb_each(p_patch)
  where key in (
    'comments',
    'polls',
    'savedPlaces',
    'itineraryItems',
    'memberPrefs',
    'tripPlan',
    'itineraryFeedback'
  );
  update trips set payload = payload || v_allowed, updated_at = now() where id = p_trip_id;
end;
$$;
