import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const original=await readFile(new URL('../supabase/drafts/20261201_rider_application_step2.sql',import.meta.url),'utf8');
const replacement=await readFile(new URL('../supabase/drafts/20261204_rider_pending_role.sql',import.meta.url),'utf8');
test('rider signup changes only linked customer to pending and does not modify private application rows',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create table public.users(id text primary key,auth_user_id uuid,role text,status text,vehicle_type text,vehicle_plate text);
 insert into auth.users values ('11111111-1111-4111-8111-111111111111',now()),('22222222-2222-4222-8222-222222222222',now()),('33333333-3333-4333-8333-333333333333',now());
 insert into public.users values ('c','11111111-1111-4111-8111-111111111111','customer',null,null,null),('m','22222222-2222-4222-8222-222222222222','manager',null,null,null),('r','33333333-3333-4333-8333-333333333333','rider','approved',null,null);`);
 await db.exec(original); await db.exec(replacement);
 await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';`);
 assert.equal((await db.query("select public.submit_step2_rider_application('motorcycle',' ABC ') as status")).rows[0].status,'pending');
 await db.exec('reset role');
 assert.deepEqual((await db.query("select role,status,vehicle_type,vehicle_plate from public.users where id='c'")).rows,[{role:'rider',status:'pending',vehicle_type:'motorcycle',vehicle_plate:'ABC'}]);
 assert.equal((await db.query('select count(*)::int as n from deliveryboys_private.step2_rider_applications')).rows[0].n,0);
 await db.exec(`set role authenticated; set "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';`);
 await assert.rejects(db.query("select public.submit_step2_rider_application('car','ABC')"),/cannot submit/);
 await db.exec(`set "request.jwt.claim.sub"='33333333-3333-4333-8333-333333333333';`);
 await assert.rejects(db.query("select public.submit_step2_rider_application('car','ABC')"),/cannot submit/);
 } finally {await db.close();}
});
