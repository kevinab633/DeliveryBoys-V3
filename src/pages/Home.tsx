import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, UtensilsCrossed, ShoppingCart, FileText, Building2, Zap, Bike, ArrowRight, Shield, Clock, MapPin, TrendingUp, TrendingDown, Minus, Star, LogIn, UserPlus, ChevronRight, Phone, Power, PowerOff, DollarSign, CheckCircle2, Wallet } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useContentStore } from '../stores/contentStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { cn, formatCurrency } from '../lib/utils';
import { RiderProfile } from '../lib/types';

const services = [
  { icon: Package, name: 'Parcel Delivery', desc: 'Safe and secure parcel delivery across town.', color: '#C41E1E' },
  { icon: UtensilsCrossed, name: 'Food Delivery', desc: 'Hot meals from your favorite restaurants.', color: '#F59E0B' },
  { icon: ShoppingCart, name: 'Grocery Delivery', desc: 'Fresh groceries to your doorstep.', color: '#10B981' },
  { icon: FileText, name: 'Document Delivery', desc: 'Confidential document courier services.', color: '#3B82F6' },
  { icon: Building2, name: 'Corporate Deliveries', desc: 'Tailored solutions for businesses.', color: '#8B5CF6' },
  { icon: Zap, name: 'Express Delivery', desc: 'Same-day guaranteed delivery.', color: '#EC4899' },
];

const stats = [
  { value: '10K+', label: 'Deliveries Completed' },
  { value: '500+', label: 'Happy Customers' },
  { value: '50+', label: 'Active Riders' },
  { value: '99%', label: 'On-Time Rate' },
];

const steps = [
  { n: '01', title: 'Book Online', desc: 'Enter pickup & drop-off. Search locations or drop a pin on the map.', icon: MapPin },
  { n: '02', title: 'Get Matched', desc: 'A nearby rider sees your order and accepts it instantly.', icon: Bike },
  { n: '03', title: 'Track Live', desc: 'Watch your rider move in real-time on the live map.', icon: Clock },
  { n: '04', title: 'Delivered!', desc: 'Your item arrives safely. Rate your experience.', icon: Star },
];

const testimonials = [
  { name: 'Ama Serwaa', role: 'Business Owner', text: 'Delivery Boys transformed how I send products. Fast, reliable, and the live tracking is amazing!' },
  { name: 'Kwame Asante', role: 'Restaurant Manager', text: 'Our food deliveries are always handled with care. The riders are professional and punctual.' },
  { name: 'Nana Yaa', role: 'Online Shopper', text: 'I love the transparent pricing. I can see exactly what I\'m paying for before I book.' },
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

  const card = cn('p-5 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200');

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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 border border-brand/20 mb-6">
              <span className={cn('w-2 h-2 rounded-full animate-pulse', rider.availability === 'online' ? 'bg-success' : 'bg-brand')} />
              <span className="text-brand text-sm font-semibold">
                {rider.availability === 'online' ? 'You are online — receiving orders' : 'You are offline'}
              </span>
            </div>

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
                className={cn('inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg transition shadow-xl',
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
                <p className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{rider.rating > 0 ? rider.rating.toFixed(1) : 'N/A'}</p>
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
// CUSTOMER / VISITOR HOME (unchanged for logged-out, customers, managers)
// ════════════════════════════════════════════════════════════════════
function CustomerHomePage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { getContent } = useContentStore();
  const { user } = useAuthStore();

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative min-h-[100vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="/images/hero-rider.jpg" alt="" className="w-full h-full object-cover" />
          <div className={cn('absolute inset-0',
            dk ? 'bg-gradient-to-br from-black/97 via-black/85 to-brand/15' : 'bg-gradient-to-br from-white/97 via-white/90 to-brand/8'
          )} />
        </div>
        {/* Decorative */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-brand/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand/5 rounded-full blur-[150px]" />

        <div className="relative max-w-7xl mx-auto px-6 py-32 lg:py-40 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left - Text */}
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 border border-brand/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                <span className="text-brand text-sm font-semibold">Fast & Reliable Delivery in Ghana</span>
              </div>
              <h1 className={cn('text-5xl sm:text-6xl md:text-7xl font-black leading-[1.05] tracking-tight mb-3', dk ? 'text-white' : 'text-gray-900')}>
                {getContent('home.hero.title', 'Delivery Boys')}
              </h1>
              <p className="text-xl md:text-2xl font-bold text-brand mb-5">
                {getContent('home.hero.subtitle', 'We Go The Extra Mile For You!')}
              </p>
              <p className={cn('text-base md:text-lg mb-10 max-w-lg leading-relaxed', dk ? 'text-white/55' : 'text-gray-600')}>
                {getContent('home.hero.description', "Ghana's most trusted delivery service. Book in seconds, track live on the map, pay fair distance-based prices.")}
              </p>

              {/* Primary CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <Link to={user ? '/book' : '/auth/login'}
                  className="inline-flex items-center justify-center gap-2 bg-brand text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-brand-dark transition shadow-xl shadow-brand/25 group">
                  <Package size={22} />
                  {getContent('home.cta.primary', 'Book a Delivery')}
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                {user?.role === 'customer' ? (
                  <Link to="/my-orders"
                    className={cn('inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg border-2 transition group',
                      dk ? 'border-white/15 text-white hover:border-brand hover:text-brand' : 'border-gray-200 text-gray-700 hover:border-brand hover:text-brand')}>
                    <Package size={22} />
                    Track Orders
                  </Link>
                ) : (
                  <Link to="/auth/signup?role=rider"
                    className={cn('inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg border-2 transition group',
                      dk ? 'border-white/15 text-white hover:border-brand hover:text-brand' : 'border-gray-200 text-gray-700 hover:border-brand hover:text-brand')}>
                    <Bike size={22} />
                    {getContent('home.cta.secondary', 'Become a Rider')}
                  </Link>
                )}
              </div>

              {/* Secondary links */}
              <div className="flex flex-wrap gap-4">
                {!user && (
                  <>
                    <Link to="/auth/login?role=rider" className={cn('inline-flex items-center gap-1.5 text-sm font-semibold transition',
                      dk ? 'text-white/40 hover:text-brand' : 'text-gray-400 hover:text-brand')}>
                      <LogIn size={15} /> Rider Login <ChevronRight size={14} />
                    </Link>
                    <Link to="/auth/login" className={cn('inline-flex items-center gap-1.5 text-sm font-semibold transition',
                      dk ? 'text-white/40 hover:text-brand' : 'text-gray-400 hover:text-brand')}>
                      <LogIn size={15} /> Customer Login <ChevronRight size={14} />
                    </Link>
                  </>
                )}
                <a href="tel:+233544188778" className={cn('inline-flex items-center gap-1.5 text-sm font-semibold transition',
                  dk ? 'text-white/40 hover:text-brand' : 'text-gray-400 hover:text-brand')}>
                  <Phone size={15} /> +233 544 188 778
                </a>
              </div>
            </motion.div>

            {/* Right - Logo & Quick Action Cards */}
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
              className="hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-8 bg-brand/8 rounded-full blur-3xl" />
                <img src="/images/logo.jpeg" alt="Delivery Boys" className="relative w-72 h-72 xl:w-80 xl:h-80 rounded-full object-cover mx-auto shadow-2xl ring-4 ring-brand/20 animate-float" />

                {/* Floating cards */}
                <motion.div initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.8 }}
                  className={cn('absolute -right-4 top-8 px-4 py-3 rounded-2xl shadow-2xl border max-w-[180px]',
                    dk ? 'bg-surface-dark-3/90 glass border-white/10' : 'bg-white/90 glass border-gray-200')}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center"><MapPin size={16} className="text-success" /></div>
                    <div>
                      <p className={cn('text-[11px] font-bold', dk ? 'text-white' : 'text-gray-900')}>Live Tracking</p>
                      <p className={cn('text-[10px]', dk ? 'text-white/40' : 'text-gray-500')}>Real-time GPS</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1 }}
                  className={cn('absolute -left-4 bottom-12 px-4 py-3 rounded-2xl shadow-2xl border max-w-[180px]',
                    dk ? 'bg-surface-dark-3/90 glass border-white/10' : 'bg-white/90 glass border-gray-200')}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center"><TrendingUp size={16} className="text-brand" /></div>
                    <div>
                      <p className={cn('text-[11px] font-bold', dk ? 'text-white' : 'text-gray-900')}>Fair Pricing</p>
                      <p className={cn('text-[10px]', dk ? 'text-white/40' : 'text-gray-500')}>Distance-based</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="relative z-10 -mt-14">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="bg-gradient-to-r from-brand to-brand-dark rounded-3xl p-8 grid grid-cols-2 md:grid-cols-4 gap-6 shadow-2xl shadow-brand/20">
            {stats.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-3xl md:text-4xl font-black text-white">{s.value}</div>
                <div className="text-white/65 text-sm mt-1 font-medium">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <section className={cn('py-28', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block px-4 py-1.5 rounded-full bg-brand/8 text-brand text-sm font-semibold mb-4">Our Services</span>
            <h2 className={cn('text-4xl md:text-5xl font-black tracking-tight', dk ? 'text-white' : 'text-gray-900')}>What We Deliver</h2>
            <p className={cn('mt-3 text-lg max-w-xl mx-auto', dk ? 'text-white/45' : 'text-gray-500')}>From parcels to food, groceries to documents — we deliver it all.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((s, i) => (
              <motion.div key={s.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}>
                <Link to="/book"
                  className={cn('block p-6 rounded-2xl border transition hover:-translate-y-1 group',
                    dk ? 'bg-surface-dark-2 border-white/5 hover:border-brand/25 hover:shadow-lg hover:shadow-brand/5' : 'bg-gray-50/50 border-gray-100 hover:border-brand/25 hover:shadow-xl hover:shadow-brand/5')}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `${s.color}15` }}>
                    <s.icon size={24} style={{ color: s.color }} />
                  </div>
                  <h3 className={cn('text-lg font-bold mb-2 group-hover:text-brand transition', dk ? 'text-white' : 'text-gray-900')}>{s.name}</h3>
                  <p className={cn('text-sm leading-relaxed', dk ? 'text-white/45' : 'text-gray-500')}>{s.desc}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className={cn('py-28', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block px-4 py-1.5 rounded-full bg-brand/8 text-brand text-sm font-semibold mb-4">How It Works</span>
            <h2 className={cn('text-4xl md:text-5xl font-black tracking-tight', dk ? 'text-white' : 'text-gray-900')}>Simple & Fast</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
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
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 z-10">
                    <ChevronRight size={20} className={dk ? 'text-white/10' : 'text-gray-300'} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY CHOOSE US ===== */}
      <section className={cn('py-28', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full bg-brand/8 text-brand text-sm font-semibold mb-4">Why Choose Us</span>
              <h2 className={cn('text-4xl font-black tracking-tight mb-8', dk ? 'text-white' : 'text-gray-900')}>We Go The Extra Mile</h2>
              <div className="space-y-4">
                {[
                  { icon: Clock, title: 'Lightning Fast', desc: 'Same-day and express delivery options. Most deliveries within 1-3 hours.' },
                  { icon: Shield, title: 'Verified Riders', desc: 'All riders submit National ID and photo. Managers verify every application.' },
                  { icon: MapPin, title: 'Live Map Tracking', desc: 'Track your rider in real-time, just like Uber and Yango.' },
                  { icon: TrendingUp, title: 'Transparent Pricing', desc: 'See the full price breakdown: distance, fuel, and service fee.' },
                ].map((item, i) => (
                  <motion.div key={item.title} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className={cn('flex gap-4 p-5 rounded-2xl border transition hover:border-brand/20',
                      dk ? 'bg-surface-dark-2 border-white/5' : 'bg-gray-50 border-gray-100')}>
                    <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                      <item.icon size={22} className="text-brand" />
                    </div>
                    <div>
                      <h4 className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>{item.title}</h4>
                      <p className={cn('text-sm mt-1 leading-relaxed', dk ? 'text-white/45' : 'text-gray-500')}>{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="relative">
                <div className="absolute -inset-6 bg-brand/5 rounded-3xl blur-2xl" />
                <img src="/images/img2.jpeg" alt="Delivery Boys Flyer" className="relative rounded-3xl shadow-2xl w-full max-w-md mx-auto" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className={cn('py-28', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block px-4 py-1.5 rounded-full bg-brand/8 text-brand text-sm font-semibold mb-4">Testimonials</span>
            <h2 className={cn('text-4xl font-black tracking-tight', dk ? 'text-white' : 'text-gray-900')}>What Our Customers Say</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={cn('p-7 rounded-2xl border', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(n => <Star key={n} size={16} className="text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className={cn('text-sm leading-relaxed mb-6', dk ? 'text-white/60' : 'text-gray-600')}>"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white font-bold text-sm">{t.name[0]}</div>
                  <div>
                    <p className={cn('text-sm font-bold', dk ? 'text-white' : 'text-gray-900')}>{t.name}</p>
                    <p className={cn('text-xs', dk ? 'text-white/35' : 'text-gray-400')}>{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-28">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            className="bg-gradient-to-br from-brand via-brand to-brand-dark rounded-3xl p-12 md:p-16 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
            <div className="relative">
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Ready to Send a Delivery?</h2>
              <p className="text-white/75 text-lg mb-10 max-w-xl mx-auto">Book now and get matched with a verified rider in seconds. Available 7 days a week.</p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link to={user ? '/book' : '/auth/signup'} className="inline-flex items-center gap-2 bg-white text-brand px-8 py-4 rounded-2xl font-bold text-lg hover:bg-white/90 transition shadow-xl group">
                  {user ? 'Book Now' : 'Get Started'} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                {user?.role === 'customer' ? (
                  <Link to="/my-orders" className="inline-flex items-center gap-2 border-2 border-white/25 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-white/10 transition">
                    <Package size={20} /> Track Orders
                  </Link>
                ) : (
                  <Link to="/auth/signup?role=rider" className="inline-flex items-center gap-2 border-2 border-white/25 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-white/10 transition">
                    <Bike size={20} /> Join as Rider
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
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
  return <CustomerHomePage />;
}
