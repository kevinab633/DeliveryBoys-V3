import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSecureOrderAcceptance } from '../src/lib/secureOrderAcceptance.ts';

test('sends only order id and requires server-confirmed assignment', async () => {
  const calls = [];
  const client = { rpc: async (name, payload) => { calls.push([name,payload]); return { data: { id: 'order', rider_id: 'rider', status: 'accepted' }, error: null }; } };
  assert.equal((await requestSecureOrderAcceptance(client,'order','rider')).status, 'accepted');
  assert.deepEqual(calls, [['accept_delivery_order', { p_order_id: 'order' }]]);
  client.rpc = async () => ({ data: { id:'order', rider_id:'other', status:'accepted' }, error:null });
  await assert.rejects(requestSecureOrderAcceptance(client,'order','rider'), /did not confirm/);
  client.rpc = async () => ({ data: null, error: { message:'Overdue commission' } });
  await assert.rejects(requestSecureOrderAcceptance(client,'order','rider'), /Overdue commission/);
});
