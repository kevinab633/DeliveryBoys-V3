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

-- Require an OAuth session for the verified Google identity, not merely a
-- user-editable email or a linked identity on a password-authenticated session.
create function deliveryboys_private.is_google_session()
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->'app_metadata'->>'provider' = 'google', false)
    and coalesce(auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb, false)
    and exists(select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'google')
    and exists(select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function deliveryboys_private.is_google_session() from public, anon, authenticated;

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
  where l.auth_user_id = auth.uid() and deliveryboys_private.is_google_session()
    and (l.app_role <> 'manager' or exists(select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = 'support.deliveryboysgh@gmail.com'))
  order by l.app_role;
$$;
revoke all on function public.my_deliveryboys_identities() from public, anon;
grant execute on function public.my_deliveryboys_identities() to authenticated;

-- Only a verified Google identity may create an app profile. The server,
-- never a supplied parameter, assigns manager to the owner-controlled Google
-- address and customer to everyone else. Rider access requires an independent
-- manager-approved application (not implemented by this draft).
create function public.register_google_profile(p_name text, p_phone text default null)
returns table (app_user_id text, app_role text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_user_id text := gen_random_uuid()::text;
  v_role text;
begin
  if not deliveryboys_private.is_google_session() then
    raise exception 'Verified Google identity required' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_auth_id and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Verified Google identity required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 120 then
    raise exception 'Invalid name' using errcode = '22023';
  end if;
  if length(coalesce(p_phone, '')) > 40 then raise exception 'Invalid phone' using errcode = '22023'; end if;
  v_role := case when lower(v_email) = 'support.deliveryboysgh@gmail.com' then 'manager' else 'customer' end;
  if exists(select 1 from deliveryboys_private.account_identity_links l where l.auth_user_id = v_auth_id) then
    raise exception 'Profile already exists' using errcode = '23505';
  end if;
  insert into public.users(id,role,name,email,phone,verified)
    values(v_user_id,v_role,trim(p_name),v_email,nullif(trim(p_phone),''),true);
  insert into deliveryboys_private.account_identity_links(auth_user_id,app_user_id,app_role)
    values(v_auth_id,v_user_id,v_role);
  return query select v_user_id,v_role;
end;
$$;
revoke all on function public.register_google_profile(text,text) from public, anon;
grant execute on function public.register_google_profile(text,text) to authenticated;
