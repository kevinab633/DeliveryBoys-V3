import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

export function Skeleton({ className, rounded = 'md' }: { className?: string; rounded?: 'sm' | 'md' | 'lg' | 'pill' }) {
  return <span aria-hidden="true" className={cn('db-skeleton block', `db-skeleton-${rounded}`, className)} />;
}

export function PageSkeleton() {
  return (
    <main className="min-h-screen px-4 py-24 sm:px-6 lg:px-8" aria-label="Loading page">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="space-y-3 max-w-xl">
          <Skeleton className="h-3 w-24" rounded="pill" />
          <Skeleton className="h-10 w-3/4" rounded="md" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" rounded="lg" />
          <Skeleton className="h-32" rounded="lg" />
          <Skeleton className="h-32" rounded="lg" />
        </div>
        <Skeleton className="h-72 w-full" rounded="lg" />
      </div>
    </main>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="app-card flex items-center gap-3 p-4">
          <Skeleton className="h-11 w-11 shrink-0" rounded="pill" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-16" rounded="pill" />
        </div>
      ))}
    </div>
  );
}

export function MapSkeleton({ className }: { className?: string }) {
  const dk = useThemeStore(s => s.theme === 'dark');
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" aria-live="polite" aria-label="Loading map"
      className={cn('db-map-skeleton relative overflow-hidden flex flex-col items-center justify-center gap-3 px-6 text-center', className)}>
      <Loader2 size={32} className="animate-spin text-brand" aria-hidden="true" />
      <p className={cn('text-sm font-semibold', dk ? 'text-white/70' : 'text-gray-700')}>Loading map…</p>
      {slow && (
        <p className={cn('text-xs max-w-xs', dk ? 'text-white/45' : 'text-gray-500')}>
          This is taking longer than usual. Check your internet connection; the map will appear when it loads.
        </p>
      )}
    </div>
  );
}
