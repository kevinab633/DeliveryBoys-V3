import { Link, useLocation } from 'react-router-dom';
import { Home, Package, ClipboardList, User } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';

/** Pages where the customer bottom tab bar is shown. Booking and tracking
 *  use full-height map layouts, so they keep their own back controls. */
export const CUSTOMER_TAB_ROUTES = ['/', '/my-orders', '/profile'];

const tabs = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'Book', path: '/book', icon: Package },
  { name: 'Orders', path: '/my-orders', icon: ClipboardList },
  { name: 'Profile', path: '/profile', icon: User },
];

/** Mobile bottom navigation for signed-in customers only. Visitors, riders,
 *  and managers never see it. */
export default function CustomerTabBar() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const user = useAuthStore(s => s.user);
  const { pathname } = useLocation();

  if (user?.role !== 'customer' || !CUSTOMER_TAB_ROUTES.includes(pathname)) return null;

  return (
    <nav aria-label="Customer navigation"
      className={cn('fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] md:hidden',
        dk ? 'border-white/10 bg-surface-dark-2' : 'border-gray-200 bg-white')}>
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map(tab => {
          const active = pathname === tab.path;
          return (
            <li key={tab.path}>
              <Link to={tab.path} aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition',
                  active ? 'text-brand' : dk ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-900')}>
                <tab.icon size={22} strokeWidth={active ? 2.4 : 2} />
                {tab.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
