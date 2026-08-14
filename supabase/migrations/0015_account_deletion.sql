-- Store-compliant account deletion support.
-- Auth deletion cascades through profiles, while shared trips retain only
-- content that does not identify the departing member.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade not valid;

alter table public.trips
  drop constraint if exists trips_owner_id_fkey;
alter table public.trips
  add constraint trips_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete cascade;

alter table public.trip_invites
  drop constraint if exists trip_invites_created_by_fkey;
alter table public.trip_invites
  add constraint trip_invites_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.trip_comments
  drop constraint if exists trip_comments_user_id_fkey;
alter table public.trip_comments
  add constraint trip_comments_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.trip_activity
  drop constraint if exists trip_activity_actor_id_fkey;
alter table public.trip_activity
  add constraint trip_activity_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

alter table public.guides
  drop constraint if exists guides_author_id_fkey;
alter table public.guides
  add constraint guides_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;

alter table public.reviews
  drop constraint if exists reviews_author_id_fkey;
alter table public.reviews
  add constraint reviews_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;

alter table public.reports
  drop constraint if exists reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

create or replace function public.account_deletion_filter_array(
  p_value jsonb,
  p_identity_key text,
  p_user_id uuid
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_value) <> 'array' then coalesce(p_value, '[]'::jsonb)
    else coalesce(
      (
        select jsonb_agg(item order by ordinal)
        from jsonb_array_elements(p_value) with ordinality as entries(item, ordinal)
        where coalesce(item->>p_identity_key, '') <> p_user_id::text
      ),
      '[]'::jsonb
    )
  end;
$$;

create or replace function public.account_deletion_scrub_polls(
  p_value jsonb,
  p_user_id uuid
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_value) <> 'array' then coalesce(p_value, '[]'::jsonb)
    else coalesce(
      (
        select jsonb_agg(
          jsonb_set(
            poll,
            '{options}',
            case
              when jsonb_typeof(poll->'options') <> 'array' then coalesce(poll->'options', '[]'::jsonb)
              else coalesce(
                (
                  select jsonb_agg(
                    jsonb_set(
                      option,
                      '{votes}',
                      case
                        when jsonb_typeof(option->'votes') <> 'array' then '[]'::jsonb
                        else coalesce(
                          (
                            select jsonb_agg(vote order by vote_ordinal)
                            from jsonb_array_elements(option->'votes')
                              with ordinality as votes(vote, vote_ordinal)
                            where vote #>> '{}' <> p_user_id::text
                          ),
                          '[]'::jsonb
                        )
                      end,
                      true
                    ) order by option_ordinal)
                  from jsonb_array_elements(poll->'options')
                    with ordinality as options(option, option_ordinal)
                ),
                '[]'::jsonb
              )
            end,
            true
          ) order by poll_ordinal)
        from jsonb_array_elements(p_value) with ordinality as polls(poll, poll_ordinal)
      ),
      '[]'::jsonb
    )
  end;
$$;

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned_trip_count int := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_user_id is null then
    raise exception 'User is required';
  end if;

  -- Remove the user's identity and authored content from trips that will remain
  -- available to another owner after this account is deleted.
  update public.trips
  set payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    coalesce(payload, '{}'::jsonb),
                    '{members}',
                    public.account_deletion_filter_array(payload->'members', 'id', p_user_id),
                    true
                  ),
                  '{memberPrefs}',
                  public.account_deletion_filter_array(payload->'memberPrefs', 'memberId', p_user_id),
                  true
                ),
                '{comments}',
                public.account_deletion_filter_array(payload->'comments', 'userId', p_user_id),
                true
              ),
              '{activityPreferences}',
              public.account_deletion_filter_array(payload->'activityPreferences', 'memberId', p_user_id),
              true
            ),
            '{activityPreferencesV2}',
            public.account_deletion_filter_array(payload->'activityPreferencesV2', 'memberId', p_user_id),
            true
          ),
          '{itineraryFeedback}',
          public.account_deletion_filter_array(
            public.account_deletion_filter_array(payload->'itineraryFeedback', 'userId', p_user_id),
            'memberId',
            p_user_id
          ),
          true
        ),
        '{tripPlanProposals}',
        public.account_deletion_filter_array(payload->'tripPlanProposals', 'createdBy', p_user_id),
        true
      ),
      '{polls}',
      public.account_deletion_scrub_polls(payload->'polls', p_user_id),
      true
    ),
    updated_at = now()
  where owner_id <> p_user_id
    and payload::text like '%' || p_user_id::text || '%';

  -- These rows are authored by the user and should not survive as anonymous
  -- content. Rows with an intentional audit/retention purpose are handled by
  -- their existing cascade or set-null foreign keys.
  delete from public.trip_invites where created_by = p_user_id;
  delete from public.trip_comments where user_id = p_user_id;
  delete from public.trip_activity where actor_id = p_user_id;
  delete from public.guides where author_id = p_user_id;
  delete from public.reviews where author_id = p_user_id;
  delete from public.reports where reporter_id = p_user_id;
  delete from public.audit_logs where actor_id = p_user_id;
  delete from public.api_rate_limits where user_id = p_user_id;

  select count(*)::int into v_owned_trip_count
  from public.trips where owner_id = p_user_id;

  -- Owned trips contain the organizer's planning data and are deleted for all
  -- members. The app warns the organizer about this before confirmation.
  delete from public.trips where owner_id = p_user_id;

  return jsonb_build_object('ownedTripsDeleted', v_owned_trip_count);
end;
$$;

revoke all on function public.account_deletion_filter_array(jsonb, text, uuid) from public;
revoke all on function public.account_deletion_scrub_polls(jsonb, uuid) from public;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

comment on function public.prepare_account_deletion(uuid) is
  'Service-only cleanup invoked with an identity derived from a verified JWT before deleting auth.users.';
