import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, UtensilsCrossed, ShoppingCart, FileText, Zap, Bike, ArrowRight, Shield, Clock, MapPin, TrendingUp, TrendingDown, Minus, Star, ChevronRight, Power, PowerOff, DollarSign, CheckCircle2, Wallet, Pill, Gift, MoreHorizontal } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { cn, formatCurrency } from '../lib/utils';
import { RiderProfile } from '../lib/types';
import MicroSlatsBackdrop from '../components/MicroSlatsBackdrop';




const steps = [
  { n: '01', title: 'Book Online', desc: 'Enter pickup & drop-off. Search locations or drop a pin on the map.', icon: MapPin },
  { n: '02', title: 'Get Matched', desc: 'A nearby rider sees your order and accepts it instantly.', icon: Bike },
  { n: '03', title: 'Track Live', desc: 'Watch your rider move in real-time on the live map.', icon: Clock },
  { n: '04', title: 'Delivered!', desc: 'Your item arrives safely. Rate your experience.', icon: Star },
];

// ════════════════════════════════════════════════════════════════════
// RIDER-FOCUSED HOME (logged-in riders only)
// ════════════════════════════════════════════════════════════════════
const riderSteps = [
  { n: '01', title: 'Go Online', desc: 'Flip the switch to online and start receiving nearby orders instantly.', icon: Power },
  { n: '02', title: 'Accept Orders', desc: 'Orders ring on your dashboard — nearest riders get alerted first.', icon: CheckCircle2 },
  { n: '03', title: 'Deliver & Get Paid', desc: 'Pick up, drop off, and earn 75% of every fare you complete.', icon: Wallet },
];

function RiderHomePage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user, setRiderAvailability } = useAuthStore();
  const { orders } = useOrderStore();
  const rider = user as RiderProfile;

  // ── Real stats from the rider's profile + order history ─────────
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  const weekAgo = Date.now() - 7 * 86400000;
  const prevWeekStart = Date.now() - 14 * 86400000;

  const myDelivered = orders.filter(o => o.riderId === rider.id && o.status === 'delivered');
  const todayDelivered = myDelivered.filter(o => (o.deliveredAt ?? 0) >= todayStart);
  const todayEarnings = todayDelivered.reduce((s, o) => s + o.price * 0.75, 0);
  const weekEarnings = myDelivered.filter(o => (o.deliveredAt ?? 0) >= weekAgo).reduce((s, o) => s + o.price * 0.75, 0);
  const prevWeekEarnings = myDelivered
    .filter(o => (o.deliveredAt ?? 0) >= prevWeekStart && (o.deliveredAt ?? 0) < weekAgo)
    .reduce((s, o) => s + o.price * 0.75, 0);
  const trendUp = weekEarnings > prevWeekEarnings;
  const trendDown = weekEarnings < prevWeekEarnings;
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus;
  const trendPct = prevWeekEarnings > 0
    ? Math.abs(Math.round(((weekEarnings - prevWeekEarnings) / prevWeekEarnings) * 100))
    : null;

  const card = cn('app-card p-5', dk ? '' : 'bg-white');

  return (
    <div>
      {/* ===== HERO: Welcome back ===== */}
      <section className="relative min-h-[100vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="/images/hero-rider.jpg" alt="" className="w-full h-full object-cover" />
          <div className={cn('absolute inset-0',
            dk ? 'bg-gradient-to-br from-black/97 via-black/85 to-brand/15' : 'bg-gradient-to-br from-white/97 via-white/90 to-brand/8'
          )} />
        </div>
        <div className="absolute top-20 right-10 w-72 h-72 bg-brand/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand/5 rounded-full blur-[150px]" />

        <div className="relative max-w-7xl mx-auto px-6 py-32 lg:py-40 w-full">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="max-w-2xl">
            <h1 className={cn('text-5xl sm:text-6xl md:text-7xl font-black leading-[1.05] tracking-tight mb-3', dk ? 'text-white' : 'text-gray-900')}>
              Welcome back, {rider.name.split(' ')[0]}
            </h1>
            <p className={cn('text-base md:text-lg mb-8 max-w-lg leading-relaxed', dk ? 'text-white/55' : 'text-gray-600')}>
              {rider.availability === 'online'
                ? 'You\'re live on the map. New orders nearby will ring your dashboard.'
                : 'Go online to start receiving delivery orders near you.'}
            </p>

            {/* Online/Offline toggle — same store action as the dashboard */}
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <button onClick={() => setRiderAvailability(rider.availability === 'online' ? 'offline' : 'online')}
                className={cn('inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold text-lg transition shadow-xl',
                  rider.availability === 'online'
                    ? 'bg-success text-white hover:brightness-110 shadow-success/25'
                    : 'bg-brand text-white hover:bg-brand-dark shadow-brand/25')}>
                {rider.availability === 'online' ? <><Power size={22} /> Online — Tap to Go Offline</> : <><PowerOff size={22} /> Go Online</>}
              </button>
              <Link to="/rider/dashboard"
                className={cn('inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg border-2 transition group',
                  dk ? 'border-white/15 text-white hover:border-brand hover:text-brand' : 'border-gray-200 text-gray-700 hover:border-brand hover:text-brand')}>
                Go to Dashboard <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* Quick stats — today */}
            <div className="grid grid-cols-3 gap-3 max-w-xl">
              <div className={card}>
                <Package size={18} className="text-brand mb-2" />
                <p className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{todayDelivered.length}</p>
                <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>Deliveries today</p>
              </div>
              <div className={card}>
                <DollarSign size={18} className="text-success mb-2" />
                <p className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{formatCurrency(todayEarnings)}</p>
                <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>Earned today</p>
              </div>
              <div className={card}>
                <Star size={18} className="text-yellow-400 mb-2" />
                <p className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{rider.rating > 0 ? rider.rating.toFixed(1) : 'No ratings'}</p>
                <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>Current rating</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== WEEKLY EARNINGS SUMMARY ===== */}
      <section className="relative z-10 -mt-14">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="bg-gradient-to-r from-brand to-brand-dark rounded-3xl p-8 md:p-10 shadow-2xl shadow-brand/20 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <p className="text-white/65 text-sm font-medium mb-1">This week's earnings</p>
              <div className="flex items-end gap-4 flex-wrap">
                <span className="text-4xl md:text-5xl font-black text-white">{formatCurrency(weekEarnings)}</span>
                <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold mb-1',
                  trendUp ? 'bg-green-400/20 text-green-200' : trendDown ? 'bg-red-400/20 text-red-200' : 'bg-white/15 text-white/80')}>
                  <TrendIcon size={16} />
                  {trendUp ? `Up ${trendPct !== null ? trendPct + '%' : ''} vs last week`
                    : trendDown ? `Down ${trendPct !== null ? trendPct + '%' : ''} vs last week`
                    : 'Same as last week'}
                </span>
              </div>
              <p className="text-white/55 text-sm mt-2">
                {myDelivered.length} completed deliver{myDelivered.length === 1 ? 'y' : 'ies'} all-time · you keep 75% of every fare
              </p>
            </div>
            <Link to="/rider/dashboard"
              className="inline-flex items-center gap-2 bg-white text-brand px-6 py-3.5 rounded-2xl font-bold hover:bg-white/90 transition shadow-xl group shrink-0">
              View My Orders <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ===== HOW EARNING WORKS (3 steps) ===== */}
      <section className={cn('py-28', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block px-4 py-1.5 rounded-full bg-brand/8 text-brand text-sm font-semibold mb-4">How Earning Works</span>
            <h2 className={cn('text-4xl md:text-5xl font-black tracking-tight', dk ? 'text-white' : 'text-gray-900')}>Three Steps to Get Paid</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {riderSteps.map((s, i) => (
              <motion.div key={s.n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={cn('relative p-7 rounded-2xl border', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                    <s.icon size={20} className="text-brand" />
                  </div>
                  <span className="text-4xl font-black text-brand/15">{s.n}</span>
                </div>
                <h3 className={cn('text-lg font-bold mb-2', dk ? 'text-white' : 'text-gray-900')}>{s.title}</h3>
                <p className={cn('text-sm leading-relaxed', dk ? 'text-white/45' : 'text-gray-500')}>{s.desc}</p>
                {i < riderSteps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 z-10">
                    <ChevronRight size={20} className={dk ? 'text-white/10' : 'text-gray-300'} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-28">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            className="bg-gradient-to-br from-brand via-brand to-brand-dark rounded-3xl p-12 md:p-16 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
            <div className="relative">
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Ready to earn more today?</h2>
              <p className="text-white/75 text-lg mb-10 max-w-xl mx-auto">
                {rider.availability === 'online'
                  ? 'You\'re online — keep an eye on your dashboard for incoming orders.'
                  : 'Go online and start accepting deliveries near you.'}
              </p>
              <Link to="/rider/dashboard"
                className="inline-flex items-center gap-2 bg-white text-brand px-8 py-4 rounded-2xl font-bold text-lg hover:bg-white/90 transition shadow-xl group">
                Go to Dashboard <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// CUSTOMER / VISITOR HOME — mobile-first layout from the approved mockups
// ════════════════════════════════════════════════════════════════════

// Service shortcuts. Each tile opens booking with a pre-filled package
// description. Visitors are sent to sign-in first (see bookHref below).
const serviceTiles = [
  { name: 'Food', icon: UtensilsCrossed, service: 'food' },
  { name: 'Groceries', icon: ShoppingCart, service: 'groceries' },
  { name: 'Pharmacy', icon: Pill, service: 'pharmacy' },
  { name: 'Documents', icon: FileText, service: 'documents' },
  { name: 'Gifts', icon: Gift, service: 'gifts' },
  { name: 'Others', icon: MoreHorizontal, service: 'other' },
];

const promoFeatures = [
  { icon: Shield, label: 'Safe Handling' },
  { icon: Zap, label: 'Quick Booking' },
  { icon: MapPin, label: 'Live Map' },
  { icon: Bike, label: 'Rider Matching' },
];

const HEADLINE_LINE_1 = 'Your Delivery';
const HEADLINE_LINE_2 = 'Our Priority';

/** Types the visitor headline one character at a time. Users who ask for
 *  reduced motion get the full text immediately. */
function useTypedHeadline(enabled: boolean) {
  const total = HEADLINE_LINE_1.length + HEADLINE_LINE_2.length;
  const [count, setCount] = useState(() => {
    if (!enabled || typeof window === 'undefined') return total;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? total : 0;
  });

  useEffect(() => {
    if (!enabled || count >= total) return;
    const timer = window.setTimeout(() => setCount(c => c + 1), 70);
    return () => window.clearTimeout(timer);
  }, [enabled, count, total]);

  return {
    line1: HEADLINE_LINE_1.slice(0, count),
    line2: HEADLINE_LINE_2.slice(0, Math.max(0, count - HEADLINE_LINE_1.length)),
    typingLine1: count < HEADLINE_LINE_1.length,
    done: count >= total,
  };
}

function CustomerHomePage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user } = useAuthStore();
  const isCustomer = user?.role === 'customer';
  const headline = useTypedHeadline(!isCustomer);
  const [legacyHeroOpacity, setLegacyHeroOpacity] = useState(1);
  const [supportsWebgl2] = useState(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  });

  useEffect(() => {
    const updateFade = () => {
      const distance = Math.max(window.innerHeight * 0.7, 1);
      setLegacyHeroOpacity(Math.max(0, 1 - window.scrollY / distance));
    };
    updateFade();
    window.addEventListener('scroll', updateFade, { passive: true });
    return () => window.removeEventListener('scroll', updateFade);
  }, []);

  // Booking is only reachable after sign-in. Visitors get the login page
  // with a `next` target, so they land on booking once authenticated.
  const bookHref = (service?: string) => {
    const target = service ? `/book?service=${service}` : '/book';
    return user ? target : `/auth/login?role=customer&next=${encodeURIComponent(target)}`;
  };

  const heading = dk ? 'text-white' : 'text-gray-900';
  const muted = dk ? 'text-white/55' : 'text-gray-500';
  const tile = dk ? 'border-white/10 bg-surface-dark-2 hover:border-brand/50' : 'border-gray-200 bg-white hover:border-brand/40';
  const outlineBtn = cn('inline-flex items-center justify-center gap-3 rounded-full border px-8 py-4 text-lg font-bold transition',
    dk ? 'border-white/15 text-white hover:border-brand hover:text-brand' : 'border-gray-300 text-gray-800 hover:border-brand hover:text-brand');

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative flex min-h-[78vh] items-center overflow-hidden">
        {!isCustomer && (
          <div className={cn('legacy-hero-layer absolute inset-0 z-0', supportsWebgl2 && 'webgl-hero-hidden')} style={{ opacity: legacyHeroOpacity }}>
            <img src="/images/hero-rider.jpg" alt="" className="h-full w-full object-cover" />
            <div className={cn('absolute inset-0',
              dk ? 'bg-gradient-to-br from-black/97 via-black/85 to-brand/15' : 'bg-gradient-to-br from-white/97 via-white/90 to-brand/8'
            )} />
          </div>
        )}
        <MicroSlatsBackdrop />

        <div className="relative mx-auto w-full max-w-6xl px-6 pb-14 pt-32 lg:pt-40">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-xl">
            {isCustomer ? (
              <>
                <p className={cn('text-xs font-bold uppercase tracking-[0.3em]', muted)}>Welcome back,</p>
                <h1 className="mt-1 text-5xl font-black tracking-tight text-brand sm:text-6xl">{user?.name.split(' ')[0]}</h1>
                <p className={cn('mt-3 text-base', muted)}>Good to have you here! Let’s get your delivery going.</p>
                <span className="mt-4 block h-1 w-14 rounded-full bg-brand" />
              </>
            ) : (
              <>
                <h1 aria-label="Your Delivery Our Priority" className={cn('text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl md:text-7xl', heading)}>
                  <span className="block">
                    {headline.line1}
                    {headline.typingLine1 && !headline.done && <span className="hero-typewriter-cursor" aria-hidden="true" />}
                  </span>
                  <span className="block text-brand">
                    {headline.line2}
                    {!headline.typingLine1 && !headline.done && <span className="hero-typewriter-cursor" aria-hidden="true" />}
                  </span>
                </h1>
                <p className={cn('mt-4 text-base sm:text-lg', muted)}>We pick. We deliver. You relax.</p>
              </>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={bookHref()}
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-brand px-8 py-4 text-lg font-bold text-white shadow-xl shadow-brand/25 transition hover:bg-brand-dark">
                <Package size={22} />
                Book a Delivery
                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
              </Link>
              {isCustomer ? (
                <Link to="/my-orders" className={outlineBtn}>
                  <MapPin size={20} /> Track Orders <ArrowRight size={18} />
                </Link>
              ) : (
                <Link to="/auth/signup?role=customer" className={outlineBtn}>
                  Create account
                </Link>
              )}
            </div>
            {!isCustomer && (
              <p className={cn('mt-4 text-sm', muted)}>
                Already registered?{' '}
                <Link to="/auth/login?role=customer" className="font-semibold text-brand hover:underline">Sign in</Link>
              </p>
            )}
          </motion.div>
        </div>
      </section>

      {/* ===== SERVICE SHORTCUTS ===== */}
      <section className="px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className={cn('text-2xl font-black tracking-tight sm:text-3xl', heading)}>What do you need delivered?</h2>
            <Link to="/services" className="shrink-0 text-sm font-semibold text-brand hover:underline">See all services</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {serviceTiles.map(item => (
              <Link key={item.name} to={bookHref(item.service)}
                className={cn('group flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition hover:-translate-y-0.5', tile)}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
                  <item.icon size={26} />
                </span>
                <span className={cn('text-sm font-semibold', heading)}>{item.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROMO BANNER ===== */}
      <section className="px-6 pb-10">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gray-950 p-7 text-white md:p-10">
          <div className="flex items-center gap-3">
            <Zap size={34} className="text-brand" fill="currentColor" />
            <div>
              <p className="text-2xl font-black tracking-tight sm:text-3xl">Fast &amp; Secure</p>
              <p className="text-2xl font-black tracking-tight text-brand sm:text-3xl">Delivery</p>
            </div>
          </div>
          <p className="mt-4 max-w-md text-sm text-white/70 sm:text-base">From your door to theirs, we get it there.</p>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 md:grid-cols-4">
            {promoFeatures.map(f => (
              <div key={f.label} className="flex flex-col items-center gap-2 text-center">
                <f.icon size={22} className="text-brand" />
                <span className="text-xs font-semibold text-white/80">{f.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className={cn('px-6 py-14', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="mx-auto max-w-6xl">
          <h2 className={cn('mb-8 text-2xl font-black tracking-tight sm:text-3xl', heading)}>How it works</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {steps.map(step => (
              <div key={step.n} className={cn('rounded-2xl border p-5', dk ? 'border-white/10 bg-surface-dark' : 'border-gray-200 bg-white')}>
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><step.icon size={22} /></span>
                  <span className={cn('text-xs font-bold tracking-widest', muted)}>{step.n}</span>
                </div>
                <h3 className={cn('font-bold', heading)}>{step.title}</h3>
                <p className={cn('mt-1.5 text-sm leading-relaxed', muted)}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="px-6 py-14 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className={cn('text-2xl font-black tracking-tight sm:text-3xl', heading)}>
            {isCustomer ? 'Ready for your next delivery?' : 'Ready to send something?'}
          </h2>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to={bookHref()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-8 py-4 font-bold text-white shadow-xl shadow-brand/25 transition hover:bg-brand-dark">
              <Package size={20} /> Book a Delivery
            </Link>
            <Link to="/services" className={cn('inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3.5 font-bold transition', dk ? 'border-white/15 text-white hover:border-brand hover:text-brand' : 'border-gray-300 text-gray-800 hover:border-brand hover:text-brand')}>
              View services
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Role switch: riders get the rider home; everyone else keeps the
//    customer/visitor page completely unchanged. ─────────────────────
export default function Home() {
  const { user } = useAuthStore();
  if (user?.role === 'rider') return <RiderHomePage />;
  if (user?.role === 'manager') return <Navigate to="/manager?tab=overview" replace />;
  return <CustomerHomePage />;
}
