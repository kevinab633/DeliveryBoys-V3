import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const rider = status => ({ id: 'r', role: 'rider', name: 'Rider Name', status, availability: 'offline', vehicleType: 'car', vehiclePlate: 'ABC', totalDeliveries: 0, rating: 0, earnings: 0, createdAt: 1 });
globalThis.__uiTest = {
  auth: { user: null, loginDirect: async () => false, signupDirect: async () => {}, signupRiderDirect: async () => {}, refreshCurrentUser: async () => null, setRiderAvailability: async () => false, updateRiderLocation: () => {}, persistRiderLocation: () => {} },
  orders: { orders: [], getPendingOrders: () => [], getOrdersByRider: () => [], fetchOrders: async () => {}, acceptOrder: () => false, acceptOrderSecure: async () => false, updateOrderStatus: () => {} },
};
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MemoryRouter } from 'react-router-dom';
    import { LoginPage, SignupPage } from './src/pages/Auth';
    import RiderDashboard from './src/pages/RiderDashboard';
    export function renderPage(page, route) {
      const Component = page === 'login' ? LoginPage : page === 'signup' ? SignupPage : RiderDashboard;
      return renderToStaticMarkup(React.createElement(MemoryRouter, {initialEntries: [route]}, React.createElement(Component)));
    }
  ` },
  bundle: true, platform: 'node', format: 'esm', write: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(process.cwd() + '/package.json');" },
  plugins: [{ name: 'ui-test-mocks', setup(builder) {
    builder.onResolve({ filter: /^\.\.\/(stores\/(authStore|orderStore|themeStore)|lib\/(supabase|syncService)|components\/(MapView|CommissionCard|Toast))$/ }, args => ({ path: args.path, namespace: 'test-mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-mock' }, args => {
      const contents = args.path.endsWith('authStore')
        ? 'export const useAuthStore = selector => selector ? selector(globalThis.__uiTest.auth) : globalThis.__uiTest.auth; useAuthStore.getState = () => globalThis.__uiTest.auth;'
        : args.path.endsWith('orderStore')
        ? 'export const useOrderStore = selector => selector ? selector(globalThis.__uiTest.orders) : globalThis.__uiTest.orders; useOrderStore.getState = () => globalThis.__uiTest.orders;'
        : args.path.endsWith('themeStore') ? "export const useThemeStore = selector => selector({theme:'light'});"
        : args.path.endsWith('supabase') ? 'export default {auth:{}};'
        : args.path.endsWith('syncService') ? 'export const syncService = {};'
        : args.path.endsWith('MapView') ? 'export default function MapView(){return null}; export const fetchTurnByTurnRoute = async () => null;'
        : args.path.endsWith('CommissionCard') ? 'export default function CommissionCard(){return null}'
        : 'export const showToast = () => {};';
      return { contents, loader: 'js' };
    });
  } }],
});
const { renderPage } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

test('sign-in always exposes the existing rider signup flow and route alias', async () => {
  const html = renderPage('login', '/auth/login?role=customer');
  assert.match(html, /href="\/rider\/signup"/);
  assert.match(html, /Sign up as a rider/);
  assert.match(renderPage('signup', '/auth/signup?role=rider'), /href="\/auth\/login\?role=rider"/);
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/rider\/signup" element=\{<Navigate to="\/auth\/signup\?role=rider" replace \/>\}/);
  const auth = await readFile(new URL('../src/pages/Auth.tsx', import.meta.url), 'utf8');
  assert.equal(auth.split('No account for this email. Sign up first.').length - 1, 3);
});

test('arbitrary role query parameters cannot select manager sign-in', () => {
  const html = renderPage('login', '/auth/login?role=manager');
  assert.match(html, /href="\/auth\/signup\?role=customer"/);
  assert.doesNotMatch(html, /href="\/auth\/signup\?role=manager"/);
});

test('pending, rejected, and suspended riders see review state instead of availability and ride controls', () => {
  for (const [status, heading] of [['pending', 'Application under review'], ['rejected', 'Application needs attention'], ['suspended', 'Rider account suspended']]) {
    globalThis.__uiTest.auth.user = rider(status);
    const html = renderPage('rider', '/rider/dashboard');
    assert.match(html, new RegExp(heading));
    assert.match(html, /once a manager approves your account/);
    assert.match(html, /Refresh status/);
    assert.match(html, /My Orders \(0\)/);
    assert.match(html, /Awaiting approval/);
    assert.doesNotMatch(html, />Go Online</);
  }
});

test('unapproved riders cannot accept an available order while retaining the dashboard', () => {
  globalThis.__uiTest.auth.user = rider('pending');
  globalThis.__uiTest.orders.getPendingOrders = () => [{ id: 'o', displayCode: 'DB-1', status: 'pending', orderType: 'instant', createdAt: Date.now(), distance: 1, price: 10, pickup: { address: 'A' }, dropoff: { address: 'B' } }];
  try {
    const html = renderPage('rider', '/rider/dashboard');
    assert.match(html, /<button disabled=""[^>]*>Accept<\/button>/);
    assert.match(html, /My Orders \(0\)/);
  } finally { globalThis.__uiTest.orders.getPendingOrders = () => []; }
});

test('approved riders retain their dashboard and availability control', () => {
  globalThis.__uiTest.auth.user = rider('approved');
  const html = renderPage('rider', '/rider/dashboard');
  assert.match(html, /Rider Dashboard/);
  assert.match(html, /Go Online/);
  assert.match(html, /Available \(0\)/);
});
