-- DRAFT ONLY. Do not apply before the Google identity migration, complete
-- orders/users RLS, an authoritative weekly statement scheduler and migration
-- of every legacy API and sync path. This migration breaks legacy assignment.
-- It does not by itself make the existing app or its public data secure.

-- This guard runs for *all* writes, including service-role writes, so the old
-- unauthenticated API cannot silently bypass commission restrictions. A
-- normal maintenance job without a verified rider session is denied too.
create function deliveryboys_private.guard_order_assignment()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_rider_id text; v_name text; v_status text; v_assignment boolean;
begin
  if tg_op = 'INSERT' then
    v_assignment := new.rider_id is not null or new.status in ('accepted','picked_up','in_transit','delivered');
  else
    v_assignment := new.rider_id is distinct from old.rider_id or
      (new.status in ('accepted','picked_up','in_transit','delivered') and
       (old.rider_id is null or old.status in ('pending','cancelled')));
  end if;
  if not v_assignment then return new; end if;

  select l.app_user_id into v_rider_id from deliveryboys_private.account_identity_links l
    where l.auth_user_id = auth.uid() and l.app_role = 'rider' and deliveryboys_private.is_google_session();
  if v_rider_id is null or new.rider_id is distinct from v_rider_id then
    raise exception 'Verified rider assignment required' using errcode = '42501'; end if;
  select u.name,u.status into v_name,v_status from public.users u where u.id=v_rider_id and u.role='rider';
  if v_status is distinct from 'approved' then raise exception 'Rider approval required' using errcode = '42501'; end if;
  if not public.commission_can_accept_orders() then raise exception 'Overdue commission or manager reapproval required' using errcode = '42501'; end if;
  -- Never trust the client to supply another rider's displayed name.
  new.rider_name := v_name;
  return new;
end;
$$;
revoke all on function deliveryboys_private.guard_order_assignment() from public, anon, authenticated;
create trigger guard_order_assignment before insert or update on public.orders
for each row execute function deliveryboys_private.guard_order_assignment();

-- Clients provide only the order ID. Assignment and first-come-first-served
-- status change are performed atomically in the database, after a row lock.
create function public.accept_delivery_order(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = pg_catalog as $$
declare v_rider text; v_name text; v_order public.orders%rowtype; v_accepted bigint;
begin
  select l.app_user_id into v_rider from deliveryboys_private.account_identity_links l
    where l.auth_user_id = auth.uid() and l.app_role = 'rider' and deliveryboys_private.is_google_session();
  if v_rider is null then raise exception 'Verified rider required' using errcode = '42501'; end if;
  select name into v_name from public.users where id=v_rider and role='rider' and status='approved';
  if v_name is null then raise exception 'Rider approval required' using errcode = '42501'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status <> 'pending' or v_order.rider_id is not null then
    raise exception 'Order is no longer available' using errcode = '22023'; end if;
  if not public.commission_can_accept_orders() then raise exception 'Overdue commission or manager reapproval required' using errcode = '42501'; end if;
  v_accepted := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  update public.orders set rider_id=v_rider,rider_name=v_name,status='accepted',
    pickup=coalesce(pickup,'{}'::jsonb) || jsonb_build_object('acceptedAt',v_accepted), updated_at=clock_timestamp()
    where id=p_order_id returning * into v_order;
  return v_order;
end;
$$;
revoke all on function public.accept_delivery_order(uuid) from public, anon;
grant execute on function public.accept_delivery_order(uuid) to authenticated;
