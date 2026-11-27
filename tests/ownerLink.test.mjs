import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const base=await readFile(new URL('../supabase/migrations/20261130000200_step1_auth_links.sql',import.meta.url),'utf8');
const insert=await readFile(new URL('../supabase/drafts/20261202_insert_manager.sql',import.meta.url),'utf8');
const replacement=await readFile(new URL('../supabase/drafts/20261202_link_owner.sql',import.meta.url),'utf8');
test('owner Google links only the manager row; other roles remain unchanged',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
   create table public.users(id text primary key,role text,name text,email text,verified boolean);
   insert into auth.users values('11111111-1111-4111-8111-111111111111','support.deliveryboysgh@gmail.com',now(),'{}');
   insert into public.users values ('r','rider','r','support.deliveryboysgh@gmail.com',true),('c','customer','c','support.deliveryboysgh@gmail.com',true);
  `);
  await db.exec(base); await db.exec(insert); await db.exec(replacement);
  await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111'; set "request.jwt.claims"='{"app_metadata":{"provider":"email"}}';`);
  await assert.rejects(db.query('select * from public.link_auth_user()'),/requires Google/);
  await db.exec(`set "request.jwt.claims"='{"app_metadata":{"provider":"google"}}';`);
  assert.equal((await db.query('select result from public.link_auth_user()')).rows[0].result,'linked');
  assert.equal((await db.query('select result from public.link_auth_user()')).rows[0].result,'linked');
  await db.exec('reset role');
  const rows=(await db.query('select role,auth_user_id is not null as linked from public.users order by role')).rows;
  assert.deepEqual(rows,[{role:'customer',linked:false},{role:'manager',linked:true},{role:'rider',linked:false}]);
 } finally {await db.close();}
});
