-- Step 1 only. Existing RLS policies and application paths are unchanged.
alter table public.users add column auth_user_id uuid unique;

create function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and lower(coalesce(auth.jwt()->>'email','')) = 'support.deliveryboysgh@gmail.com'
    and coalesce(auth.jwt()->'app_metadata'->>'provider' = 'google', false);
$$;

create function public.my_user_id() returns text
language sql stable security definer set search_path = public as $$
  select u.id from public.users u where u.auth_user_id = auth.uid();
$$;

-- Invoker trigger: direct API requests run as anon/authenticated. A call made
-- inside link_auth_user runs as its definer. No client-settable flag is used.
create function public.guard_auth_user_link() returns trigger
language plpgsql set search_path = public as $$
declare v_link_owner name;
begin
  if (tg_op = 'INSERT' and new.auth_user_id is not null)
     or (tg_op = 'UPDATE' and new.auth_user_id is distinct from old.auth_user_id) then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_link_owner
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='link_auth_user' and p.pronargs=0;
    if current_user is distinct from v_link_owner then
      raise exception 'auth_user_id can only be set by link_auth_user' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

create function public.link_auth_user() returns table(result text, user_id text)
language plpgsql security definer set search_path = public as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_id text;
  v_count bigint;
begin
  if v_auth_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select lower(trim(a.email)), coalesce(nullif(trim(a.raw_user_meta_data->>'full_name'),''), split_part(a.email,'@',1))
    into v_email, v_name from auth.users a
    where a.id=v_auth_id and a.email_confirmed_at is not null;
  if v_email is null or v_email='' then raise exception 'Verified email required' using errcode='42501'; end if;
  -- Serialize this function's concurrent attempts for the same login/email.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_auth_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,1));
  select u.id into v_id from public.users u where u.auth_user_id=v_auth_id;
  if v_id is not null then return query select 'linked'::text,v_id; return; end if;
  select count(*) into v_count from public.users u where lower(trim(u.email))=v_email;
  if v_count > 1 then return query select 'account needs review'::text,null::text; return; end if;
  if v_count = 1 then
    select u.id into v_id from public.users u where lower(trim(u.email))=v_email for update;
    if exists(select 1 from public.users u where u.id=v_id and u.auth_user_id is not null) then
      return query select 'account needs review'::text,null::text; return;
    end if;
    update public.users u set auth_user_id=v_auth_id where u.id=v_id and u.auth_user_id is null and lower(trim(u.email))=v_email;
    if not found then return query select 'account needs review'::text,null::text; return; end if;
  else
    v_id := pg_catalog.gen_random_uuid()::text;
    insert into public.users(id,role,name,email,verified,auth_user_id)
      values(v_id,'customer',left(v_name,120),v_email,true,v_auth_id);
  end if;
  return query select 'linked'::text,v_id;
end;
$$;

create trigger guard_auth_user_link before insert or update on public.users
for each row execute function public.guard_auth_user_link();
