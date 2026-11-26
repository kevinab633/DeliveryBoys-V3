import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { runCommissionJobs } from '../api/commission-jobs.js';

test('maintenance removes before acknowledging and preserves failures for retry', async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => { calls.push([name, args]); return { data: name === 'cron_pending_storage_deletions' ? [{ bucket: 'commission-proofs', path: 'proof' }] : 1, error: null }; },
    storage: { from: bucket => ({ remove: async paths => { calls.push(['remove', bucket, paths]); return { error: null }; } }) },
  };
  assert.deepEqual(await runCommissionJobs(client), { created: 1, removed: 1 });
  assert.deepEqual(calls.map(c => c[0]), ['cron_prepare_commission_cycles','cron_pending_storage_deletions','remove','cron_ack_storage_deletion']);
  calls.length = 0;
  client.storage.from = () => ({ remove: async () => ({ error: new Error('storage failed') }) });
  await assert.rejects(runCommissionJobs(client), /storage failed/);
  assert.equal(calls.some(c => c[0] === 'cron_ack_storage_deletion'), false);
});

test('maintenance endpoint rejects missing or invalid secret without connecting to database', async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  try {
    const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { return body; } };
    await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res);
    assert.equal(res.statusCode, 401);
    await handler({ method: 'POST', headers: {} }, res);
    assert.equal(res.statusCode, 405);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
  }
});
