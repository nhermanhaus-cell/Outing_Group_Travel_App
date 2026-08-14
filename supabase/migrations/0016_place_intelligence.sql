-- Searchable, structured place intelligence for provider-backed assistant tools.
-- The existing payload remains the lossless compatibility record.

alter table public.places
  add column if not exists provider_place_id text,
  add column if not exists primary_type text,
  add column if not exists neighborhood text,
  add column if not exists lgbtq_relevance text,
  add column if not exists estimated_cost_usd numeric,
  add column if not exists duration_minutes integer,
  add column if not exists accessibility_notes text,
  add column if not exists website_uri text,
  add column if not exists google_maps_uri text,
  add column if not exists rating numeric,
  add column if not exists review_count integer,
  add column if not exists price_level text,
  add column if not exists business_status text,
  add column if not exists opening_hours jsonb not null default '[]'::jsonb,
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists source_ids jsonb not null default '[]'::jsonb,
  add column if not exists verified_at timestamptz,
  add column if not exists metadata_completeness numeric not null default 0
    check (metadata_completeness between 0 and 1);

create unique index if not exists places_provider_place_id_idx
  on public.places(provider_place_id)
  where provider_place_id is not null and deleted_at is null;

create index if not exists places_destination_category_idx
  on public.places(destination_id, category)
  where published = true and deleted_at is null;

create index if not exists places_metadata_completeness_idx
  on public.places(destination_id, metadata_completeness desc)
  where published = true and deleted_at is null;
