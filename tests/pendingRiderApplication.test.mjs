import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { isOwnPendingRiderApplication } from '../src/lib/pendingRiderApplication.ts';
const migration = await readFile(new URL('../supabase/drafts/20261201_rider_application_step2.sql',import.meta.url),'utf8');
const statusSql = await readFile(new URL('../supabase/drafts/20261203_pending_rider_status.sql',import.meta.url),'utf8');
test('pending status is scoped to the verified session and cannot be read by other users',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
  create table public.users(id text primary key,auth_user_id uuid);
  insert into auth.users values ('11111111-1111-4111-8111-111111111111',now()),('22222222-2222-4222-8222-222222222222',now());
  insert into public.users values ('c1','11111111-1111-4111-8111-111111111111'),('c2','22222222-2222-4222-8222-222222222222');`);
  await db.exec(migration); await db.exec(statusSql);
  await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';`);
  assert.equal((await db.query('select public.my_pending_step2_rider_user_id() as id')).rows[0].id,null);
  await db.query("select public.submit_step2_rider_application('motorcycle','ABC')");
  assert.equal((await db.query('select public.my_pending_step2_rider_user_id() as id')).rows[0].id,'c1');
  await db.exec(`set "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';`);
  assert.equal((await db.query('select public.my_pending_step2_rider_user_id() as id')).rows[0].id,null);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select public.my_pending_step2_rider_user_id()'),/permission denied/);
 } finally {await db.close();}
});
test('capture gate checks returned ID and fails closed on an RPC error',async()=>{
 const client = data => ({rpc:async(name)=>{assert.equal(name,'my_pending_step2_rider_user_id');return data;}});
 assert.equal(await isOwnPendingRiderApplication(client({data:'c1',error:null}),'c1'),true);
 assert.equal(await isOwnPendingRiderApplication(client({data:'c2',error:null}),'c1'),false);
 assert.equal(await isOwnPendingRiderApplication(client({data:null,error:null}),'c1'),false);
 await assert.rejects(isOwnPendingRiderApplication(client({data:null,error:new Error('unavailable')}),'c1'),/unavailable/);
});
