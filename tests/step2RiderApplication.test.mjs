import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const sql = await readFile(new URL('../supabase/drafts/20261201_rider_application_step2.sql',import.meta.url),'utf8');
test('rider application is pending, session bound, and cannot be directly approved',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
  create table public.users(id text primary key,auth_user_id uuid);
  insert into auth.users values ('11111111-1111-4111-8111-111111111111',now()),('22222222-2222-4222-8222-222222222222',null);
  insert into public.users values ('c1','11111111-1111-4111-8111-111111111111');`);
  await db.exec(sql);
  await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';`);
  assert.equal((await db.query("select public.submit_step2_rider_application('motorcycle','ABC') as status")).rows[0].status,'pending');
  assert.equal((await db.query("select public.submit_step2_rider_application('car','NEW') as status")).rows[0].status,'pending');
  await assert.rejects(db.query("update deliveryboys_private.step2_rider_applications set status='approved'"),/permission denied/);
  await db.exec(`set "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';`);
  await assert.rejects(db.query("select public.submit_step2_rider_application('car','ABC')"),/Verified sign-in required/);
  await db.exec('reset role');
  assert.equal((await db.query('select vehicle_plate from deliveryboys_private.step2_rider_applications')).rows[0].vehicle_plate,'ABC');
 } finally { await db.close(); }
});
