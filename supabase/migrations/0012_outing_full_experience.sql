-- Outing full-experience additive persistence. Existing clients and schema-v1
-- plans remain valid during the native release window.

insert into public.feature_flags (key, enabled, payload)
values ('outingFullExperienceV1', false, '{"release":"2026-08-12","scope":"all_features"}'::jsonb)
on conflict (key) do update set enabled = false, payload = excluded.payload, updated_at = now();

alter table public.feature_flags enable row level security;
create policy feature_flags_public_read on public.feature_flags for select using (true);
revoke insert, update, delete on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to anon, authenticated;

create table if not exists public.activity_preference_sessions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_place_ids jsonb not null default '[]'::jsonb,
  reviewed_categories jsonb not null default '[]'::jsonb,
  reaction_count int not null default 0 check (reaction_count >= 0),
  is_complete boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (trip_id, member_id)
);

alter table public.activity_preference_sessions enable row level security;
create policy activity_preference_sessions_member_read
  on public.activity_preference_sessions for select
  using (public.is_trip_member(trip_id));
create policy activity_preference_sessions_own_write
  on public.activity_preference_sessions for all
  using (member_id = auth.uid() and public.is_trip_member(trip_id))
  with check (member_id = auth.uid() and public.is_trip_member(trip_id));

create or replace function public.update_trip_activity_preferences_v2(
  p_trip_id uuid,
  p_votes jsonb,
  p_completed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_place_ids text[];
  v_clean_votes jsonb;
  v_merged jsonb;
  v_legacy jsonb;
begin
  if v_user_id is null or not public.is_trip_member(p_trip_id) then
    raise exception 'Trip membership required';
  end if;
  if jsonb_typeof(p_votes) <> 'array' then raise exception 'Votes must be an array'; end if;

  select coalesce(jsonb_agg(
    case when value->>'choice' = 'not_interested'
      then jsonb_set(value, '{choice}', '"not_for_this_trip"'::jsonb, true)
      else value end
  ), '[]'::jsonb), array_agg(value->>'placeId')
  into v_clean_votes, v_place_ids
  from jsonb_array_elements(p_votes)
  where value->>'memberId' = v_user_id::text
    and value->>'choice' in ('must_do', 'interested', 'maybe', 'not_for_this_trip', 'not_interested')
    and nullif(value->>'placeId', '') is not null
    and nullif(value->>'category', '') is not null;

  select case
    when payload ? 'activityPreferencesV2' then coalesce(payload->'activityPreferencesV2', '[]'::jsonb)
    else coalesce((
      select jsonb_agg(
        case when value->>'choice' = 'not_interested'
          then jsonb_set(value, '{choice}', '"not_for_this_trip"'::jsonb, true)
          else value end
      ) from jsonb_array_elements(coalesce(payload->'activityPreferences', '[]'::jsonb))
    ), '[]'::jsonb)
  end
  into v_existing
  from public.trips
  where id = p_trip_id and deleted_at is null
  for update;
  if not found then raise exception 'Trip not found'; end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb)
  into v_merged
  from jsonb_array_elements(v_existing)
  where not (
    value->>'memberId' = v_user_id::text
    and value->>'placeId' = any(coalesce(v_place_ids, array[]::text[]))
  );

  v_merged := v_merged || coalesce(v_clean_votes, '[]'::jsonb);
  select coalesce(jsonb_agg(
    jsonb_set(
      value,
      '{choice}',
      to_jsonb(case
        when value->>'choice' = 'not_for_this_trip' then 'not_interested'
        else 'interested'
      end),
      true
    )
  ), '[]'::jsonb)
  into v_legacy
  from jsonb_array_elements(v_merged);
  update public.trips
  set payload = jsonb_set(
        jsonb_set(coalesce(payload, '{}'::jsonb), '{activityPreferencesV2}', v_merged, true),
        '{activityPreferences}', v_legacy, true
      ),
      updated_at = now()
  where id = p_trip_id;

  insert into public.activity_preference_sessions (
    trip_id, member_id, reviewed_place_ids, reviewed_categories,
    reaction_count, is_complete, completed_at, updated_at
  )
  select
    p_trip_id,
    v_user_id,
    coalesce(jsonb_agg(distinct value->>'placeId'), '[]'::jsonb),
    coalesce(jsonb_agg(distinct value->>'category'), '[]'::jsonb),
    count(distinct value->>'placeId')::int,
    p_completed,
    case when p_completed then now() else null end,
    now()
  from jsonb_array_elements(v_merged) value
  where value->>'memberId' = v_user_id::text
  on conflict (trip_id, member_id) do update set
    reviewed_place_ids = excluded.reviewed_place_ids,
    reviewed_categories = excluded.reviewed_categories,
    reaction_count = excluded.reaction_count,
    is_complete = public.activity_preference_sessions.is_complete or excluded.is_complete,
    completed_at = coalesce(public.activity_preference_sessions.completed_at, excluded.completed_at),
    updated_at = now();
end;
$$;

revoke all on function public.update_trip_activity_preferences_v2(uuid, jsonb, boolean) from public;
grant execute on function public.update_trip_activity_preferences_v2(uuid, jsonb, boolean) to authenticated;

-- Retain the old RPC for one mobile compatibility window while dual-writing.
create or replace function public.update_trip_activity_preferences(
  p_trip_id uuid,
  p_votes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.update_trip_activity_preferences_v2(p_trip_id, p_votes, false);
end;
$$;

revoke all on function public.update_trip_activity_preferences(uuid, jsonb) from public;
grant execute on function public.update_trip_activity_preferences(uuid, jsonb) to authenticated;

-- Serialize payload-backed poll votes so concurrent members cannot replace
-- one another's selection. Proposal resolution is derived while the row lock
-- is held, using the authoritative trip-members table.
create or replace function public.cast_trip_payload_poll_vote(
  p_trip_id uuid,
  p_poll_id text,
  p_option_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_polls jsonb;
  v_next jsonb;
  v_toggle_off boolean;
  v_member_count int;
  v_accepts int;
  v_dismisses int;
  v_voter_count int;
  v_majority int;
  v_resolution text;
begin
  if v_user_id is null or not public.is_trip_member(p_trip_id) then
    raise exception 'Trip membership required';
  end if;
  if nullif(trim(p_poll_id), '') is null or nullif(trim(p_option_id), '') is null then
    raise exception 'Poll and option are required';
  end if;

  select coalesce(payload->'polls', '[]'::jsonb)
  into v_polls
  from public.trips
  where id = p_trip_id and deleted_at is null
  for update;
  if not found then raise exception 'Trip not found'; end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_polls) poll,
      jsonb_array_elements(coalesce(poll->'options', '[]'::jsonb)) option
    where poll->>'id' = p_poll_id and option->>'id' = p_option_id
  ) then
    raise exception 'Poll option not found';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_polls) poll
    where poll->>'id' = p_poll_id and nullif(poll->>'resolution', '') is not null
  ) then
    raise exception 'Poll is already resolved';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(v_polls) poll,
      jsonb_array_elements(coalesce(poll->'options', '[]'::jsonb)) option,
      jsonb_array_elements(coalesce(option->'votes', '[]'::jsonb)) voter
    where poll->>'id' = p_poll_id
      and option->>'id' = p_option_id
      and voter #>> '{}' = v_user_id::text
  ) into v_toggle_off;

  select coalesce(jsonb_agg(
    case when poll->>'id' <> p_poll_id then poll
    else jsonb_set(
      poll - 'resolution',
      '{options}',
      coalesce((
        select jsonb_agg(
          jsonb_set(
            option,
            '{votes}',
            coalesce((
              select jsonb_agg(voter)
              from jsonb_array_elements(coalesce(option->'votes', '[]'::jsonb)) voter
              where voter #>> '{}' <> v_user_id::text
            ), '[]'::jsonb)
            || case
              when option->>'id' = p_option_id and not v_toggle_off
                then jsonb_build_array(v_user_id::text)
              else '[]'::jsonb
            end,
            true
          ) order by option_ordinality
        )
        from jsonb_array_elements(coalesce(poll->'options', '[]'::jsonb))
          with ordinality as options(option, option_ordinality)
      ), '[]'::jsonb),
      true
    ) end
    order by poll_ordinality
  ), '[]'::jsonb)
  into v_next
  from jsonb_array_elements(v_polls) with ordinality as polls(poll, poll_ordinality);

  if exists (
    select 1 from jsonb_array_elements(v_next) poll
    where poll->>'id' = p_poll_id
      and (poll ? 'assistantProposal' or poll ? 'planProposalId')
  ) then
    select count(*) into v_member_count
    from public.trip_members where trip_id = p_trip_id;
    v_majority := floor(v_member_count / 2.0)::int + 1;

    with target as (
      select option, option_ordinality
      from jsonb_array_elements(v_next) poll,
        jsonb_array_elements(coalesce(poll->'options', '[]'::jsonb))
          with ordinality as options(option, option_ordinality)
      where poll->>'id' = p_poll_id
    ), valid_votes as (
      select distinct option_ordinality, voter #>> '{}' as user_id
      from target,
        jsonb_array_elements(coalesce(option->'votes', '[]'::jsonb)) voter
      where exists (
        select 1 from public.trip_members member
        where member.trip_id = p_trip_id and member.user_id::text = voter #>> '{}'
      )
    )
    select
      count(*) filter (where option_ordinality = 1),
      count(*) filter (where option_ordinality = 2),
      count(distinct user_id)
    into v_accepts, v_dismisses, v_voter_count
    from valid_votes;

    v_resolution := case
      when v_accepts >= v_majority then 'accepted'
      when v_dismisses >= v_majority then 'dismissed'
      when v_voter_count >= v_member_count and v_accepts = v_dismisses then 'tie'
      else null
    end;

    if v_resolution is not null then
      select jsonb_agg(
        case when poll->>'id' = p_poll_id
          then jsonb_set(poll, '{resolution}', to_jsonb(v_resolution), true)
          else poll end
        order by poll_ordinality
      )
      into v_next
      from jsonb_array_elements(v_next) with ordinality as polls(poll, poll_ordinality);
    end if;
  end if;

  update public.trips
  set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{polls}', v_next, true),
      updated_at = now()
  where id = p_trip_id;

  return v_next;
end;
$$;

revoke all on function public.cast_trip_payload_poll_vote(uuid, text, text) from public;
grant execute on function public.cast_trip_payload_poll_vote(uuid, text, text) to authenticated;

create table if not exists public.trip_plan_proposals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  proposal_kind text not null check (proposal_kind in ('day_rework', 'assistant_change', 'audit_fix')),
  action text not null,
  day_index int check (day_index between 1 and 90),
  prior_plan_id text not null,
  prior_revision int not null check (prior_revision > 0),
  preview_plan jsonb not null,
  summary text not null,
  status text not null default 'preview' check (status in ('preview', 'polling', 'accepted', 'dismissed')),
  poll_id uuid references public.trip_polls(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_plan_proposals_trip_idx
  on public.trip_plan_proposals(trip_id, status, created_at desc);
alter table public.trip_plan_proposals enable row level security;
create policy trip_plan_proposals_member_read
  on public.trip_plan_proposals for select using (public.is_trip_member(trip_id));
create policy trip_plan_proposals_member_insert
  on public.trip_plan_proposals for insert
  with check (created_by = auth.uid() and public.is_trip_member(trip_id));
create policy trip_plan_proposals_organizer_update
  on public.trip_plan_proposals for update
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create table if not exists public.inspiration_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'uploading', 'processing', 'review', 'completed', 'failed', 'expired')),
  source_count int not null check (source_count between 1 and 10),
  confirmed_count int not null default 0 check (confirmed_count >= 0),
  storage_prefix text,
  failure_code text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspiration_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.inspiration_imports(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  input_kind text not null check (input_kind in ('image', 'url', 'google_maps', 'article', 'social_link', 'place_file')),
  title text not null,
  summary text,
  destination_name text,
  destination_slug text,
  canonical_place_id text,
  provider_place_id text,
  source_url text,
  category text,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  status text not null default 'candidate'
    check (status in ('candidate', 'confirmed', 'dismissed', 'duplicate', 'invalid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspiration_imports_owner_idx on public.inspiration_imports(owner_id, created_at desc);
create index if not exists inspiration_items_import_idx on public.inspiration_items(import_id, status);
create unique index if not exists inspiration_confirmed_place_unique
  on public.inspiration_items(owner_id, canonical_place_id)
  where status = 'confirmed' and canonical_place_id is not null;

alter table public.inspiration_imports enable row level security;
alter table public.inspiration_items enable row level security;
create policy inspiration_imports_own on public.inspiration_imports for all
  using (owner_id = auth.uid()) with check (
    owner_id = auth.uid() and (trip_id is null or public.is_trip_member(trip_id))
  );
create policy inspiration_items_own on public.inspiration_items for all
  using (owner_id = auth.uid()) with check (
    owner_id = auth.uid() and exists (
      select 1 from public.inspiration_imports i
      where i.id = import_id and i.owner_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspiration-imports',
  'inspiration-imports',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv', 'text/xml', 'application/json', 'application/xml', 'application/vnd.google-earth.kml+xml']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy inspiration_storage_own_read on storage.objects for select
  using (bucket_id = 'inspiration-imports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy inspiration_storage_own_insert on storage.objects for insert
  with check (bucket_id = 'inspiration-imports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy inspiration_storage_own_delete on storage.objects for delete
  using (bucket_id = 'inspiration-imports' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.trip_awareness_settings (
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  background_location_enabled boolean not null default false,
  itinerary_reminders_enabled boolean not null default true,
  consented_at timestamptz,
  monitoring_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, owner_id)
);

create table if not exists public.trip_visit_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  item_id text,
  place_id text,
  event text not null check (event in ('arrived', 'departed', 'skipped', 'manually_visited')),
  occurred_at timestamptz not null,
  source text not null check (source in ('device_geofence', 'manual')),
  created_at timestamptz not null default now(),
  unique (owner_id, trip_id, item_id, event, occurred_at)
);

create index if not exists trip_visit_events_owner_idx
  on public.trip_visit_events(owner_id, trip_id, occurred_at desc);
alter table public.trip_awareness_settings enable row level security;
alter table public.trip_visit_events enable row level security;
create policy trip_awareness_owner_only on public.trip_awareness_settings for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.is_trip_member(trip_id));
create policy trip_visit_events_owner_only on public.trip_visit_events for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.is_trip_member(trip_id));

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null,
  platform text not null check (platform in ('ios', 'android')),
  expo_push_token text not null,
  timezone text not null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

alter table public.device_push_tokens enable row level security;
create policy device_push_tokens_own on public.device_push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences
  add column if not exists last_discovery_digest_at timestamptz;
delete from public.notification_preferences older
using public.notification_preferences newer
where older.user_id = newer.user_id
  and (older.updated_at, older.id) < (newer.updated_at, newer.id);
create unique index if not exists notification_preferences_user_unique
  on public.notification_preferences(user_id);
create policy notification_preferences_own on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('discovery_digest', 'active_trip_reminder')),
  dedupe_key text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, dedupe_key)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;

comment on table public.trip_visit_events is
  'Owner-only derived visit events. Raw coordinate trails must never be persisted.';
comment on table public.inspiration_items is
  'Confirmed structured extraction only. Raw OCR and uploaded originals are deleted after processing.';

-- pgcrypto is installed in Supabase's extensions schema. Keep the existing
-- invite behavior and make its digest lookup explicit to database linting.
alter function public.redeem_trip_invite(text) set search_path = public, extensions;
