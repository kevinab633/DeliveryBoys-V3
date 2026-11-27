# Rollback SQL — draft, not applied

`supabase/drafts/20261130_identity_policy_draft.sql` is **not ready for deployment**. The following reverses its policy/function changes only, assuming the verified live policy inventory has not otherwise changed. It intentionally restores public access and is **insecure**; use only in a controlled rollback window with the matching older app. It does not restore any data and does not undo the separate identity foundation. Review grants, dependencies, and current policies immediately before any use.

```sql
begin;
drop policy "deliveryboys linked user read" on public.users;
drop policy "deliveryboys participant order read" on public.orders;
create policy "Allow all access to users" on public.users as permissive for all to public using (true) with check (true);
create policy "anyone can create an order" on public.orders as permissive for insert to public with check (true);
create policy "anyone can update an order" on public.orders as permissive for update to public using (true);
create policy "anyone can view orders" on public.orders as permissive for select to public using (true);
drop function public.deliveryboys_draft_user_read(text);
drop function public.deliveryboys_draft_order_read(text,text);
commit;
```

No identity foundation or profile-function migration has been finalized; rollback SQL for those will be needed before they are eligible for deployment.

## Step 1 identity-link rollback (column retained)

Run only if the corresponding step 1 migration was applied. This disables the
link-write guard and removes its functions but **never drops the column** or
its existing links. Until the guard is restored, the existing public users
policy permits clients to change `auth_user_id`; do not use that column for
authorization during this rollback state.

```sql
begin;
drop trigger if exists guard_auth_user_link on public.users;
drop function if exists public.link_auth_user();
drop function if exists public.my_user_id();
drop function if exists public.is_manager();
drop function if exists public.guard_auth_user_link();
commit;
```

## Step 2 rider-application rollback (applied to LIVE)

Rollback removes the application function but retains the private schema and
application table and all submitted data. A future migration must explicitly
handle the retained table before recreating it. No rows are deleted.

```sql
drop function if exists public.submit_step2_rider_application(text,text);
```

## Manager authentication limitation

The current LIVE `is_manager()` checks the email and provider in the session
token. The provider in account metadata alone does not establish that the
current session used Google: a linked account may also have a password session.
Step 3 must strengthen this with a server-verified session authentication
method, and test Google and password sessions for the same linked account.
Do not treat the current function or UI as complete authorization enforcement.

## Owner manager row rollback (only the specifically created row)

This deletes the inserted manager row. Before execution confirm it has no
new dependencies or information that must be retained. It does not affect the
existing customer or rider rows.

```sql
delete from public.users where id = md5('deliveryboys-owner-manager-step2-20261201');
```

## Owner-specific link function rollback

The following is the pre-change definition returned by `pg_get_functiondef` on LIVE:

```sql
CREATE OR REPLACE FUNCTION public.link_auth_user()
 RETURNS TABLE(result text, user_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
```

## Rider application role function rollback

The exact definition returned by `pg_get_functiondef` before the role-function replacement follows. Restoring it does not revert any users rows already changed by the new function; review those rows separately without deleting data.

```sql
CREATE OR REPLACE FUNCTION public.submit_step2_rider_application(p_vehicle_type text, p_vehicle_plate text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
```

## Signup name function rollback (LIVE pre-apply state)

Before applying `supabase/drafts/20261205_signup_name.sql`, a read-only LIVE
catalog check found no `public.save_signup_name` function. If rollback is
approved, remove only the new function. This does not undo names already saved
and does not drop any column, table, or policy.

```sql
drop function if exists public.save_signup_name(text);
```
