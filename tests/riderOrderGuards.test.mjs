import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const memory = new Map();
globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage };
globalThis.fetch = async () => ({ ok: true }); // Prevent all network access in this test.
const calls = [];
let authState = { user: null, allUsers: [] };
globalThis.__orderGuardTest = {
  auth: { getState: () => authState },
  supabase: { rpc: async (...args) => { calls.push(['rpc', ...args]); return { data: null, error: null }; } },
  sync: { broadcastOrderAccepted: (...args) => calls.push(['broadcast', ...args]) },
  notifications: { getState: () => ({ addNotification: () => {} }) },
};
const bundle = await build({
  entryPoints: ['src/stores/orderStore.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'order-mocks', setup(builder) {
    builder.onResolve({ filter: /^(\.\/(authStore|notificationStore|supabase)|\.\.\/lib\/(supabase|syncService|browserNotify)|\.\.\/components\/Toast)$/ }, args => ({ path: args.path, namespace: 'test-mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-mock' }, args => {
      const contents = args.path.endsWith('authStore') ? 'export const useAuthStore = globalThis.__orderGuardTest.auth;'
        : args.path.endsWith('notificationStore') ? 'export const useNotificationStore = globalThis.__orderGuardTest.notifications;'
        : args.path.endsWith('supabase') ? 'export default globalThis.__orderGuardTest.supabase;'
        : args.path.endsWith('syncService') ? 'export const syncService = globalThis.__orderGuardTest.sync; export const rowToOrder = x => x;'
        : args.path.endsWith('browserNotify') ? 'export const fireBrowserNotification = () => {};'
        : 'export const showToast = () => {};';
      return { contents, loader: 'js' };
    });
  } }],
});
const { useOrderStore } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const rider = (status, overrides = {}) => ({ id: 'rider', role: 'rider', name: 'Real Rider', status, availability: 'online', location: { lat: 5.6, lng: -0.2 }, ...overrides });
const order = () => ({ id: 'order', displayCode: 'DB-1', customerId: 'customer', status: 'pending', pickup: { lat: 5.6, lng: -0.2, address: 'A' }, dropoff: { lat: 5.7, lng: -0.2, address: 'B' } });

beforeEach(() => {
  calls.length = 0;
  authState = { user: null, allUsers: [] };
  useOrderStore.setState({ orders: [order()] });
});

test('pending, rejected, suspended, non-riders and mismatched rider IDs cannot accept locally or via secure RPC', async () => {
  for (const status of ['pending', 'rejected', 'suspended', undefined]) {
    authState = { user: rider(status), allUsers: [rider(status)] };
    assert.equal(useOrderStore.getState().acceptOrder('order', 'rider', 'Imposter'), false);
    await assert.rejects(useOrderStore.getState().acceptOrderSecure('order'), /approval/);
  }
  authState = { user: { id: 'rider', role: 'customer' }, allUsers: [] };
  assert.equal(useOrderStore.getState().acceptOrder('order', 'rider', 'Name'), false);
  authState = { user: rider('approved'), allUsers: [rider('approved')] };
  assert.equal(useOrderStore.getState().acceptOrder('order', 'someone-else', 'Name'), false);
  assert.equal(useOrderStore.getState().orders[0].status, 'pending');
  assert.deepEqual(calls, []);
});

test('an approved rider can still accept and only approved online riders are dispatched', () => {
  const approved = rider('approved');
  authState = { user: approved, allUsers: [approved, rider('pending', { id: 'pending' }), rider('suspended', { id: 'suspended' })] };
  assert.deepEqual(useOrderStore.getState().getRankedRidersForOrder(order()).map(r => r.id), ['rider']);
  assert.equal(useOrderStore.getState().acceptOrder('order', 'rider', 'Real Rider'), true);
  assert.equal(useOrderStore.getState().orders[0].status, 'accepted');
  assert.equal(calls[0][0], 'broadcast');
});
