import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedAuth } from '../src/lib/verifiedAuth.ts';

function mockClient() {
  const calls = [];
  const auth = {
    signInWithPassword: async args => { calls.push(['signIn', args]); return { data: { user: { email_confirmed_at: 'yes' } }, error: null }; },
    signOut: async () => { calls.push(['signOut']); },
    signUp: async args => { calls.push(['signUp', args]); return { error: null }; },
    verifyOtp: async args => { calls.push(['verifyOtp', args]); return { data: { session: {}, user: { email_confirmed_at: 'yes' } }, error: null }; },
    resend: async args => { calls.push(['resend', args]); return { error: null }; },
    resetPasswordForEmail: async (...args) => { calls.push(['reset', ...args]); return { error: null }; },
    signInWithOAuth: async args => { calls.push(['oauth', args]); return { error: null }; },
    getUser: async () => ({ data: { user: { email_confirmed_at: 'yes' } }, error: null }),
  };
  return { calls, client: { auth, rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: [{ app_role: args?.p_role || 'rider', app_user_id: 'rider-1' }], error: null }; } } };
}

test('signup uses password and verifies the Supabase signup code before profile creation', async () => {
  const { client, calls } = mockClient();
  const api = createVerifiedAuth(client);
  await assert.rejects(api.startEmailSignup('person@example.test', 'short'), /at least 8/);
  await api.startEmailSignup(' person@example.test ', 'long-password');
  await api.verifySignupCode('person@example.test', '12345678');
  const id = await api.registerProfile({ role: 'rider', name: 'Person', vehicleType: 'car', vehiclePlate: 'AA1' });
  assert.equal(id, 'rider-1');
  assert.deepEqual(calls.map(c => c[0]), ['signUp', 'verifyOtp', 'rpc']);
  assert.equal(calls[1][1].type, 'signup');
  assert.equal(calls[2][1], 'register_deliveryboys_profile');
  await assert.rejects(api.registerProfile({ role: 'manager', name: 'Person' }), /Invalid account role/);
});

test('verified identity comes from the server rather than an email or local role', async () => {
  const { client } = mockClient();
  const api = createVerifiedAuth(client);
  assert.equal(await api.getLinkedProfileId('rider'), 'rider-1');
  assert.equal(await api.getLinkedProfileId('manager'), null);
  client.auth.getUser = async () => ({ data: { user: { email_confirmed_at: null } }, error: null });
  assert.equal(await api.getLinkedProfileId('rider'), null);
  await assert.rejects(api.registerProfile({ role: 'customer', name: 'Person' }), /verified email/);
});

test('password login rejects unverified users and signs them out', async () => {
  const { client, calls } = mockClient();
  client.auth.signInWithPassword = async () => ({ data: { user: { email_confirmed_at: null } }, error: null });
  await assert.rejects(createVerifiedAuth(client).signIn('x@example.test', 'password'), /Verify your email/);
  assert.equal(calls[0][0], 'signOut');
});
