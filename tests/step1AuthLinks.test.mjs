import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../supabase/migrations/20261130000200_step1_auth_links.sql',import.meta.url),'utf8');
const doc=await readFile(new URL('../docs/rollback.md',import.meta.url),'utf8');
const rollback=doc.split('## Step 1 identity-link rollback (column retained)')[1].match(/```sql\n([\s\S]*?)```/)[1];
test('links only a unique verified email, rejects duplicates and direct link writes; rollback retains column',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
 create table public.users(id text primary key,role text not null,name text not null,email text,verified boolean not null default true);
 alter table public.users enable row level security; create policy open_access on public.users for all using(true) with check(true);
 grant all on public.users to authenticated,anon;
 insert into auth.users values ('11111111-1111-4111-8111-111111111111','one@example.test',now(),'{}'),('22222222-2222-4222-8222-222222222222','duplicate@example.test',now(),'{}'),('33333333-3333-4333-8333-333333333333','new@example.test',now(),'{}'),('44444444-4444-4444-8444-444444444444','unverified@example.test',null,'{}');
 insert into public.users values('one','rider','One','one@example.test',true),('dup1','customer','D','duplicate@example.test',true),('dup2','rider','D','DUPLICATE@example.test',true);`);
 await db.exec(migration);
 await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';`);
 await assert.rejects(db.query("update public.users set auth_user_id='11111111-1111-4111-8111-111111111111' where id='one'"),/only be set/);
 await assert.rejects(db.query("insert into public.users(id,role,name,auth_user_id) values('x','customer','X','11111111-1111-4111-8111-111111111111')"),/only be set/);
 assert.deepEqual((await db.query('select * from public.link_auth_user()')).rows,[{result:'linked',user_id:'one'}]);
 assert.deepEqual((await db.query('select * from public.link_auth_user()')).rows,[{result:'linked',user_id:'one'}]);
 await db.exec(`set "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';`);
 assert.deepEqual((await db.query('select * from public.link_auth_user()')).rows,[{result:'account needs review',user_id:null}]);
 await db.exec(`set "request.jwt.claim.sub"='33333333-3333-4333-8333-333333333333';`);
 assert.equal((await db.query('select * from public.link_auth_user()')).rows[0].result,'linked');
 assert.equal((await db.query("select role from public.users where email='new@example.test'")).rows[0].role,'customer');
 await db.exec(`set "request.jwt.claim.sub"='44444444-4444-4444-8444-444444444444';`);
 await assert.rejects(db.query('select * from public.link_auth_user()'),/Verified email required/);
 await db.exec('reset role'); await db.exec(rollback);
 assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='users' and column_name='auth_user_id'")).rows[0].n,1);
 } finally {await db.close();}
});
