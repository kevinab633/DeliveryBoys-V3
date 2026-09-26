import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bike, Car, Truck, ArrowRight, ArrowLeft as ArrowLeftIcon, Info, CheckCircle2, ChevronUp, ChevronDown, Zap, Calendar, Star, X, AlertTriangle } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useContentStore } from '../stores/contentStore';
import { calculateDistance, calculatePrice, estimateFuelCost } from '../lib/pricing';
import { cn, formatCurrency, formatDistance, formatDate } from '../lib/utils';
import { showToast } from '../components/Toast';
import { VehicleType, OrderType } from '../lib/types';
import LocationSearch from '../components/LocationSearch';
import MapView from '../components/MapView';
import { reverseGeocode } from '../lib/locations';

const vehicles: { type: VehicleType; icon: typeof Bike; label: string; desc: string }[] = [
  { type: 'motorcycle', icon: Bike, label: 'Motorcycle', desc: 'Fast, for small items' },
  { type: 'car', icon: Car, label: 'Car', desc: 'Medium packages' },
  { type: 'van', icon: Truck, label: 'Van', desc: 'Large items' },
  { type: 'truck', icon: Truck, label: 'Truck', desc: 'Bulk / heavy loads' },
];

const SHEET_COLLAPSED = 160;
// Navbar is h-16 = 4rem. We use 4.5rem to give a little breathing room.
const NAV_HEIGHT_REM = 4.5;

// In-page booking phases — the customer never leaves this screen:
// form → searching → rider_responding → just_assigned → assigned  (instant orders)
// (rider_responding is a sub-state of searching; reverts back to searching
// if that rider backs out without accepting. just_assigned is a brief,
// few-second confirmation before settling into the tracking-style assigned view.)
// form → scheduled             (scheduled orders)
type BookPhase = 'form' | 'searching' | 'rider_responding' | 'just_assigned' | 'assigned' | 'scheduled' | 'no_riders' | 'no_riders_scheduled';

export default function Book() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user, getRiders } = useAuthStore();
  const { orders, createOrder, cancelOrder } = useOrderStore();
  const { priceRules, pricingMode, manualOverrides } = useContentStore();
  const navigate = useNavigate();

  const [pickup, setPickup] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>('motorcycle');
  const [desc, setDesc] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [pinMode, setPinMode] = useState<'pickup' | 'dropoff' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);

  // ── Booking phase state ─────────────────────────────────────────
  const [phase, setPhase] = useState<BookPhase>('form');
  const [orderId, setOrderId] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('instant');
  const [scheduleAt, setScheduleAt] = useState('');

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Back button intercept ────────────────────────────────────────
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
        // Collapse the sheet instead of navigating back
        setSheetOpen(false);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // ── Live order + rider data (reactive — refreshes on any change) ─
  const activeOrder = orders.find(o => o.id === orderId);
  const riders = getRiders();
  const onlineRiders = riders.filter(r => r.availability === 'online' && r.location);
  const assignedRider = activeOrder?.riderId
    ? riders.find(r => r.id === activeOrder.riderId)
    : undefined;

  // ── Poll the order status while searching (every 2 s). As soon as
  //    a rider accepts, transition to the "assigned" panel. Also tracks
  //    respondingRiderId so the customer sees "rider is responding" the
  //    moment a rider opens the order, reverting back to plain
  //    "searching" if that rider backs out without accepting. ────────
  useEffect(() => {
    if ((phase !== 'searching' && phase !== 'rider_responding') || !orderId) return;
    const check = () => {
      const o = useOrderStore.getState().orders.find(x => x.id === orderId);
      if (!o) return;
      if (o.status === 'accepted') {
        setPhase('just_assigned');
        setSheetOpen(true);
        // Brief confirmation moment, then actually move into the
        // full tracking view automatically — matches the short
        // "Driver assigned" flash Yango/Bolt show before dropping into
        // live tracking. (Previously this only flipped an internal
        // phase flag with no visible change — the assigned screen looks
        // identical either way, so nothing appeared to happen. Navigating
        // is the actual "settle into tracking" behavior.)
        setTimeout(() => navigate('/track?id=' + orderId), 3000);
      } else if (o.status === 'cancelled') {
        // Auto-cancelled with no riders? Show the right message per
        // reason. User-cancelled orders just go back to the form.
        if (o.cancelReason === 'no_riders_available') {
          setPhase('no_riders');
          setSheetOpen(true);
        } else if (o.cancelReason === 'no_riders_available_scheduled') {
          setPhase('no_riders_scheduled');
          setSheetOpen(true);
        } else {
          resetForm();
        }
      } else if (o.respondingRiderId) {
        if (phase !== 'rider_responding') setPhase('rider_responding');
      } else if (phase === 'rider_responding') {
        // The reviewing rider backed out without accepting or declining —
        // fall back to plain "searching" rather than staying stuck.
        setPhase('searching');
      }
    };
    const iv = setInterval(check, 2000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, orderId]);

  // ── Staged dispatch: while nobody accepts, widen the ringing window
  //    to the next-closest riders every ~15 seconds ──────────────────
  useEffect(() => {
    if ((phase !== 'searching' && phase !== 'rider_responding') || !orderId) return;
    const iv = setInterval(() => {
      useOrderStore.getState().expandOrderDispatch(orderId);
    }, 15000);
    return () => clearInterval(iv);
  }, [phase, orderId]);

  // Auto-open the sheet when the phase changes on mobile
  useEffect(() => {
    if (phase !== 'form') setSheetOpen(true);
  }, [phase]);

  const resetForm = useCallback(() => {
    setPhase('form');
    setOrderId('');
    setScheduleAt('');
    setOrderType('instant');
  }, []);

  const distance = pickup && dropoff ? calculateDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng) : 0;
  const pricing = distance > 0 ? calculatePrice(distance, vehicle, priceRules, manualOverrides, pricingMode) : null;
  const fuelEst = distance > 0 ? estimateFuelCost(distance, vehicle) : 0;

  const priceForVehicle = useCallback((vt: VehicleType) => {
    if (distance <= 0) return null;
    return calculatePrice(distance, vt, priceRules, manualOverrides, pricingMode);
  }, [distance, priceRules, manualOverrides, pricingMode]);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    const addr = await reverseGeocode(lat, lng);
    if (pinMode === 'pickup') setPickup({ lat, lng, address: addr });
    else if (pinMode === 'dropoff') setDropoff({ lat, lng, address: addr });
  }, [pinMode]);

  // Minimum schedulable time: 15 minutes from now (for datetime-local)
  const minSchedule = (() => {
    const d = new Date(Date.now() + 15 * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const handleBook = () => {
    if (!pickup || !dropoff || !user) { navigate('/auth/login'); return; }

    let scheduledFor: number | undefined;
    if (orderType === 'scheduled') {
      scheduledFor = scheduleAt ? new Date(scheduleAt).getTime() : NaN;
      if (!scheduledFor || isNaN(scheduledFor) || scheduledFor < Date.now() + 10 * 60000) {
        showToast({ title: 'Pick a future time', message: 'Choose a date & time at least 10 minutes from now.', type: 'error' });
        return;
      }
    }

    // Immediate on-screen feedback (visible on mobile without DevTools) —
    // the store then toasts success/failure once the POST resolves.
    showToast({ title: 'Creating order…', message: 'Saving your booking, please wait.', type: 'info' });

    const order = createOrder({
      customerId: user.id, customerName: user.name, customerPhone: phone || user.phone || '',
      pickup, dropoff, vehicleType: vehicle, packageDescription: desc,
      orderType, scheduledFor,
    });
    setOrderId(order.id);

    if (orderType === 'scheduled') {
      // Scheduled orders skip the searching/ringing flow entirely —
      // they post straight to riders' Available list as a Scheduled entry.
      // (Customer notification fires inside createOrder.)
      showToast({ title: '📅 Order Scheduled!', message: `${order.displayCode} — riders will see it in their available list`, type: 'success' });
      setPhase('scheduled');
    } else {
      // (Customer notification fires inside createOrder.)
      setPhase('searching');
    }
  };

  const handleCancelSearch = () => {
    cancelOrder(orderId);
    showToast({ title: 'Order Cancelled', message: 'Your booking was cancelled.', type: 'info' });
    resetForm();
  };

  // ── Markers: pickup/dropoff + live ambient layer of online riders ─
  // Strict gate: riders with null/missing/malformed locations are dropped
  // here so a NaN coordinate never reaches MapView -> LngLat (crash).
  const markers = [
    ...(pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng) ? [{ lat: pickup.lat, lng: pickup.lng, color: '#10B981', popup: 'Pickup: ' + pickup.address, icon: 'pickup' as const }] : []),
    ...(dropoff && Number.isFinite(dropoff.lat) && Number.isFinite(dropoff.lng) ? [{ lat: dropoff.lat, lng: dropoff.lng, color: '#C41E1E', popup: 'Drop-off: ' + dropoff.address, icon: 'dropoff' as const }] : []),
    // Online riders' live locations — bike icons, no popup, no route.
    ...onlineRiders
      .filter(r => r.location && Number.isFinite(r.location.lat) && Number.isFinite(r.location.lng))
      .map(r => ({
        lat: r.location!.lat, lng: r.location!.lng, color: '#F59E0B', icon: 'bike' as const,
      })),
  ];
  const route = pickup && dropoff
    ? [[pickup.lat, pickup.lng] as [number, number], [dropoff.lat, dropoff.lng] as [number, number]]
    : undefined;

  // ── Sheet handle swipe detection ─────────────────────────────────
  // Simple touch-based swipe on the handle row only. No framer-motion
  // drag, no dragControls, no dragConstraints.
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
        // Swiped down
        setSheetOpen(false);
      } else if (delta < -40) {
        // Swiped up
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

  // ── "Use your current location" handlers ─────────────────────────
  const handleUseLocationPickup = useCallback(() => {
    if (!navigator.geolocation) {
      showToast({ title: 'Unavailable', message: 'Geolocation is not supported by your browser', type: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const address = await reverseGeocode(latitude, longitude);
        setPickup({ lat: latitude, lng: longitude, address });
      },
      () => {
        showToast({ title: 'Location denied', message: 'Please allow location access in your browser settings', type: 'error' });
      },
      { enableHighAccuracy: true },
    );
  }, []);

  const handleUseLocationDropoff = useCallback(() => {
    if (!navigator.geolocation) {
      showToast({ title: 'Unavailable', message: 'Geolocation is not supported by your browser', type: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const address = await reverseGeocode(latitude, longitude);
        setDropoff({ lat: latitude, lng: longitude, address });
      },
      () => {
        showToast({ title: 'Location denied', message: 'Please allow location access in your browser settings', type: 'error' });
      },
      { enableHighAccuracy: true },
    );
  }, []);

  // ── Pin-drop handlers (collapse sheet + toggle pin mode) ─────────
  const handlePinPickup = useCallback(() => {
    setPinMode(pinMode === 'pickup' ? null : 'pickup');
    setSheetOpen(false);
  }, [pinMode]);

  const handlePinDropoff = useCallback(() => {
    setPinMode(pinMode === 'dropoff' ? null : 'dropoff');
    setSheetOpen(false);
  }, [pinMode]);

  const inp = cn(
    'w-full px-4 py-3 rounded-xl text-sm border transition',
    dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30'
       : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400',
  );

  // ── Shared form content ──────────────────────────────────────────
  const formContent = (
    <>
      {/* Book Now / Schedule for Later toggle */}
      <div className={cn('grid grid-cols-2 gap-1 p-1 rounded-xl', dk ? 'bg-surface-dark-3' : 'bg-gray-100')}>
        <button type="button" onClick={() => setOrderType('instant')}
          className={cn('flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition',
            orderType === 'instant' ? 'bg-brand text-white shadow' : dk ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-800')}>
          <Zap size={15} /> Book Now
        </button>
        <button type="button" onClick={() => setOrderType('scheduled')}
          className={cn('flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition',
            orderType === 'scheduled' ? 'bg-brand text-white shadow' : dk ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-800')}>
          <Calendar size={15} /> Schedule for Later
        </button>
      </div>

      {orderType === 'scheduled' && (
        <div>
          <label className={cn('text-sm font-semibold mb-1.5 block', dk ? 'text-white/70' : 'text-gray-700')}>Delivery Date & Time</label>
          <input type="datetime-local" value={scheduleAt} min={minSchedule}
            onChange={e => setScheduleAt(e.target.value)} className={inp} />
          <p className={cn('text-xs mt-1.5', dk ? 'text-white/30' : 'text-gray-400')}>
            Riders will see this order in their available list — no instant dispatch.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <LocationSearch
          label="Pickup Location"
          value={pickup?.address || ''}
          onSelect={(v) => { setPickup(v); setPinMode(null); }}
          placeholder="Where to pick up?"
          onPinClick={handlePinPickup}
          pinActive={pinMode === 'pickup'}
          onUseCurrentLocation={handleUseLocationPickup}
        />
        <LocationSearch
          label="Drop-off Location"
          value={dropoff?.address || ''}
          onSelect={(v) => { setDropoff(v); setPinMode(null); }}
          placeholder="Where to deliver?"
          onPinClick={handlePinDropoff}
          pinActive={pinMode === 'dropoff'}
          onUseCurrentLocation={handleUseLocationDropoff}
        />
      </div>

      <div>
        <label className={cn('text-sm font-semibold mb-2 block', dk ? 'text-white/70' : 'text-gray-700')}>Vehicle Type</label>
        <div className="space-y-2">
          {vehicles.map(v => {
            const vPrice = priceForVehicle(v.type);
            const selected = vehicle === v.type;
            return (
              <button key={v.type} onClick={() => setVehicle(v.type)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition text-left',
                  selected
                    ? 'border-brand bg-brand/8'
                    : dk ? 'border-white/5 bg-surface-dark-3/50 hover:border-white/10' : 'border-gray-200 bg-white hover:border-gray-300',
                )}>
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  selected ? 'bg-brand/15' : dk ? 'bg-white/5' : 'bg-gray-100',
                )}>
                  <v.icon size={20} className={selected ? 'text-brand' : dk ? 'text-white/40' : 'text-gray-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-900')}>{v.label}</p>
                  <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>{v.desc}</p>
                </div>
                {vPrice && (
                  <span className={cn('text-sm font-bold shrink-0', selected ? 'text-brand' : dk ? 'text-white/60' : 'text-gray-700')}>
                    {formatCurrency(vPrice.breakdown.total)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={cn('text-sm font-semibold mb-1.5 block', dk ? 'text-white/70' : 'text-gray-700')}>Package Description</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What are you sending?" className={inp} />
      </div>
      <div>
        <label className={cn('text-sm font-semibold mb-1.5 block', dk ? 'text-white/70' : 'text-gray-700')}>Contact Phone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your phone number" className={inp} />
      </div>

      {pricing && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={cn('p-4 rounded-xl border', dk ? 'bg-surface-dark-3/80 border-white/5' : 'bg-gray-50 border-gray-200')}>
          <div className="flex items-center gap-2 mb-3">
            <Info size={16} className="text-brand" />
            <span className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-900')}>Price Breakdown</span>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className={dk ? 'text-white/50' : 'text-gray-500'}>Distance</span>
              <span className={cn('font-semibold', dk ? 'text-white' : 'text-gray-900')}>{formatDistance(distance)}</span>
            </div>
            <div className="flex justify-between">
              <span className={dk ? 'text-white/50' : 'text-gray-500'}>Base Fare</span>
              <span className={dk ? 'text-white/70' : 'text-gray-700'}>{formatCurrency(pricing.breakdown.baseFare)}</span>
            </div>
            <div className="flex justify-between">
              <span className={dk ? 'text-white/50' : 'text-gray-500'}>Distance Fare</span>
              <span className={dk ? 'text-white/70' : 'text-gray-700'}>{formatCurrency(pricing.breakdown.distanceFare)}</span>
            </div>
            <div className="flex justify-between">
              <span className={dk ? 'text-white/50' : 'text-gray-500'}>Fuel Cost</span>
              <span className={dk ? 'text-white/70' : 'text-gray-700'}>{formatCurrency(pricing.breakdown.fuelCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className={dk ? 'text-white/50' : 'text-gray-500'}>Service Fee</span>
              <span className={dk ? 'text-white/70' : 'text-gray-700'}>{formatCurrency(pricing.breakdown.companyFee)}</span>
            </div>
            <p className={cn('text-xs pt-1', dk ? 'text-white/25' : 'text-gray-400')}>
              Est. fuel: {formatCurrency(fuelEst)} ({vehicle})
            </p>
          </div>
        </motion.div>
      )}
    </>
  );

  const confirmButton = (
    <button onClick={handleBook} disabled={!pickup || !dropoff}
      className={cn(
        'w-full py-4 rounded-2xl font-bold text-base transition flex items-center justify-center gap-2',
        pickup && dropoff
          ? 'bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand/25'
          : dk ? 'bg-surface-dark-3 text-white/20 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
      )}>
      {!user
        ? 'Sign In to Book'
        : orderType === 'scheduled'
          ? <><Calendar size={18} /> {pricing ? `Schedule — ${formatCurrency(pricing.breakdown.total)}` : 'Schedule Delivery'}</>
          : pricing
            ? <>Confirm — {formatCurrency(pricing.breakdown.total)} <ArrowRight size={18} /></>
            : <>Confirm Booking <ArrowRight size={18} /></>
      }
    </button>
  );

  // ── Searching-for-riders panel (in-page, no navigation) ──────────
  // Doubles as the "rider is responding" sub-state: same shell, swapped
  // copy/animation so the transition feels continuous rather than
  // jumping to a different screen when a rider opens the order.
  const isResponding = phase === 'rider_responding';
  const searchingContent = (
    <div className="flex flex-col items-center text-center py-8 space-y-5">
      <div className="relative w-28 h-28">
        <div className={cn('absolute inset-0 rounded-full animate-ping', isResponding ? 'bg-success/20' : 'bg-brand/20')} />
        <div className={cn('absolute inset-2.5 rounded-full animate-pulse', isResponding ? 'bg-success/25' : 'bg-brand/25')} />
        <div className={cn('absolute inset-5 rounded-full flex items-center justify-center shadow-lg',
          isResponding ? 'bg-success shadow-success/30' : 'bg-brand shadow-brand/30')}>
          <Bike size={30} className="text-white" />
        </div>
      </div>
      <div>
        <h2 className={cn('text-xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>
          {isResponding ? 'A rider is responding…' : 'Searching for riders…'}
        </h2>
        <p className={cn('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>
          {isResponding
            ? 'Reviewing your order now — hang tight'
            : <>Order <span className="font-bold text-brand">{activeOrder?.displayCode || orderId}</span> · notifying nearby riders</>}
        </p>
      </div>
      {!isResponding && (
        <p className={cn('text-xs flex items-center gap-1.5', dk ? 'text-white/40' : 'text-gray-400')}>
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          {onlineRiders.length} rider{onlineRiders.length === 1 ? '' : 's'} online right now
        </p>
      )}
      <button onClick={handleCancelSearch}
        className={cn('flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold border transition',
          dk ? 'border-white/10 text-white/60 hover:bg-white/5 hover:text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800')}>
        <X size={15} /> Cancel Booking
      </button>
    </div>
  );

  // ── Rider-assigned panel ─────────────────────────────────────────
  const assignedContent = (
    <div className="py-6 space-y-5 text-center">
      <div className="relative w-24 h-24 mx-auto">
        <div className="absolute inset-0 rounded-full bg-success/20 animate-pulse" />
        <div className="absolute inset-1 rounded-full overflow-hidden ring-4 ring-success/30">
          {assignedRider?.photoUrl ? (
            <img src={assignedRider.photoUrl} alt={activeOrder?.riderName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-success flex items-center justify-center text-white text-3xl font-black">
              {activeOrder?.riderName?.[0] || 'R'}
            </div>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-success uppercase tracking-widest">Rider Assigned</p>
        <h2 className={cn('text-2xl font-extrabold mt-1', dk ? 'text-white' : 'text-gray-900')}>{activeOrder?.riderName}</h2>
        <p className={cn('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>is on the way to your pickup point</p>
      </div>
      {assignedRider && (
        <div className={cn('flex items-center justify-center gap-4 text-xs', dk ? 'text-white/50' : 'text-gray-500')}>
          <span className="flex items-center gap-1">
            <Star size={12} className="text-yellow-400 fill-yellow-400" />
            {assignedRider.rating > 0 ? assignedRider.rating.toFixed(1) : 'New'}
          </span>
          <span>{assignedRider.totalDeliveries || 0} deliveries</span>
          <span className="uppercase">{assignedRider.vehiclePlate}</span>
        </div>
      )}
      <button onClick={() => navigate('/track?id=' + orderId)}
        className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand-dark transition shadow-lg shadow-brand/25 flex items-center justify-center gap-2">
        View Full Tracking <ArrowRight size={18} />
      </button>
    </div>
  );

  // ── Scheduled confirmation panel ─────────────────────────────────
  const scheduledContent = (
    <div className="py-6 space-y-5 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-20 rounded-full bg-success flex items-center justify-center mx-auto">
        <CheckCircle2 size={40} className="text-white" />
      </motion.div>
      <div>
        <h2 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Order Placed!</h2>
        <p className={cn('text-sm mt-2', dk ? 'text-white/50' : 'text-gray-500')}>
          Scheduled for{' '}
          <span className="font-bold text-brand">{formatDate(activeOrder?.scheduledFor || Date.now())}</span>
        </p>
        <p className={cn('text-xs mt-2', dk ? 'text-white/35' : 'text-gray-400')}>
          Order <span className="font-bold">{activeOrder?.displayCode || orderId}</span> is now visible to riders as a Scheduled delivery.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={resetForm}
          className="w-full bg-brand text-white py-3.5 rounded-2xl font-bold hover:bg-brand-dark transition shadow-lg shadow-brand/25">
          Book Another Delivery
        </button>
        <button onClick={() => navigate('/my-orders')}
          className={cn('w-full py-3.5 rounded-2xl font-bold border transition',
            dk ? 'border-white/10 text-white/70 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
          View My Orders
        </button>
      </div>
    </div>
  );

  // ── No riders available (auto-cancelled after 5 min) ─────────────
  const noRidersContent = (
    <div className="py-6 space-y-5 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-20 rounded-full bg-danger/10 flex items-center justify-center mx-auto">
        <AlertTriangle size={38} className="text-danger" />
      </motion.div>
      <div>
        <h2 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>No riders available right now</h2>
        <p className={cn('text-sm mt-2 leading-relaxed', dk ? 'text-white/50' : 'text-gray-500')}>
          Order <span className="font-bold">{activeOrder?.displayCode || orderId}</span> was cancelled because no rider accepted within 5 minutes.
          Please try again shortly.
        </p>
      </div>
      <button onClick={resetForm}
        className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand-dark transition shadow-lg shadow-brand/25 flex items-center justify-center gap-2">
        Try Booking Again <ArrowRight size={18} />
      </button>
    </div>
  );

  // ── No riders for a SCHEDULED delivery (missed its window) ────────
  const noRidersScheduledContent = (
    <div className="py-6 space-y-5 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-20 rounded-full bg-danger/10 flex items-center justify-center mx-auto">
        <AlertTriangle size={38} className="text-danger" />
      </motion.div>
      <div>
        <h2 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>No rider found for your scheduled delivery</h2>
        <p className={cn('text-sm mt-2 leading-relaxed', dk ? 'text-white/50' : 'text-gray-500')}>
          We couldn't find a rider for your scheduled delivery <span className="font-bold">{activeOrder?.displayCode || orderId}</span> —
          please rebook or try again.
        </p>
      </div>
      <button onClick={resetForm}
        className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand-dark transition shadow-lg shadow-brand/25 flex items-center justify-center gap-2">
        Book Another Delivery <ArrowRight size={18} />
      </button>
    </div>
  );

  const panelContent =
    phase === 'form' ? formContent
    : phase === 'searching' ? searchingContent
    : phase === 'rider_responding' ? searchingContent
    : phase === 'just_assigned' ? assignedContent
    : phase === 'assigned' ? assignedContent
    : phase === 'no_riders' ? noRidersContent
    : phase === 'no_riders_scheduled' ? noRidersScheduledContent
    : scheduledContent;

  const panelTitle =
    phase === 'form' ? 'Book a Delivery'
    : phase === 'searching' ? 'Finding Your Rider'
    : phase === 'rider_responding' ? 'Rider Responding'
    : phase === 'just_assigned' ? 'Rider Assigned'
    : phase === 'assigned' ? 'Rider Assigned'
    : phase === 'scheduled' ? 'Delivery Scheduled'
    : phase === 'no_riders_scheduled' ? 'Scheduled Delivery Unfilled'
    : 'No Riders Available';

  const panelSubtitle =
    phase === 'form' ? 'Search locations or drag the map to drop a pin'
    : phase === 'searching' ? 'Stay on this screen — we\'ll update you live'
    : phase === 'rider_responding' ? 'A rider is reviewing your order'
    : phase === 'just_assigned' ? 'Heading to your pickup point'
    : phase === 'assigned' ? 'Your rider is heading to pickup'
    : phase === 'scheduled' ? 'Your delivery is booked for later'
    : phase === 'no_riders_scheduled' ? 'Your scheduled delivery was cancelled'
    : 'Your order was cancelled automatically';

  // Collapsed mobile bar content per phase
  const collapsedBar = phase === 'form' ? (
    <div className="px-4 pb-3 space-y-2">
      <LocationSearch
        label="Pickup Location"
        value={pickup?.address || ''}
        onSelect={(v) => { setPickup(v); setPinMode(null); }}
        placeholder="Where to pick up?"
        onPinClick={handlePinPickup}
        pinActive={pinMode === 'pickup'}
        onUseCurrentLocation={handleUseLocationPickup}
      />
      <button onClick={() => setSheetOpen(true)}
        className={cn('w-full flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-xl transition',
          dk ? 'text-white/40 bg-white/5' : 'text-gray-500 bg-gray-100')}>
        <ChevronUp size={14} /> Tap to expand
      </button>
    </div>
  ) : (
    <button onClick={() => setSheetOpen(true)}
      className={cn('w-full px-4 pb-3 flex items-center justify-center gap-2 py-2 text-sm font-bold',
        dk ? 'text-white/70' : 'text-gray-700')}>
      {phase === 'searching' && (<><span className="w-2 h-2 rounded-full bg-brand animate-pulse" /> Searching for riders… <ChevronUp size={14} /></>)}
      {phase === 'rider_responding' && (<><span className="w-2 h-2 rounded-full bg-success animate-pulse" /> A rider is responding… <ChevronUp size={14} /></>)}
      {(phase === 'just_assigned' || phase === 'assigned') && (<><CheckCircle2 size={15} className="text-success" /> {activeOrder?.riderName} assigned <ChevronUp size={14} /></>)}
      {phase === 'scheduled' && (<><Calendar size={15} className="text-brand" /> Scheduled <ChevronUp size={14} /></>)}
      {phase === 'no_riders' && (<><AlertTriangle size={15} className="text-danger" /> No riders available <ChevronUp size={14} /></>)}
      {phase === 'no_riders_scheduled' && (<><AlertTriangle size={15} className="text-danger" /> Scheduled delivery unfilled <ChevronUp size={14} /></>)}
    </button>
  );

  return (
    <div style={{ position: 'relative', height: '100dvh', width: '100vw', overflow: 'hidden' }}>
      {/* ── Full-screen map — no navbar offset, the navbar is hidden on
          this route entirely per the full-screen map-page convention. ── */}
      <MapView
        markers={markers}
        route={route}
        onMapClick={pinMode ? handleMapClick : undefined}
        className="absolute inset-0 z-0"
        pinDropActive={!!pinMode}
      />

      {/* ── Back button — replaces the hidden navbar's own way home.
          Hidden during pin-drop, where its own back/Done bar takes over. ── */}
      {!pinMode && (
        <button onClick={() => navigate('/')}
          className="absolute z-20 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-700"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 12 }}>
          <ArrowLeftIcon size={20} />
        </button>
      )}

      {/* ── Pin-drop mode: sheet fully drops away (handled below via
          sheetOpen forced false) to reveal the complete map, with a
          "Done" button and a back button — not the floating label alone
          that used to sit on top of a partially-visible sheet. ────── */}
      {pinMode && (
        <>
          <div className="absolute z-20 flex items-center gap-3"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 12, right: 12 }}>
            <button onClick={() => setPinMode(null)}
              className="w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-700 shrink-0">
              <ArrowLeftIcon size={20} />
            </button>
            <div className={cn(
              'flex-1 text-center px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg',
              pinMode === 'pickup' ? 'bg-success text-white' : 'bg-brand text-white',
            )}>
              Drag map to set {pinMode === 'pickup' ? 'pickup' : 'drop-off'}
            </div>
          </div>
          <div className="absolute z-20 left-4 right-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
            <button onClick={() => setPinMode(null)}
              className="w-full bg-brand text-white py-4 rounded-2xl font-bold text-base shadow-xl shadow-brand/30">
              Done
            </button>
          </div>
        </>
      )}

      {/* ══ DESKTOP: floating panel (lg: and up) ════════════════ */}
      <div className={cn('hidden lg:flex absolute left-6 bottom-6 z-10 w-[400px] flex-col transition-opacity',
        pinMode ? 'opacity-0 pointer-events-none' : 'opacity-100')}
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 80px)' }}>
        <div className={cn(
          'flex-1 min-h-0 rounded-2xl shadow-2xl border flex flex-col overflow-hidden',
          dk ? 'bg-surface-dark-2/95 border-white/5 glass' : 'bg-white/95 border-gray-200 glass',
        )}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="mb-1">
              <h1 className={cn('text-xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{panelTitle}</h1>
              <p className={cn('text-xs mt-0.5', dk ? 'text-white/40' : 'text-gray-500')}>{panelSubtitle}</p>
            </div>
            {panelContent}
          </div>
          {phase === 'form' && (
            <div className={cn('p-4 border-t shrink-0', dk ? 'border-white/5' : 'border-gray-100')}>
              {confirmButton}
            </div>
          )}
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
          height: pinMode ? '0px' : sheetOpen ? `calc(100dvh - env(safe-area-inset-top, 0px) - 3.5rem)` : `${SHEET_COLLAPSED}px`,
          opacity: pinMode ? 0 : 1,
        }}
        style={{ pointerEvents: pinMode ? 'none' : 'auto' }}
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

        {/* Collapsed: phase summary bar */}
        {!sheetOpen && collapsedBar}

        {/* Expanded: full panel */}
        {sheetOpen && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto">
              <div className="mb-1">
                <h1 className={cn('text-lg font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{panelTitle}</h1>
              </div>
              {panelContent}
            </div>
            {phase === 'form' && (
              <div className={cn('p-4 border-t shrink-0', dk ? 'border-white/5' : 'border-gray-100')}>
                {confirmButton}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
