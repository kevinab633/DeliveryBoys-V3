import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Package, MapPin, DollarSign, Star, Clock, Calendar, PhoneCall, MessageSquare, Power, PowerOff, Eye, X, ChevronUp, ChevronDown, CheckCircle2, Navigation2, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { syncService } from '../lib/syncService';
import { cn, formatCurrency, formatDistance, formatDate, timeAgo } from '../lib/utils';
import { calculateDistance } from '../lib/pricing';
import { RiderProfile, Order } from '../lib/types';
import MapView from '../components/MapView';
import { fetchTurnByTurnRoute, DirectionStep } from '../components/MapView';
import { showToast } from '../components/Toast';

const SHEET_COLLAPSED = 190;
const NAV_HEIGHT_REM = 4.5;

// ── Ringing chime via Web Audio (no asset files needed) ────────────
let audioCtx: AudioContext | null = null;
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const notes = [880, 1174.66, 1567.98]; // A5 → D6 → G6, pleasant rising chime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch {
    // Audio unavailable — the pulsing animation still cues the rider
  }
}

// ── Swipe-to-collapse hook for sheet handles (same gesture as /book) ─
function useSwipeHandle(onDown: () => void, onUp: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY = 0;
    const ts = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const te = (e: TouchEvent) => {
      const d = e.changedTouches[0].clientY - startY;
      if (d > 40) onDown();
      else if (d < -40) onUp();
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchend', te, { passive: true });
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchend', te);
    };
  }, [onDown, onUp]);
  return ref;
}

// ── Order detail rows shared by modal + overlay ────────────────────
function OrderDetailRows({ order, dk, showEarnings }: { order: Order; dk: boolean; showEarnings?: boolean }) {
  const scheduled = (order.orderType || 'instant') === 'scheduled';
  return (
    <div className="space-y-3 text-sm">
      {scheduled && order.scheduledFor && (
        <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold',
          'bg-blue-500/10 text-blue-500')}>
          <Calendar size={14} /> Scheduled for {formatDate(order.scheduledFor)}
        </div>
      )}
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
      <div className="flex justify-between">
        <span className={dk ? 'text-white/50' : 'text-gray-500'}>Package</span>
        <span className={cn('font-medium text-right max-w-[60%]', dk ? 'text-white/80' : 'text-gray-700')}>{order.packageDescription || 'N/A'}</span>
      </div>
      <div className="flex justify-between">
        <span className={dk ? 'text-white/50' : 'text-gray-500'}>Customer</span>
        <span className={cn('font-medium', dk ? 'text-white/80' : 'text-gray-700')}>{order.customerName}</span>
      </div>
      <div className={cn('flex justify-between pt-2 border-t', dk ? 'border-white/5' : 'border-gray-100')}>
        <span className={dk ? 'text-white/50' : 'text-gray-500'}>Fare</span>
        <span className="font-bold text-brand text-lg">{formatCurrency(order.price)}</span>
      </div>
      {showEarnings && (
        <div className="flex justify-between text-xs">
          <span className={dk ? 'text-white/40' : 'text-gray-400'}>Your earnings (75%)</span>
          <span className={cn('font-bold', 'text-success')}>{formatCurrency(order.price * 0.75)}</span>
        </div>
      )}
    </div>
  );
}

// ── Ringing incoming-order modal (incoming-call style) ─────────────
function IncomingOrderModal({ order, taken, dk, riderLocation, onAccept, onDecline, onDismiss }: {
  order: Order;
  taken: boolean;
  dk: boolean;
  riderLocation?: { lat: number; lng: number };
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, y: 24 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        className={cn('relative w-full max-w-md rounded-3xl p-6 shadow-2xl border max-h-[90dvh] overflow-y-auto',
          dk ? 'bg-surface-dark-2 border-white/10' : 'bg-white border-gray-200')}>
        {taken ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-warning/15 flex items-center justify-center mx-auto mb-4">
              <Clock size={28} className="text-warning" />
            </div>
            <h3 className={cn('text-xl font-extrabold mb-1', dk ? 'text-white' : 'text-gray-900')}>Already taken</h3>
            <p className={cn('text-sm mb-5', dk ? 'text-white/50' : 'text-gray-500')}>Another rider accepted this order first.</p>
            <button onClick={onDismiss} className="bg-brand text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-dark transition">OK</button>
          </div>
        ) : (
          <>
            {/* Pulsing "incoming call" icon */}
            <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full bg-brand/25 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-brand/20 animate-pulse" />
              <div className="absolute inset-4 rounded-full bg-brand flex items-center justify-center shadow-lg shadow-brand/40">
                <Package size={30} className="text-white" />
              </div>
            </div>
            <div className="text-center mb-5">
              <h3 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Incoming Order!</h3>
              <p className={cn('text-xs mt-1', dk ? 'text-white/40' : 'text-gray-500')}>
                {order.id} · accept before another rider takes it
              </p>
            </div>

            <OrderDetailRows order={order} dk={dk} showEarnings />

            {/* Small map preview — full trip shape:
                dashed rider → pickup (not yet reached),
                solid pickup → dropoff (the delivery leg) */}
            <div className="mt-4 rounded-xl overflow-hidden border border-black/5">
              <MapView
                markers={[
                  ...(riderLocation && Number.isFinite(riderLocation.lat) && Number.isFinite(riderLocation.lng)
                    ? [{ lat: riderLocation.lat, lng: riderLocation.lng, color: '#3B82F6', icon: 'rider' as const }]
                    : []),
                  { lat: order.pickup.lat, lng: order.pickup.lng, color: '#10B981', icon: 'pickup' as const },
                  { lat: order.dropoff.lat, lng: order.dropoff.lng, color: '#C41E1E', icon: 'dropoff' as const },
                ]}
                route={[[order.pickup.lat, order.pickup.lng], [order.dropoff.lat, order.dropoff.lng]]}
                secondaryRoute={riderLocation && Number.isFinite(riderLocation.lat) && Number.isFinite(riderLocation.lng)
                  ? [[riderLocation.lat, riderLocation.lng], [order.pickup.lat, order.pickup.lng]]
                  : undefined}
                className="h-44"
                interactive={false}
                forceLightMode
              />
            </div>

            {/* Big Accept / Decline buttons */}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={onDecline}
                className={cn('py-4 rounded-2xl font-bold text-base border-2 transition',
                  dk ? 'border-white/10 text-white/60 hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>
                Decline
              </button>
              <button onClick={onAccept}
                className="py-4 rounded-2xl font-bold text-base bg-success text-white hover:brightness-110 transition shadow-lg shadow-success/30 flex items-center justify-center gap-2">
                <CheckCircle2 size={18} /> Accept
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Full-screen order detail overlay (same layout as /book & /track) ─
// ── Active Delivery: full-screen turn-by-turn navigation view ─────────
// Opens automatically the moment a rider has an accepted/picked-up/
// in-transit order — Google-Maps-style: the camera follows and rotates
// with the rider, a turn instruction banner sits at the top, and the
// trip/order details are tucked behind a small button so they never
// block the map. No native app has room for a permanent top address
// bar the way a web page does, so this view deliberately has none.
function ActiveDeliveryView({
  order, riderLocation, dk, onStatusUpdate, onMinimize,
}: {
  order: Order;
  riderLocation?: { lat: number; lng: number };
  dk: boolean;
  onStatusUpdate: (orderId: string, status: 'picked_up' | 'in_transit' | 'delivered') => void;
  onMinimize: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [steps, setSteps] = useState<DirectionStep[]>([]);
  const [heading, setHeading] = useState<number | undefined>(undefined);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [engineDebug, setEngineDebug] = useState<{ engine: 'maplibre' | 'leaflet'; reason?: string } | null>(null);
  const prevPosRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  // Whether the last heading update came from the device compass
  // (accurate even while stationary) vs. GPS movement bearing (only
  // available once actually moving) — GPS movement is treated as the
  // more trustworthy source once available, since compass readings can
  // drift, but compass is what lets the arrow turn as the phone turns
  // while parked or crawling in traffic, which GPS bearing alone cannot.
  const usingCompassRef = useRef(false);

  // Device compass — subscribes to real orientation events so the map
  // can rotate to match which way the phone (and rider) is actually
  // facing even at 0 km/h. iOS Safari requires an explicit permission
  // prompt for this; Android Chrome generally does not.
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

    function handleOrientation(e: DeviceOrientationEvent) {
      // webkitCompassHeading (iOS) is already a true compass heading;
      // alpha (standard) is relative to the device's initial orientation
      // and needs inverting to become a compass heading in most browsers.
      const anyE = e as any;
      let compassHeading: number | null = null;
      if (typeof anyE.webkitCompassHeading === 'number') {
        compassHeading = anyE.webkitCompassHeading;
      } else if (typeof e.alpha === 'number') {
        compassHeading = (360 - e.alpha) % 360;
      }
      if (compassHeading !== null && Number.isFinite(compassHeading)) {
        usingCompassRef.current = true;
        setHeading(compassHeading);
      }
    }

    window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  const leg = order.status === 'accepted'
    ? { label: 'Pickup', address: order.pickup.address, coords: order.pickup }
    : { label: 'Dropoff', address: order.dropoff.address, coords: order.dropoff };

  const hasRiderFix = !!riderLocation && Number.isFinite(riderLocation.lat) && Number.isFinite(riderLocation.lng);

  // Heading, computed from the bearing between consecutive real GPS
  // fixes — there's no compass reading from watchPosition alone, but a
  // moving vehicle's direction of travel is a reliable stand-in, exactly
  // how Google Maps derives its arrow when not using the device compass.
  // Speed is derived the same way (distance/time between fixes), matching
  // Yango's driving-mode top bar, which shows a live speedometer.
  useEffect(() => {
    if (!hasRiderFix || !riderLocation) return;
    const now = Date.now();
    const prev = prevPosRef.current;
    if (prev && (prev.lat !== riderLocation.lat || prev.lng !== riderLocation.lng)) {
      const toRad = (d: number) => d * Math.PI / 180;
      const toDeg = (r: number) => r * 180 / Math.PI;
      const y = Math.sin(toRad(riderLocation.lng - prev.lng)) * Math.cos(toRad(riderLocation.lat));
      const x = Math.cos(toRad(prev.lat)) * Math.sin(toRad(riderLocation.lat))
        - Math.sin(toRad(prev.lat)) * Math.cos(toRad(riderLocation.lat)) * Math.cos(toRad(riderLocation.lng - prev.lng));
      const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
      const distKm = calculateDistance(prev.lat, prev.lng, riderLocation.lat, riderLocation.lng);
      const dtHours = (now - prev.t) / 3_600_000;
      // Only update heading/speed on real movement (a few metres), so
      // they don't jitter randomly from GPS noise while stationary —
      // and guard against a near-zero time delta producing a bogus spike.
      const moved = distKm > 0.003;
      if (moved) {
        setHeading(brng);
        if (dtHours > 0) setSpeedKmh(Math.min(distKm / dtHours, 180)); // clamp absurd GPS-jump spikes
      } else if (now - prev.t > 5000) {
        // Stationary for a few seconds — show 0 rather than a stale speed.
        setSpeedKmh(0);
      }
    }
    prevPosRef.current = { lat: riderLocation.lat, lng: riderLocation.lng, t: now };
  }, [riderLocation?.lat, riderLocation?.lng, hasRiderFix]);

  // Fetch real turn-by-turn steps + total distance/duration for the
  // current leg. Re-fetches periodically (not just when the leg
  // changes) so remaining distance/time/ETA stay roughly accurate as
  // the rider actually moves — throttled to every 20s to stay well
  // clear of Mapbox rate limits rather than firing on every GPS tick.
  const [routeTotals, setRouteTotals] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const lastFetchRef = useRef(0);
  useEffect(() => {
    if (!hasRiderFix || !riderLocation) { setSteps([]); setRouteTotals(null); return; }
    const now = Date.now();
    if (now - lastFetchRef.current < 20_000 && lastFetchRef.current !== 0) return;
    lastFetchRef.current = now;
    let cancelled = false;
    fetchTurnByTurnRoute([riderLocation.lat, riderLocation.lng], [leg.coords.lat, leg.coords.lng])
      .then(res => {
        if (cancelled) return;
        setSteps(res?.steps || []);
        setRouteTotals(res ? { distanceMeters: res.distanceMeters, durationSeconds: res.durationSeconds } : null);
      })
      .catch(() => { if (!cancelled) { setSteps([]); setRouteTotals(null); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg.coords.lat, leg.coords.lng, hasRiderFix, riderLocation?.lat, riderLocation?.lng]);

  // Nearest upcoming step to the rider's current position — a rough but
  // effective way to advance "next instruction" without full route
  // progress-matching, which would need much more map-matching logic.
  const currentStep = steps.length > 0 && riderLocation
    ? steps.reduce((closest, s) => {
        const d = calculateDistance(riderLocation.lat, riderLocation.lng, s.location[0], s.location[1]);
        const dClosest = calculateDistance(riderLocation.lat, riderLocation.lng, closest.location[0], closest.location[1]);
        return d < dClosest ? s : closest;
      })
    : null;

  const legRoute: [number, number][] | undefined = hasRiderFix && riderLocation
    ? [[riderLocation.lat, riderLocation.lng], [leg.coords.lat, leg.coords.lng]]
    : undefined;

  // Derived trip metrics for the bottom panel — mirrors Yango's real
  // driving_modal_view: arrival time + remaining distance + remaining
  // time shown together, plus a progress bar for how much of the leg
  // is done so far.
  const arrivalTime = routeTotals
    ? new Date(Date.now() + routeTotals.durationSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const remainingKm = routeTotals ? routeTotals.distanceMeters / 1000 : null;
  const remainingMin = routeTotals ? Math.max(1, Math.round(routeTotals.durationSeconds / 60)) : null;
  // Progress = how much of the ORIGINAL leg distance has been covered,
  // estimated from current remaining vs. the first totals fetched for
  // this leg (a rough but effective stand-in for true route-progress
  // matching, which needs much more map-matching logic than this needs).
  const initialTotalRef = useRef<number | null>(null);
  useEffect(() => { initialTotalRef.current = null; }, [leg.coords.lat, leg.coords.lng]);
  if (routeTotals && initialTotalRef.current === null) initialTotalRef.current = routeTotals.distanceMeters;
  const progressPct = routeTotals && initialTotalRef.current
    ? Math.min(100, Math.max(0, 100 - (routeTotals.distanceMeters / initialTotalRef.current) * 100))
    : 0;

  const nextAction =
    order.status === 'accepted' ? { label: 'Mark Picked Up', next: 'picked_up' as const }
    : order.status === 'picked_up' ? { label: 'Start Delivery', next: 'in_transit' as const }
    : { label: 'Mark Delivered', next: 'delivered' as const };

  const ManeuverIcon = currentStep?.maneuverModifier === 'left' ? ArrowLeft
    : currentStep?.maneuverModifier === 'right' ? ArrowRight
    : currentStep?.maneuverType === 'arrive' ? MapPin
    : ArrowUp;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      {/* Map fills the whole screen — forceLightMode for sunlight
          readability, and follows/rotates with the rider like Google
          Maps navigation instead of a fixed top-down view. */}
      <MapView
        markers={[
          { lat: order.pickup.lat, lng: order.pickup.lng, icon: 'pickup', label: 'Pickup' },
          { lat: order.dropoff.lat, lng: order.dropoff.lng, icon: 'dropoff', label: 'Dropoff' },
          ...(hasRiderFix && riderLocation
            ? [{ lat: riderLocation.lat, lng: riderLocation.lng, icon: 'rider' as const, label: 'You' }]
            : []),
        ]}
        route={[[order.pickup.lat, order.pickup.lng], [order.dropoff.lat, order.dropoff.lng]]}
        secondaryRoute={legRoute}
        className="absolute inset-0"
        interactive={true}
        forceLightMode
        followPosition={hasRiderFix ? riderLocation : undefined}
        followHeading={heading}
        onEngineChange={(engine, reason) => setEngineDebug({ engine, reason })}
      />

      {/* Turn instruction (top-left) + speedometer (top-right) — mirrors
          Yango's actual driving-mode top bar layout: maneuver card on
          one side, live speed on the other, matching real GPS movement
          rather than a placeholder. This banner (not a top bar) is the
          only thing pinned to the top of the screen. */}
      <div className="relative z-10 flex items-start justify-between gap-2 px-3 pt-3">
        {currentStep ? (
          <div className="bg-gray-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <ManeuverIcon size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-base leading-tight truncate">
                {formatDistance(currentStep.distanceMeters / 1000)}
              </p>
              <p className="text-xs text-white/60 truncate">{currentStep.instruction}</p>
            </div>
          </div>
        ) : <div />}

        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Speedometer — live speed derived from consecutive real GPS
              fixes (watchPosition doesn't reliably expose device speed
              directly on all browsers, so this is computed the same way
              as heading, from distance/time between fixes). */}
          {speedKmh !== null && (
            <div className="bg-white rounded-2xl shadow-lg w-14 h-14 flex flex-col items-center justify-center border-2 border-gray-900">
              <span className="font-extrabold text-gray-900 text-lg leading-none">{Math.round(speedKmh)}</span>
              <span className="text-[9px] text-gray-500 font-semibold leading-none mt-0.5">km/h</span>
            </div>
          )}
          <button onClick={onMinimize}
            className="w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-700">
            <ChevronDown size={22} />
          </button>
        </div>
      </div>

      {/* TEMPORARY diagnostic badge — shows which map engine is actually
          running and why, since a silent fallback to Leaflet would
          explain a flat, non-rotating map with none of the navigation
          styling applied. Remove once the real cause is confirmed. */}
      {engineDebug && (
        <div className={cn('relative z-10 mx-3 mt-2 px-3 py-2 rounded-xl text-xs font-mono',
          engineDebug.engine === 'maplibre' ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
          engine: {engineDebug.engine}{engineDebug.reason ? ` — ${engineDebug.reason}` : ''}
        </div>
      )}

      {/* Trip-details toggle — a small pill instead of a permanent
          panel, so tapping it is the only time order info covers any
          of the map. */}
      <div className="relative z-10 mt-auto px-3 pb-3">
        {detailsOpen ? (
          <div className="bg-white rounded-3xl shadow-2xl px-5 pt-2 pb-6 space-y-4">
            <button onClick={() => setDetailsOpen(false)}
              className="w-full flex items-center justify-center py-3 -mt-1 mb-1">
              <span className="w-10 h-1 bg-gray-300 rounded-full" />
            </button>

            {/* Trip metrics: arrival time + remaining distance + time
                together, plus a progress bar — matches Yango's real
                driving_modal_view layout rather than a single line. */}
            {routeTotals && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-extrabold text-gray-900 text-xl">{arrivalTime}</span>
                    <span className="text-xs text-gray-400 font-medium">arrival</span>
                  </div>
                  <div className="text-right text-sm text-gray-500 font-semibold">
                    {remainingMin} min · {formatDistance(remainingKm || 0)}
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">{order.id}</p>
                <p className="text-sm text-gray-500">{order.customerName} · {leg.address}</p>
              </div>
              <span className="text-brand font-extrabold text-lg shrink-0">{formatCurrency(order.price)}</span>
            </div>
            <div className="flex gap-2">
              <a href={`tel:${order.customerPhone}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm">
                <PhoneCall size={16} /> Call
              </a>
              <a href={`sms:${order.customerPhone}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm">
                <MessageSquare size={16} /> Message
              </a>
            </div>
            <button onClick={() => onStatusUpdate(order.id, nextAction.next)}
              className="w-full bg-brand text-white py-4 rounded-2xl font-bold text-base hover:bg-brand-dark transition shadow-lg shadow-brand/25">
              {nextAction.label}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setDetailsOpen(true)}
              className="flex-1 bg-white rounded-2xl shadow-xl px-4 py-3.5 flex items-center gap-2 font-semibold text-sm text-gray-900">
              <ChevronUp size={16} className="text-gray-400" /> {order.id} · {formatCurrency(order.price)}
            </button>
            <button onClick={() => onStatusUpdate(order.id, nextAction.next)}
              className="bg-brand text-white px-5 py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-brand/30 whitespace-nowrap">
              {nextAction.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


function OrderDetailOverlay({ order, dk, onClose, onAccept, onDecline }: {
  order: Order;
  dk: boolean;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(true);
  const isPending = order.status === 'pending';

  // Lock body scroll while the overlay is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const swipeDown = useCallback(() => setSheetOpen(false), []);
  const swipeUp = useCallback(() => setSheetOpen(true), []);
  const handleRef = useSwipeHandle(swipeDown, swipeUp);

  const details = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={cn('text-lg font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Trip: {order.id}</h2>
          <p className={cn('text-xs mt-0.5', dk ? 'text-white/40' : 'text-gray-500')}>
            {isPending ? 'Waiting for a rider' : `Status: ${order.status.replace('_', ' ')}`} · {timeAgo(order.createdAt)}
          </p>
        </div>
        <button onClick={onClose}
          className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition shrink-0',
            dk ? 'text-white/40 hover:bg-white/5 hover:text-white/80' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700')}>
          <X size={18} />
        </button>
      </div>
      <OrderDetailRows order={order} dk={dk} showEarnings />
      {/* Contact customer */}
      <div className="flex gap-2">
        <a href={`tel:${order.customerPhone}`}
          className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition border',
            dk ? 'border-white/10 text-white/70 hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
          <PhoneCall size={15} /> Call
        </a>
        <a href={`https://wa.me/${order.customerPhone.replace(/\+/g, '')}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition">
          <MessageSquare size={15} /> WhatsApp
        </a>
      </div>
    </>
  );

  const actionButtons = isPending && (
    <div className="grid grid-cols-2 gap-3">
      <button onClick={onDecline}
        className={cn('py-4 rounded-2xl font-bold border-2 transition',
          dk ? 'border-white/10 text-white/60 hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>
        Decline
      </button>
      <button onClick={onAccept}
        className="py-4 rounded-2xl font-bold bg-brand text-white hover:bg-brand-dark transition shadow-lg shadow-brand/25">
        Accept Order
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40" style={{ paddingTop: '4rem' }}>
      {/* Full-screen map with the trip route */}
      <MapView
        markers={[
          { lat: order.pickup.lat, lng: order.pickup.lng, color: '#10B981', popup: 'Pickup: ' + order.pickup.address, icon: 'pickup' },
          { lat: order.dropoff.lat, lng: order.dropoff.lng, color: '#C41E1E', popup: 'Drop-off: ' + order.dropoff.address, icon: 'dropoff' },
        ]}
        route={[[order.pickup.lat, order.pickup.lng], [order.dropoff.lat, order.dropoff.lng]]}
        className="absolute inset-0 top-16 z-0"
        forceLightMode
      />

      {/* ══ DESKTOP: floating panel ══ */}
      <div className="hidden lg:flex absolute top-20 left-6 bottom-6 z-10 w-[400px] flex-col">
        <div className={cn('flex-1 min-h-0 rounded-2xl shadow-2xl border flex flex-col overflow-hidden',
          dk ? 'bg-surface-dark-2/95 border-white/5 glass' : 'bg-white/95 border-gray-200 glass')}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">{details}</div>
          {actionButtons && (
            <div className={cn('p-4 border-t shrink-0', dk ? 'border-white/5' : 'border-gray-100')}>{actionButtons}</div>
          )}
        </div>
      </div>

      {/* ══ MOBILE: bottom sheet ══ */}
      <motion.div
        className={cn('lg:hidden fixed left-0 right-0 bottom-0 z-20 flex flex-col rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.25)]',
          dk ? 'bg-surface-dark-2 border-t border-white/5' : 'bg-white border-t border-gray-200')}
        animate={{ height: sheetOpen ? `calc(100dvh - ${NAV_HEIGHT_REM}rem)` : `${SHEET_COLLAPSED}px` }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div ref={handleRef} className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
          <button onClick={onClose}
            className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition shrink-0',
              dk ? 'text-white/40 hover:bg-white/5' : 'text-gray-400 hover:bg-gray-100')}>
            <X size={18} />
          </button>
          <div className="flex-1 flex justify-center py-2 cursor-pointer" onClick={() => setSheetOpen(!sheetOpen)}>
            <div className={cn('w-10 h-1 rounded-full', dk ? 'bg-white/20' : 'bg-gray-300')} />
          </div>
          {sheetOpen ? (
            <button onClick={() => setSheetOpen(false)}
              className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition shrink-0',
                dk ? 'text-white/40 hover:bg-white/5' : 'text-gray-400 hover:bg-gray-100')}>
              <ChevronDown size={20} />
            </button>
          ) : <div className="w-9" />}
        </div>

        {!sheetOpen && (
          <button onClick={() => setSheetOpen(true)}
            className={cn('w-full px-4 pb-3 flex items-center justify-center gap-2 py-2 text-sm font-bold',
              dk ? 'text-white/70' : 'text-gray-700')}>
            {order.id} · {formatCurrency(order.price)} <ChevronUp size={14} />
          </button>
        )}

        {sheetOpen && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto">{details}</div>
            {actionButtons && (
              <div className={cn('p-4 border-t shrink-0', dk ? 'border-white/5' : 'border-gray-100')}>{actionButtons}</div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────
export default function RiderDashboard() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user, setRiderAvailability, updateRiderLocation } = useAuthStore();
  const { orders, acceptOrder, updateOrderStatus, getPendingOrders, getOrdersByRider, fetchOrders } = useOrderStore();
  const [tab, setTab] = useState<'available' | 'my'>('available');

  // Ringing modal + full-screen detail state
  const [ringingOrder, setRingingOrder] = useState<Order | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  // The active-delivery nav view opens automatically on accept; this lets
  // the rider collapse it back to the list without losing the order —
  // it reopens automatically next time activeOrder changes (e.g. status
  // advances), so minimizing is a per-glance choice, not a dismissal.
  const [navMinimized, setNavMinimized] = useState(false);
  const [declinedIds, setDeclinedIds] = useState<string[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const rider = user as RiderProfile;

  const pending = getPendingOrders();
  const myOrders = rider ? getOrdersByRider(rider.id) : [];
  const activeOrder = myOrders.find(o => ['accepted', 'picked_up', 'in_transit'].includes(o.status));

  // Re-open the full nav view whenever the active order's status advances
  // (e.g. picked up → in transit) even if it was minimized on the
  // previous leg — each new leg is worth surfacing again.
  useEffect(() => {
    setNavMinimized(false);
  }, [activeOrder?.status]);

  // Keep the detail overlay's order fresh from the store
  const liveDetail = detailOrder ? orders.find(o => o.id === detailOrder.id) || detailOrder : null;
  // Keep the ringing order fresh — detect if someone else took it
  const liveRinging = ringingOrder ? orders.find(o => o.id === ringingOrder.id) || null : null;
  const ringingTaken = !!liveRinging && liveRinging.status !== 'pending';

  // ── Catch-up fetch on mount: pull open + own orders so this device sees
  //    what other devices created/updated (merges via __applyServerOrder).
  useEffect(() => {
    void fetchOrders({ status: 'pending' });
    if (rider?.id) void fetchOrders({ riderId: rider.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.id]);

  // ── Real GPS tracking, replacing the old fake jittered-position
  //    simulation. Watches the device's actual location continuously
  //    while online, and broadcasts it (throttled) so customers see the
  //    rider's true position rather than a random wander. Stops watching
  //    the moment the rider goes offline, so it never runs in the
  //    background unnecessarily or drains battery for no reason. ──────
  useEffect(() => {
    if (!rider || rider.role !== 'rider' || rider.availability !== 'online') return;
    if (!('geolocation' in navigator)) {
      console.warn('[RiderDashboard] Geolocation not supported on this device/browser.');
      return;
    }

    let lastSentAt = 0;
    let lastSentLat: number | null = null;
    let lastSentLng: number | null = null;

    // Haversine distance in meters — used to throttle by real movement,
    // not just by a timer, so a stationary rider doesn't spam updates.
    function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const now = Date.now();
        const movedEnough = lastSentLat === null || metersBetween(lastSentLat, lastSentLng!, lat, lng) >= 10;
        const timeEnough = now - lastSentAt >= 4000;
        if (!movedEnough && !timeEnough) return;
        lastSentAt = now;
        lastSentLat = lat;
        lastSentLng = lng;
        updateRiderLocation(lat, lng);
        if (activeOrder) {
          syncService.broadcastRiderLocation(activeOrder.id, lat, lng, rider.id);
        }
      },
      (err) => {
        console.warn('[RiderDashboard] Geolocation error:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.availability, activeOrder?.id]);

  // ── Ringing trigger: online rider + INSTANT pending order that has
  //    this rider inside its active dispatch window (dispatchedTo).
  //    Legacy orders (dispatchedTo === undefined) ring for everyone.
  //    Scheduled orders never ring — they just appear in the list.
  useEffect(() => {
    if (!rider || rider.role !== 'rider') return;
    if (rider.availability !== 'online' || ringingOrder) return;
    const candidate = pending.find(o =>
      (o.orderType || 'instant') !== 'scheduled' &&
      (o.dispatchedTo === undefined || o.dispatchedTo.includes(rider.id)) &&
      !declinedIds.includes(o.id) &&
      !seenIds.current.has(o.id),
    );
    if (candidate) {
      seenIds.current.add(candidate.id);
      setRingingOrder(candidate);
      playChime();
      // Let the customer's screen know a rider is now reviewing this
      // order the moment it starts ringing — not only once accepted.
      syncService.broadcastRiderResponding(candidate.id, rider.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, pending.length, rider?.availability, ringingOrder, declinedIds]);

  // ── Keep staged dispatch moving even if the customer's tab closed:
  //    every 15 s widen every still-pending order's dispatch window —
  //    instant orders always, scheduled orders once the sweep has
  //    started their dispatch (idempotent store action). ───────────
  useEffect(() => {
    if (!rider || rider.role !== 'rider' || rider.availability !== 'online') return;
    const iv = setInterval(() => {
      const state = useOrderStore.getState();
      state.orders
        .filter(o => o.status === 'pending' && (
          (o.orderType || 'instant') !== 'scheduled' || (o.dispatchedTo || []).length > 0
        ))
        .forEach(o => state.expandOrderDispatch(o.id));
    }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.availability]);

  // Keep ringing while the modal is open (incoming-call style)
  useEffect(() => {
    if (!ringingOrder || ringingTaken) return;
    const iv = setInterval(playChime, 3000);
    return () => clearInterval(iv);
  }, [ringingOrder?.id, ringingTaken]);

  // Broadcast "responding" whenever the rider opens the full order detail
  // view directly (tapping an available order card) — covers reviewing
  // an order outside the ringing popup, e.g. browsing the Available tab.
  useEffect(() => {
    if (!rider) return;
    if (detailOrder) {
      syncService.broadcastRiderResponding(detailOrder.id, rider.id);
      return () => syncService.broadcastRiderResponding(detailOrder.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOrder?.id]);

  // Going offline dismisses any ringing modal
  useEffect(() => {
    if (rider?.availability !== 'online') {
      if (ringingOrder) syncService.broadcastRiderResponding(ringingOrder.id);
      setRingingOrder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.availability]);

  // Toast for new SCHEDULED orders (instant ones ring instead)
  const prevPendingCount = useRef(pending.length);
  useEffect(() => {
    if (pending.length > prevPendingCount.current && rider?.availability === 'online') {
      const newest = pending[0];
      if (newest && (newest.orderType || 'instant') === 'scheduled') {
        showToast({ title: '📅 New Scheduled Order', message: `${newest.pickup.address} → ${newest.dropoff.address}`, type: 'info' });
      }
    }
    prevPendingCount.current = pending.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length]);

  if (!rider || rider.role !== 'rider') return <div className="pt-20 min-h-screen flex items-center justify-center"><p className={dk ? 'text-white/50' : 'text-gray-500'}>Please sign in as a rider.</p></div>;

  // ── Accept (first-come-first-served via orderStore guard) ───────
  // Lifecycle notifications (customer + rider) fire inside acceptOrder.
  const handleAccept = (order: Order) => {
    const ok = acceptOrder(order.id, rider.id, rider.name);
    if (!ok) {
      // Another rider already accepted it (or it was cancelled)
      showToast({ title: 'Already taken', message: 'Another rider accepted this order first.', type: 'error' });
      syncService.broadcastRiderResponding(order.id);
      setRingingOrder(null);
      setDetailOrder(null);
      return;
    }
    showToast({ title: 'Order Accepted!', message: `You accepted ${order.id}. Head to pickup.`, type: 'success' });
    syncService.broadcastRiderResponding(order.id);
    setRingingOrder(null);
    setDetailOrder(null);
    setTab('my');
  };

  // ── Decline: dismiss for THIS rider only; order stays available ──
  const handleDecline = (order: Order) => {
    setDeclinedIds(prev => prev.includes(order.id) ? prev : [...prev, order.id]);
    syncService.broadcastRiderResponding(order.id);
    setRingingOrder(null);
  };

  const handleDeclineAndClose = (order: Order) => {
    handleDecline(order);
    setDetailOrder(null);
  };

  // Lifecycle notifications fire inside updateOrderStatus.
  const handleStatusUpdate = (orderId: string, status: 'picked_up' | 'in_transit' | 'delivered') => {
    updateOrderStatus(orderId, status);
  };

  return (
    <div className="min-h-screen" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}>
      {/* Lightweight page header — replaces the hidden global navbar on
          this full-screen route, so the rider still has a way back to
          Home/logout without a permanent heavy navbar competing with the
          nav view above it. */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 bg-white border-b border-gray-100"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}>
        <Link to="/" className="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <span className="font-bold text-gray-900 text-sm">Rider Dashboard</span>
      </div>
      <section className={cn('py-6', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Rider Dashboard</h1>
              <p className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>Welcome, {rider.name}</p>
              {rider.status === 'pending' && <span className="inline-block mt-2 px-3 py-1 rounded-full bg-warning/10 text-warning text-xs font-bold">Pending Approval</span>}
            </div>
            <button onClick={() => setRiderAvailability(rider.availability === 'online' ? 'offline' : 'online')}
              className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition',
                rider.availability === 'online' ? 'bg-success text-white' : dk ? 'bg-surface-dark-3 text-white/50' : 'bg-gray-200 text-gray-600')}>
              {rider.availability === 'online' ? <><Power size={16} /> Online</> : <><PowerOff size={16} /> Go Online</>}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {[
              { icon: Package, label: 'Deliveries', value: rider.totalDeliveries || 0 },
              { icon: Star, label: 'Rating', value: rider.rating > 0 ? rider.rating.toFixed(1) : 'No ratings' },
              { icon: DollarSign, label: 'Earnings', value: formatCurrency(rider.earnings) },
              { icon: Clock, label: 'Active', value: activeOrder ? 'Yes' : 'No' },
            ].map(s => (
              <div key={s.label} className={cn('p-4 rounded-xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-gray-50 border-gray-200')}>
                <s.icon size={18} className="text-brand mb-2" />
                <p className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{s.value}</p>
                <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={cn('py-6', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6">
          {/* Tabs */}
          <div className={cn('flex rounded-xl p-1 mb-6 max-w-md', dk ? 'bg-surface-dark-3' : 'bg-gray-200')}>
            {(['available', 'my'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-1 py-2.5 rounded-lg text-sm font-semibold transition capitalize',
                  tab === t ? 'bg-brand text-white shadow' : dk ? 'text-white/50' : 'text-gray-500')}>
                {t === 'available' ? `Available (${pending.length})` : `My Orders (${myOrders.length})`}
              </button>
            ))}
          </div>

          {tab === 'available' ? (
            <div className="space-y-4">
              {pending.length === 0 && <div className="text-center py-16"><Package size={48} className={cn('mx-auto mb-4', dk ? 'text-white/20' : 'text-gray-300')} /><p className={dk ? 'text-white/40' : 'text-gray-500'}>No available orders right now</p></div>}
              {pending.map(o => {
                const scheduled = (o.orderType || 'instant') === 'scheduled';
                return (
                  <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    onClick={() => setDetailOrder(o)}
                    className={cn('p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer transition',
                      dk ? 'bg-surface-dark-3 border-white/5 hover:border-brand/30' : 'bg-white border-gray-200 hover:border-brand/40 hover:shadow-md')}>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>{o.id}</span>
                        <span className="text-xs text-brand font-semibold">{formatDistance(o.distance)}</span>
                        {scheduled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500">
                            <Calendar size={10} /> Scheduled{o.scheduledFor ? ` · ${formatDate(o.scheduledFor)}` : ''}
                          </span>
                        ) : (
                          <span className={cn('text-xs', dk ? 'text-white/30' : 'text-gray-400')}>{timeAgo(o.createdAt)}</span>
                        )}
                      </div>
                      <p className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>{o.pickup.address} → {o.dropoff.address}</p>
                      <p className="text-brand font-bold mt-1">{formatCurrency(o.price)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setDetailOrder(o); }}
                        className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition', dk ? 'bg-surface-dark-2 text-white/70 hover:bg-white/5' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                        <Eye size={14} className="inline mr-1" /> View
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleAccept(o); }}
                        className="px-4 py-2 rounded-lg text-sm font-bold bg-brand text-white hover:bg-brand-dark transition">Accept</button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {myOrders.length === 0 && <div className="text-center py-16"><Package size={48} className={cn('mx-auto mb-4', dk ? 'text-white/20' : 'text-gray-300')} /><p className={dk ? 'text-white/40' : 'text-gray-500'}>No orders yet</p></div>}
              {myOrders.map(o => (
                <div key={o.id} className={cn('p-5 rounded-xl border', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <span className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>{o.id}</span>
                      <span className={cn('ml-2 px-2 py-0.5 rounded-full text-xs font-bold capitalize',
                        o.status === 'delivered' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>{o.status.replace('_', ' ')}</span>
                    </div>
                    <span className="text-brand font-bold">{formatCurrency(o.price)}</span>
                  </div>
                  <p className={cn('text-sm mb-3', dk ? 'text-white/50' : 'text-gray-500')}>{o.pickup.address} → {o.dropoff.address}</p>
                  {o.status === 'accepted' && <button onClick={() => handleStatusUpdate(o.id, 'picked_up')} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold">Mark Picked Up</button>}
                  {o.status === 'picked_up' && <button onClick={() => handleStatusUpdate(o.id, 'in_transit')} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold">Start Delivery</button>}
                  {o.status === 'in_transit' && <button onClick={() => handleStatusUpdate(o.id, 'delivered')} className="bg-success text-white px-4 py-2 rounded-lg text-sm font-bold">Mark Delivered</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Active delivery: full-screen live nav, auto-opens on accept ── */}
      {activeOrder && !navMinimized && (
        <ActiveDeliveryView
          order={activeOrder}
          riderLocation={rider.location}
          dk={dk}
          onStatusUpdate={handleStatusUpdate}
          onMinimize={() => setNavMinimized(true)}
        />
      )}
      {activeOrder && navMinimized && (
        <button onClick={() => setNavMinimized(false)}
          className="fixed bottom-24 right-4 z-30 flex items-center gap-2 bg-brand text-white px-4 py-3 rounded-full shadow-xl shadow-brand/30 font-bold text-sm">
          <Navigation2 size={16} /> Resume navigation
        </button>
      )}

      {/* ── Ringing incoming-order modal ─────────────────────────── */}
      {ringingOrder && liveRinging && (
        <IncomingOrderModal
          order={liveRinging}
          taken={ringingTaken}
          dk={dk}
          riderLocation={rider.location}
          onAccept={() => handleAccept(liveRinging)}
          onDecline={() => handleDecline(liveRinging)}
          onDismiss={() => { syncService.broadcastRiderResponding(liveRinging.id); setRingingOrder(null); }}
        />
      )}

      {/* ── Full-screen order detail overlay ─────────────────────── */}
      {liveDetail && (
        <OrderDetailOverlay
          order={liveDetail}
          dk={dk}
          onClose={() => setDetailOrder(null)}
          onAccept={() => handleAccept(liveDetail)}
          onDecline={() => handleDeclineAndClose(liveDetail)}
        />
      )}

    </div>
  );
}
