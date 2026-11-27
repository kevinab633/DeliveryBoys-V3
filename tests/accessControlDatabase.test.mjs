import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = name => readFile(new URL(`../supabase/drafts/${name}`, import.meta.url), 'utf8');
const files = await Promise.all(['20261125_account_identity_foundation.sql','20261126_weekly_commission_draft.sql','20261129_access_control_draft.sql'].map(sql));
const customer = '11111111-1111-4111-8111-111111111111';
const rider = '22222222-2222-4222-8222-222222222222';
const manager = '33333333-3333-4333-8333-333333333333';
const jwt = '{"app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';

test('draft RLS removes anonymous access and permits only own, dispatched or manager reads', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create table auth.identities(user_id uuid,provider text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create table storage.objects(bucket_id text,name text,owner_id text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.users(id text primary key,role text,name text,email text,phone text,verified boolean);
      create table public.orders(id uuid primary key,customer_id text,rider_id text,status text,pickup jsonb,dispatched_to text[],updated_at timestamptz,price numeric);
      create table public.app_settings(key text primary key,value text,updated_at timestamptz);
      alter table public.users enable row level security; alter table public.orders enable row level security; alter table public.app_settings enable row level security;
      grant all on public.users,public.orders,public.app_settings to anon,authenticated;
      create policy open_users on public.users for all using(true) with check(true);
      create policy open_orders on public.orders for all using(true) with check(true);
      create policy open_settings on public.app_settings for all using(true) with check(true);
      insert into auth.users values ('${customer}','customer@example.test',now()),('${rider}','rider@example.test',now()),('${manager}','support.deliveryboysgh@gmail.com',now());
      insert into auth.identities values ('${customer}','google'),('${rider}','google'),('${manager}','google');
      insert into public.users(id,role,name) values ('c1','customer','C'),('c2','customer','Other'),('r1','rider','R'),('m1','manager','M');
      insert into public.orders(id,customer_id,rider_id,status,dispatched_to) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1','r1','accepted',null),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','c2',null,'pending',array['r1']),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','c2',null,'pending',array['other']);
      insert into public.app_settings(key,value) values ('fuel','1');`);
    await db.exec(files[0]); await db.exec(files[1]);
    await db.exec(`insert into deliveryboys_private.account_identity_links(auth_user_id,app_user_id,app_role) values
      ('${customer}','c1','customer'),('${rider}','r1','rider'),('${manager}','m1','manager');`);
    await db.exec(files[2]);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.users'), /permission denied/);
    await assert.rejects(db.query('select * from public.orders'), /permission denied/);
    assert.equal((await db.query('select * from public.app_settings')).rows.length,1);
    await db.exec(`reset role; set role authenticated; set "request.jwt.claims" = '${jwt}'; set "request.jwt.claim.sub" = '${customer}';`);
    assert.deepEqual((await db.query('select id from public.users')).rows, [{id:'c1'}]);
    assert.deepEqual((await db.query('select customer_id from public.orders')).rows, [{customer_id:'c1'}]);
    await assert.rejects(db.query("update public.users set role='manager' where id='c1'"), /permission denied/);
    await assert.rejects(db.query("update public.orders set status='accepted'"), /permission denied/);
    // RLS-filtered UPDATE may succeed but affect zero rows.
    await db.query("update public.app_settings set value='100' where key='fuel'");
    assert.equal((await db.query("select value from public.app_settings where key='fuel'")).rows[0].value,'1');
    await db.exec(`set "request.jwt.claim.sub" = '${rider}';`);
    assert.deepEqual((await db.query('select id from public.users')).rows, [{id:'r1'}]);
    assert.deepEqual((await db.query('select id from public.orders order by id')).rows.map(r=>r.id), ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    await db.exec(`set "request.jwt.claim.sub" = '${manager}';`);
    assert.equal((await db.query('select id from public.users')).rows.length,4);
    assert.equal((await db.query('select id from public.orders')).rows.length,3);
    await db.query("update public.app_settings set value='2' where key='fuel'");
    assert.equal((await db.query("select value from public.app_settings where key='fuel'")).rows[0].value,'2');
    await db.exec(`set "request.jwt.claims" = '{"app_metadata":{"provider":"email"},"amr":[{"method":"password"}]}';`);
    assert.deepEqual((await db.query('select id from public.users')).rows,[]);
  } finally { await db.close(); }
});
