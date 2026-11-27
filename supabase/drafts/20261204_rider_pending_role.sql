create or replace function public.submit_step2_rider_application(p_vehicle_type text, p_vehicle_plate text)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare v_role text; v_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users a where a.id=auth.uid() and a.email_confirmed_at is not null
  ) then raise exception 'Verified sign-in required' using errcode='42501'; end if;
  if p_vehicle_type is null or p_vehicle_type not in ('motorcycle','car','van','truck')
    or p_vehicle_plate is null or length(trim(p_vehicle_plate)) not between 1 and 40 then
    raise exception 'Valid vehicle details required' using errcode='22023';
  end if;
  select u.role, u.status into v_role, v_status from public.users u where u.auth_user_id=auth.uid() for update;
  if not found then raise exception 'Linked profile required' using errcode='42501'; end if;
  if v_role <> 'customer' and not (v_role='rider' and v_status='pending') then
    raise exception 'This account cannot submit a rider application' using errcode='42501';
  end if;
  update public.users u set role='rider', status='pending', vehicle_type=p_vehicle_type,
    vehicle_plate=trim(p_vehicle_plate) where u.auth_user_id=auth.uid();
  return 'pending';
end;
$$;
