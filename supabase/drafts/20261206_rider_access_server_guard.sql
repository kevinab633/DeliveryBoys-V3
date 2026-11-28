-- REVIEW DRAFT ONLY. Do not apply to live without explicit owner approval.
-- Depends on 20261206_direct_signup_server_role.sql and the step-1
-- users.auth_user_id link. This deliberately blocks legacy anonymous role,
-- approval, availability, and order-assignment writes. Existing clients,
-- manager actions, service-role jobs, verified identity linking, RLS, and
-- historical pending/online rows must be migrated and tested BEFORE rollout.
-- A trigger is not a substitute for closing permissive policies and securing
-- every service-role API. The legacy direct sign-in is not verified identity.

create function public.has_verified_delivery_session() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users a where a.id = auth.uid() and a.email_confirmed_at is not null
  );
$$;
revoke all on function public.has_verified_delivery_session() from public;
grant execute on function public.has_verified_delivery_session() to anon, authenticated;

-- SECURITY INVOKER is intentional: current_user is the effective caller. The
-- registration/review functions run as their common trusted owner, not via a
-- browser-set flag. Direct clients cannot insert a role or change role/status.
create function deliveryboys_private.guard_signup_role_and_availability()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare v_owner name;
begin
  select pg_get_userbyid(p.proowner) into v_owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'deliveryboys_private' and p.proname = 'register_direct_signup';
  if v_owner is null then raise exception 'Registration owner unavailable' using errcode = '42501'; end if;
  if current_user is distinct from v_owner then
    if tg_op = 'INSERT' then
      raise exception 'Use a server registration operation' using errcode = '42501';
    end if;
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Role and approval are server controlled' using errcode = '42501';
    end if;
    if new.availability is distinct from old.availability and
       (new.role <> 'rider' or new.auth_user_id is distinct from auth.uid() or not public.has_verified_delivery_session()) then
      raise exception 'Verified rider identity required' using errcode = '42501';
    end if;
  end if;
  if new.role = 'rider' and new.status is distinct from 'approved' and new.availability in ('online', 'busy') then
    raise exception 'Rider approval required for availability' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function deliveryboys_private.guard_signup_role_and_availability() from public, anon, authenticated;
create trigger guard_signup_role_and_availability before insert or update on public.users
for each row execute function deliveryboys_private.guard_signup_role_and_availability();

-- Manager decisions are based on a linked, verified Google OAuth session,
-- never an email/role supplied by the caller. A client migration is required
-- before using this instead of the current direct manager update.
create function public.review_direct_rider(p_rider_id text, p_status text)
returns public.users language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.users%rowtype;
begin
  if not public.has_verified_delivery_session()
     or not coalesce(auth.jwt()->'app_metadata'->>'provider' = 'google', false)
     or not coalesce(auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb, false)
     or not exists(select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'google')
     or not exists(select 1 from public.users m where m.auth_user_id = auth.uid() and m.role = 'manager') then
    raise exception 'Verified manager identity required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'Invalid rider decision' using errcode = '22023';
  end if;
  update public.users u set status = p_status,
    availability = case when p_status = 'approved' then u.availability else 'offline' end
    where u.id = p_rider_id and u.role = 'rider' returning * into v_row;
  if not found then raise exception 'Rider not found' using errcode = '22023'; end if;
  return v_row;
end;
$$;
revoke all on function public.review_direct_rider(text,text) from public, anon;
grant execute on function public.review_direct_rider(text,text) to authenticated;

-- Every new assignment, including direct and service-role writes, requires the
-- caller's linked verified identity and the current approved rider row. The
-- row lock serializes a concurrent approval/suspension against the assignment.
-- Existing order-acceptance/commission drafts remain separate prerequisites.
create function deliveryboys_private.guard_direct_rider_assignment()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_assignment boolean; v_name text;
begin
  if tg_op = 'INSERT' then
    v_assignment := new.rider_id is not null or new.status in ('accepted', 'picked_up', 'in_transit', 'delivered');
  else
    v_assignment := new.rider_id is distinct from old.rider_id or
      (new.status in ('accepted', 'picked_up', 'in_transit', 'delivered') and
       (old.rider_id is null or old.status in ('pending', 'cancelled')));
  end if;
  if not v_assignment then return new; end if;
  if not public.has_verified_delivery_session() then
    raise exception 'Verified rider identity required' using errcode = '42501';
  end if;
  select u.name into v_name from public.users u
    where u.id = new.rider_id and u.role = 'rider' and u.status = 'approved' and u.auth_user_id = auth.uid()
    for update;
  if not found then raise exception 'Approved linked rider required' using errcode = '42501'; end if;
  new.rider_name := v_name;
  return new;
end;
$$;
revoke all on function deliveryboys_private.guard_direct_rider_assignment() from public, anon, authenticated;
create trigger guard_direct_rider_assignment before insert or update on public.orders
for each row execute function deliveryboys_private.guard_direct_rider_assignment();
