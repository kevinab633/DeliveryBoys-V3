-- NOT READY FOR DEPLOYMENT. Requires the private identity foundation and
-- stage_a_session_allowed() to be installed first. Existing application writes
-- will fail until authorized server functions and clients are complete.
-- Abort if policy inventory differs from the verified live snapshot.
do $$
declare names text[];
begin
  select array_agg(tablename || ':' || policyname order by tablename,policyname) into names
  from pg_catalog.pg_policies where schemaname='public' and tablename in ('users','orders');
  if names is distinct from array['orders:anyone can create an order','orders:anyone can update an order','orders:anyone can view orders','users:Allow all access to users']::text[] then
    raise exception 'Unexpected users/orders policy inventory; stop and review';
  end if;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('users','orders') and c.relrowsecurity) <> 2 then
    raise exception 'RLS must already be enabled on users and orders';
  end if;
end $$;

create function public.deliveryboys_draft_user_read(p_id text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select deliveryboys_private.stage_a_session_allowed() and exists (
    select 1 from deliveryboys_private.account_identity_links l
    join public.users u on u.id=l.app_user_id and u.role=l.app_role
    where l.auth_user_id=auth.uid() and (l.app_user_id=p_id or
      (l.app_role='manager' and deliveryboys_private.is_google_session() and lower(u.email)='support.deliveryboysgh@gmail.com'))
  );
$$;
create function public.deliveryboys_draft_order_read(p_customer text,p_rider text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select deliveryboys_private.stage_a_session_allowed() and exists (
    select 1 from deliveryboys_private.account_identity_links l
    join public.users u on u.id=l.app_user_id and u.role=l.app_role
    where l.auth_user_id=auth.uid() and (
      (l.app_role='customer' and l.app_user_id=p_customer) or
      (l.app_role='rider' and l.app_user_id=p_rider) or
      (l.app_role='manager' and deliveryboys_private.is_google_session() and lower(u.email)='support.deliveryboysgh@gmail.com'))
  );
$$;
revoke all on function public.deliveryboys_draft_user_read(text), public.deliveryboys_draft_order_read(text,text) from public,anon;
grant execute on function public.deliveryboys_draft_user_read(text), public.deliveryboys_draft_order_read(text,text) to authenticated;

drop policy "Allow all access to users" on public.users;
drop policy "anyone can create an order" on public.orders;
drop policy "anyone can update an order" on public.orders;
drop policy "anyone can view orders" on public.orders;
create policy "deliveryboys linked user read" on public.users for select to authenticated using (public.deliveryboys_draft_user_read(id));
create policy "deliveryboys participant order read" on public.orders for select to authenticated using (public.deliveryboys_draft_order_read(customer_id,rider_id));
-- No direct writes or order deletion policy. RLS must already be enabled.
