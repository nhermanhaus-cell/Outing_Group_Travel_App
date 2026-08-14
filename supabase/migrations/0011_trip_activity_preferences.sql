create or replace function public.update_trip_activity_preferences(
  p_trip_id uuid,
  p_votes jsonb
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
begin
  if v_user_id is null or not public.is_trip_member(p_trip_id) then
    raise exception 'Trip membership required';
  end if;
  if jsonb_typeof(p_votes) <> 'array' then raise exception 'Votes must be an array'; end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb), array_agg(value->>'placeId')
  into v_clean_votes, v_place_ids
  from jsonb_array_elements(p_votes)
  where value->>'memberId' = v_user_id::text
    and value->>'choice' in ('interested', 'not_interested')
    and nullif(value->>'placeId', '') is not null;

  select coalesce(payload->'activityPreferences', '[]'::jsonb)
  into v_existing
  from public.trips
  where id = p_trip_id
  for update;

  select coalesce(jsonb_agg(value), '[]'::jsonb)
  into v_merged
  from jsonb_array_elements(v_existing)
  where not (
    value->>'memberId' = v_user_id::text
    and value->>'placeId' = any(coalesce(v_place_ids, array[]::text[]))
  );

  v_merged := v_merged || coalesce(v_clean_votes, '[]'::jsonb);
  update public.trips
  set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{activityPreferences}', v_merged, true),
      updated_at = now()
  where id = p_trip_id;
end;
$$;

revoke all on function public.update_trip_activity_preferences(uuid, jsonb) from public;
grant execute on function public.update_trip_activity_preferences(uuid, jsonb) to authenticated;
