import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useThemeStore } from '../stores/themeStore';

export default function CookieConsent() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const [visible, setVisible] = useState(() => localStorage.getItem('db-cookie-consent') !== 'accepted');
  if (!visible) return null;
  const accept = () => { localStorage.setItem('db-cookie-consent', 'accepted'); setVisible(false); };
  return <aside role="dialog" aria-label="Cookie and storage notice" className={cn('fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-xl rounded-2xl border p-4 shadow-2xl', dk ? 'border-white/10 bg-surface-dark-2 text-white' : 'border-gray-200 bg-white text-gray-900')}>
    <p className="text-sm font-bold">A quick privacy note</p>
    <p className={cn('mt-1 text-xs leading-relaxed', dk ? 'text-white/55' : 'text-gray-500')}>We use essential browser storage to keep Delivery Boys working. Optional location and notifications are requested only when you choose those features. <Link to="/cookies" className="font-semibold text-brand">Learn more</Link>.</p>
    <button type="button" onClick={accept} className="mt-3 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white">Got it</button>
  </aside>;
}
