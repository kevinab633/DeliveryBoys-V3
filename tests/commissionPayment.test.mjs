import test from 'node:test';
import assert from 'node:assert/strict';
import { reportWeeklyPayment, approveWeeklyPayment, rejectWeeklyPayment, mayAcceptNewOrders } from '../src/lib/commissionPayment.ts';

const payment = { id: 'week-1', amountPesewas: 500, deadline: 1000, status: 'unpaid' };

test('report does not settle debt, and rejection preserves evidence until replacement', () => {
  const submitted = reportWeeklyPayment(payment, 'private/one.jpg');
  assert.equal(submitted.payment.status, 'pending');
  assert.deepEqual(submitted.deleteAfterCommit, []);
  const rejected = rejectWeeklyPayment(submitted.payment);
  assert.equal(rejected.payment.proofPath, 'private/one.jpg');
  assert.deepEqual(rejected.deleteAfterCommit, []);
  assert.throws(() => reportWeeklyPayment(rejected.payment, 'private/one.jpg'));
  const resubmitted = reportWeeklyPayment(rejected.payment, 'private/two.jpg');
  assert.deepEqual(resubmitted.deleteAfterCommit, ['private/one.jpg']);
  const approved = approveWeeklyPayment(resubmitted.payment);
  assert.equal(approved.payment.status, 'paid');
  assert.equal(approved.payment.proofPath, undefined);
  assert.deepEqual(approved.deleteAfterCommit, ['private/two.jpg']);
  assert.throws(() => approveWeeklyPayment(approved.payment));
});

test('only confirmed payments clear overdue debt; manager reapproval is separate', () => {
  const pending = reportWeeklyPayment(payment, 'private/one.jpg').payment;
  assert.equal(mayAcceptNewOrders([pending], 1000, false), true);
  assert.equal(mayAcceptNewOrders([pending], 1001, false), false);
  const paid = approveWeeklyPayment(pending).payment;
  assert.equal(mayAcceptNewOrders([paid], 1001, true), false);
  assert.equal(mayAcceptNewOrders([paid], 1001, false), true);
  assert.equal(mayAcceptNewOrders([paid, { ...payment, id: 'week-2' }], 1001, false), false);
  assert.equal(mayAcceptNewOrders([{ ...payment, amountPesewas: 0 }], 1001, false), true);
});
