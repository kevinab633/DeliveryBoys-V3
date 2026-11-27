import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/orders.js';

test('legacy service-role order endpoint never returns or modifies orders', async () => {
  for (const method of ['GET', 'POST', 'PATCH', 'OPTIONS']) {
    const res = { headers: {}, statusCode: 0, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { return body; } };
    const body = await handler({ method, query: {}, body: {} }, res);
    assert.equal(res.statusCode, 410);
    assert.deepEqual(body, { error: 'Legacy order API is disabled.' });
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});
