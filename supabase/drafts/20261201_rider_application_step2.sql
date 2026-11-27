-- Applied to LIVE as rider_application_step2. The function was subsequently
-- replaced by 20261204_rider_pending_role.sql; the private table remains.
-- Requires step 1's public.users.auth_user_id.
create schema if not exists deliveryboys_private;
revoke all on schema deliveryboys_private from public, anon, authenticated;

create table deliveryboys_private.step2_rider_applications (
  auth_user_id uuid primary key references auth.users(id),
  app_user_id text not null references public.users(id),
  vehicle_type text not null check (vehicle_type in ('motorcycle','car','van','truck')),
  vehicle_plate text not null check (length(trim(vehicle_plate)) between 1 and 40),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table deliveryboys_private.step2_rider_applications enable row level security;
revoke all on deliveryboys_private.step2_rider_applications from public, anon, authenticated;

create function public.submit_step2_rider_application(p_vehicle_type text, p_vehicle_plate text)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare v_user_id text; v_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users a where a.id=auth.uid() and a.email_confirmed_at is not null
  ) then raise exception 'Verified sign-in required' using errcode='42501'; end if;
  if p_vehicle_type is null or p_vehicle_type not in ('motorcycle','car','van','truck')
    or p_vehicle_plate is null or length(trim(p_vehicle_plate)) not between 1 and 40 then
    raise exception 'Valid vehicle details required' using errcode='22023';
  end if;
  select u.id into v_user_id from public.users u where u.auth_user_id=auth.uid();
  if v_user_id is null then raise exception 'Linked profile required' using errcode='42501'; end if;
  insert into deliveryboys_private.step2_rider_applications(auth_user_id,app_user_id,vehicle_type,vehicle_plate)
    values(auth.uid(),v_user_id,p_vehicle_type,trim(p_vehicle_plate))
    on conflict(auth_user_id) do nothing;
  select a.status into v_status from deliveryboys_private.step2_rider_applications a where a.auth_user_id=auth.uid();
  return v_status;
end;
$$;
revoke all on function public.submit_step2_rider_application(text,text) from public, anon;
grant execute on function public.submit_step2_rider_application(text,text) to authenticated;
