-- Delete trips through one explicit, permission-checked operation.

create or replace function public.soft_delete_trip(p_trip_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_trip_organizer(p_trip_id) then
    raise exception 'Only a trip owner or organizer can delete this trip' using errcode = '42501';
  end if;

  update public.trips
  set deleted_at = now(), updated_at = now()
  where id = p_trip_id and deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.soft_delete_trip(uuid) from public;
grant execute on function public.soft_delete_trip(uuid) to authenticated;
