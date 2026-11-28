import test from 'node:test';
import assert from 'node:assert/strict';
import { findContactRow } from '../src/lib/contactLookup.ts';

function clientFor(rows, error = null) {
  const calls = [];
  const filters = [];
  const orders = [];
  const query = {
    select: (...args) => { calls.push(['select', ...args]); return query; },
    eq: (key, value) => { calls.push(['eq', key, value]); filters.push(row => row[key] === value); return query; },
    ilike: (key, pattern) => {
      calls.push(['ilike', key, pattern]);
      const literal = pattern.replace(/\\(.)/g, '$1').toLowerCase();
      filters.push(row => typeof row[key] === 'string' && row[key].toLowerCase() === literal);
      return query;
    },
    order: (key, options) => { calls.push(['order', key, options]); orders.push(key); return query; },
    limit: async value => {
      calls.push(['limit', value]);
      const result = rows.filter(row => filters.every(filter => filter(row))).sort((a, b) => {
        for (const key of orders) {
          if (a[key] == null && b[key] != null) return 1;
          if (a[key] != null && b[key] == null) return -1;
          const cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
          if (cmp) return cmp;
        }
        return 0;
      });
      return { data: result.slice(0, value), count: result.length, error };
    },
  };
  return { client: { from: table => { calls.push(['from', table]); return query; } }, calls };
}

const row = (id, role, email, created_at, phone = null) => ({ id, role, email, phone, created_at });

test('duplicate rows are reported and the oldest, id-tiebroken row is selected without deletion', async () => {
  const rows = [
    row('z', 'customer', 'Same@Example.test', null),
    row('b', 'customer', 'SAME@example.test', '2025-01-01'),
    row('a', 'customer', 'same@example.test', '2025-01-01'),
    row('manager', 'manager', 'same@example.test', '2020-01-01'),
  ];
  const { client, calls } = clientFor(rows);
  const reports = [];
  const found = await findContactRow(client, ' SAME@example.test ', 'email', 'customer', details => reports.push(details));
  assert.equal(found.id, 'a');
  assert.deepEqual(reports, [{ method: 'email', role: 'customer', count: 3, selectedId: 'a', sampleIds: ['a', 'b'] }]);
  assert.deepEqual(calls.filter(c => c[0] === 'order'), [
    ['order', 'created_at', { ascending: true, nullsFirst: false }], ['order', 'id', { ascending: true }],
  ]);
  assert.deepEqual(calls.find(c => c[0] === 'select'), ['select', '*', { count: 'exact' }]);
  assert.equal(rows.length, 4);
});

test('role-scoped lookup does not turn a manager into a customer', async () => {
  const manager = row('manager', 'manager', 'support.deliveryboysgh@gmail.com', '2020-01-01');
  let context = clientFor([manager]);
  assert.equal(await findContactRow(context.client, manager.email, 'email', 'customer'), null);
  context = clientFor([manager, row('customer', 'customer', manager.email, '2022-01-01')]);
  assert.equal((await findContactRow(context.client, manager.email.toUpperCase(), 'email', 'customer')).id, 'customer');
});

test('email LIKE metacharacters are escaped, asterisk uses exact equality, and phone is exact', async () => {
  const special = row('a', 'customer', 'user_100%@example.test', '2020');
  const { client, calls } = clientFor([special]);
  assert.equal((await findContactRow(client, special.email, 'email', 'customer')).id, 'a');
  assert.equal(calls.find(c => c[0] === 'ilike')[2], 'user\\_100\\%@example.test');
  const star = clientFor([row('star', 'customer', 'star*@example.test', '2020')]);
  assert.equal((await findContactRow(star.client, 'star*@example.test', 'email', 'customer')).id, 'star');
  assert.ok(star.calls.some(c => c[0] === 'eq' && c[1] === 'email'));
  const phone = clientFor([row('phone', 'rider', null, '2020', '+233201234567')]);
  assert.equal((await findContactRow(phone.client, ' +233201234567 ', 'phone', 'rider')).id, 'phone');
});

test('lookup errors are not misreported as missing accounts', async () => {
  const { client } = clientFor([], { message: 'database unavailable' });
  await assert.rejects(findContactRow(client, 'a@example.test', 'email', 'customer'), /lookup is unavailable/i);
});
