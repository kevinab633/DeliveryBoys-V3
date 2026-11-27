-- DRAFT ONLY: do not apply to the live database yet. This removes legacy
-- permissive policies and direct client writes; the current production app
-- still relies on both. All user/profile/order/dispatch/notification flows,
-- existing-account migration, API endpoints and realtime subscriptions must
-- be updated and tested before rollout. Service-role endpoints bypass RLS.

-- SECURITY DEFINER helpers access private account links without exposing them
-- or accepting a caller-supplied role or auth ID.
create function deliveryboys_private.can_read_user(p_id text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select deliveryboys_private.has_role('manager') or exists (
    select 1 from deliveryboys_private.account_identity_links l
    where l.auth_user_id=auth.uid() and l.app_user_id=p_id and deliveryboys_private.is_google_session()
  );
$$;
revoke all on function deliveryboys_private.can_read_user(text) from public, anon, authenticated;

create function deliveryboys_private.can_read_order(p_customer text,p_rider text,p_status text,p_dispatch text[])
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select deliveryboys_private.has_role('manager') or exists (
    select 1 from deliveryboys_private.account_identity_links l
    where l.auth_user_id=auth.uid() and deliveryboys_private.is_google_session()
      and ((l.app_role='customer' and l.app_user_id=p_customer)
        or (l.app_role='rider' and (l.app_user_id=p_rider or
             (p_status='pending' and l.app_user_id=any(coalesce(p_dispatch,array[]::text[]))))))
  );
$$;
revoke all on function deliveryboys_private.can_read_order(text,text,text,text[]) from public, anon, authenticated;

-- Policy expressions run with caller privileges, so use small public wrappers
-- exposing only boolean access decisions, not the private identity mapping.
create function public.can_read_own_app_user(p_id text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select deliveryboys_private.can_read_user(p_id);
$$;
create function public.can_read_app_order(p_customer text,p_rider text,p_status text,p_dispatch text[]) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select deliveryboys_private.can_read_order(p_customer,p_rider,p_status,p_dispatch);
$$;
create function public.is_deliveryboys_manager() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select deliveryboys_private.has_role('manager');
$$;
revoke all on function public.can_read_own_app_user(text), public.can_read_app_order(text,text,text,text[]), public.is_deliveryboys_manager() from public,anon;
grant execute on function public.can_read_own_app_user(text), public.can_read_app_order(text,text,text,text[]), public.is_deliveryboys_manager() to authenticated;

-- Remove every old permissive policy on these tables; policies are ORed by
-- Postgres, so adding a restrictive one without removing old ones is unsafe.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_catalog.pg_policies
    where schemaname='public' and tablename in ('users','orders','app_settings') loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;
alter table public.users enable row level security;
alter table public.orders enable row level security;
alter table public.app_settings enable row level security;
revoke all on public.users,public.orders,public.app_settings from public,anon,authenticated;
grant select on public.users,public.orders to authenticated;
grant select on public.app_settings to anon,authenticated;
grant insert,update,delete on public.app_settings to authenticated;
create policy "linked user or manager read" on public.users for select to authenticated
  using(public.can_read_own_app_user(id));
create policy "order participant or dispatched rider read" on public.orders for select to authenticated
  using(public.can_read_app_order(customer_id,rider_id,status,dispatched_to));
create policy "pricing settings read" on public.app_settings for select to anon,authenticated using(true);
create policy "manager settings insert" on public.app_settings for insert to authenticated with check(public.is_deliveryboys_manager());
create policy "manager settings update" on public.app_settings for update to authenticated using(public.is_deliveryboys_manager()) with check(public.is_deliveryboys_manager());
create policy "manager settings delete" on public.app_settings for delete to authenticated using(public.is_deliveryboys_manager());
-- There are intentionally no direct INSERT/UPDATE/DELETE grants for users or
-- orders. Those require validated, role-specific server operations; until all
-- of those exist this draft will break normal app workflows.
