import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeeklyCommissionApi } from '../src/lib/weeklyCommissionApi.ts';

function mockClient() {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'rider-auth-id' } }, error: null }) },
    rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: [], error: null }; },
    storage: { from: (bucket) => ({
      upload: async (path, file, options) => { calls.push(['upload', bucket, path, file, options]); return { error: null }; },
      createSignedUrl: async (path, seconds) => { calls.push(['signed', bucket, path, seconds]); return { data: { signedUrl: 'signed-url' }, error: null }; },
    }) },
  };
  return { client, calls };
}

test('payment proof is uploaded privately before reporting the cycle', async () => {
  const { client, calls } = mockClient();
  const file = new File(['image'], 'proof.png', { type: 'image/png' });
  await createWeeklyCommissionApi(client).report('cycle-id', file);
  assert.equal(calls[0][0], 'upload');
  assert.equal(calls[0][1], 'commission-proofs');
  assert.match(calls[0][2], /^rider-auth-id\/[\da-f-]+\.png$/);
  assert.deepEqual(calls[1], ['rpc', 'report_commission_payment', { p_cycle_id: 'cycle-id', p_proof_path: calls[0][2] }]);
});

test('invalid proof never uploads or reports', async () => {
  const { client, calls } = mockClient();
  await assert.rejects(createWeeklyCommissionApi(client).report('cycle-id', new File(['x'], 'proof.txt', { type: 'text/plain' })), /JPEG/);
  assert.deepEqual(calls, []);
});

test('review and settings use the draft database function signatures', async () => {
  const { client, calls } = mockClient();
  const api = createWeeklyCommissionApi(client);
  await api.cycles(); await api.reviews();
  await api.review('cycle-id', true); await api.review('cycle-id', false);
  await api.reapprove('rider-id'); await api.setDeadlineDays(2);
  assert.equal(await api.proofUrl('rider-auth-id/proof.png'), 'signed-url');
  assert.deepEqual(calls, [
    ['rpc', 'my_commission_cycles', undefined], ['rpc', 'pending_commission_reviews', undefined],
    ['rpc', 'approve_commission_payment', { p_cycle_id: 'cycle-id' }],
    ['rpc', 'reject_commission_payment', { p_cycle_id: 'cycle-id' }],
    ['rpc', 'reapprove_commission_rider', { p_rider_id: 'rider-id' }],
    ['rpc', 'set_commission_deadline_days', { p_days: 2 }],
    ['signed', 'commission-proofs', 'rider-auth-id/proof.png', 60],
  ]);
  await assert.rejects(api.setDeadlineDays(0), /whole number/);
});

test('failed upload is not reported; RPC errors are surfaced', async () => {
  const { client, calls } = mockClient();
  client.storage.from = () => ({ upload: async () => ({ error: new Error('upload failed') }) });
  const api = createWeeklyCommissionApi(client);
  await assert.rejects(api.report('cycle-id', new File(['x'], 'proof.jpg', { type: 'image/jpeg' })), /upload failed/);
  assert.deepEqual(calls, []);
  client.rpc = async () => ({ data: null, error: new Error('denied') });
  await assert.rejects(api.review('cycle-id', true), /denied/);
});
