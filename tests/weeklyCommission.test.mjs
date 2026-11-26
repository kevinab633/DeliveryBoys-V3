import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWeeklyCommission } from '../src/lib/weeklyCommission.ts';

const start = Date.parse('2026-11-23T00:00:00Z');
const end = Date.parse('2026-11-30T00:00:00Z');
const delivery = (id, deliveredAt, commissionPesewas = 500) => ({ id, riderId: 'rider', status: 'delivered', deliveredAt, commissionPesewas });

test('totals only the rider’s post-cutover deliveries in the closed week', () => {
  const result = calculateWeeklyCommission([
    delivery('old', start),
    delivery('b', start + 2000, 525),
    delivery('a', end - 1, 301),
    delivery('next', end),
    { ...delivery('other', start + 2000), riderId: 'other' },
    { ...delivery('cancelled', start + 2000), status: 'cancelled' },
  ], 'rider', start, start + 1000, end);
  assert.deepEqual(result, { weekStart: start, weekEnd: end, deliveryIds: ['a', 'b'], totalPesewas: 826 });
});

test('returns zero if nothing was earned after the cutover', () => {
  assert.equal(calculateWeeklyCommission([delivery('old', start)], 'rider', start, end, end).totalPesewas, 0);
});

test('refuses to close an ongoing week or bill incomplete and duplicate data', () => {
  assert.throws(() => calculateWeeklyCommission([], 'rider', start, start, end - 1), /before it ends/);
  assert.throws(() => calculateWeeklyCommission([delivery('missing', undefined)], 'rider', start, start, end), /delivery time/);
  assert.throws(() => calculateWeeklyCommission([{ ...delivery('missing', start), commissionPesewas: undefined }], 'rider', start, start, end), /commission/);
  assert.throws(() => calculateWeeklyCommission([delivery('dup', start), delivery('dup', start)], 'rider', start, start, end), /Duplicate/);
  assert.throws(() => calculateWeeklyCommission([delivery('bad', start, 3.5)], 'rider', start, start, end), /commission/);
});
