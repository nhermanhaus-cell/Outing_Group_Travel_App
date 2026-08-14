-- Rich itinerary planning, profile defaults, and secure collaboration.

create unique index if not exists user_preferences_user_unique on user_preferences(user_id);
create policy user_preferences_own_select on user_preferences for select using (user_id = auth.uid());
create policy user_preferences_own_insert on user_preferences for insert with check (user_id = auth.uid());
create policy user_preferences_own_update on user_preferences for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles(id, display_name, avatar_url)
select id, coalesce(raw_user_meta_data->>'display_name', raw_user_meta_data->>'full_name'), raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

create table if not exists trip_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('recommendations', 'manual')),
  payload jsonb not null default '{}'::jsonb,
  converted_trip_id uuid references trips(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trip_drafts enable row level security;
create policy trip_drafts_owner on trip_drafts for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table trip_itinerary_items add column if not exists starts_at_tz timestamptz;
alter table trip_itinerary_items add column if not exists ends_at_tz timestamptz;
alter table trip_itinerary_items add column if not exists source text;
alter table trip_itinerary_items add column if not exists source_item_id text;
alter table trip_itinerary_items add column if not exists travel_from_previous jsonb;
alter table trip_itinerary_items add column if not exists schedule_status text default 'estimated';

create table if not exists trip_route_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day_id uuid references trip_itinerary_days(id) on delete cascade,
  from_item_id uuid references trip_itinerary_items(id) on delete cascade,
  to_item_id uuid references trip_itinerary_items(id) on delete cascade,
  mode text not null,
  duration_seconds int not null,
  distance_meters int not null,
  encoded_polyline text,
  status text not null default 'estimated',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table trip_route_legs enable row level security;

create table if not exists provider_cache (
  cache_key text primary key,
  provider text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table provider_cache enable row level security;

create table if not exists api_rate_limits (
  user_id uuid not null,
  provider text not null,
  bucket timestamptz not null,
  request_count int not null default 0,
  primary key (user_id, provider, bucket)
);
alter table api_rate_limits enable row level security;

create or replace function public.check_provider_rate_limit(p_provider text, p_limit int default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_bucket timestamptz := date_trunc('minute', now()); v_count int;
begin
  if auth.uid() is null then return false; end if;
  insert into api_rate_limits(user_id, provider, bucket, request_count)
  values (auth.uid(), p_provider, v_bucket, 1)
  on conflict (user_id, provider, bucket) do update
    set request_count = api_rate_limits.request_count + 1
  returning request_count into v_count;
  delete from api_rate_limits where bucket < now() - interval '1 day';
  return v_count <= p_limit;
end;
$$;

create or replace function public.is_trip_organizer(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trips t where t.id = p_trip_id and t.owner_id = auth.uid()
  ) or exists (
    select 1 from trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid() and m.role in ('owner', 'organizer')
  );
$$;

create or replace function public.update_trip_collaboration_payload(p_trip_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_allowed jsonb;
begin
  if not public.is_trip_member(p_trip_id) then raise exception 'Trip membership required'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_allowed
  from jsonb_each(p_patch)
  where key in ('comments', 'polls', 'savedPlaces', 'itineraryItems', 'memberPrefs');
  update trips set payload = payload || v_allowed, updated_at = now() where id = p_trip_id;
end;
$$;

drop policy if exists trips_member_update on trips;
create policy trips_organizer_update on trips for update
  using (public.is_trip_organizer(id)) with check (public.is_trip_organizer(id));

drop policy if exists trip_members_insert on trip_members;
create policy trip_members_organizer_insert on trip_members for insert
  with check (public.is_trip_organizer(trip_id));
create policy trip_members_organizer_update on trip_members for update
  using (public.is_trip_organizer(trip_id)) with check (public.is_trip_organizer(trip_id));
create policy trip_members_organizer_delete on trip_members for delete
  using (public.is_trip_organizer(trip_id));

create policy trip_invites_organizer_select on trip_invites for select
  using (public.is_trip_organizer(trip_id));
create policy trip_invites_organizer_insert on trip_invites for insert
  with check (public.is_trip_organizer(trip_id));
create policy trip_invites_organizer_update on trip_invites for update
  using (public.is_trip_organizer(trip_id)) with check (public.is_trip_organizer(trip_id));

create policy trip_itinerary_items_member on trip_itinerary_items for all
  using (exists (
    select 1 from trip_itinerary_days d
    where d.id = day_id and public.is_trip_member(d.trip_id)
  ));
create policy trip_route_legs_member on trip_route_legs for all
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create or replace function public.redeem_trip_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite trip_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_invite from trip_invites
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses)
  for update;
  if not found then raise exception 'Invite is invalid or expired'; end if;
  insert into trip_members(trip_id, user_id, role)
  values (v_invite.trip_id, auth.uid(), 'member')
  on conflict (trip_id, user_id) do nothing;
  update trip_invites set use_count = use_count + 1 where id = v_invite.id;
  return v_invite.trip_id;
end;
$$;

insert into feature_flags(key, enabled, payload) values
  ('smart_itinerary_v2', true, '{}'),
  ('viator_v2', true, '{}'),
  ('supabase_collaboration', false, '{}'),
  ('trip_wizard_v2', true, '{}'),
  ('collections_v1', true, '{}')
on conflict (key) do nothing;
