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
  return (
    <div className={cn('db-map-skeleton relative overflow-hidden', className)} aria-label="Loading map">
      <div className="absolute inset-0 db-map-grid" />
      <div className="absolute left-1/3 top-1/3 h-20 w-20 rounded-full border-4 border-brand/15" />
      <Skeleton className="absolute bottom-4 left-4 h-3 w-28" rounded="pill" />
    </div>
  );
}
