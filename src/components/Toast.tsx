import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, Bell } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

export interface ToastData {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'error';
}

let toastListeners: ((t: ToastData) => void)[] = [];

export function showToast(t: Omit<ToastData, 'id'>) {
  const toast = { ...t, id: Math.random().toString(36).slice(2) };
  toastListeners.forEach(fn => fn(toast));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const dk = useThemeStore(s => s.theme === 'dark');

  useEffect(() => {
    const handler = (t: ToastData) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 5000);
    };
    toastListeners.push(handler);
    return () => { toastListeners = toastListeners.filter(fn => fn !== handler); };
  }, []);

  const icons = { success: CheckCircle2, warning: AlertTriangle, info: Info, error: AlertTriangle };
  const colors = { success: 'text-success border-success/20', warning: 'text-warning border-warning/20', info: 'text-info border-info/20', error: 'text-danger border-danger/20' };

  return (
    <div className="toast-container">
      {toasts.map(t => {
        const Icon = icons[t.type];
        return (
          <div key={t.id} className={cn('toast-item flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl max-w-sm',
            dk ? 'bg-surface-dark-3/95 glass' : 'bg-white/95 glass', colors[t.type])}>
            <Icon size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-900')}>{t.title}</p>
              <p className={cn('text-xs mt-0.5 truncate', dk ? 'text-white/50' : 'text-gray-500')}>{t.message}</p>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className={cn('shrink-0', dk ? 'text-white/30 hover:text-white/60' : 'text-gray-400 hover:text-gray-600')}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
