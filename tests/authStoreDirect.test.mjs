import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key),
};
globalThis.window = { localStorage: globalThis.localStorage };
const calls = [];
const api = {};
const theme = { getState: () => ({ setTheme: value => calls.push(['theme', value]) }) };
globalThis.__directAuthTest = { api, theme, supabase: { auth: { signOut: async () => ({ error: null }) } } };
const bundle = await build({
  entryPoints: ['src/stores/authStore.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'auth-test-mocks', setup(builder) {
    builder.onResolve({ filter: /^(\.\.\/lib\/(usersApi|supabase)|\.\/themeStore)$/ }, args => ({ path: args.path, namespace: 'test-mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-mock' }, args => ({ contents:
      args.path.endsWith('usersApi') ? 'export const usersApi = globalThis.__directAuthTest.api;'
        : args.path.endsWith('themeStore') ? 'export const useThemeStore = globalThis.__directAuthTest.theme;'
        : 'export default globalThis.__directAuthTest.supabase;', loader: 'js' }));
  } }],
});
const { useAuthStore } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const customer = (overrides = {}) => ({ id: 'customer-1', name: 'Current Name', email: 'customer@example.test', role: 'customer', createdAt: 1, verified: true, ...overrides });
const rider = (overrides = {}) => ({ id: 'rider-1', name: 'Rider Name', email: 'rider@example.test', role: 'rider', status: 'pending', availability: 'offline', vehicleType: 'car', vehiclePlate: 'ABC', totalDeliveries: 0, rating: 0, earnings: 0, createdAt: 1, verified: true, ...overrides });

beforeEach(() => {
  calls.length = 0;
  Object.assign(api, {
    findByContact: async (...args) => { calls.push(['find', ...args]); return null; },
    fetchById: async id => { calls.push(['fetch', id]); return null; },
    fetchAll: async () => [],
    update: async (...args) => { calls.push(['update', ...args]); },
    upsert: async (...args) => { calls.push(['upsert', ...args]); },
    registerCustomer: async data => { calls.push(['registerCustomer', data]); return customer(data); },
    registerRider: async data => { calls.push(['registerRider', data]); return rider(data); },
    setRiderAvailability: async (...args) => { calls.push(['availability', ...args]); return null; },
  });
  useAuthStore.setState({ user: null, allUsers: [], usersLoaded: true, otpPending: null });
});

test('direct sign-in never falls back to local/demo users or creates an account', async () => {
  const demo = rider({ id: 'rider-001', status: 'approved', email: 'kwame@test.com' });
  useAuthStore.setState({ allUsers: [demo], user: demo });
  assert.equal(await useAuthStore.getState().loginDirect('kwame@test.com', 'rider'), false);
  assert.equal(useAuthStore.getState().user, null);
  assert.deepEqual(calls, [['find', 'kwame@test.com', 'email', 'rider']]);
  api.findByContact = async () => { throw new Error('offline'); };
  await assert.rejects(useAuthStore.getState().loginDirect('kwame@test.com', 'rider'), /offline/);
  assert.equal(useAuthStore.getState().user, null);
  assert.ok(!calls.some(c => c[0] === 'upsert' || c[0] === 'update'));
});

test('support manager cannot become a customer without a customer row; a real row is allowed', async () => {
  const email = 'support.deliveryboysgh@gmail.com';
  const manager = customer({ id: 'manager', role: 'manager', email });
  useAuthStore.setState({ allUsers: [manager, customer({ id: 'fake', email })] });
  assert.equal(await useAuthStore.getState().loginDirect(email, 'customer'), false);
  assert.equal(useAuthStore.getState().user, null);
  const existing = customer({ id: 'real-customer', email, name: 'Real Customer' });
  api.findByContact = async (contact, method, role) => role === 'customer' ? existing : manager;
  api.fetchById = async () => existing;
  assert.equal(await useAuthStore.getState().loginDirect(email.toUpperCase(), 'customer'), true);
  assert.equal(useAuthStore.getState().user.id, 'real-customer');
  assert.equal(useAuthStore.getState().user.role, 'customer');
});

test('customer sign-in refreshes and replaces the cached profile; it never upserts', async () => {
  const stale = customer({ name: 'Old Name' });
  const fresh = customer({ name: 'Newest Name' });
  useAuthStore.setState({ allUsers: [stale] });
  api.findByContact = async (...args) => { calls.push(['find', ...args]); return stale; };
  api.fetchById = async id => { calls.push(['fetch', id]); return fresh; };
  assert.equal(await useAuthStore.getState().loginDirect('  customer@example.test  ', 'customer'), true);
  assert.equal(useAuthStore.getState().user.name, 'Newest Name');
  assert.equal(useAuthStore.getState().allUsers.find(u => u.id === stale.id).name, 'Newest Name');
  assert.deepEqual(calls, [['find', 'customer@example.test', 'email', 'customer'], ['fetch', stale.id]]);
  api.fetchById = async () => customer({ email: 'different@example.test' });
  assert.equal(await useAuthStore.getState().loginDirect('customer@example.test', 'customer'), false);
  assert.equal(useAuthStore.getState().user, null);
});

test('pending rider signs in but a fresh pending/rejected status blocks online and busy', async () => {
  const pending = rider({ availability: 'online' });
  api.findByContact = async () => pending;
  api.fetchById = async () => pending;
  assert.equal(await useAuthStore.getState().loginDirect('rider@example.test', 'rider'), true);
  assert.equal(useAuthStore.getState().user.status, 'pending');
  assert.equal(await useAuthStore.getState().setRiderAvailability('online'), false);
  assert.equal(await useAuthStore.getState().setRiderAvailability('busy'), false);
  assert.ok(!calls.some(c => c[0] === 'availability'));
  api.fetchById = async () => rider({ status: 'rejected' });
  assert.equal(await useAuthStore.getState().setRiderAvailability('online'), false);
  assert.equal(useAuthStore.getState().user.status, 'rejected');
});

test('approved availability requires a fresh row and a server-confirmed conditional write', async () => {
  const stale = rider({ status: 'approved' });
  useAuthStore.setState({ user: stale, allUsers: [stale] });
  api.fetchById = async () => rider({ status: 'suspended' });
  assert.equal(await useAuthStore.getState().setRiderAvailability('online'), false);
  assert.equal(useAuthStore.getState().user.status, 'suspended');
  api.fetchById = async () => rider({ status: 'approved' });
  api.setRiderAvailability = async (id, availability) => { calls.push(['availability', id, availability]); return rider({ status: 'approved', availability }); };
  assert.equal(await useAuthStore.getState().setRiderAvailability('online'), true);
  assert.deepEqual(calls.at(-1), ['availability', 'rider-1', 'online']);
  assert.equal(useAuthStore.getState().user.availability, 'online');
  api.fetchById = async () => { const error = new Error('offline'); error.stack = 'offline'; throw error; };
  assert.equal(await useAuthStore.getState().setRiderAvailability('busy'), false);
});

test('a conditional availability write rejected after approval changes fails closed and refreshes', async () => {
  const stale = rider({ status: 'approved' });
  useAuthStore.setState({ user: stale, allUsers: [stale] });
  let reads = 0;
  api.fetchById = async () => ++reads === 1 ? stale : rider({ status: 'suspended' });
  api.setRiderAvailability = async () => null;
  assert.equal(await useAuthStore.getState().setRiderAvailability('online'), false);
  assert.equal(reads, 2);
  assert.equal(useAuthStore.getState().user.status, 'suspended');
  assert.equal(useAuthStore.getState().user.availability, 'offline');
});

test('signup uses only server-confirmed profiles and never lets the role input grant manager', async () => {
  await assert.rejects(useAuthStore.getState().signupDirect({ name: 'X', role: 'manager' }), /appropriate sign-up/);
  assert.deepEqual(calls, []);
  api.registerCustomer = async () => { throw new Error('server unavailable'); };
  await assert.rejects(useAuthStore.getState().signupDirect({ name: 'X', role: 'customer' }), /unavailable/);
  assert.equal(useAuthStore.getState().user, null);
  api.registerCustomer = async data => { calls.push(['registerCustomer', data]); return customer(data); };
  await useAuthStore.getState().signupDirect({ name: 'Customer', email: 'c@example.test', role: 'customer' });
  assert.deepEqual(calls[0], ['registerCustomer', { name: 'Customer', email: 'c@example.test', phone: undefined }]);
  await useAuthStore.getState().signupRiderDirect({ name: 'Rider', email: 'r@example.test', vehicleType: 'car', vehiclePlate: 'ABC', nationalIdUrl: '', photoUrl: '' });
  assert.equal(useAuthStore.getState().user.role, 'rider');
  assert.equal(useAuthStore.getState().user.status, 'pending');
  assert.deepEqual(calls.at(-1), ['theme', 'light']);
  assert.ok(!calls.some(c => c[0] === 'upsert'));
});

test('an old direct sign-in cannot overwrite a newer sign-in or revive a logged-out session', async () => {
  let resolveFirst;
  api.findByContact = contact => contact === 'first@example.test'
    ? new Promise(resolve => { resolveFirst = resolve; })
    : Promise.resolve(rider({ email: 'second@example.test' }));
  const first = useAuthStore.getState().loginDirect('first@example.test', 'rider');
  assert.equal(await useAuthStore.getState().loginDirect('second@example.test', 'rider'), true);
  resolveFirst(rider({ email: 'first@example.test' }));
  assert.equal(await first, false);
  assert.equal(useAuthStore.getState().user.email, 'second@example.test');
  const next = useAuthStore.getState().loginDirect('first@example.test', 'rider');
  useAuthStore.getState().logout();
  resolveFirst(rider({ email: 'first@example.test' }));
  assert.equal(await next, false);
  assert.equal(useAuthStore.getState().user, null);
});

test('profile editing preserves role and approval while still updating normal fields', () => {
  const pending = rider();
  useAuthStore.setState({ user: pending, allUsers: [pending] });
  useAuthStore.getState().updateProfile({ name: 'Edited Rider', role: 'manager', status: 'approved', id: 'other' });
  assert.equal(useAuthStore.getState().user.name, 'Edited Rider');
  assert.equal(useAuthStore.getState().user.id, 'rider-1');
  assert.equal(useAuthStore.getState().user.role, 'rider');
  assert.equal(useAuthStore.getState().user.status, 'pending');
  assert.deepEqual(calls, [['update', 'rider-1', { name: 'Edited Rider' }]]);
  useAuthStore.getState().addContact('phone', '+2332');
  assert.deepEqual(calls.at(-1), ['update', 'rider-1', { phone: '+2332' }]);
});

test('refresh invalidates missing or role-changed saved profiles and cannot undo logout', async () => {
  const saved = customer();
  useAuthStore.setState({ user: saved, allUsers: [saved] });
  api.fetchById = async () => null;
  assert.equal(await useAuthStore.getState().refreshCurrentUser(), null);
  assert.equal(useAuthStore.getState().user, null);
  useAuthStore.setState({ user: saved });
  api.fetchById = async () => customer({ role: 'manager' });
  assert.equal(await useAuthStore.getState().refreshCurrentUser(), null);
  assert.equal(useAuthStore.getState().user, null);
  let resolve;
  api.fetchById = () => new Promise(r => { resolve = r; });
  useAuthStore.setState({ user: saved });
  const refresh = useAuthStore.getState().refreshCurrentUser();
  useAuthStore.getState().logout();
  resolve(saved);
  assert.equal(await refresh, null);
  assert.equal(useAuthStore.getState().user, null);
});
