-- Outing initial schema + RLS
create extension if not exists "pgcrypto";

do $$ begin
  create type trip_visibility as enum ('private', 'link_only', 'friends', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trip_member_role as enum ('owner', 'organizer', 'member', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type glamour_level as enum (
    'shoestring_slay',
    'cute_but_controlled',
    'comfortably_fabulous',
    'luxury_gaycation',
    'no_budget_just_vibes'
  );
exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_privacy_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  profile_visibility text not null default 'friends',
  show_past_trips boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null,
  country_code text not null,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  timezone text not null,
  currency text not null,
  editorial_summary text,
  hero_image_url text,
  payload jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  data_freshness timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists destination_seasons (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  month int not null check (month between 1 and 12),
  score int not null default 50,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists destination_context (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  payload jsonb not null,
  last_reviewed_at timestamptz,
  data_label text not null default 'editorial_demo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists destination_sources (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  title text not null,
  url text,
  accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists neighborhoods (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  slug text not null,
  name text not null,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  name text not null,
  category text not null,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  summary text,
  payload jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  title text not null,
  start_date timestamptz,
  end_date timestamptz,
  category text,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  name text not null,
  destination_slug text,
  visibility trip_visibility not null default 'private',
  start_date timestamptz,
  end_date timestamptz,
  origin text,
  traveler_count int not null default 1,
  glamour_level glamour_level default 'comfortably_fabulous',
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role trip_member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  token_hash text not null,
  created_by uuid references profiles(id),
  expires_at timestamptz,
  max_uses int,
  use_count int not null default 0,
  revoked_at timestamptz,
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_preferences (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  question text not null,
  poll_type text not null default 'custom',
  deadline timestamptz,
  anonymous boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references trip_polls(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists trip_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references trip_polls(id) on delete cascade,
  option_id uuid not null references trip_poll_options(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rank int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, user_id, option_id)
);

create table if not exists trip_itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day_index int not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references trip_itinerary_days(id) on delete cascade,
  place_id uuid references places(id),
  title text not null,
  category text,
  starts_at text,
  duration_minutes int,
  estimated_cost numeric,
  locked boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_saved_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  place_id uuid references places(id),
  label text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  parent_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_activity (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists trip_external_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  provider text not null,
  url text not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_budgets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_budget_scenarios (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references trip_budgets(id) on delete cascade,
  glamour_level glamour_level not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_budget_items (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references trip_budget_scenarios(id) on delete cascade,
  category text not null,
  amount_low numeric,
  amount_high numeric,
  is_live boolean not null default false,
  assumptions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists community_signal_aggregates (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists guides (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  author_id uuid references profiles(id),
  published boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  author_id uuid references profiles(id),
  ratings jsonb not null default '{}'::jsonb,
  body text,
  published boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  enabled boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id),
  target_type text not null,
  target_id text not null,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_owner_idx on trips(owner_id);
create index if not exists trip_members_user_idx on trip_members(user_id);
create index if not exists places_destination_idx on places(destination_id);
create index if not exists events_destination_idx on events(destination_id);

-- RLS
alter table profiles enable row level security;
alter table user_preferences enable row level security;
alter table user_privacy_settings enable row level security;
alter table destinations enable row level security;
alter table places enable row level security;
alter table events enable row level security;
alter table guides enable row level security;
alter table trips enable row level security;
alter table trip_members enable row level security;
alter table trip_invites enable row level security;
alter table trip_polls enable row level security;
alter table trip_poll_options enable row level security;
alter table trip_votes enable row level security;
alter table trip_comments enable row level security;
alter table trip_itinerary_days enable row level security;
alter table trip_itinerary_items enable row level security;
alter table trip_saved_places enable row level security;
alter table trip_activity enable row level security;
alter table trip_external_links enable row level security;
alter table trip_budgets enable row level security;
alter table trip_budget_scenarios enable row level security;
alter table trip_budget_items enable row level security;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

create policy destinations_public_read on destinations for select using (published = true and deleted_at is null);
create policy places_public_read on places for select using (published = true and deleted_at is null);
create policy events_public_read on events for select using (published = true);
create policy guides_public_read on guides for select using (published = true);

create policy profiles_read on profiles for select using (deleted_at is null);
create policy profiles_update_own on profiles for update using (id = auth.uid());

create policy trips_member_select on trips for select using (
  deleted_at is null and (
    visibility in ('public', 'link_only') or owner_id = auth.uid() or public.is_trip_member(id)
  )
);
create policy trips_owner_insert on trips for insert with check (owner_id = auth.uid());
create policy trips_member_update on trips for update using (
  owner_id = auth.uid() or public.is_trip_member(id)
);

create policy trip_members_select on trip_members for select using (public.is_trip_member(trip_id) or user_id = auth.uid());
create policy trip_members_insert on trip_members for insert with check (public.is_trip_member(trip_id) or user_id = auth.uid());

create policy trip_polls_member on trip_polls for all using (public.is_trip_member(trip_id));
create policy trip_votes_member on trip_votes for all using (
  exists (select 1 from trip_polls p where p.id = poll_id and public.is_trip_member(p.trip_id))
);
create policy trip_comments_member on trip_comments for all using (public.is_trip_member(trip_id));
create policy trip_itinerary_days_member on trip_itinerary_days for all using (public.is_trip_member(trip_id));
create policy trip_saved_places_member on trip_saved_places for all using (public.is_trip_member(trip_id));
create policy trip_external_links_member on trip_external_links for all using (public.is_trip_member(trip_id));
create policy trip_budgets_member on trip_budgets for all using (public.is_trip_member(trip_id));
