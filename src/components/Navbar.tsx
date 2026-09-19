import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Sun, Moon, User, LogOut, ChevronDown, Settings, Package, Bike } from 'lucide-react';
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

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const { theme, toggle } = useThemeStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const dk = theme === 'dark';

  const handleLogout = () => { logout(); setUserMenu(false); navigate('/'); };

  return (
    <nav className={cn('fixed top-0 left-0 right-0 z-50 glass border-b transition-colors',
      dk ? 'bg-surface-dark/80 border-white/5' : 'bg-white/80 border-black/5'
    )}>
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/images/logo.jpeg" alt="DB" className="h-10 w-10 rounded-full object-cover ring-2 ring-brand/20" />
            <div className="hidden sm:flex items-baseline gap-0.5">
              <span className={cn('font-extrabold text-lg tracking-tight', dk ? 'text-white' : 'text-gray-900')}>Delivery</span>
              <span className="font-extrabold text-lg tracking-tight text-brand">Boys</span>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-0.5">
            {publicLinks.map(l => (
              <Link key={l.path} to={l.path}
                className={cn('px-3 py-2 text-[13px] font-semibold rounded-lg transition',
                  location.pathname === l.path
                    ? 'text-brand bg-brand/8'
                    : dk ? 'text-white/55 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                )}>
                {l.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={toggle} className={cn('p-2 rounded-xl transition', dk ? 'text-white/50 hover:bg-white/5' : 'text-gray-400 hover:bg-gray-100')}>
              {dk ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {user ? (
              <>
                <NotificationPanel />
                <div className="relative">
                  <button onClick={() => setUserMenu(!userMenu)} className={cn('flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl transition',
                    dk ? 'hover:bg-white/5' : 'hover:bg-gray-100')}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-brand/20">
                      {user.name[0]}
                    </div>
                    <span className={cn('text-sm font-semibold hidden sm:block', dk ? 'text-white' : 'text-gray-900')}>{user.name.split(' ')[0]}</span>
                    <ChevronDown size={14} className={cn('transition', userMenu ? 'rotate-180' : '', dk ? 'text-white/30' : 'text-gray-400')} />
                  </button>
                  <AnimatePresence>
                    {userMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                        <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          className={cn('absolute right-0 top-full mt-2 w-60 rounded-2xl shadow-2xl border p-1.5 z-50',
                            dk ? 'bg-surface-dark-2 border-white/10' : 'bg-white border-gray-200')}>
                          <div className={cn('px-3 py-2.5 mb-1 border-b rounded-xl', dk ? 'border-white/5 bg-surface-dark-3' : 'border-gray-100 bg-gray-50')}>
                            <p className={cn('text-sm font-bold', dk ? 'text-white' : 'text-gray-900')}>{user.name}</p>
                            <p className={cn('text-[11px] truncate', dk ? 'text-white/35' : 'text-gray-400')}>{user.email || user.phone}</p>
                            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand/10 text-brand capitalize">{user.role}</span>
                          </div>
                          <Link to="/profile" onClick={() => setUserMenu(false)} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition',
                            dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}>
                            <User size={16} /> Profile
                          </Link>
                          {user.role === 'customer' && (
                            <Link to="/my-orders" onClick={() => setUserMenu(false)} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition',
                              dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}>
                              <Package size={16} /> My Orders
                            </Link>
                          )}
                          {user.role === 'rider' && (
                            <Link to="/rider/dashboard" onClick={() => setUserMenu(false)} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition',
                              dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}>
                              <Bike size={16} /> Rider Dashboard
                            </Link>
                          )}
                          {user.role === 'manager' && (
                            <Link to="/manager" onClick={() => setUserMenu(false)} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition',
                              dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}>
                              <Settings size={16} /> Manager Panel
                            </Link>
                          )}
                          <div className={cn('mt-1 pt-1 border-t', dk ? 'border-white/5' : 'border-gray-100')}>
                            <button onClick={handleLogout} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm w-full transition text-danger hover:bg-danger/8">
                              <LogOut size={16} /> Sign Out
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/auth/login" className={cn('px-4 py-2 text-sm font-semibold rounded-xl transition',
                  dk ? 'text-white/65 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100')}>
                  Sign In
                </Link>
                <Link to="/auth/signup" className="px-4 py-2 text-sm font-bold rounded-xl bg-brand text-white hover:bg-brand-dark transition shadow-md shadow-brand/20">
                  Sign Up
                </Link>
              </div>
            )}

            <button onClick={() => setOpen(!open)} className={cn('lg:hidden p-2 rounded-xl', dk ? 'text-white/50' : 'text-gray-500')}>
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className={cn('lg:hidden overflow-hidden border-t', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-100')}>
            <div className="px-4 py-3 space-y-1">
              {publicLinks.map(l => (
                <Link key={l.path} to={l.path} onClick={() => setOpen(false)}
                  className={cn('block px-3 py-2.5 rounded-xl text-sm font-semibold transition',
                    location.pathname === l.path ? 'text-brand bg-brand/8' : dk ? 'text-white/55 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-50')}>
                  {l.name}
                </Link>
              ))}
              {!user && (
                <div className="flex gap-2 pt-2">
                  <Link to="/auth/login" onClick={() => setOpen(false)} className={cn('flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-semibold border',
                    dk ? 'border-white/10 text-white/70' : 'border-gray-200 text-gray-600')}>Sign In</Link>
                  <Link to="/auth/signup" onClick={() => setOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-bold bg-brand text-white">Sign Up</Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
