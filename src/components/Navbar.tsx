import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Sun, Moon, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';
import NotificationPanel from './NotificationPanel';

const publicLinks = [
  { name: 'Home', path: '/' },
  { name: 'Services', path: '/services' },
  { name: 'Book Delivery', path: '/book' },
  { name: 'Track', path: '/track' },
  { name: 'About', path: '/about' },
  { name: 'Contact', path: '/contact' },
];

// Customer-only actions inside publicLinks — hidden from the mobile
// hamburger menu for logged-in riders/managers, who have their own
// role-specific destinations (Rider Dashboard / Manager Panel) instead.
const customerOnlyPaths = ['/book', '/track'];
const managerLinks = [
  { name: 'Overview', path: '/manager?tab=overview' },
  { name: 'Active & Available Orders', path: '/manager?tab=orders' },
  { name: 'Riders & Verification', path: '/manager?tab=riders' },
  { name: 'Live Map', path: '/manager?tab=map' },
  { name: 'Pricing', path: '/manager?tab=pricing' },
  { name: 'Content', path: '/manager?tab=content' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useThemeStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const dk = theme === 'dark';

  const handleLogout = () => { logout(); navigate('/'); setOpen(false); };

  return (
    <nav className="app-navbar fixed top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 pointer-events-none">
        <div className="flex items-center justify-between h-16">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
            <Link to="/" className={cn('liquid-glass-mark pointer-events-auto flex items-center gap-2.5 shrink-0', dk ? 'text-white' : 'text-gray-900')}>
              <img src="/images/logo.jpeg" alt="Delivery Boys logo" className="h-10 w-10 rounded-full object-cover ring-2 ring-brand/20" />
              <div className="flex items-baseline gap-0.5 leading-none">
                <span className={cn('font-black text-[1.05rem] tracking-[0.055em]', dk ? 'text-white' : 'text-gray-950')}>Delivery</span>
                <span className="font-black text-[1.05rem] tracking-[0.055em] text-brand">Boys</span>
              </div>
            </Link>
          </motion.div>

          <div className="hidden items-center gap-0.5">
            {publicLinks.map(l => (
              <Link key={l.path} to={!user && l.path === '/book' ? '/auth/login?role=customer' : l.path}
                className={cn('px-3 py-2 text-[13px] font-semibold rounded-full transition',
                  location.pathname === l.path
                    ? 'text-brand bg-brand/8'
                    : dk ? 'text-white/55 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                )}>
                {l.name}
              </Link>
            ))}
          </div>

          <div className="navbar-utility-cluster pointer-events-auto flex items-center">
            <motion.button type="button" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open} onClick={() => setOpen(!open)} whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 420, damping: 26 }} className={cn('liquid-glass-menu pointer-events-auto rounded-full p-3', dk ? 'text-white/75' : 'text-gray-700')}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={open ? 'close' : 'menu'} initial={{ opacity: 0, rotate: -45, scale: 0.7 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 45, scale: 0.7 }} transition={{ duration: 0.16 }} className="flex">
                  {open ? <X size={22} /> : <Menu size={22} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/45 pointer-events-auto" onClick={() => setOpen(false)}>
            <motion.aside onClick={(event) => event.stopPropagation()} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', duration: 0.38, bounce: 0 }}
              className={cn('absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col border-l p-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] shadow-2xl', dk ? 'bg-surface-dark-2 border-white/10' : 'bg-white border-gray-200')}>
              <div className="mb-5 flex items-center justify-between">
                <span className={cn('text-lg font-extrabold tracking-tight', dk ? 'text-white' : 'text-gray-900')}>Menu</span>
                <button type="button" aria-label="Close navigation menu" onClick={() => setOpen(false)} className={cn('rounded-xl p-2', dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100')}><X size={21} /></button>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto overscroll-contain">
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={toggle} className={cn('flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition', dk ? 'bg-white/5 text-white/70 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                  {dk ? <Sun size={17} /> : <Moon size={17} />} {dk ? 'Light mode' : 'Dark mode'}
                </button>
                {user && <div className={cn('flex items-center justify-center rounded-2xl px-3 py-3', dk ? 'bg-white/5' : 'bg-gray-100')}><NotificationPanel /></div>}
              </div>
              <div className="space-y-1">
              {(user?.role === 'manager' ? managerLinks : publicLinks
                .filter(l => l.path === '/track' && !user ? false : user && user.role !== 'customer' ? !customerOnlyPaths.includes(l.path) : true))
                .map(l => (
                <Link key={l.path} to={!user && l.path === '/book' ? '/auth/login?role=customer' : l.path} onClick={() => setOpen(false)}
                  className={cn('block px-3 py-2.5 rounded-full text-sm font-semibold transition',
                    location.pathname === l.path.split('?')[0] && (l.path.includes('?') ? new URLSearchParams(location.search).get('tab') === l.path.split('=')[1] : true)
                      ? 'text-brand bg-brand/8' : dk ? 'text-white/55 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-50')}>
                  {l.name}
                </Link>
              ))}
              {user && user.role === 'rider' && (
                <Link to="/rider/dashboard" onClick={() => setOpen(false)}
                  className={cn('block px-3 py-2.5 rounded-full text-sm font-semibold transition',
                    location.pathname === '/rider/dashboard' ? 'text-brand bg-brand/8' : dk ? 'text-white/55 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-50')}>
                  Rider Dashboard
                </Link>
              )}
              {user && user.role === 'manager' && (
                <Link to="/manager" onClick={() => setOpen(false)}
                  className={cn('block px-3 py-2.5 rounded-full text-sm font-semibold transition',
                    location.pathname === '/manager' ? 'text-brand bg-brand/8' : dk ? 'text-white/55 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-50')}>
                  Manager Panel
                </Link>
              )}
              {user && (
                <div className={cn('mt-4 border-t pt-4', dk ? 'border-white/10' : 'border-gray-200')}>
                  <div className={cn('mb-2 rounded-2xl px-3 py-3', dk ? 'bg-white/5' : 'bg-gray-50')}>
                    <p className={cn('text-sm font-bold', dk ? 'text-white' : 'text-gray-900')}>{user.name}</p>
                    <p className={cn('truncate text-[11px]', dk ? 'text-white/40' : 'text-gray-400')}>{user.email || user.phone}</p>
                    <span className="mt-1 inline-block rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-bold capitalize text-brand">{user.role}</span>
                  </div>
                  <Link to="/profile" onClick={() => setOpen(false)} className={cn('block rounded-full px-3 py-2.5 text-sm font-semibold transition', dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}>Profile & account</Link>
                  {user.role === 'customer' && <Link to="/my-orders" onClick={() => setOpen(false)} className={cn('block rounded-full px-3 py-2.5 text-sm font-semibold transition', dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}>My Orders</Link>}
                  <button onClick={handleLogout} className="mt-1 flex w-full items-center rounded-full px-3 py-2.5 text-left text-sm font-semibold text-danger transition hover:bg-danger/8"><LogOut size={16} className="mr-2" /> Sign Out</button>
                </div>
              )}
              {!user && (
                <div className="flex gap-2 pt-2">
                  <Link to="/auth/login" onClick={() => setOpen(false)} className={cn('flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-semibold border',
                    dk ? 'border-white/10 text-white/70' : 'border-gray-200 text-gray-600')}>Sign In</Link>
                  <Link to="/auth/signup" onClick={() => setOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-full text-sm font-bold bg-brand text-white">Sign Up</Link>
                </div>
              )}
              </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
