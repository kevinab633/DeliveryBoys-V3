import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261125_account_identity_foundation.sql', import.meta.url), 'utf8');
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const charlie = '33333333-3333-4333-8333-333333333333';
const unverified = '44444444-4444-4444-8444-444444444444';
const owner = '55555555-5555-4555-8555-555555555555';

test('identity links are private and callers see only their own trusted assignments', async () => {
  const db = new PGlite();
  try {
    // Minimal stand-ins for Supabase schemas and JWT context; this does not
    // substitute for integration testing against the real Supabase policies.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create table auth.identities (user_id uuid, provider text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create table public.users (id text primary key, role text, name text, email text, phone text, verified boolean, vehicle_type text, vehicle_plate text, status text, availability text);
      insert into auth.users values ('${alice}', 'alice@example.test', now()), ('${bob}', 'support.deliveryboysgh@gmail.com', now()), ('${charlie}', 'charlie@example.test', now()), ('${unverified}', 'unverified@example.test', null), ('${owner}', 'support.deliveryboysgh@gmail.com', now());
      insert into auth.identities values ('${alice}', 'google'), ('${bob}', 'google'), ('${charlie}', 'google'), ('${unverified}', 'google'), ('${owner}', 'google');
      insert into public.users (id) values ('alice-customer'), ('alice-rider'), ('bob-manager');
    `);
    await db.exec(migration);
    await db.exec(`insert into deliveryboys_private.account_identity_links
      (auth_user_id, app_user_id, app_role) values
      ('${alice}', 'alice-customer', 'customer'),
      ('${alice}', 'alice-rider', 'rider'),
      ('${bob}', 'bob-manager', 'manager');`);
    await db.exec(`set role authenticated; set "request.jwt.claim.sub" = '${alice}'; set "request.jwt.claims" = '{"app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';`);
    const result = await db.query('select * from public.my_deliveryboys_identities()');
    assert.deepEqual(result.rows, [
      { app_user_id: 'alice-customer', app_role: 'customer' },
      { app_user_id: 'alice-rider', app_role: 'rider' },
    ]);
    await assert.rejects(db.query("select * from public.register_google_profile('Alice')"), /already exists/);
    await assert.rejects(db.query('select * from deliveryboys_private.account_identity_links'), /permission denied/);
    await assert.rejects(db.query(`insert into deliveryboys_private.account_identity_links values ('${alice}', 'bob-manager', 'manager')`), /permission denied/);
    await db.exec(`set "request.jwt.claim.sub" = '${bob}';`);
    assert.deepEqual((await db.query('select * from public.my_deliveryboys_identities()')).rows,
      [{ app_user_id: 'bob-manager', app_role: 'manager' }]);
    await db.exec(`set "request.jwt.claims" = '{"app_metadata":{"provider":"email"},"amr":[{"method":"password"}]}';`);
    assert.deepEqual((await db.query('select * from public.my_deliveryboys_identities()')).rows, []);
    await db.exec(`set "request.jwt.claims" = '{"app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';`);
    await db.exec(`set "request.jwt.claim.sub" = '${unverified}';`);
    await assert.rejects(db.query("select * from public.register_google_profile('Unverified')"), /Verified Google identity required/);
    await db.exec(`set "request.jwt.claim.sub" = '${charlie}';`);
    const registered = await db.query("select * from public.register_google_profile('Charlie')");
    assert.equal(registered.rows[0].app_role, 'customer');
    assert.deepEqual((await db.query('select * from public.my_deliveryboys_identities()')).rows, registered.rows);
    await db.exec(`set "request.jwt.claim.sub" = '${owner}';`);
    const managerProfile = await db.query("select * from public.register_google_profile('Owner')");
    assert.equal(managerProfile.rows[0].app_role, 'manager');
    await db.exec(`set "request.jwt.claims" = '{"app_metadata":{"provider":"google"},"amr":[{"method":"password"}]}';`);
    assert.deepEqual((await db.query('select * from public.my_deliveryboys_identities()')).rows, []);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.my_deliveryboys_identities()'), /permission denied/);
  } finally {
    await db.close();
  }
});
