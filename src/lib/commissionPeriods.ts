/** Calendar calculations for weekly commissions. Ghana uses UTC year-round.
 * This module does not enforce payment deadlines or restrict rider access;
 * those operations must be performed by an authenticated server. */
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Start of the Monday–Sunday week containing timestamp, in UTC. */
export function commissionWeekStart(timestamp: number): number {
  if (!Number.isFinite(timestamp)) throw new RangeError('Invalid timestamp');
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid timestamp');
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return midnight - daysSinceMonday * DAY_MS;
}

/** End of a week is exclusive, i.e. midnight at the beginning of Monday. */
export function commissionWeekEnd(start: number): number {
  if (commissionWeekStart(start) !== start) throw new RangeError('Week start must be Monday at 00:00 UTC');
  return start + WEEK_MS;
}

/** Last millisecond of the final allowed day after Sunday. Snapshot this value
 * when creating a statement; changing settings must not rewrite old deadlines. */
export function commissionDeadline(start: number, days: number): number {
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new RangeError('Payment days must be a whole number from 1 to 365');
  }
  const deadline = commissionWeekEnd(start) + days * DAY_MS - 1;
  if (!Number.isFinite(new Date(deadline).getTime())) throw new RangeError('Invalid deadline');
  return deadline;
}
