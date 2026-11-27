import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkedAccount } from '../src/lib/linkedAccount.ts';

const profile = { id: 'profile-1', name: 'Test', role: 'customer', createdAt: 0, verified: true };
test('links using the current session without sending role or email', async () => {
  const calls = [];
  const link = createLinkedAccount({ client: { rpc: async (...args) => { calls.push(args); return { data: [{ result: 'linked', user_id: profile.id }], error: null }; } }, fetchById: async id => id === profile.id ? profile : null });
  assert.equal(await link(), profile);
  assert.deepEqual(calls, [['link_auth_user']]);
});
test('duplicate accounts are not guessed and no profile is read', async () => {
  let fetched = false;
  const link = createLinkedAccount({ client: { rpc: async () => ({ data: [{ result: 'account needs review', user_id: null }], error: null }) }, fetchById: async () => { fetched = true; return profile; } });
  await assert.rejects(link(), /account needs review/i);
  assert.equal(fetched, false);
});
test('propagates server errors and refuses malformed or missing profiles', async () => {
  const error = new Error('unauthenticated');
  await assert.rejects(createLinkedAccount({ client: { rpc: async () => ({ error }) }, fetchById: async () => profile })(), /unauthenticated/);
  await assert.rejects(createLinkedAccount({ client: { rpc: async () => ({ data: [{ result: 'linked', user_id: 'other' }], error: null }) }, fetchById: async () => profile })(), /profile is unavailable/i);
  await assert.rejects(createLinkedAccount({ client: { rpc: async () => ({ data: [], error: null }) }, fetchById: async () => profile })(), /Unable to link/);
});
