import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Package, MapPin, CheckCircle2, Truck, User, ChevronUp, ChevronDown } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useOrderStore } from '../stores/orderStore';
import { cn, formatCurrency, formatDistance, formatDate } from '../lib/utils';
import MapView from '../components/MapView';
import { Order } from '../lib/types';

const statusSteps = [
  { key: 'pending', label: 'Order Placed', icon: Package },
  { key: 'accepted', label: 'Rider Assigned', icon: User },
  { key: 'picked_up', label: 'Picked Up', icon: MapPin },
  { key: 'in_transit', label: 'In Transit', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
];

const SHEET_COLLAPSED = 150;
// Navbar is h-16 = 4rem. We use 4.5rem to give a little breathing room.
const NAV_HEIGHT_REM = 4.5;

// ── Smooth lerp helper ─────────────────────────────────────────────
// Returns an interpolated lat/lng between `from` and `to` over `durationMs`,
// updating every ~16 ms (requestAnimationFrame).
function useSmoothLatLng(
  target: { lat: number; lng: number } | undefined,
  durationMs = 1800,
): { lat: number; lng: number } | undefined {
  const current = useRef<{ lat: number; lng: number } | undefined>(undefined);
  const [display, setDisplay] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!target) {
      current.current = undefined;
      setDisplay(undefined);
      return;
    }

    // First position — snap, don't animate
    if (!current.current) {
      current.current = { ...target };
      setDisplay({ ...target });
      return;
    }

    const from = { ...current.current };
    const to = { ...target };
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = from.lat + (to.lat - from.lat) * ease;
      const lng = from.lng + (to.lng - from.lng) * ease;
      const pos = { lat, lng };
      current.current = pos;
      setDisplay(pos);
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animRef.current);
  }, [target?.lat, target?.lng, durationMs]);

  return display;
}

export default function Track() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { orders } = useOrderStore();
  const [searchParams] = useSearchParams();
  const [trackId, setTrackId] = useState(searchParams.get('id') || '');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [searched, setSearched] = useState(!!searchParams.get('id'));
  const [sheetOpen, setSheetOpen] = useState(true);

  // Lock body scroll (full-screen map layout, same as /book)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Back button intercept (same pattern as /book) ───────────────
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;

  useEffect(() => {
    if (sheetOpen) {
      window.history.pushState({ sheetOpen: true }, '');
    }
  }, [sheetOpen]);

  useEffect(() => {
    const handler = () => {
      if (sheetOpenRef.current) {
        setSheetOpen(false);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // Sync from ?id= query param (e.g. arriving from the booking flow)
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setTrackId(id);
      setSelectedId(id);
      setSearched(true);
      setSheetOpen(true);
    }
  }, [searchParams]);

  const order = selectedId
    ? orders.find(o => o.id.toLowerCase() === selectedId.toLowerCase()) || null
    : null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedId(trackId.trim() || null);
    setSearched(true);
    setSheetOpen(true);
  };

  // ── Real rider position, fed straight from order.riderLocation ───
  // This is the live GPS position broadcast from the rider's device
  // (see RiderDashboard.tsx's watchPosition + broadcastRiderLocation).
  // useSmoothLatLng below handles the animated glide between updates —
  // there's no need to simulate movement here, since real updates now
  // arrive every ~4s/10m of actual rider movement.
  const rawRiderPos = order && ['accepted', 'picked_up', 'in_transit'].includes(order.status)
    ? (order.riderLocation && Number.isFinite(order.riderLocation.lat) && Number.isFinite(order.riderLocation.lng)
        ? order.riderLocation
        : { lat: order.pickup.lat, lng: order.pickup.lng })
    : undefined;

  // ── Smooth the raw position for the marker ───────────────────────
  const smoothRider = useSmoothLatLng(rawRiderPos, 2200);

  const statusIndex = order ? statusSteps.findIndex(s => s.key === order.status) : -1;

  const markers = order
    ? [
        { lat: order.pickup.lat, lng: order.pickup.lng, color: '#10B981', popup: 'Pickup: ' + order.pickup.address, icon: 'pickup' as const },
        { lat: order.dropoff.lat, lng: order.dropoff.lng, color: '#C41E1E', popup: 'Drop-off: ' + order.dropoff.address, icon: 'dropoff' as const },
        ...(smoothRider && Number.isFinite(smoothRider.lat) && Number.isFinite(smoothRider.lng)
          ? [{ lat: smoothRider.lat, lng: smoothRider.lng, color: '#3B82F6', popup: (order.riderName || 'Rider') + ' — En route', icon: 'rider' as const }]
          : []),
      ]
    : [];

  // Rider's live leg (rider → pickup, or pickup → dropoff once picked up)
  // is the one the customer is actually watching move, so it gets the
  // prominent solid animated line — swapped from the old setup where the
  // static full-trip line was the prominent one and the rider's actual
  // path was the duller dashed line.
  const riderRoute = order && order.status === 'accepted' && smoothRider
    && Number.isFinite(smoothRider.lat) && Number.isFinite(smoothRider.lng)
    ? ([[smoothRider.lat, smoothRider.lng], [order.pickup.lat, order.pickup.lng]] as [number, number][])
    : order && (order.status === 'picked_up' || order.status === 'in_transit') && smoothRider
      && Number.isFinite(smoothRider.lat) && Number.isFinite(smoothRider.lng)
      ? ([[smoothRider.lat, smoothRider.lng], [order.dropoff.lat, order.dropoff.lng]] as [number, number][])
      : undefined;

  // Full pickup → dropoff trip shown as a lighter reference line
  // underneath, so the customer still sees the whole journey at a glance.
  const route = order
    ? ([[order.pickup.lat, order.pickup.lng], [order.dropoff.lat, order.dropoff.lng]] as [number, number][])
    : undefined;

  // ── Sheet handle swipe detection (same pattern as /book) ────────
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const endY = e.changedTouches[0].clientY;
      const delta = endY - startY;
      if (delta > 40) {
        setSheetOpen(false);
      } else if (delta < -40) {
        setSheetOpen(true);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // ── Panel pieces ─────────────────────────────────────────────────
  const searchForm = (
    <form onSubmit={handleSearch} className="flex gap-2">
      <div className="flex-1 relative">
        <Search size={16} className={cn('absolute left-3 top-1/2 -translate-y-1/2', dk ? 'text-white/30' : 'text-gray-400')} />
        <input value={trackId} onChange={e => setTrackId(e.target.value)} placeholder="Order ID (e.g. ORD-003)"
          className={cn('w-full pl-9 pr-3 py-3 rounded-xl text-sm border',
            dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400')} />
      </div>
      <button type="submit" className="bg-brand text-white px-5 py-3 rounded-xl font-bold hover:bg-brand-dark transition">Track</button>
    </form>
  );

  const orderDetails = order && (
    <>
      {/* Order info */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className={cn('p-5 rounded-2xl border', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-gray-50 border-gray-200')}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className={cn('font-bold text-lg', dk ? 'text-white' : 'text-gray-900')}>{order.id}</h3>
            <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>{formatDate(order.createdAt)}</p>
          </div>
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold capitalize',
            order.status === 'delivered' ? 'bg-success/10 text-success' :
            order.status === 'cancelled' ? 'bg-danger/10 text-danger' :
            'bg-warning/10 text-warning')}>{order.status.replace('_', ' ')}</span>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex gap-3">
            <MapPin size={16} className="text-success shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className={dk ? 'text-white/40' : 'text-gray-500'}>Pickup</p>
              <p className={cn('font-medium break-words', dk ? 'text-white' : 'text-gray-900')}>{order.pickup.address}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <MapPin size={16} className="text-brand shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className={dk ? 'text-white/40' : 'text-gray-500'}>Drop-off</p>
              <p className={cn('font-medium break-words', dk ? 'text-white' : 'text-gray-900')}>{order.dropoff.address}</p>
            </div>
          </div>
          <div className="flex justify-between">
            <span className={dk ? 'text-white/50' : 'text-gray-500'}>Distance</span>
            <span className={cn('font-semibold', dk ? 'text-white' : 'text-gray-900')}>{formatDistance(order.distance)}</span>
          </div>
          <div className={cn('flex justify-between pt-2 border-t', dk ? 'border-white/5' : 'border-gray-200')}>
            <span className={dk ? 'text-white/50' : 'text-gray-500'}>Total</span>
            <span className="font-bold text-brand text-lg">{formatCurrency(order.price)}</span>
          </div>
        </div>
        {order.riderName && (
          <div className={cn('mt-4 p-3 rounded-xl flex items-center gap-3', dk ? 'bg-surface-dark-2' : 'bg-white border border-gray-100')}>
            <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-bold">{order.riderName[0]}</div>
            <div>
              <p className={cn('font-semibold text-sm', dk ? 'text-white' : 'text-gray-900')}>{order.riderName}</p>
              <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>
                {order.status === 'accepted' ? 'Heading to pickup' : 'Your Rider'}
              </p>
            </div>
          </div>
        )}
        {order.status === 'accepted' && (
          <div className={cn('mt-3 flex items-center gap-2 text-xs', dk ? 'text-white/40' : 'text-gray-500')}>
            <svg width="26" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="26" y2="3" stroke="#64748B" strokeWidth="3" strokeDasharray="5 4" strokeLinecap="round" />
            </svg>
            Rider heading to pickup (dashed)
          </div>
        )}
      </motion.div>

      {/* Status timeline */}
      <div className={cn('p-5 rounded-2xl border', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-gray-50 border-gray-200')}>
        <h4 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Delivery Status</h4>
        <div className="space-y-0">
          {statusSteps.map((s, i) => {
            const done = i <= statusIndex;
            return (
              <div key={s.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center',
                    done ? 'bg-brand' : dk ? 'bg-surface-dark-2 border border-white/10' : 'bg-white border border-gray-200')}>
                    <s.icon size={16} className={done ? 'text-white' : dk ? 'text-white/30' : 'text-gray-400'} />
                  </div>
                  {i < statusSteps.length - 1 && (
                    <div className={cn('w-0.5 h-8', done ? 'bg-brand' : dk ? 'bg-white/10' : 'bg-gray-200')} />
                  )}
                </div>
                <div className="pt-1.5">
                  <p className={cn('text-sm font-semibold',
                    done ? (dk ? 'text-white' : 'text-gray-900') : (dk ? 'text-white/30' : 'text-gray-400'))}>{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  const notFound = (
    <div className="py-10 text-center">
      <Package size={44} className={cn('mx-auto mb-3', dk ? 'text-white/20' : 'text-gray-300')} />
      <p className={cn('text-sm font-medium', dk ? 'text-white/40' : 'text-gray-500')}>No order found with that ID</p>
    </div>
  );

  const hint = (
    <p className={cn('text-sm leading-relaxed', dk ? 'text-white/35' : 'text-gray-400')}>
      Enter your order ID above to watch your rider move live on the map.
    </p>
  );

  return (
    <div style={{ position: 'relative', height: '100dvh', width: '100vw', overflow: 'hidden' }}>
      {/* ── Full-screen map ─────────────────────────────────────── */}
      <MapView
        markers={markers}
        route={riderRoute}
        secondaryRoute={route}
        className="absolute inset-0 top-16 z-0"
        interactive={true}
      />

      {/* ══ DESKTOP: floating panel (lg: and up) ════════════════ */}
      <div className="hidden lg:flex absolute top-20 left-6 bottom-6 z-10 w-[400px] flex-col">
        <div className={cn(
          'flex-1 min-h-0 rounded-2xl shadow-2xl border flex flex-col overflow-hidden',
          dk ? 'bg-surface-dark-2/95 border-white/5 glass' : 'bg-white/95 border-gray-200 glass',
        )}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="mb-1">
              <h1 className={cn('text-xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Track Delivery</h1>
              <p className={cn('text-xs mt-0.5', dk ? 'text-white/40' : 'text-gray-500')}>Live rider location & route</p>
            </div>
            {searchForm}
            {order ? orderDetails : searched ? notFound : hint}
          </div>
        </div>
      </div>

      {/* ══ MOBILE: bottom sheet (below lg:) ════════════════════ */}
      <motion.div
        className={cn(
          'lg:hidden fixed left-0 right-0 bottom-0 z-20 flex flex-col',
          'rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.25)]',
          dk ? 'bg-surface-dark-2 border-t border-white/5' : 'bg-white border-t border-gray-200',
        )}
        animate={{
          height: sheetOpen ? `calc(100dvh - ${NAV_HEIGHT_REM}rem)` : `${SHEET_COLLAPSED}px`,
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        {/* Handle row — swipeable + tap-to-toggle + collapse button */}
        <div
          ref={handleRef}
          className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0"
        >
          <div className="w-9" />
          <div
            className="flex-1 flex justify-center py-2 cursor-pointer"
            onClick={() => setSheetOpen(!sheetOpen)}
          >
            <div className={cn('w-10 h-1 rounded-full', dk ? 'bg-white/20' : 'bg-gray-300')} />
          </div>
          {sheetOpen ? (
            <button
              onClick={() => setSheetOpen(false)}
              className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition shrink-0',
                dk ? 'text-white/40 hover:bg-white/5 hover:text-white/70' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600')}
            >
              <ChevronDown size={20} />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>

        {/* Collapsed: compact status bar */}
        {!sheetOpen && (
          <button onClick={() => setSheetOpen(true)}
            className={cn('w-full px-4 pb-3 flex items-center justify-between gap-2', dk ? 'text-white/70' : 'text-gray-700')}>
            {order ? (
              <>
                <span className="flex items-center gap-2 text-sm font-bold min-w-0">
                  <span className={cn('w-2 h-2 rounded-full shrink-0',
                    order.status === 'delivered' ? 'bg-success' : order.status === 'cancelled' ? 'bg-danger' : 'bg-warning animate-pulse')} />
                  <span className="truncate">{order.id} · {order.status.replace('_', ' ')}</span>
                </span>
                <span className={cn('flex items-center gap-1 text-xs font-semibold shrink-0', dk ? 'text-white/40' : 'text-gray-400')}>
                  Details <ChevronUp size={14} />
                </span>
              </>
            ) : (
              <span className={cn('w-full flex items-center justify-center gap-1 py-2 text-xs font-semibold', dk ? 'text-white/40' : 'text-gray-500')}>
                Track an order <ChevronUp size={14} />
              </span>
            )}
          </button>
        )}

        {/* Expanded: search + details */}
        {sheetOpen && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto">
              <div className="mb-1">
                <h1 className={cn('text-lg font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Track Delivery</h1>
              </div>
              {searchForm}
              {order ? orderDetails : searched ? notFound : hint}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
