import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const identity = await readFile(new URL('../supabase/drafts/20261125_account_identity_foundation.sql',import.meta.url),'utf8');
const requests = await readFile(new URL('../supabase/drafts/test_rider_applications.sql',import.meta.url),'utf8');

test('only the verified manager can approve; applicants cannot select a role',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create table public.users(id text primary key,role text,name text,email text,phone text,verified boolean,vehicle_type text,vehicle_plate text,status text,availability text);
    insert into auth.users values ('11111111-1111-4111-8111-111111111111','rider@example.test',now()),('22222222-2222-4222-8222-222222222222','support.deliveryboysgh@gmail.com',now());
    insert into auth.identities values ('11111111-1111-4111-8111-111111111111','google'),('22222222-2222-4222-8222-222222222222','google');
    insert into public.users(id,role,name) values ('customer','customer','Rider'),('manager','manager','Manager');`);
  await db.exec(identity); await db.exec(requests);
  await db.exec(`insert into deliveryboys_private.account_identity_links(auth_user_id,app_user_id,app_role) values ('11111111-1111-4111-8111-111111111111','customer','customer'),('22222222-2222-4222-8222-222222222222','manager','manager');
    set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111'; set "request.jwt.claims"='{"app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';`);
  await db.query("select public.submit_rider_request('motorcycle','ABC')");
  assert.equal((await db.query('select status from public.my_rider_request()')).rows[0].status,'pending');
  assert.deepEqual((await db.query('select app_role from public.my_deliveryboys_identities()')).rows,[{app_role:'customer'}]);
  await assert.rejects(db.query('select * from public.pending_rider_requests()'),/Manager identity required/);
  await assert.rejects(db.query('select public.review_rider_request(null,true)'),/Manager identity required/);
  await assert.rejects(db.query('select * from deliveryboys_private.rider_applications_v1'),/permission denied/);
  await db.exec(`set "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';`);
  const pending = (await db.query('select * from public.pending_rider_requests()')).rows;
  assert.equal(pending.length,1);
  await db.query('select public.review_rider_request($1,true)',[pending[0].request_id]);
  await assert.rejects(db.query('select public.review_rider_request($1,true)',[pending[0].request_id]),/No pending request/);
  await db.exec(`set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';`);
  assert.deepEqual((await db.query('select app_role from public.my_deliveryboys_identities()')).rows,[{app_role:'customer'},{app_role:'rider'}]);
 } finally {await db.close();}
});
