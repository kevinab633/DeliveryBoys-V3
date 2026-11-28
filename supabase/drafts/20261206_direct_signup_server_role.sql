-- REVIEW DRAFT ONLY. Do not apply to a live project without explicit owner
-- approval, a verified-identity rollout, policy inventory, and integration
-- testing. This preserves the legacy contact-only signup interface, so the
-- caller does NOT prove ownership of the email or phone. These functions
-- alone do not secure sign-in, prevent account impersonation, or rate-limit
-- registration. The separate rider/role guard draft also requires changes to
-- existing manager, verification, and order clients before it can be deployed.
--
-- The public wrappers expose distinct signup operations, NOT a role/status/id
-- argument. Only the server assigns customer or pending/offline rider; manager
-- accounts are never provisioned here. Existing duplicate rows are untouched.

create schema if not exists deliveryboys_private;
revoke all on schema deliveryboys_private from public, anon, authenticated;

create function deliveryboys_private.register_direct_signup(
  p_kind text, p_name text, p_email text, p_phone text,
  p_vehicle_type text, p_vehicle_plate text, p_national_id_url text, p_photo_url text
) returns setof public.users
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_email text := nullif(lower(trim(p_email)), '');
  v_phone text := nullif(trim(p_phone), '');
  v_row public.users%rowtype;
begin
  if p_kind is null or p_kind not in ('customer', 'rider') then
    raise exception 'Unsupported registration operation' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'Valid name required' using errcode = '22023';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'Email or phone required' using errcode = '22023';
  end if;
  if v_email is not null and (length(v_email) > 320 or strpos(v_email, '@') < 2 or right(v_email, 1) = '@') then
    raise exception 'Valid email required' using errcode = '22023';
  end if;
  if length(coalesce(v_phone, '')) > 40 then
    raise exception 'Invalid phone' using errcode = '22023';
  end if;
  if v_email = 'support.deliveryboysgh@gmail.com' then
    raise exception 'Manager email cannot be registered here' using errcode = '42501';
  end if;
  if p_kind = 'rider' and (p_vehicle_type is null or p_vehicle_type not in ('motorcycle', 'car', 'van', 'truck')
      or p_vehicle_plate is null or length(trim(p_vehicle_plate)) not between 1 and 40
      or length(coalesce(p_national_id_url, '')) > 2048 or length(coalesce(p_photo_url, '')) > 2048) then
    raise exception 'Valid vehicle and verification details required' using errcode = '22023';
  end if;

  -- Serialize duplicate checks for each role/contact, including concurrent
  -- signup requests. This does not modify or delete historical duplicates.
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended('signup:' || p_kind || ':email:' || v_email, 0));
  end if;
  if v_phone is not null then
    perform pg_advisory_xact_lock(hashtextextended('signup:' || p_kind || ':phone:' || v_phone, 0));
  end if;
  if exists(select 1 from public.users u where u.role = p_kind and
      ((v_email is not null and lower(trim(u.email)) = v_email) or
       (v_phone is not null and trim(u.phone) = v_phone))) then
    raise exception 'Account already exists for this contact and role' using errcode = '23505';
  end if;

  if p_kind = 'customer' then
    insert into public.users(id, role, name, email, phone, verified)
      values(gen_random_uuid()::text, 'customer', v_name, v_email, v_phone, false)
      returning * into v_row;
  else
    insert into public.users(id, role, name, email, phone, verified, vehicle_type,
      vehicle_plate, status, availability, total_deliveries, rating, earnings, national_id_url, photo_url)
      values(gen_random_uuid()::text, 'rider', v_name, v_email, v_phone, false, p_vehicle_type,
        trim(p_vehicle_plate), 'pending', 'offline', 0, 0, 0, nullif(p_national_id_url, ''), nullif(p_photo_url, ''))
      returning * into v_row;
  end if;
  return next v_row;
end;
$$;
revoke all on function deliveryboys_private.register_direct_signup(text,text,text,text,text,text,text,text) from public, anon, authenticated;

create function public.register_direct_customer(p_name text, p_email text, p_phone text)
returns setof public.users language sql security definer set search_path = pg_catalog as $$
  select * from deliveryboys_private.register_direct_signup('customer', p_name, p_email, p_phone, null, null, null, null);
$$;
create function public.register_direct_rider(p_name text, p_email text, p_phone text,
  p_vehicle_type text, p_vehicle_plate text, p_national_id_url text, p_photo_url text)
returns setof public.users language sql security definer set search_path = pg_catalog as $$
  select * from deliveryboys_private.register_direct_signup('rider', p_name, p_email, p_phone,
    p_vehicle_type, p_vehicle_plate, p_national_id_url, p_photo_url);
$$;
revoke all on function public.register_direct_customer(text,text,text) from public;
revoke all on function public.register_direct_rider(text,text,text,text,text,text,text) from public;
grant execute on function public.register_direct_customer(text,text,text) to anon, authenticated;
grant execute on function public.register_direct_rider(text,text,text,text,text,text,text) to anon, authenticated;
