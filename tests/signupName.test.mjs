import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../supabase/drafts/20261205_signup_name.sql', import.meta.url), 'utf8');
test('verified linked customer or pending rider can save only their own typed name', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
      create table public.users(id text primary key, auth_user_id uuid unique, role text, status text, name text);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111',now()), ('22222222-2222-4222-8222-222222222222',now()), ('33333333-3333-4333-8333-333333333333',null), ('44444444-4444-4444-8444-444444444444',now());
      insert into public.users values ('a','11111111-1111-4111-8111-111111111111','customer',null,'Old A'), ('b','22222222-2222-4222-8222-222222222222','rider','pending','Old B'), ('c','33333333-3333-4333-8333-333333333333','customer',null,'Old C'), ('d','44444444-4444-4444-8444-444444444444','manager',null,'Old D');`);
    await db.exec(sql);
    await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';`);
    await db.query("select public.save_signup_name('  Email typed name  ')");
    await assert.rejects(db.query("select public.save_signup_name('   ')"), /Name must/);
    await assert.rejects(db.query('select public.save_signup_name($1)', ['x'.repeat(121)]), /Name must/);
    await db.exec(`set "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';`);
    await db.query("select public.save_signup_name('Google typed name')");
    await db.exec(`set "request.jwt.claim.sub"='33333333-3333-4333-8333-333333333333';`);
    await assert.rejects(db.query("select public.save_signup_name('No')"), /Verified sign-in/);
    await db.exec(`set "request.jwt.claim.sub"='44444444-4444-4444-8444-444444444444';`);
    await assert.rejects(db.query("select public.save_signup_name('No')"), /Eligible linked profile/);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select id,name from public.users order by id')).rows, [
      {id:'a',name:'Email typed name'}, {id:'b',name:'Google typed name'}, {id:'c',name:'Old C'}, {id:'d',name:'Old D'},
    ]);
    await db.exec('set role anon');
    await assert.rejects(db.query("select public.save_signup_name('No')"), /permission denied/);
  } finally { await db.close(); }
});
