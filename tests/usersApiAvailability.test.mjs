import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const calls = [];
let response = { data: null, error: null };
const query = {
  update: patch => { calls.push(['update', patch]); return query; },
  eq: (key, value) => { calls.push(['eq', key, value]); return query; },
  select: value => { calls.push(['select', value]); return query; },
  maybeSingle: async () => response,
};
globalThis.__usersApiClient = { from: table => { calls.push(['from', table]); return query; } };
const bundle = await build({
  entryPoints: ['src/lib/usersApi.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'supabase-mock', setup(builder) {
    builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export default globalThis.__usersApiClient;', loader: 'js' }));
  } }],
});
const { usersApi } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const row = (status, availability) => ({ id: 'r', name: 'Rider', role: 'rider', status, availability, vehicle_type: 'car', created_at: '2025-01-01' });

test('online and busy writes are conditional on an approved rider row', async () => {
  for (const availability of ['online', 'busy']) {
    calls.length = 0; response = { data: row('approved', availability), error: null };
    assert.equal((await usersApi.setRiderAvailability('r', availability)).availability, availability);
    assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === 'r'));
    assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'role' && c[2] === 'rider'));
    assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'status' && c[2] === 'approved'));
  }
  calls.length = 0; response = { data: row('pending', 'offline'), error: null };
  assert.equal((await usersApi.setRiderAvailability('r', 'offline')).availability, 'offline');
  assert.ok(!calls.some(c => c[0] === 'eq' && c[1] === 'status'));
});

test('stale online values on non-approved rows are displayed offline, and write errors propagate', async () => {
  for (const status of ['pending', 'rejected', 'suspended', null]) {
    response = { data: row(status, 'online'), error: null };
    assert.equal((await usersApi.fetchById('r')).availability, 'offline');
  }
  response = { data: null, error: new Error('network failure') };
  await assert.rejects(usersApi.setRiderAvailability('r', 'online'), /network failure/);
});
