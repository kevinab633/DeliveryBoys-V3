/** Pure transition rules for the planned server-side weekly commission flow.
 * This module does not authenticate callers, persist changes, enforce access,
 * or delete files. Those operations must happen transactionally on a server. */
export type PaymentStatus = 'unpaid' | 'pending' | 'rejected' | 'paid';

export interface WeeklyPayment {
  id: string;
  amountPesewas: number;
  deadline: number;
  status: PaymentStatus;
  /** Private storage path, never a public URL. */
  proofPath?: string;
}

export interface PaymentTransition {
  payment: WeeklyPayment;
  /** The server must durably queue these storage paths for deletion. */
  deleteAfterCommit: string[];
}

/** Payment reports do not settle debt. Retain a rejected image until the new
 * submission is committed; then enqueue the old object for deletion. */
export function reportWeeklyPayment(payment: WeeklyPayment, proofPath: string): PaymentTransition {
  if (payment.status !== 'unpaid' && payment.status !== 'rejected') throw new Error('Payment cannot be submitted in its current state');
  if (!proofPath || proofPath === payment.proofPath) throw new Error('A new payment screenshot is required');
  return {
    payment: { ...payment, status: 'pending', proofPath },
    deleteAfterCommit: payment.proofPath ? [payment.proofPath] : [],
  };
}

/** Confirmation must happen only after a manager has checked receipt. */
export function approveWeeklyPayment(payment: WeeklyPayment): PaymentTransition {
  if (payment.status !== 'pending' || !payment.proofPath) throw new Error('No payment proof is awaiting review');
  const { proofPath, ...settled } = payment;
  return { payment: { ...settled, status: 'paid' }, deleteAfterCommit: [proofPath] };
}

export function rejectWeeklyPayment(payment: WeeklyPayment): PaymentTransition {
  if (payment.status !== 'pending' || !payment.proofPath) throw new Error('No payment proof is awaiting review');
  return { payment: { ...payment, status: 'rejected' }, deleteAfterCommit: [] };
}

/** Any overdue, unconfirmed week blocks new orders. An overdue payment report
 * remains blocking until confirmation. The separate manual halt is a durable
 * server-side flag cleared only by manager approval after overdue debts clear. */
export function mayAcceptNewOrders(payments: WeeklyPayment[], now: number, requiresManagerReapproval: boolean): boolean {
  if (!Number.isFinite(now)) throw new RangeError('Invalid current time');
  return !requiresManagerReapproval && !payments.some(p => p.status !== 'paid' && p.amountPesewas > 0 && now > p.deadline);
}
