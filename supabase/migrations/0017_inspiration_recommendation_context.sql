-- A confirmed inspiration item may be attached to one trip. The item remains
-- owner-private and is only exposed to Ask Outing as redacted structured data.

alter table public.inspiration_items
  add column if not exists trip_id uuid references public.trips(id) on delete set null;

create index if not exists inspiration_items_owner_confirmed_idx
  on public.inspiration_items(owner_id, updated_at desc)
  where status = 'confirmed';

create index if not exists inspiration_items_trip_confirmed_idx
  on public.inspiration_items(trip_id, updated_at desc)
  where trip_id is not null and status = 'confirmed';
