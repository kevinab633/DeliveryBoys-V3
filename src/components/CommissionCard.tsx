import { Wallet, Clock, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { cn, formatCurrency } from '../lib/utils';
import { commissionOwed } from '../lib/pricing';
import { Order, RiderProfile } from '../lib/types';

/** Commission the rider owes the company. The rider reports a payment; the
 *  manager confirms it, and the amount resets to zero. */
export default function CommissionCard({ rider, orders, dk, className }: {
  rider: RiderProfile;
  orders: Order[];
  dk: boolean;
  className?: string;
}) {
  const requestPayment = useAuthStore(s => s.requestCommissionPayment);
  const owed = commissionOwed(rider.id, orders, rider.commissionSettledAt);
  const pending = rider.commissionPaymentRequest;

  return (
    <div className={cn('rounded-2xl border p-5', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-surface-light-3', className)}>
      <div className="flex items-center gap-2">
        <Wallet size={18} className="text-brand" />
        <span className={cn('text-sm font-semibold', dk ? 'text-white/70' : 'text-gray-600')}>Commission owed to Delivery Boys</span>
      </div>
      <p className={cn('mt-2 text-3xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{formatCurrency(owed)}</p>

      {pending ? (
        <p className={cn('mt-3 flex items-center gap-2 text-sm', dk ? 'text-white/60' : 'text-gray-500')}>
          <Clock size={16} className="text-warning" />
          Payment of {formatCurrency(pending.amount)} reported. Waiting for the manager to confirm.
        </p>
      ) : owed > 0 ? (
        <button type="button" onClick={() => requestPayment(owed)}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark">
          <CheckCircle2 size={16} /> I have paid {formatCurrency(owed)}
        </button>
      ) : (
        <p className={cn('mt-3 text-sm', dk ? 'text-white/50' : 'text-gray-500')}>Nothing owed. It builds up as you complete deliveries.</p>
      )}
    </div>
  );
}
