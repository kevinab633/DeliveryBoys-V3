import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailPasswordAuth } from '../src/lib/emailPasswordAuth.ts';

test('email auth does not accept or send an application role', async () => {
  const calls = [];
  const auth = createEmailPasswordAuth({ auth: {
    signUp: async x => { calls.push(['signup', x]); return { data: { session: null }, error: null }; },
    signInWithPassword: async x => { calls.push(['signin', x]); return { data: {}, error: null }; },
    resetPasswordForEmail: async (email, options) => { calls.push(['reset', email, options]); return { data: {}, error: null }; },
  } });
  const generatedValue = crypto.randomUUID();
  await auth.signUp(' Customer@Example.test ', generatedValue, 'https://example.test/auth/login', 'Typed Name');
  await auth.signIn(' Customer@Example.test ', generatedValue);
  await auth.resetPassword(' Customer@Example.test ', 'https://example.test/auth/reset');
  assert.deepEqual(calls, [
    ['signup', { email: 'customer@example.test', password: generatedValue, options: { emailRedirectTo: 'https://example.test/auth/login', data: { full_name: 'Typed Name' } } }],
    ['signin', { email: 'customer@example.test', password: generatedValue }],
    ['reset', 'customer@example.test', { redirectTo: 'https://example.test/auth/reset' }],
  ]);
});

test('manager email is not accepted by client email/password flows', async () => {
  const auth = createEmailPasswordAuth({ auth: {} });
  const generatedValue = crypto.randomUUID();
  await assert.rejects(auth.signUp('SUPPORT.DELIVERYBOYSGH@GMAIL.COM', generatedValue, 'https://example.test', 'Name'), /Google/);
  await assert.rejects(auth.signIn('support.deliveryboysgh@gmail.com', generatedValue), /Google/);
  await assert.rejects(auth.resetPassword('support.deliveryboysgh@gmail.com', 'https://example.test'), /Google/);
});
