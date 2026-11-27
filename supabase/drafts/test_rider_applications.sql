-- TEST PROJECT ONLY. Depends on the test Google identity foundation.
-- Does not implement document verification or storage retention.
create table deliveryboys_private.rider_applications_v1 (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  customer_id text not null references public.users(id),
  status text not null check (status in ('pending','rejected','approved')),
  vehicle_type text not null check (vehicle_type in ('motorcycle','car','van','truck')),
  vehicle_plate text not null check (length(trim(vehicle_plate)) between 1 and 40),
  updated_at timestamptz not null default now()
);
alter table deliveryboys_private.rider_applications_v1 enable row level security;
revoke all on deliveryboys_private.rider_applications_v1 from public, anon, authenticated;

create function public.submit_rider_request(p_vehicle_type text,p_vehicle_plate text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_customer text;
begin
  if not deliveryboys_private.is_google_session() then raise exception 'Verified Google session required' using errcode='42501'; end if;
  select l.app_user_id into v_customer from deliveryboys_private.account_identity_links l where l.auth_user_id=auth.uid() and l.app_role='customer';
  if v_customer is null then raise exception 'Customer profile required' using errcode='42501'; end if;
  if p_vehicle_type is null or p_vehicle_type not in ('motorcycle','car','van','truck') or p_vehicle_plate is null or length(trim(p_vehicle_plate)) not between 1 and 40 then raise exception 'Valid vehicle details required' using errcode='22023'; end if;
  if exists(select 1 from deliveryboys_private.account_identity_links l where l.auth_user_id=auth.uid() and l.app_role='rider') then raise exception 'Already a rider' using errcode='22023'; end if;
  insert into deliveryboys_private.rider_applications_v1(auth_user_id,customer_id,status,vehicle_type,vehicle_plate)
    values(auth.uid(),v_customer,'pending',p_vehicle_type,trim(p_vehicle_plate))
    on conflict(auth_user_id) do update set status='pending',vehicle_type=excluded.vehicle_type,vehicle_plate=excluded.vehicle_plate,updated_at=now()
    where deliveryboys_private.rider_applications_v1.status='rejected';
  if not found then raise exception 'Application already submitted' using errcode='22023'; end if;
end $$;

create function public.my_rider_request() returns table(status text,vehicle_type text,vehicle_plate text)
language sql stable security definer set search_path=pg_catalog as $$
  select a.status,a.vehicle_type,a.vehicle_plate from deliveryboys_private.rider_applications_v1 a where a.auth_user_id=auth.uid() and deliveryboys_private.is_google_session();
$$;

create function public.pending_rider_requests() returns table(request_id uuid, name text, vehicle_type text, vehicle_plate text)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if not deliveryboys_private.is_google_session() or not exists(select 1 from auth.users u join deliveryboys_private.account_identity_links l on l.auth_user_id=u.id where u.id=auth.uid() and lower(u.email)='support.deliveryboysgh@gmail.com' and l.app_role='manager') then raise exception 'Manager identity required' using errcode='42501'; end if;
  return query select a.id,u.name,a.vehicle_type,a.vehicle_plate from deliveryboys_private.rider_applications_v1 a join public.users u on u.id=a.customer_id where a.status='pending' order by a.updated_at;
end $$;

create function public.review_rider_request(p_request_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare a deliveryboys_private.rider_applications_v1%rowtype; v_id text:=gen_random_uuid()::text;
begin
  if not deliveryboys_private.is_google_session() or not exists(select 1 from auth.users u join deliveryboys_private.account_identity_links l on l.auth_user_id=u.id where u.id=auth.uid() and lower(u.email)='support.deliveryboysgh@gmail.com' and l.app_role='manager') then raise exception 'Manager identity required' using errcode='42501'; end if;
  if p_approve is null then raise exception 'Decision required' using errcode='22023'; end if;
  select * into a from deliveryboys_private.rider_applications_v1 where id=p_request_id for update;
  if not found or a.status <> 'pending' then raise exception 'No pending request' using errcode='22023'; end if;
  if not p_approve then update deliveryboys_private.rider_applications_v1 set status='rejected',updated_at=now() where auth_user_id=a.auth_user_id; return; end if;
  insert into public.users(id,role,name,email,phone,verified,vehicle_type,vehicle_plate,status,availability)
    select v_id,'rider',u.name,u.email,u.phone,true,a.vehicle_type,a.vehicle_plate,'approved','offline' from public.users u where u.id=a.customer_id;
  if not found then raise exception 'Customer profile missing'; end if;
  insert into deliveryboys_private.account_identity_links(auth_user_id,app_user_id,app_role) values(a.auth_user_id,v_id,'rider');
  update deliveryboys_private.rider_applications_v1 set status='approved',updated_at=now() where auth_user_id=a.auth_user_id;
end $$;
revoke all on function public.submit_rider_request(text,text),public.my_rider_request(),public.pending_rider_requests(),public.review_rider_request(uuid,boolean) from public,anon;
grant execute on function public.submit_rider_request(text,text),public.my_rider_request(),public.pending_rider_requests(),public.review_rider_request(uuid,boolean) to authenticated;
