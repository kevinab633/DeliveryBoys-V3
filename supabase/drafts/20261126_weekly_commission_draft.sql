-- DRAFT ONLY. Do not apply to production: the authenticated order flow,
-- private upload policies, statement creation job and cleanup worker are not
-- yet implemented. This migration depends on the identity foundation.
create table deliveryboys_private.commission_cycles (
  id uuid primary key default gen_random_uuid(),
  rider_id text not null references public.users(id),
  week_start timestamptz not null,
  week_end timestamptz not null,
  deadline timestamptz not null,
  amount_pesewas bigint not null check (amount_pesewas > 0),
  state text not null default 'unpaid' check (state in ('unpaid','pending','rejected','paid')),
  proof_path text,
  unique (rider_id, week_start),
  check (week_end = week_start + interval '7 days'),
  check (deadline >= week_end),
  check ((state in ('pending', 'rejected') and proof_path is not null) or
         (state in ('unpaid', 'paid') and proof_path is null))
);
-- A proof object can belong to at most one live submission, including during
-- concurrent reports. Object paths must also be unique and non-reusable.
create unique index commission_cycles_unique_proof on deliveryboys_private.commission_cycles(proof_path) where proof_path is not null;
create table deliveryboys_private.commission_holds (
  rider_id text primary key references public.users(id),
  requires_reapproval boolean not null default true
);
create table deliveryboys_private.commission_audit (
  id bigint generated always as identity primary key,
  cycle_id uuid not null references deliveryboys_private.commission_cycles(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('reported','rejected','approved','reapproved')),
  recorded_at timestamptz not null default now()
);
-- Durable outbox. A server worker must delete via Storage API (not SQL), then
-- remove the queue item only after successful deletion, retrying on failure.
create table deliveryboys_private.storage_deletions (
  bucket text not null,
  path text not null,
  queued_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table deliveryboys_private.commission_cycles enable row level security;
alter table deliveryboys_private.commission_holds enable row level security;
alter table deliveryboys_private.commission_audit enable row level security;
alter table deliveryboys_private.storage_deletions enable row level security;
revoke all on all tables in schema deliveryboys_private from public, anon, authenticated;

-- The caller cannot supply an auth UID or a role. Roles are assigned only via
-- the private, administrator-managed identity mapping.
create function deliveryboys_private.has_role(p_role text, p_app_user_id text default null)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from deliveryboys_private.account_identity_links l
    where l.auth_user_id = auth.uid() and deliveryboys_private.is_google_session() and l.app_role = p_role
      and (p_app_user_id is null or l.app_user_id = p_app_user_id)
      and (p_role <> 'manager' or exists(select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = 'support.deliveryboysgh@gmail.com')));
$$;
revoke all on function deliveryboys_private.has_role(text, text) from public, anon, authenticated;

-- This function alone cannot enforce a halt: every authenticated order
-- assignment/acceptance path must call it within the transaction that accepts.
create function public.commission_can_accept_orders()
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_rider_id text;
begin
  select l.app_user_id into v_rider_id from deliveryboys_private.account_identity_links l
    where l.auth_user_id = auth.uid() and deliveryboys_private.is_google_session() and l.app_role = 'rider';
  if v_rider_id is null then raise exception 'Rider identity required' using errcode = '42501'; end if;
  return not exists(select 1 from deliveryboys_private.commission_holds h
                    where h.rider_id = v_rider_id and h.requires_reapproval)
     and not exists(select 1 from deliveryboys_private.commission_cycles c
                    where c.rider_id = v_rider_id and c.state <> 'paid' and c.deadline < now());
end;
$$;
revoke all on function public.commission_can_accept_orders() from public, anon;
grant execute on function public.commission_can_accept_orders() to authenticated;

-- Approval cannot be called by riders and is atomic with recording evidence
-- cleanup. An overdue payment creates a separate hold that only a manager may
-- clear after every overdue cycle is paid.
create function public.approve_commission_payment(p_cycle_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare c deliveryboys_private.commission_cycles%rowtype;
begin
  if not deliveryboys_private.has_role('manager') then raise exception 'Manager identity required' using errcode = '42501'; end if;
  select * into c from deliveryboys_private.commission_cycles where id = p_cycle_id for update;
  if not found or c.state <> 'pending' or c.proof_path is null then
    raise exception 'No payment awaiting review' using errcode = '22023';
  end if;
  if c.deadline < now() then
    insert into deliveryboys_private.commission_holds(rider_id) values(c.rider_id)
      on conflict(rider_id) do update set requires_reapproval = true;
  end if;
  insert into deliveryboys_private.storage_deletions(bucket,path) values('commission-proofs',c.proof_path)
    on conflict do nothing;
  update deliveryboys_private.commission_cycles set state = 'paid', proof_path = null where id = c.id;
  insert into deliveryboys_private.commission_audit(cycle_id, actor_id, action) values(c.id, auth.uid(), 'approved');
end;
$$;
revoke all on function public.approve_commission_payment(uuid) from public, anon;
grant execute on function public.approve_commission_payment(uuid) to authenticated;

create function public.reapprove_commission_rider(p_rider_id text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not deliveryboys_private.has_role('manager') then raise exception 'Manager identity required' using errcode = '42501'; end if;
  -- Serialize manager actions on this rider's hold before checking debts.
  perform 1 from deliveryboys_private.commission_holds where rider_id = p_rider_id for update;
  if not found then raise exception 'Rider has no commission hold' using errcode = '22023'; end if;
  if exists(select 1 from deliveryboys_private.commission_cycles c
      where c.rider_id = p_rider_id and c.state <> 'paid' and c.deadline < now()) then
    raise exception 'Overdue commission remains unpaid' using errcode = '22023';
  end if;
  update deliveryboys_private.commission_holds set requires_reapproval = false where rider_id = p_rider_id;
end;
$$;
revoke all on function public.reapprove_commission_rider(text) from public, anon;
grant execute on function public.reapprove_commission_rider(text) to authenticated;

-- Managers need to discover holds without exposing the private hold table.
create function public.commission_riders_needing_reapproval()
returns table(rider_id text, rider_name text, overdue_remaining boolean)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not deliveryboys_private.has_role('manager') then raise exception 'Manager identity required' using errcode = '42501'; end if;
  return query select h.rider_id, u.name,
    exists(select 1 from deliveryboys_private.commission_cycles c where c.rider_id=h.rider_id and c.state <> 'paid' and c.deadline < now())
    from deliveryboys_private.commission_holds h join public.users u on u.id=h.rider_id
    where h.requires_reapproval order by u.name, h.rider_id;
end;
$$;
revoke all on function public.commission_riders_needing_reapproval() from public, anon;
grant execute on function public.commission_riders_needing_reapproval() to authenticated;

-- Caller must first upload to the private bucket with authenticated ownership.
-- The complete rollout must create that bucket and restrictive storage policies.
create function public.report_commission_payment(p_cycle_id uuid, p_proof_path text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare c deliveryboys_private.commission_cycles%rowtype;
begin
  select * into c from deliveryboys_private.commission_cycles where id = p_cycle_id for update;
  if not found or not deliveryboys_private.has_role('rider', c.rider_id) then
    raise exception 'Rider identity required' using errcode = '42501';
  end if;
  if c.state not in ('unpaid', 'rejected') then
    raise exception 'Payment cannot be reported in this state' using errcode = '22023';
  end if;
  if p_proof_path is null or p_proof_path = c.proof_path or
     exists(select 1 from deliveryboys_private.commission_cycles other where other.proof_path = p_proof_path) or
     exists(select 1 from deliveryboys_private.storage_deletions d where d.bucket = 'commission-proofs' and d.path = p_proof_path) or
     not exists(select 1 from storage.objects o where o.bucket_id = 'commission-proofs'
                and o.name = p_proof_path and o.owner_id = auth.uid()::text) then
    raise exception 'A new uploaded payment screenshot is required' using errcode = '22023';
  end if;
  if c.proof_path is not null then
    insert into deliveryboys_private.storage_deletions(bucket,path) values('commission-proofs',c.proof_path)
      on conflict do nothing;
  end if;
  update deliveryboys_private.commission_cycles set state = 'pending', proof_path = p_proof_path where id = c.id;
  insert into deliveryboys_private.commission_audit(cycle_id, actor_id, action) values(c.id, auth.uid(), 'reported');
end;
$$;
revoke all on function public.report_commission_payment(uuid,text) from public, anon;
grant execute on function public.report_commission_payment(uuid,text) to authenticated;

create function public.reject_commission_payment(p_cycle_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare c deliveryboys_private.commission_cycles%rowtype;
begin
  if not deliveryboys_private.has_role('manager') then raise exception 'Manager identity required' using errcode = '42501'; end if;
  select * into c from deliveryboys_private.commission_cycles where id = p_cycle_id for update;
  if not found or c.state <> 'pending' then raise exception 'No payment awaiting review' using errcode = '22023'; end if;
  update deliveryboys_private.commission_cycles set state = 'rejected' where id = c.id;
  insert into deliveryboys_private.commission_audit(cycle_id, actor_id, action) values(c.id, auth.uid(), 'rejected');
end;
$$;
revoke all on function public.reject_commission_payment(uuid) from public, anon;
grant execute on function public.reject_commission_payment(uuid) to authenticated;

create function public.my_commission_cycles()
returns table(id uuid, week_start timestamptz, week_end timestamptz, deadline timestamptz,
  amount_pesewas bigint, state text, proof_path text)
language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_rider text;
begin
  select l.app_user_id into v_rider from deliveryboys_private.account_identity_links l
    where l.auth_user_id = auth.uid() and deliveryboys_private.is_google_session() and l.app_role = 'rider';
  if v_rider is null then raise exception 'Rider identity required' using errcode = '42501'; end if;
  return query select c.id, c.week_start, c.week_end, c.deadline, c.amount_pesewas, c.state, c.proof_path
    from deliveryboys_private.commission_cycles c where c.rider_id = v_rider order by c.week_start desc;
end;
$$;
revoke all on function public.my_commission_cycles() from public, anon;
grant execute on function public.my_commission_cycles() to authenticated;

create function public.pending_commission_reviews()
returns table(id uuid, rider_id text, week_start timestamptz, week_end timestamptz, deadline timestamptz,
  amount_pesewas bigint, proof_path text)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not deliveryboys_private.has_role('manager') then raise exception 'Manager identity required' using errcode = '42501'; end if;
  return query select c.id, c.rider_id, c.week_start, c.week_end, c.deadline, c.amount_pesewas, c.proof_path
    from deliveryboys_private.commission_cycles c where c.state = 'pending' order by c.deadline, c.id;
end;
$$;
revoke all on function public.pending_commission_reviews() from public, anon;
grant execute on function public.pending_commission_reviews() to authenticated;

-- Private proof bucket. Do not reuse this bucket for profile photos. Object
-- names start with the authenticated rider UUID followed by a unique filename.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('commission-proofs', 'commission-proofs', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.may_access_commission_proof(p_path text, p_upload boolean)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select case when auth.uid() is null or p_path is null then false
    when p_upload then deliveryboys_private.has_role('rider')
      and split_part(p_path, '/', 1) = auth.uid()::text
      and split_part(p_path, '/', 2) <> '' and split_part(p_path, '/', 3) = ''
    else deliveryboys_private.has_role('manager') or
      (deliveryboys_private.has_role('rider') and split_part(p_path, '/', 1) = auth.uid()::text)
    end;
$$;
revoke all on function public.may_access_commission_proof(text,boolean) from public, anon;
grant execute on function public.may_access_commission_proof(text,boolean) to authenticated;

create policy "commission proof upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'commission-proofs' and public.may_access_commission_proof(name, true));
create policy "commission proof review" on storage.objects for select to authenticated
  using (bucket_id = 'commission-proofs' and public.may_access_commission_proof(name, false));
-- No public UPDATE or DELETE policy. Only the trusted cleanup worker removes
-- proof objects after the database has durably queued them.

-- Deadline changes are versioned. A statement snapshots the setting in force
-- when its week ended, so delayed statement generation does not retroactively
-- change its deadline. The cutover excludes all prior test commission.
create table deliveryboys_private.commission_deadline_history (
  effective_at timestamptz primary key default clock_timestamp(),
  days integer not null check (days between 1 and 365)
);
create table deliveryboys_private.commission_configuration (
  singleton boolean primary key default true check(singleton),
  cutover timestamptz not null
);
insert into deliveryboys_private.commission_configuration(singleton,cutover) values (true,clock_timestamp());
insert into deliveryboys_private.commission_deadline_history(effective_at,days)
  select cutover, 1 from deliveryboys_private.commission_configuration where singleton;
alter table deliveryboys_private.commission_deadline_history enable row level security;
alter table deliveryboys_private.commission_configuration enable row level security;
revoke all on deliveryboys_private.commission_deadline_history, deliveryboys_private.commission_configuration from public, anon, authenticated;

create function public.set_commission_deadline_days(p_days integer)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not deliveryboys_private.has_role('manager') then raise exception 'Manager identity required' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Days must be between 1 and 365' using errcode = '22023'; end if;
  insert into deliveryboys_private.commission_deadline_history(days) values(p_days);
end;
$$;
revoke all on function public.set_commission_deadline_days(integer) from public, anon;
grant execute on function public.set_commission_deadline_days(integer) to authenticated;

-- Server-only: invoke from a trusted scheduler after a week closes. This is
-- intentionally not available to clients. The order ingestion/assignment
-- system must first be secured so recorded status, timestamp and commission
-- are authoritative. Late corrections require an explicit adjustment flow.
create function deliveryboys_private.close_commission_week(p_week_start timestamptz)
returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare v_end timestamptz := p_week_start + interval '7 days';
  v_cutover timestamptz; v_days integer; v_rows integer;
begin
  if p_week_start is null or p_week_start <> (date_trunc('week', p_week_start at time zone 'UTC') at time zone 'UTC')
      or v_end > now() then raise exception 'A completed Monday UTC week is required' using errcode = '22023'; end if;
  select cutover into v_cutover from deliveryboys_private.commission_configuration where singleton;
  if v_cutover is null then raise exception 'Commission cutover not configured'; end if;
  if v_end <= v_cutover then return 0; end if;
  select days into v_days from deliveryboys_private.commission_deadline_history
    where effective_at < v_end order by effective_at desc limit 1;
  if v_days is null then raise exception 'Deadline setting missing'; end if;
  -- The timestamp/commission values are in the pickup JSON. Never guess a
  -- delivered time or an old pricing formula when calculating money owed.
  if exists (select 1 from public.orders o where o.status = 'delivered' and o.rider_id is not null
      and o.updated_at >= v_cutover and o.updated_at >= p_week_start
      and (jsonb_typeof(o.pickup->'deliveredAt') is distinct from 'number'
        or jsonb_typeof(o.pickup->'commission') is distinct from 'number')) then
    raise exception 'A delivered order is missing recorded delivery time or commission';
  end if;
  if exists (select 1 from public.orders o where o.status = 'delivered' and o.rider_id is not null
      and jsonb_typeof(o.pickup->'deliveredAt') = 'number' and jsonb_typeof(o.pickup->'commission') = 'number'
      and (o.pickup->>'deliveredAt')::numeric >= extract(epoch from greatest(v_cutover,p_week_start))*1000
      and (o.pickup->>'deliveredAt')::numeric < extract(epoch from v_end)*1000
      and ((o.pickup->>'commission')::numeric < 0 or (o.pickup->>'commission')::numeric > o.price
        or (o.pickup->>'commission')::numeric * 100 <> trunc((o.pickup->>'commission')::numeric * 100))) then
    raise exception 'A delivered order has an invalid commission';
  end if;
  -- Never silently ignore a late correction to a previously issued bill.
  -- Such a change must be handled by an explicit audited adjustment workflow.
  if exists (select 1 from deliveryboys_private.commission_cycles c
      where c.week_start = p_week_start and c.amount_pesewas <> coalesce((
        select sum((o.pickup->>'commission')::numeric * 100)
        from public.orders o where o.rider_id = c.rider_id and o.status = 'delivered'
          and jsonb_typeof(o.pickup->'deliveredAt')='number' and jsonb_typeof(o.pickup->'commission')='number'
          and (o.pickup->>'deliveredAt')::numeric >= extract(epoch from greatest(v_cutover,p_week_start))*1000
          and (o.pickup->>'deliveredAt')::numeric < extract(epoch from v_end)*1000
      ),0)) then raise exception 'Existing statement requires a manual adjustment'; end if;
  insert into deliveryboys_private.commission_cycles(rider_id,week_start,week_end,deadline,amount_pesewas)
  select o.rider_id,p_week_start,v_end,v_end + make_interval(days => v_days) - interval '1 millisecond',
      sum((o.pickup->>'commission')::numeric * 100)::bigint
    from public.orders o where o.status='delivered' and o.rider_id is not null
      and jsonb_typeof(o.pickup->'deliveredAt')='number' and jsonb_typeof(o.pickup->'commission')='number'
      and (o.pickup->>'deliveredAt')::numeric >= extract(epoch from greatest(v_cutover,p_week_start))*1000
      and (o.pickup->>'deliveredAt')::numeric < extract(epoch from v_end)*1000
    group by o.rider_id having sum((o.pickup->>'commission')::numeric) > 0
    on conflict (rider_id,week_start) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke all on function deliveryboys_private.close_commission_week(timestamptz) from public, anon, authenticated;

-- Service-role-only scheduled maintenance. Deploy only after all order writes
-- are authenticated and proof storage is private, and configure CRON_SECRET.
create function public.cron_prepare_commission_cycles()
returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare v_week timestamptz; v_end timestamptz; v_created integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('deliveryboys_commission_cron'));
  select date_trunc('week',cutover at time zone 'UTC') at time zone 'UTC'
    into v_week from deliveryboys_private.commission_configuration where singleton;
  if v_week is null then raise exception 'Commission cutover missing'; end if;
  v_end := date_trunc('week',now() at time zone 'UTC') at time zone 'UTC';
  while v_week < v_end loop
    v_created := v_created + deliveryboys_private.close_commission_week(v_week);
    v_week := v_week + interval '7 days';
  end loop;
  return v_created;
end;
$$;
revoke all on function public.cron_prepare_commission_cycles() from public, anon, authenticated;
grant execute on function public.cron_prepare_commission_cycles() to service_role;

create function public.cron_pending_storage_deletions()
returns table(bucket text,path text) language sql stable security definer set search_path = pg_catalog as $$
  select d.bucket,d.path from deliveryboys_private.storage_deletions d order by d.queued_at limit 50;
$$;
revoke all on function public.cron_pending_storage_deletions() from public, anon, authenticated;
grant execute on function public.cron_pending_storage_deletions() to service_role;

create function public.cron_ack_storage_deletion(p_bucket text,p_path text)
returns void language sql security definer set search_path = pg_catalog as $$
  delete from deliveryboys_private.storage_deletions where bucket=p_bucket and path=p_path;
$$;
revoke all on function public.cron_ack_storage_deletion(text,text) from public, anon, authenticated;
grant execute on function public.cron_ack_storage_deletion(text,text) to service_role;
