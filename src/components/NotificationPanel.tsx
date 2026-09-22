import { useState } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { cn, timeAgo } from '../lib/utils';

export default function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user } = useAuthStore();
  const { notifications, markRead, markAllRead, getUnread } = useNotificationStore();

  if (!user) return null;

  const userNotifs = notifications.filter(n => n.userId === user.id).slice(0, 20);
  const unread = getUnread(user.id);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={cn('p-2 rounded-xl transition relative', dk ? 'text-white/60 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100')}>
        <Bell size={20} />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold animate-pulse">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className={cn('fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-full mt-0 sm:mt-2 sm:w-96 max-w-[calc(100vw-1rem)] rounded-2xl shadow-2xl border z-50 overflow-hidden',
                dk ? 'bg-surface-dark-2 border-white/10' : 'bg-white border-gray-200')}
            >
              <div className={cn('px-4 py-3 flex items-center justify-between border-b', dk ? 'border-white/5' : 'border-gray-100')}>
                <h3 className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>Notifications</h3>
                <div className="flex items-center gap-2">
                  {unread.length > 0 && (
                    <button onClick={() => markAllRead(user.id)} className="text-brand text-xs font-semibold flex items-center gap-1">
                      <CheckCheck size={14} /> Mark all read
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className={dk ? 'text-white/30' : 'text-gray-400'}><X size={18} /></button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {userNotifs.length === 0 && (
                  <div className="py-12 text-center">
                    <Bell size={28} className={cn('mx-auto mb-2', dk ? 'text-white/15' : 'text-gray-300')} />
                    <p className={cn('text-sm', dk ? 'text-white/30' : 'text-gray-400')}>No notifications yet</p>
                  </div>
                )}
                {userNotifs.map(n => (
                  <div key={n.id}
                    onClick={() => { if (!n.read) markRead(n.id); }}
                    className={cn('px-4 py-3 border-b cursor-pointer transition',
                      !n.read ? dk ? 'bg-brand/5 border-white/5' : 'bg-brand/5 border-gray-100' : dk ? 'border-white/5 hover:bg-white/3' : 'border-gray-50 hover:bg-gray-50')}>
                    <div className="flex items-start gap-3">
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', !n.read ? 'bg-brand' : 'bg-transparent')} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-900')}>{n.title}</p>
                        <p className={cn('text-xs mt-0.5', dk ? 'text-white/50' : 'text-gray-500')}>{n.message}</p>
                        <p className={cn('text-[10px] mt-1', dk ? 'text-white/25' : 'text-gray-400')}>{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
