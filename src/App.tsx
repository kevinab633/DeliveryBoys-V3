import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useThemeStore } from './stores/themeStore';
import { useOrderStore } from './stores/orderStore';
import { useAuthStore } from './stores/authStore';
import { requestNotifyPermission } from './lib/browserNotify';
import { subscribeToPush } from './lib/pushClient';
import { syncService } from './lib/syncService';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WhatsAppFloat from './components/WhatsAppFloat';
import ToastContainer from './components/Toast';
import DebugBanner, { DebugErrorBoundary } from './components/DebugBanner';
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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Routes where the map is full-screen — hide Footer & WhatsApp FAB
const FULL_SCREEN_ROUTES = ['/book', '/track'];

function AppContent() {
  const theme = useThemeStore(s => s.theme);
  const { pathname } = useLocation();
  const isFullScreen = FULL_SCREEN_ROUTES.includes(pathname);
  const user = useAuthStore(s => s.user);

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

  // ── Re-sync on resume: Android suspends/kills the Realtime WebSocket
  //    whenever the tab/PWA is backgrounded or the phone sleeps, so a
  //    broadcast sent while closed (e.g. a cancellation) is simply missed
  //    — there's no queue or replay. Re-fetching orders from the DB every
  //    time the tab becomes visible again means the UI is always correct
  //    within a moment of reopening, regardless of what the socket missed
  //    while backgrounded. mergeRemoteOrders only moves a status forward
  //    (cancelled always wins), so this can't undo a newer local change. ──
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return;
      void useOrderStore.getState().fetchOrders();
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

  return (
    <div className={theme === 'dark' ? 'theme-dark' : 'theme-light'}>
      <ScrollToTop />
      <Navbar />
      <main className="min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/book" element={<Book />} />
          <Route path="/track" element={<Track />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/manager/login" element={<ManagerLoginPage />} />
          <Route path="/rider/dashboard" element={<RiderDashboard />} />
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/my-orders" element={<MyOrders />} />
        </Routes>
      </main>
      {!isFullScreen && <Footer />}
      {!isFullScreen && <WhatsAppFloat />}
      <ToastContainer />
      <DebugBanner />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DebugErrorBoundary>
        <AppContent />
      </DebugErrorBoundary>
    </BrowserRouter>
  );
}
