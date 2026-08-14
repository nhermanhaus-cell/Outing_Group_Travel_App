-- Replace ambiguous swipe-era reactions with a symmetric five-point scale.
-- Legacy values remain accepted and are normalized before persistence.

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
    jsonb_set(
      value,
      '{choice}',
      to_jsonb((case value->>'choice'
        when 'must_do' then 'very_interested'
        when 'maybe' then 'neutral'
        when 'not_for_this_trip' then 'uninterested'
        when 'not_interested' then 'uninterested'
        else value->>'choice'
      end)::text),
      true
    )
  ), '[]'::jsonb), array_agg(value->>'placeId')
  into v_clean_votes, v_place_ids
  from jsonb_array_elements(p_votes)
  where value->>'memberId' = v_user_id::text
    and value->>'choice' in (
      'very_interested', 'interested', 'neutral', 'uninterested', 'very_uninterested',
      'must_do', 'maybe', 'not_for_this_trip', 'not_interested'
    )
    and nullif(value->>'placeId', '') is not null
    and nullif(value->>'category', '') is not null;

  select coalesce((
    select jsonb_agg(
      jsonb_set(
        value,
        '{choice}',
        to_jsonb((case value->>'choice'
          when 'must_do' then 'very_interested'
          when 'maybe' then 'neutral'
          when 'not_for_this_trip' then 'uninterested'
          when 'not_interested' then 'uninterested'
          else value->>'choice'
        end)::text),
        true
      )
    )
    from jsonb_array_elements(
      case
        when payload ? 'activityPreferencesV2' then coalesce(payload->'activityPreferencesV2', '[]'::jsonb)
        else coalesce(payload->'activityPreferences', '[]'::jsonb)
      end
    )
  ), '[]'::jsonb)
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
      to_jsonb((case
        when value->>'choice' in ('very_interested', 'interested') then 'interested'
        else 'not_interested'
      end)::text),
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
