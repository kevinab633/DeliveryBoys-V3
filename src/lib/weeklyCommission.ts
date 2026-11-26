import { commissionWeekEnd, commissionWeekStart } from './commissionPeriods.ts';

/** An immutable input for calculating a statement. Amounts are in pesewas. */
export interface CommissionDelivery {
  id: string;
  riderId: string;
  status: string;
  deliveredAt?: number;
  commissionPesewas?: number;
}

export interface WeeklyCommissionTotal {
  weekStart: number;
  weekEnd: number;
  deliveryIds: string[];
  totalPesewas: number;
}

/**
 * Calculate one closed week from authoritative deliveries. This pure function
 * does not persist statements, enforce deadlines or provide authorization.
 * The caller must fetch a complete set from a trusted source and create the
 * statement transactionally. No estimated commission or creation-date fallback
 * is used: missing delivery data must be resolved instead of silently billing
 * the wrong amount. cutover is inclusive and excludes the owner's old test data.
 */
export function calculateWeeklyCommission(
  deliveries: CommissionDelivery[], riderId: string, weekStart: number,
  cutover: number, now: number,
): WeeklyCommissionTotal {
  if (!riderId || !Number.isFinite(cutover) || !Number.isFinite(now)) {
    throw new RangeError('A rider, cutover and current time are required');
  }
  if (commissionWeekStart(weekStart) !== weekStart) throw new RangeError('Invalid week start');
  const weekEnd = commissionWeekEnd(weekStart);
  if (now < weekEnd) throw new RangeError('Cannot close a week before it ends');

  const ids = new Set<string>();
  let totalPesewas = 0;
  for (const delivery of deliveries) {
    if (delivery.riderId !== riderId || delivery.status !== 'delivered') continue;
    if (!delivery.id) throw new RangeError('A delivered order has no ID');
    if (!Number.isFinite(delivery.deliveredAt)) throw new RangeError(`Missing delivery time for ${delivery.id}`);
    const deliveredAt = delivery.deliveredAt!;
    if (deliveredAt < weekStart || deliveredAt >= weekEnd || deliveredAt < cutover) continue;
    if (ids.has(delivery.id)) throw new RangeError(`Duplicate delivery ${delivery.id}`);
    if (!Number.isSafeInteger(delivery.commissionPesewas) || delivery.commissionPesewas! < 0) {
      throw new RangeError(`Missing or invalid commission for ${delivery.id}`);
    }
    ids.add(delivery.id);
    totalPesewas += delivery.commissionPesewas!;
    if (!Number.isSafeInteger(totalPesewas)) throw new RangeError('Commission total is too large');
  }
  return { weekStart, weekEnd, deliveryIds: [...ids].sort(), totalPesewas };
}
