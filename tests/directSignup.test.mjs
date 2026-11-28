import test from 'node:test';
import assert from 'node:assert/strict';
import { requestCustomerSignup, requestRiderSignup } from '../src/lib/directSignup.ts';

function mockClient(response) {
  const calls = [];
  return { calls, client: { rpc: async (name, params) => { calls.push([name, params]); return response; } } };
}

test('customer signup sends no role, id, verification, approval, or availability', async () => {
  const { client, calls } = mockClient({ data: [{ id: 'server-id', role: 'customer' }], error: null });
  const row = await requestCustomerSignup(client, { name: 'Ada', email: 'a@example.test', role: 'manager', id: 'spoofed' });
  assert.equal(row.id, 'server-id');
  assert.deepEqual(calls, [['register_direct_customer', { p_name: 'Ada', p_email: 'a@example.test', p_phone: null }]]);
});

test('rider signup sends application details, not a role or approval status', async () => {
  const { client, calls } = mockClient({ data: [{ id: 'rider', role: 'rider', status: 'pending', availability: 'offline' }], error: null });
  await requestRiderSignup(client, {
    name: 'Rider', email: 'r@example.test', phone: '+2332', vehicleType: 'car', vehiclePlate: 'AA-1',
    nationalIdUrl: '', photoUrl: '', role: 'manager', status: 'approved', availability: 'online',
  });
  assert.deepEqual(calls, [['register_direct_rider', {
    p_name: 'Rider', p_email: 'r@example.test', p_phone: '+2332', p_vehicle_type: 'car',
    p_vehicle_plate: 'AA-1', p_national_id_url: null, p_photo_url: null,
  }]]);
});

test('unavailable, duplicate, unexpected role, and non-pending server replies fail closed', async () => {
  let mock = mockClient({ data: null, error: { code: 'PGRST202' } });
  await assert.rejects(requestCustomerSignup(mock.client, { name: 'A' }), /temporarily unavailable/);
  mock = mockClient({ data: null, error: { code: '23505' } });
  await assert.rejects(requestCustomerSignup(mock.client, { name: 'A' }), /already exists/);
  mock = mockClient({ data: [{ id: 'x', role: 'manager' }], error: null });
  await assert.rejects(requestCustomerSignup(mock.client, { name: 'A' }), /could not be confirmed/);
  mock = mockClient({ data: [{ id: 'x', role: 'rider', status: 'approved', availability: 'online' }], error: null });
  await assert.rejects(requestRiderSignup(mock.client, { name: 'A', vehicleType: 'car', vehiclePlate: '1', nationalIdUrl: '', photoUrl: '' }), /could not be confirmed/);
});
