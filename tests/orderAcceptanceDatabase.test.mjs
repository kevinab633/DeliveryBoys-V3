import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const [identitySql, commissionSql, acceptanceSql] = await Promise.all([
  sql('20261125_account_identity_foundation.sql'), sql('20261126_weekly_commission_draft.sql'), sql('20261128_order_acceptance_draft.sql'),
]);
const rider = '11111111-1111-4111-8111-111111111111';
const order = '22222222-2222-4222-8222-222222222222';
const order2 = '33333333-3333-4333-8333-333333333333';
const cycle = '44444444-4444-4444-8444-444444444444';
const jwt = '{"app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';

test('server acceptance rejects overdue and spoofed assignments, then accepts atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create table auth.identities (user_id uuid, provider text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.objects (bucket_id text, name text, owner_id text);
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table public.users (id text primary key, role text, name text, email text, phone text, verified boolean, status text);
      create table public.orders (id uuid primary key, rider_id text, rider_name text, status text, pickup jsonb, updated_at timestamptz, price numeric);
      grant select,insert,update on public.orders to anon,authenticated;
      insert into auth.users values ('${rider}', 'rider@example.test', now());
      insert into auth.identities values ('${rider}', 'google');
      insert into public.users values ('rider', 'rider', 'Real Rider', 'rider@example.test', null, true, 'approved');`);
    await db.exec(identitySql); await db.exec(commissionSql); await db.exec(acceptanceSql);
    await db.exec(`insert into deliveryboys_private.account_identity_links(auth_user_id,app_user_id,app_role) values ('${rider}','rider','rider');
      insert into public.orders(id,status,pickup) values ('${order}','pending','{}'), ('${order2}','pending','{}');
      insert into deliveryboys_private.commission_cycles(id,rider_id,week_start,week_end,deadline,amount_pesewas)
        values ('${cycle}','rider',now()-interval '10 days',now()-interval '3 days',now()-interval '2 days',500);
      set role authenticated; set "request.jwt.claim.sub" = '${rider}'; set "request.jwt.claims" = '${jwt}';`);
    await assert.rejects(db.query(`select public.accept_delivery_order('${order}')`), /Overdue commission/);
    await assert.rejects(db.query(`update public.orders set status='accepted',rider_id='rider' where id='${order}'`), /Overdue commission/);
    await assert.rejects(db.query(`update public.orders set status='accepted',rider_id='someone-else' where id='${order}'`), /Verified rider assignment/);
    await db.exec('reset role');
    await db.exec(`update deliveryboys_private.commission_cycles set state='paid' where id='${cycle}';`);
    await db.exec(`set role authenticated; set "request.jwt.claim.sub" = '${rider}'; set "request.jwt.claims" = '${jwt}';`);
    const accepted = await db.query(`select * from public.accept_delivery_order('${order}')`);
    assert.equal(accepted.rows[0].status, 'accepted');
    assert.equal(accepted.rows[0].rider_id, 'rider');
    assert.equal(accepted.rows[0].rider_name, 'Real Rider');
    assert.equal(typeof accepted.rows[0].pickup.acceptedAt, 'number');
    await assert.rejects(db.query(`select public.accept_delivery_order('${order}')`), /no longer available/);
    // A held rider can finish their existing order, but cannot accept another.
    await db.exec('reset role');
    await db.exec("insert into deliveryboys_private.commission_holds(rider_id) values ('rider')");
    await db.exec(`set role authenticated; set "request.jwt.claim.sub" = '${rider}'; set "request.jwt.claims" = '${jwt}';`);
    await db.query(`update public.orders set status='picked_up' where id='${order}'`);
    await assert.rejects(db.query(`select public.accept_delivery_order('${order2}')`), /reapproval required/);
    await assert.rejects(db.query(`insert into public.orders(id,status,rider_id) values ('55555555-5555-4555-8555-555555555555','accepted','rider')`), /reapproval required/);
    await db.exec(`set "request.jwt.claim.sub" = '';`);
    await assert.rejects(db.query(`update public.orders set rider_id='rider',status='accepted' where id='${order2}'`), /Verified rider assignment/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query(`select public.accept_delivery_order('${order2}')`), /permission denied/);
  } finally { await db.close(); }
});
