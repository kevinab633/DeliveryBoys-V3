import test from 'node:test';
import assert from 'node:assert/strict';
import { commissionWeekStart, commissionWeekEnd, commissionDeadline } from '../src/lib/commissionPeriods.ts';

const time = value => Date.parse(value);

test('Monday through Sunday belong to the same Ghana-time week', () => {
  const monday = time('2026-11-23T00:00:00Z');
  assert.equal(commissionWeekStart(monday), monday);
  assert.equal(commissionWeekStart(time('2026-11-29T23:59:59.999Z')), monday);
  assert.equal(commissionWeekStart(time('2026-11-30T00:00:00Z')), monday + 7 * 86400000);
  assert.equal(commissionWeekEnd(monday), time('2026-11-30T00:00:00Z'));
});

test('one day means payment is due by Monday 23:59 Ghana time', () => {
  const start = time('2026-11-23T00:00:00Z');
  assert.equal(commissionDeadline(start, 1), time('2026-11-30T23:59:59.999Z'));
  assert.equal(commissionDeadline(start, 3), time('2026-12-02T23:59:59.999Z'));
});

test('rejects invalid dates, non-week starts and unsupported deadline settings', () => {
  assert.throws(() => commissionWeekStart(NaN), RangeError);
  assert.throws(() => commissionWeekEnd(time('2026-11-23T00:00:01Z')), RangeError);
  for (const days of [0, -1, 1.5, 366, NaN]) {
    assert.throws(() => commissionDeadline(time('2026-11-23T00:00:00Z'), days), RangeError);
  }
});
