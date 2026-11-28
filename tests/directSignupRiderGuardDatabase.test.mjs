import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const signupSql = await readFile(new URL('../supabase/drafts/20261206_direct_signup_server_role.sql', import.meta.url), 'utf8');
const guardSql = await readFile(new URL('../supabase/drafts/20261206_rider_access_server_guard.sql', import.meta.url), 'utf8');
const riderId = '11111111-1111-4111-8111-111111111111';
const managerId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const order1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const order2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const googleJwt = '{"app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';

test('draft server assigns fixed signup roles and enforces verified approval for availability and assignment', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon, authenticated, service_role;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create table auth.identities(user_id uuid,provider text);
      create table public.users(id text primary key,role text not null,name text not null,email text,phone text,verified boolean,
        auth_user_id uuid unique,created_at timestamptz default now(),updated_at timestamptz default now(),status text,availability text,
        vehicle_type text,vehicle_plate text,total_deliveries numeric,rating numeric,earnings numeric,national_id_url text,photo_url text);
      create table public.orders(id uuid primary key,rider_id text,rider_name text,status text);
      grant select,insert,update on public.users,public.orders to anon,authenticated,service_role;
      insert into auth.users values ('${riderId}','rider@example.test',now()),('${managerId}','support.deliveryboysgh@gmail.com',now()),('${otherId}','other@example.test',now());
      insert into auth.identities values ('${managerId}','google'),('${riderId}','google');
      insert into public.users(id,role,name,email,verified,auth_user_id,status,availability) values
        ('manager','manager','Manager','support.deliveryboysgh@gmail.com',true,'${managerId}',null,null),
        ('rider','rider','Actual Rider','rider@example.test',true,'${riderId}','pending','offline'),
        ('other','rider','Other Rider','other@example.test',true,'${otherId}','approved','offline'),
        ('support-customer','customer','Existing Customer','support.deliveryboysgh@gmail.com',true,null,null,null);
      insert into public.orders(id,status) values ('${order1}','pending'),('${order2}','pending');`);
    await db.exec(signupSql);
    await db.exec(guardSql);

    await db.exec('set role anon');
    const customer = (await db.query("select id,role,email,verified from public.register_direct_customer('  Ada  ','ADA@example.test',null)")).rows[0];
    assert.equal(customer.role, 'customer');
    assert.equal(customer.email, 'ada@example.test');
    assert.equal(customer.verified, false);
    const applied = (await db.query("select id,role,status,availability from public.register_direct_rider('Rider','ADA@example.test',null,'car',' AA-1 ',null,null)")).rows[0];
    assert.equal(applied.role, 'rider');
    assert.equal(applied.status, 'pending');
    assert.equal(applied.availability, 'offline');
    await assert.rejects(db.query("select * from public.register_direct_customer('Ada','ada@EXAMPLE.test',null)"), /already exists/);
    await assert.rejects(db.query("select * from public.register_direct_customer('Manager','SUPPORT.DELIVERYBOYSGH@GMAIL.COM',null)"), /Manager email/);
    await assert.rejects(db.query("select * from public.register_direct_rider('Manager','support.deliveryboysgh@gmail.com',null,'car','X',null,null)"), /Manager email/);
    await assert.rejects(db.query("select * from deliveryboys_private.register_direct_signup('manager','X','x@example.test',null,null,null,null,null)"), /permission denied/);
    await assert.rejects(db.query("insert into public.users(id,role,name) values('evil','manager','Evil')"), /server registration/);
    await assert.rejects(db.query("update public.users set role='manager' where id='rider'"), /server controlled/);
    await assert.rejects(db.query(`update public.orders set status='accepted',rider_id='rider' where id='${order1}'`), /Verified rider identity/);

    await db.exec(`reset role; set role authenticated; set "request.jwt.claim.sub"='${riderId}'; set "request.jwt.claims"='${googleJwt}';`);
    await assert.rejects(db.query("update public.users set status='approved' where id='rider'"), /server controlled/);
    await assert.rejects(db.query("update public.users set availability='online' where id='rider'"), /approval required/);
    await assert.rejects(db.query(`update public.orders set status='accepted',rider_id='rider' where id='${order1}'`), /Approved linked rider/);
    await assert.rejects(db.query("select public.review_direct_rider('rider','approved')"), /Verified manager/);
    await assert.rejects(db.query("update public.users set availability='online' where id='other'"), /Verified rider identity/);

    await db.exec(`set "request.jwt.claim.sub"='${managerId}'; set "request.jwt.claims"='{"app_metadata":{"provider":"google"},"amr":[{"method":"password"}]}';`);
    await assert.rejects(db.query("select public.review_direct_rider('rider','approved')"), /Verified manager/);
    await db.exec(`set "request.jwt.claims"='${googleJwt}';`);
    await db.query("select public.review_direct_rider('rider','approved')");
    await db.exec(`set "request.jwt.claim.sub"='${riderId}';`);
    await db.query("update public.users set availability='online' where id='rider'");
    await db.query(`update public.orders set status='accepted',rider_id='rider',rider_name='Spoofed' where id='${order1}'`);
    const assigned = (await db.query(`select rider_id,rider_name,status from public.orders where id='${order1}'`)).rows[0];
    assert.deepEqual(assigned, { rider_id: 'rider', rider_name: 'Actual Rider', status: 'accepted' });

    await db.exec(`set "request.jwt.claim.sub"='${managerId}';`);
    await db.query("select public.review_direct_rider('rider','suspended')");
    assert.equal((await db.query("select availability from public.users where id='rider'")).rows[0].availability, 'offline');
    await db.exec(`set "request.jwt.claim.sub"='${riderId}';`);
    await assert.rejects(db.query("update public.users set availability='busy' where id='rider'"), /approval required/);
    await assert.rejects(db.query(`update public.orders set status='accepted',rider_id='rider' where id='${order2}'`), /Approved linked rider/);
    // Previously assigned orders may continue; no duplicate or historical rows are deleted.
    await db.query(`update public.orders set status='picked_up' where id='${order1}'`);
    await db.exec('reset role; set role service_role; set "request.jwt.claim.sub"=\'\';');
    await assert.rejects(db.query(`update public.orders set status='accepted',rider_id='other' where id='${order2}'`), /Verified rider identity/);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int as n from public.users where lower(email)='support.deliveryboysgh@gmail.com'")).rows[0].n, 2);
    assert.equal((await db.query(`select status from public.orders where id='${order2}'`)).rows[0].status, 'pending');
  } finally { await db.close(); }
});
