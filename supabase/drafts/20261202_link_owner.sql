create or replace function public.link_auth_user() returns table(result text, user_id text)
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
  if v_email = 'support.deliveryboysgh@gmail.com' then
    if coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'google' then
      raise exception 'Manager account requires Google sign-in' using errcode='42501';
    end if;
    select count(*) into v_count from public.users u where lower(trim(u.email))=v_email and u.role='manager';
    if v_count <> 1 then return query select 'account needs review'::text,null::text; return; end if;
    select u.id into v_id from public.users u where lower(trim(u.email))=v_email and u.role='manager' for update;
    if exists(select 1 from public.users u where u.auth_user_id=v_auth_id and u.id<>v_id) then
      return query select 'account needs review'::text,null::text; return;
    end if;
    if exists(select 1 from public.users u where u.id=v_id and u.auth_user_id is not null and u.auth_user_id<>v_auth_id) then
      return query select 'account needs review'::text,null::text; return;
    end if;
    update public.users u set auth_user_id=v_auth_id where u.id=v_id and (u.auth_user_id is null or u.auth_user_id=v_auth_id) and u.role='manager' and lower(trim(u.email))=v_email;
    if not found then return query select 'account needs review'::text,null::text; return; end if;
    return query select 'linked'::text,v_id; return;
  end if;
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
