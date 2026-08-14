-- Protected Ask Outing conversations, reviewable proposals, and saved destinations.

create table if not exists public.saved_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  destination_slug text not null,
  source text not null default 'user'
    check (source in ('user', 'quiz', 'assistant', 'trip')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, destination_slug)
);

create index if not exists saved_destinations_user_idx
  on public.saved_destinations(user_id, created_at desc);

alter table public.saved_destinations enable row level security;

create policy saved_destinations_own_select
  on public.saved_destinations for select using (user_id = auth.uid());
create policy saved_destinations_own_insert
  on public.saved_destinations for insert with check (user_id = auth.uid());
create policy saved_destinations_own_update
  on public.saved_destinations for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saved_destinations_own_delete
  on public.saved_destinations for delete using (user_id = auth.uid());

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  scope_kind text not null check (scope_kind in ('general', 'destination', 'trip')),
  destination_slug text,
  visibility text not null check (visibility in ('private', 'trip_shared')),
  title text,
  provider text not null default 'mistral',
  model text not null default 'mistral-small-2603',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_shared_requires_trip check (
    visibility <> 'trip_shared' or (scope_kind = 'trip' and trip_id is not null)
  ),
  constraint assistant_trip_scope_requires_trip check (
    scope_kind <> 'trip' or trip_id is not null
  )
);

create index if not exists assistant_conversations_owner_idx
  on public.assistant_conversations(owner_id, updated_at desc);
create index if not exists assistant_conversations_trip_idx
  on public.assistant_conversations(trip_id, updated_at desc)
  where trip_id is not null;

create or replace function public.can_access_assistant_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistant_conversations c
    where c.id = p_conversation_id
      and (
        c.owner_id = auth.uid()
        or (
          c.visibility = 'trip_shared'
          and c.trip_id is not null
          and public.is_trip_member(c.trip_id)
        )
      )
  );
$$;

revoke all on function public.can_access_assistant_conversation(uuid) from public;
grant execute on function public.can_access_assistant_conversation(uuid) to authenticated;

alter table public.assistant_conversations enable row level security;

create policy assistant_conversations_select
  on public.assistant_conversations for select
  using (
    owner_id = auth.uid()
    or (
      visibility = 'trip_shared'
      and trip_id is not null
      and public.is_trip_member(trip_id)
    )
  );
create policy assistant_conversations_insert
  on public.assistant_conversations for insert
  with check (
    owner_id = auth.uid()
    and (
      visibility = 'private'
      or (trip_id is not null and public.is_trip_member(trip_id))
    )
  );

create or replace function public.lock_assistant_conversation_scope()
returns trigger language plpgsql as $$
begin
  if old.visibility is distinct from new.visibility
    or old.scope_kind is distinct from new.scope_kind
    or old.trip_id is distinct from new.trip_id
    or old.destination_slug is distinct from new.destination_slug then
    raise exception 'Assistant conversation scope and visibility are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_conversation_scope_immutable on public.assistant_conversations;
create trigger assistant_conversation_scope_immutable
before update on public.assistant_conversations
for each row execute function public.lock_assistant_conversation_scope();

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null check (char_length(content) <= 20000),
  sources jsonb not null default '[]'::jsonb,
  tool_name text,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_conversation_idx
  on public.assistant_messages(conversation_id, created_at);

alter table public.assistant_messages enable row level security;

create policy assistant_messages_select
  on public.assistant_messages for select
  using (public.can_access_assistant_conversation(conversation_id));

create table if not exists public.assistant_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (
    kind in (
      'add_itinerary_item',
      'replace_itinerary_item',
      'remove_itinerary_item',
      'change_dates',
      'save_destination'
    )
  ),
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'polling', 'applied', 'dismissed')),
  poll_id uuid references public.trip_polls(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_proposals_conversation_idx
  on public.assistant_proposals(conversation_id, created_at desc);
create index if not exists assistant_proposals_trip_idx
  on public.assistant_proposals(trip_id, status)
  where trip_id is not null;

alter table public.assistant_proposals enable row level security;

create policy assistant_proposals_select
  on public.assistant_proposals for select
  using (public.can_access_assistant_conversation(conversation_id));

-- Messages and proposals are written by the authenticated Edge Function using
-- the service role. Clients can read permitted records but cannot bypass review.

create or replace function public.review_assistant_proposal(
  p_proposal_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.assistant_proposals%rowtype;
  conversation public.assistant_conversations%rowtype;
  next_status text;
begin
  if p_action not in ('apply', 'dismiss', 'submit_poll') then
    raise exception 'Unsupported proposal action';
  end if;

  select * into proposal
  from public.assistant_proposals
  where id = p_proposal_id
  for update;
  if proposal.id is null then raise exception 'Proposal not found'; end if;

  select * into conversation
  from public.assistant_conversations
  where id = proposal.conversation_id;
  if not public.can_access_assistant_conversation(conversation.id) then
    raise exception 'Conversation access required';
  end if;

  if p_action = 'submit_poll' then
    if proposal.trip_id is null or not public.is_trip_member(proposal.trip_id) then
      raise exception 'Trip membership required';
    end if;
    next_status := 'polling';
  else
    if proposal.trip_id is not null and not public.is_trip_organizer(proposal.trip_id) then
      raise exception 'An organizer must resolve this proposal';
    end if;
    if proposal.trip_id is null and conversation.owner_id <> auth.uid() then
      raise exception 'Only the conversation owner can resolve this proposal';
    end if;
    next_status := case when p_action = 'apply' then 'applied' else 'dismissed' end;
  end if;

  update public.assistant_proposals
  set status = next_status,
      decided_by = case when next_status in ('applied', 'dismissed') then auth.uid() else null end,
      decided_at = case when next_status in ('applied', 'dismissed') then now() else null end,
      updated_at = now()
  where id = p_proposal_id;
  return next_status;
end;
$$;

revoke all on function public.review_assistant_proposal(uuid, text) from public;
grant execute on function public.review_assistant_proposal(uuid, text) to authenticated;
