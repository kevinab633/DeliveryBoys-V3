import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, MapPin, ArrowRight } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { cn, formatCurrency, formatDistance, timeAgo } from '../lib/utils';

export default function MyOrders() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user } = useAuthStore();
  const { orders, fetchOrders } = useOrderStore();

  // ── Catch-up fetch on mount: pull this customer's orders from the
  //    backend so orders created on other devices appear here too.
  useEffect(() => {
    if (user?.id) void fetchOrders({ customerId: user.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return <div className="pt-20 min-h-screen flex items-center justify-center"><p>Please sign in.</p></div>;

  const myOrders = orders.filter(o => o.customerId === user.id);

  return (
    <div className="pt-20 min-h-screen">
      <section className={cn('py-8', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-4xl mx-auto px-6">
          <h1 className={cn('text-3xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>My Orders</h1>
        </div>
      </section>
      <section className={cn('py-8', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-4xl mx-auto px-6 space-y-4">
          {myOrders.length === 0 && (
            <div className="text-center py-16">
              <Package size={48} className={cn('mx-auto mb-4', dk ? 'text-white/20' : 'text-gray-300')} />
              <p className={cn('text-lg mb-4', dk ? 'text-white/40' : 'text-gray-500')}>No orders yet</p>
              <Link to="/book" className="bg-brand text-white px-6 py-3 rounded-xl font-bold">Book Your First Delivery</Link>
            </div>
          )}
          {myOrders.map(o => (
            <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={cn('p-5 rounded-xl border', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>{o.displayCode}</span>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold capitalize',
                    o.status==='delivered'?'bg-success/10 text-success':o.status==='cancelled'?'bg-danger/10 text-danger':'bg-warning/10 text-warning')}>{o.status.replace('_',' ')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-brand font-bold">{formatCurrency(o.price)}</span>
                  <span className={cn('text-xs', dk ? 'text-white/30' : 'text-gray-400')}>{timeAgo(o.createdAt)}</span>
                </div>
              </div>
              <p className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>
                <MapPin size={14} className="inline text-success mr-1" />{o.pickup.address} → <MapPin size={14} className="inline text-brand mr-1" />{o.dropoff.address}
              </p>
              {o.status === 'cancelled' && (
                <p className={cn('text-xs mt-2', dk ? 'text-white/40' : 'text-gray-400')}>
                  {o.cancelReason === 'no_riders_available'
                    ? 'No riders were available for this order — please try again shortly.'
                    : o.cancelReason === 'no_riders_available_scheduled'
                      ? "We couldn't find a rider for your scheduled delivery — please rebook or try again."
                      : 'This order was cancelled.'}
                </p>
              )}
              {['accepted','picked_up','in_transit'].includes(o.status) && (
                <Link to={`/track?id=${o.id}`} className="inline-flex items-center gap-1 text-brand text-sm font-bold mt-3">
                  Track Live <ArrowRight size={14} />
                </Link>
              )}
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
