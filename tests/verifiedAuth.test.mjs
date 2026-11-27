import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedAuth } from '../src/lib/verifiedAuth.ts';
function mockClient() {
  const calls = [];
  const auth = {
    signInWithOAuth: async args => { calls.push(['oauth', args]); return { error: null }; },
    getUser: async () => ({ data: { user: { email_confirmed_at: 'yes' } }, error: null }),
  };
  return { calls, client: { auth, rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: [{ app_role: 'customer', app_user_id: 'customer-1' }], error: null }; } } };
}
test('Google sign-in and profile registration never send a role from the client', async () => {
  const { client, calls } = mockClient(); const api = createVerifiedAuth(client);
  await api.signInWithGoogle('https://example.test/auth/login');
  const identity = await api.registerGoogleProfile('Customer', '123');
  assert.deepEqual(identity, { app_role: 'customer', app_user_id: 'customer-1' });
  assert.deepEqual(calls[1][2], { p_name: 'Customer', p_phone: '123' });
  assert.equal(calls[0][1].provider, 'google');
});
test('unverified users cannot fetch identities or register a profile', async () => {
  const { client } = mockClient(); const api = createVerifiedAuth(client);
  client.auth.getUser = async () => ({ data: { user: { email_confirmed_at: null } }, error: null });
  assert.deepEqual(await api.getLinkedIdentities(), []);
  await assert.rejects(api.registerGoogleProfile('Person'), /verified Google/);
});
