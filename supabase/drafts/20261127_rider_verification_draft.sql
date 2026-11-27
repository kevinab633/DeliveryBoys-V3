-- DRAFT: requires the identity and commission drafts. Do not apply until
-- server authorization, client integration, storage cleanup and rollout tests
-- are complete. Never use this private bucket for profile photos.
create table deliveryboys_private.rider_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_auth_id uuid not null unique references auth.users(id),
  customer_id text not null references public.users(id),
  status text not null check (status in ('pending', 'rejected', 'approved')),
  vehicle_type text not null check (vehicle_type in ('motorcycle','car','van','truck')),
  vehicle_plate text not null check (length(trim(vehicle_plate)) between 1 and 40),
  national_id_path text,
  selfie_path text,
  updated_at timestamptz not null default now(),
  check ((status in ('pending','rejected') and national_id_path is not null and selfie_path is not null and national_id_path <> selfie_path)
      or (status = 'approved' and national_id_path is null and selfie_path is null))
);
create unique index rider_application_unique_id on deliveryboys_private.rider_applications(national_id_path) where national_id_path is not null;
create unique index rider_application_unique_selfie on deliveryboys_private.rider_applications(selfie_path) where selfie_path is not null;
alter table deliveryboys_private.rider_applications enable row level security;
revoke all on deliveryboys_private.rider_applications from public, anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('rider-verification-private','rider-verification-private',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function public.may_access_rider_verification(p_path text, p_upload boolean)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select case when auth.uid() is null or p_path is null then false
    when p_upload then deliveryboys_private.has_role('customer')
      and split_part(p_path,'/',1) = auth.uid()::text
      and split_part(p_path,'/',2) <> '' and split_part(p_path,'/',3) = ''
    else deliveryboys_private.has_role('manager') or
      (deliveryboys_private.has_role('customer') and split_part(p_path,'/',1) = auth.uid()::text)
    end;
$$;
revoke all on function public.may_access_rider_verification(text,boolean) from public, anon;
grant execute on function public.may_access_rider_verification(text,boolean) to authenticated;
create policy "rider verification upload" on storage.objects for insert to authenticated
  with check(bucket_id = 'rider-verification-private' and public.may_access_rider_verification(name,true));
create policy "rider verification review" on storage.objects for select to authenticated
  using(bucket_id = 'rider-verification-private' and public.may_access_rider_verification(name,false));

-- Both new objects must already exist and belong to the caller. Rejected proof
-- remains available until replacement is committed; old objects are queued
-- transactionally for a service worker to delete after the commit.
create function public.submit_rider_application(p_vehicle_type text,p_vehicle_plate text,p_national_id_path text,p_selfie_path text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_customer text; v_existing deliveryboys_private.rider_applications%rowtype; v_id uuid;
begin
  select l.app_user_id into v_customer from deliveryboys_private.account_identity_links l
    where l.auth_user_id = auth.uid() and l.app_role = 'customer' and deliveryboys_private.is_google_session();
  if v_customer is null then raise exception 'Customer identity required' using errcode = '42501'; end if;
  if p_vehicle_type is null or p_vehicle_type not in ('motorcycle','car','van','truck') or
     p_vehicle_plate is null or length(trim(p_vehicle_plate)) not between 1 and 40 then
    raise exception 'Valid vehicle details required' using errcode = '22023'; end if;
  select * into v_existing from deliveryboys_private.rider_applications where applicant_auth_id = auth.uid() for update;
  if found and v_existing.status <> 'rejected' then raise exception 'Application cannot be submitted in this state' using errcode = '22023'; end if;
  if p_national_id_path is null or p_selfie_path is null or p_national_id_path = p_selfie_path or
     p_national_id_path = v_existing.national_id_path or p_selfie_path = v_existing.selfie_path or
     not public.may_access_rider_verification(p_national_id_path,true) or not public.may_access_rider_verification(p_selfie_path,true) or
     exists(select 1 from deliveryboys_private.storage_deletions d where d.bucket = 'rider-verification-private' and d.path in (p_national_id_path,p_selfie_path)) or
     exists(select 1 from deliveryboys_private.rider_applications a where a.national_id_path in (p_national_id_path,p_selfie_path) or a.selfie_path in (p_national_id_path,p_selfie_path)) or
     not exists(select 1 from storage.objects o where o.bucket_id='rider-verification-private' and o.name=p_national_id_path and o.owner_id=auth.uid()::text) or
     not exists(select 1 from storage.objects o where o.bucket_id='rider-verification-private' and o.name=p_selfie_path and o.owner_id=auth.uid()::text) then
    raise exception 'New verification images are required' using errcode = '22023'; end if;
  if v_existing.id is not null then
    insert into deliveryboys_private.storage_deletions(bucket,path) values
      ('rider-verification-private',v_existing.national_id_path),('rider-verification-private',v_existing.selfie_path) on conflict do nothing;
    update deliveryboys_private.rider_applications set status='pending', vehicle_type=p_vehicle_type,vehicle_plate=trim(p_vehicle_plate),
      national_id_path=p_national_id_path,selfie_path=p_selfie_path,updated_at=now() where id=v_existing.id returning id into v_id;
  else
    insert into deliveryboys_private.rider_applications(applicant_auth_id,customer_id,status,vehicle_type,vehicle_plate,national_id_path,selfie_path)
      values(auth.uid(),v_customer,'pending',p_vehicle_type,trim(p_vehicle_plate),p_national_id_path,p_selfie_path) returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.submit_rider_application(text,text,text,text) from public, anon;
grant execute on function public.submit_rider_application(text,text,text,text) to authenticated;

create function public.review_rider_application(p_application_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare a deliveryboys_private.rider_applications%rowtype; v_rider_id text := gen_random_uuid()::text;
begin
  if not deliveryboys_private.has_role('manager') then raise exception 'Manager identity required' using errcode = '42501'; end if;
  if p_approve is null then raise exception 'Decision required' using errcode = '22023'; end if;
  select * into a from deliveryboys_private.rider_applications where id=p_application_id for update;
  if not found or a.status <> 'pending' then raise exception 'No application awaiting review' using errcode = '22023'; end if;
  if not p_approve then
    update deliveryboys_private.rider_applications set status='rejected',updated_at=now() where id=a.id;
    return;
  end if;
  if exists(select 1 from deliveryboys_private.account_identity_links l where l.auth_user_id=a.applicant_auth_id and l.app_role='rider') then
    raise exception 'Rider profile already exists' using errcode = '23505'; end if;
  insert into public.users(id,role,name,email,phone,verified,vehicle_type,vehicle_plate,status,availability,photo_url)
    select v_rider_id,'rider',u.name,u.email,u.phone,true,a.vehicle_type,a.vehicle_plate,'approved','offline',u.photo_url
    from public.users u where u.id=a.customer_id;
  if not found then raise exception 'Customer profile missing'; end if;
  insert into deliveryboys_private.account_identity_links(auth_user_id,app_user_id,app_role) values(a.applicant_auth_id,v_rider_id,'rider');
  insert into deliveryboys_private.storage_deletions(bucket,path) values
    ('rider-verification-private',a.national_id_path),('rider-verification-private',a.selfie_path) on conflict do nothing;
  update deliveryboys_private.rider_applications set status='approved',national_id_path=null,selfie_path=null,updated_at=now() where id=a.id;
end;
$$;
revoke all on function public.review_rider_application(uuid,boolean) from public, anon;
grant execute on function public.review_rider_application(uuid,boolean) to authenticated;
