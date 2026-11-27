import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migration=await readFile(new URL('../supabase/drafts/20261130_identity_policy_draft.sql',import.meta.url),'utf8');
const rollback=(await readFile(new URL('../docs/rollback.md',import.meta.url),'utf8')).match(/```sql\n([\s\S]*?)```/)[1];
test('draft policy blocks cross-customer reads and writes, and rollback restores old policies',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema deliveryboys_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function deliveryboys_private.stage_a_session_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
    create function deliveryboys_private.is_google_session() returns boolean language sql stable as $$select current_setting('request.jwt.method',true)='oauth'$$;
    create table public.users(id text primary key, role text, email text);
    create table public.orders(id text primary key, customer_id text, rider_id text);
    create table deliveryboys_private.account_identity_links(auth_user_id uuid,app_user_id text,app_role text);
    alter table public.users enable row level security; alter table public.orders enable row level security;
    grant select,insert,update,delete on public.users,public.orders to anon,authenticated;
    create policy "Allow all access to users" on public.users for all to public using(true) with check(true);
    create policy "anyone can create an order" on public.orders for insert to public with check(true);
    create policy "anyone can update an order" on public.orders for update to public using(true);
    create policy "anyone can view orders" on public.orders for select to public using(true);
    insert into public.users values ('c1','customer','one@example.test'),('c2','customer','two@example.test'),('m1','manager','support.deliveryboysgh@gmail.com');
    insert into public.orders values ('o1','c1',null),('o2','c2',null);
    insert into deliveryboys_private.account_identity_links values ('11111111-1111-4111-8111-111111111111','c1','customer'),('22222222-2222-4222-8222-222222222222','m1','manager');`);
  await db.exec(migration);
  await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111'; set "request.jwt.method"='password';`);
  assert.deepEqual((await db.query('select id from public.orders')).rows,[{id:'o1'}]);
  await assert.rejects(db.query("insert into public.orders values ('o3','c1',null)"),/row-level security/);
  assert.equal((await db.query("update public.users set role='manager' where id='c1' returning id")).rows.length,0);
  await db.exec(`set "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';`);
  assert.equal((await db.query('select * from public.orders')).rows.length,0);
  await db.exec(`set "request.jwt.method"='oauth';`);
  assert.equal((await db.query('select * from public.orders')).rows.length,2);
  await db.exec('reset role'); await db.exec(rollback);
  await db.exec('set role anon'); assert.equal((await db.query('select * from public.orders')).rows.length,2);
 } finally {await db.close();}
});
