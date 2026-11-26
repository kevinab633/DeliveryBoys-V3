-- DRAFT: do not apply to the live project until the client, API and existing
-- account migration have been reviewed together. This is additive only: it
-- does NOT close the existing public users/orders policies or secure the app.
-- Existing account IDs are text and are not the same as Supabase Auth UUIDs.
-- A trusted administrator must create links after verifying account ownership.

create schema if not exists deliveryboys_private;
revoke all on schema deliveryboys_private from public, anon, authenticated;

create table deliveryboys_private.account_identity_links (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  app_user_id text not null references public.users(id) on delete cascade,
  app_role text not null check (app_role in ('customer', 'rider', 'manager')),
  created_at timestamptz not null default now(),
  primary key (auth_user_id, app_role),
  unique (app_user_id)
);

-- All assignments, especially manager assignments, must be performed by a
-- trusted administrator. Neither an email claim nor user-editable metadata is
-- sufficient to grant an existing profile or a privileged role.
alter table deliveryboys_private.account_identity_links enable row level security;
revoke all on deliveryboys_private.account_identity_links from public, anon, authenticated;

-- An authenticated caller may discover only its own linked app identities.
-- SECURITY DEFINER is needed because clients cannot access the private table.
-- Do not add a parameter allowing the caller to choose another auth user ID.
create function public.my_deliveryboys_identities()
returns table (app_user_id text, app_role text)
language sql stable security definer
set search_path = pg_catalog
as $$
  select l.app_user_id, l.app_role
  from deliveryboys_private.account_identity_links as l
  where l.auth_user_id = auth.uid()
  order by l.app_role;
$$;
revoke all on function public.my_deliveryboys_identities() from public, anon;
grant execute on function public.my_deliveryboys_identities() to authenticated;

-- New verified email or Google users may create customer/rider profiles only.
-- Existing profiles must be linked through a separate trusted migration; this
-- function deliberately does not claim profiles by email or grant managers.
create function public.register_deliveryboys_profile(
  p_role text,
  p_name text,
  p_phone text default null,
  p_vehicle_type text default null,
  p_vehicle_plate text default null
)
returns table (app_user_id text, app_role text)
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_user_id text := gen_random_uuid()::text;
begin
  if v_auth_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select u.email into v_email from auth.users as u
    where u.id = v_auth_id and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Verified email required' using errcode = '42501'; end if;
  if p_role not in ('customer', 'rider') or p_role is null then
    raise exception 'Only customer and rider profiles may be registered' using errcode = '22023';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 120 then
    raise exception 'Invalid name' using errcode = '22023';
  end if;
  if length(coalesce(p_phone, '')) > 40 then raise exception 'Invalid phone' using errcode = '22023'; end if;
  if p_role = 'rider' and (p_vehicle_type is null or p_vehicle_type not in ('motorcycle', 'car', 'van', 'truck')
      or nullif(trim(p_vehicle_plate), '') is null or length(p_vehicle_plate) > 40) then
    raise exception 'Valid rider vehicle details required' using errcode = '22023';
  end if;
  if exists (select 1 from deliveryboys_private.account_identity_links l where l.auth_user_id = v_auth_id and l.app_role = p_role) then
    raise exception 'Profile already exists for this role' using errcode = '23505';
  end if;
  insert into public.users (id, role, name, email, phone, verified, vehicle_type, vehicle_plate, status, availability)
  values (v_user_id, p_role, trim(p_name), v_email, nullif(trim(p_phone), ''), true,
    case when p_role = 'rider' then p_vehicle_type else null end,
    case when p_role = 'rider' then trim(p_vehicle_plate) else null end,
    case when p_role = 'rider' then 'pending' else null end,
    case when p_role = 'rider' then 'offline' else null end);
  insert into deliveryboys_private.account_identity_links (auth_user_id, app_user_id, app_role)
  values (v_auth_id, v_user_id, p_role);
  return query select v_user_id, p_role;
end;
$$;
revoke all on function public.register_deliveryboys_profile(text, text, text, text, text) from public, anon;
grant execute on function public.register_deliveryboys_profile(text, text, text, text, text) to authenticated;
