import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useEffect } from 'react';
import { useThemeStore } from './stores/themeStore';
import { useOrderStore } from './stores/orderStore';
import { useAuthStore } from './stores/authStore';
import { requestNotifyPermission } from './lib/browserNotify';
import { subscribeToPush } from './lib/pushClient';
import { syncService } from './lib/syncService';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ToastContainer from './components/Toast';
import CookieConsent from './components/CookieConsent';
import CustomerTabBar, { CUSTOMER_TAB_ROUTES } from './components/CustomerTabBar';
import { DebugErrorBoundary } from './components/DebugBanner';
import { PageSkeleton } from './components/Skeleton';
import Home from './pages/Home';
import Services from './pages/Services';
import Book from './pages/Book';
import Track from './pages/Track';
import About from './pages/About';
import Contact from './pages/Contact';
import { LoginPage, SignupPage, ManagerLoginPage } from './pages/Auth';
import RiderDashboard from './pages/RiderDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import Profile from './pages/Profile';
import MyOrders from './pages/MyOrders';
import VerificationPage from './pages/Verification';
import LegalPage from './pages/Legal';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Routes where the map is full-screen — hide Footer & WhatsApp FAB
const FULL_SCREEN_ROUTES = ['/book', '/track', '/rider/dashboard'];
const MINIMAL_ROUTES = ['/auth/login', '/auth/signup', '/manager/login', '/manager', '/rider/verification'];

function CustomerOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user);
  return user?.role === 'customer' ? <>{children}</> : <Navigate to="/auth/login?role=customer" replace />;
}

function AppContent() {
  const theme = useThemeStore(s => s.theme);
  const location = useLocation();
  const { pathname } = location;
  const isFullScreen = FULL_SCREEN_ROUTES.includes(pathname);
  const user = useAuthStore(s => s.user);
  const usersLoaded = useAuthStore(s => s.usersLoaded);

  // ── Browser Notification permission: requested once, the first time
  //    a user is logged in. Graceful no-op if denied/unsupported. ────
  useEffect(() => {
    if (user) requestNotifyPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Web Push subscription: so order alerts arrive even with the site
  //    fully closed, not just while a tab is open (which is all the
  //    effect above covers). Additive — doesn't replace anything. ────
  useEffect(() => {
    if (user) void subscribeToPush(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Load real accounts from Supabase on startup, merging over the local
  //    demo/cached data — this is what makes rider signups, availability,
  //    and delivery stats visible across devices instead of being stuck
  //    in whichever browser created them. ─────────────────────────────
  useEffect(() => {
    void useAuthStore.getState().loadUsers();
  }, []);

  // ── Re-sync on resume: Android suspends/kills the Realtime WebSocket
  //    whenever the tab/PWA is backgrounded or the phone sleeps, so a
  //    broadcast sent while closed (e.g. a cancellation, or a rider going
  //    online) is simply missed — there's no queue or replay. Re-fetching
  //    from the DB every time the tab becomes visible again means the UI
  //    is always correct within a moment of reopening, regardless of what
  //    the socket missed while backgrounded. mergeRemoteOrders only moves
  //    a status forward (cancelled always wins), so this can't undo a
  //    newer local change. ─────────────────────────────────────────────
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return;
      void useOrderStore.getState().fetchOrders();
      void useAuthStore.getState().loadUsers();
      syncService.reconnectIfNeeded();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ── Periodic sweep: auto-cancel expired instant orders, start dispatch
  //    for scheduled orders coming due (~30 min before), and auto-cancel
  //    scheduled orders that missed their window. Runs app-wide so it
  //    works no matter which page is open. ─────────────────────────
  useEffect(() => {
    useOrderStore.getState().sweepExpiredOrders();
    const iv = setInterval(() => useOrderStore.getState().sweepExpiredOrders(), 15000);
    return () => clearInterval(iv);
  }, []);

  // ── Periodic rider refresh: the RIDER_PRESENCE broadcast covers instant
  //    updates while both devices are actively connected, but the socket
  //    dies in the background (see resume-sync above). Polling every 20s
  //    on top of that closes the gap while a device is foregrounded but
  //    the broadcast happened to be missed, without waiting for a full
  //    background/foreground cycle. ────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => void useAuthStore.getState().loadUsers(), 20000);
    return () => clearInterval(iv);
  }, []);

  // ── Live sync ──────────────────────────────────────────────────────
  // Opens both channels (Supabase Realtime broadcast for cross-device and
  // BroadcastChannel for cross-tab), then pulls recent orders from
  // Supabase and merges them in. Merging is an upsert by id, so local
  // optimistic state is never wiped; if the network is down the local
  // copy simply stands until the next event.
  //
  // init() is idempotent and intentionally NOT torn down on user change —
  // repeatedly tearing the socket down was what made the old subscription
  // flap between SUBSCRIBED and CLOSED.
  useEffect(() => {
    syncService.init();
  }, []);

  // Re-announce presence / re-pull orders whenever the signed-in user
  // changes, so a rider who just logged in is visible to customers.
  useEffect(() => {
    if (!user?.id) return;
    void useOrderStore.getState().fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!usersLoaded) {
    return (
      <div className={theme === 'dark' ? 'theme-dark' : 'theme-light'}>
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className={theme === 'dark' ? 'theme-dark' : 'theme-light'}>
      <ScrollToTop />
      {!isFullScreen && <Navbar />}
      <main className="min-h-screen">
        {/* Route-level page transition: a short fade + slight upward
            slide on every screen change instead of an instant snap.
            Only opacity/transform are animated (GPU-friendly), and the
            duration is kept brief so it feels responsive rather than
            slow, which matters on mid-range phones and in the native
            app conversion where navigation should feel native. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/book" element={<CustomerOnly><Book /></CustomerOnly>} />
          <Route path="/track" element={<CustomerOnly><Track /></CustomerOnly>} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/manager/login" element={<ManagerLoginPage />} />
          <Route path="/rider/dashboard" element={<RiderDashboard />} />
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/my-orders" element={<CustomerOnly><MyOrders /></CustomerOnly>} />
          <Route path="/rider/verification" element={<VerificationPage />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/refunds" element={<LegalPage kind="refund" />} />
          <Route path="/cookies" element={<LegalPage kind="cookies" />} />
        </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      {!isFullScreen && !MINIMAL_ROUTES.some(route => pathname.startsWith(route)) && (
        <div className={user?.role === 'customer' && CUSTOMER_TAB_ROUTES.includes(pathname) ? 'pb-20 md:pb-0' : undefined}>
          <Footer />
        </div>
      )}
      <CustomerTabBar />
      <ToastContainer />
      <CookieConsent />
    </div>
  );
}

export default function App() {
  return (
    // reducedMotion="user" makes every motion.* component and
    // AnimatePresence transition in the app automatically respect the
    // OS-level "reduce motion" accessibility setting — transforms and
    // opacity fades are kept (so content still appears/disappears
    // correctly), but the animated motion itself is skipped for anyone
    // who has that preference turned on. This covers every page-
    // transition, panel-swap, and nav-screen animation added this
    // session in one place, rather than needing a per-component check.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <DebugErrorBoundary>
          <AppContent />
        </DebugErrorBoundary>
      </BrowserRouter>
    </MotionConfig>
  );
}
