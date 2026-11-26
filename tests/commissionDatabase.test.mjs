import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const identitySql = await readFile(new URL('../supabase/migrations/20261125_account_identity_foundation.sql', import.meta.url), 'utf8');
const commissionSql = await readFile(new URL('../supabase/migrations/20261126_weekly_commission_draft.sql', import.meta.url), 'utf8');
const rider = '11111111-1111-4111-8111-111111111111';
const manager = '22222222-2222-4222-8222-222222222222';
const cycle = '33333333-3333-4333-8333-333333333333';

test('only managers can approve; overdue approval queues proof and requires reapproval', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
      create table storage.objects (bucket_id text, name text, owner_id text);
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create table auth.identities (user_id uuid, provider text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.users (id text primary key, role text, name text, email text, phone text, verified boolean, vehicle_type text, vehicle_plate text, status text, availability text);
      create table public.orders (rider_id text, status text, pickup jsonb, price numeric, updated_at timestamptz);
      insert into auth.users(id,email,email_confirmed_at) values ('${rider}', 'rider@example.test', now()), ('${manager}', 'support.deliveryboysgh@gmail.com', now());
      insert into auth.identities values ('${rider}', 'google'), ('${manager}', 'google');
      insert into public.users(id) values ('rider'), ('manager');`);
    await db.exec(identitySql);
    await db.exec(commissionSql);
    await db.exec(`update deliveryboys_private.commission_configuration set cutover = now() - interval '20 days';
      delete from deliveryboys_private.commission_deadline_history;
      insert into deliveryboys_private.commission_deadline_history(effective_at, days) values (now() - interval '20 days', 1);
      insert into public.orders values ('rider', 'delivered', jsonb_build_object('deliveredAt', extract(epoch from (date_trunc('week', now() at time zone 'UTC') - interval '6 days') at time zone 'UTC') * 1000, 'commission', 6.25), 25, now());
    `);
    const closed = await db.query("select deliveryboys_private.close_commission_week((date_trunc('week',now() at time zone 'UTC') - interval '7 days') at time zone 'UTC') as count");
    assert.equal(closed.rows[0].count, 1);
    const repeat = await db.query("select deliveryboys_private.close_commission_week((date_trunc('week',now() at time zone 'UTC') - interval '7 days') at time zone 'UTC') as count");
    assert.equal(repeat.rows[0].count, 0);
    const statement = await db.query("select amount_pesewas from deliveryboys_private.commission_cycles");
    assert.equal(Number(statement.rows[0].amount_pesewas), 625);
    await db.exec("update public.orders set pickup = jsonb_set(pickup, '{commission}', '7'::jsonb)");
    await assert.rejects(db.query("select deliveryboys_private.close_commission_week((date_trunc('week',now() at time zone 'UTC') - interval '7 days') at time zone 'UTC')"), /manual adjustment/);
    await db.exec("delete from deliveryboys_private.commission_cycles");
    await db.exec(`insert into deliveryboys_private.account_identity_links values
      ('${rider}', 'rider', 'rider', now()), ('${manager}', 'manager', 'manager', now());
      insert into deliveryboys_private.commission_cycles(id,rider_id,week_start,week_end,deadline,amount_pesewas,state,proof_path)
      values ('${cycle}','rider',now()-interval '10 days',now()-interval '3 days',now()-interval '2 days',500,'unpaid',null);
      insert into storage.objects values ('commission-proofs','rider/proof-old.jpg','${rider}'), ('commission-proofs','rider/proof.jpg','${rider}'), ('commission-proofs','foreign.jpg','${manager}');
      set role authenticated; set "request.jwt.claim.sub" = '${rider}'; set "request.jwt.claims" = '{"app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';`);
    assert.equal((await db.query('select public.commission_can_accept_orders() as allowed')).rows[0].allowed, false);
    assert.equal((await db.query(`select public.may_access_commission_proof('${rider}/proof.jpg', true) as allowed`)).rows[0].allowed, true);
    assert.equal((await db.query(`select public.may_access_commission_proof('${manager}/proof.jpg', true) as allowed`)).rows[0].allowed, false);
    await assert.rejects(db.query(`select public.report_commission_payment('${cycle}', 'foreign.jpg')`), /new uploaded/);
    await db.query(`select public.report_commission_payment('${cycle}', 'rider/proof-old.jpg')`);
    await assert.rejects(db.query(`select public.approve_commission_payment('${cycle}')`), /Manager identity required/);
    await assert.rejects(db.query('select * from public.pending_commission_reviews()'), /Manager identity required/);
    await db.exec(`set "request.jwt.claim.sub" = '${manager}';`);
    assert.equal((await db.query('select * from public.pending_commission_reviews()')).rows.length, 1);
    await db.query(`select public.reject_commission_payment('${cycle}')`);
    await db.exec(`set "request.jwt.claim.sub" = '${rider}';`);
    assert.equal((await db.query('select * from public.my_commission_cycles()')).rows[0].proof_path, 'rider/proof-old.jpg');
    await db.query(`select public.report_commission_payment('${cycle}', 'rider/proof.jpg')`);
    await assert.rejects(db.query('select * from deliveryboys_private.commission_cycles'), /permission denied/);
    await db.exec(`set "request.jwt.claim.sub" = '${manager}';`);
    await db.query(`select public.approve_commission_payment('${cycle}')`);
    await assert.rejects(db.query(`select public.approve_commission_payment('${cycle}')`), /No payment awaiting review/);
    await db.exec(`set "request.jwt.claim.sub" = '${rider}';`);
    assert.equal((await db.query('select public.commission_can_accept_orders() as allowed')).rows[0].allowed, false);
    await db.exec(`set "request.jwt.claim.sub" = '${manager}';`);
    await db.query("select public.reapprove_commission_rider('rider')");
    await db.exec(`set "request.jwt.claim.sub" = '${rider}';`);
    assert.equal((await db.query('select public.commission_can_accept_orders() as allowed')).rows[0].allowed, true);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select bucket, path from deliveryboys_private.storage_deletions')).rows,
      [{ bucket: 'commission-proofs', path: 'rider/proof-old.jpg' }, { bucket: 'commission-proofs', path: 'rider/proof.jpg' }]);
    assert.equal((await db.query('select state from deliveryboys_private.commission_cycles')).rows[0].state, 'paid');
  } finally { await db.close(); }
});
