import React from 'react';
import { cn } from '../../lib/utils';

export const Skeleton: React.FC<
  React.HTMLAttributes<HTMLDivElement> & {
    dark?: boolean;
  }
> = ({ className, dark = false, ...rest }) => {
  return (
    <div
      aria-hidden="true"
      className={cn(dark ? 'skeleton-dark' : 'skeleton', className)}
      {...rest}
    />
  );
};

export function KpiValueSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-7 w-24 inline-block align-middle rounded-md', className)} />;
}

export function TableRowsSkeleton({
  rows = 6,
  columns = 6,
  withAvatar = false,
  compact = false,
}: {
  rows?: number;
  columns?: number;
  withAvatar?: boolean;
  compact?: boolean;
}) {
  const cellPad = compact ? 'p-3' : 'px-6 py-4';
  const widths = ['w-32', 'w-24', 'w-20', 'w-28', 'w-16', 'w-20', 'w-24'];

  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} aria-hidden="true">
          {Array.from({ length: columns }).map((__, colIdx) => {
            const isFirst = colIdx === 0;
            const isLast = colIdx === columns - 1;
            const wClass = widths[(colIdx + rowIdx) % widths.length];

            return (
              <td key={colIdx} className={cn(cellPad, isLast && 'text-right')}>
                {isFirst && withAvatar ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                    <div className="space-y-1.5 min-w-0">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ) : isFirst ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                ) : isLast ? (
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <Skeleton className="h-7 w-14 rounded-md" />
                    <Skeleton className="h-7 w-7 rounded-md" />
                  </div>
                ) : (
                  <Skeleton className={cn('h-3.5', wClass)} />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

export function MobileListSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: cards }).map((_, idx) => (
        <div key={idx} className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-3.5 w-24" />
            </div>
            <div className="space-y-1.5 flex flex-col items-end">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PosProductGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="card p-3 sm:p-4 flex flex-col h-full">
          <Skeleton className="w-full aspect-square rounded-lg mb-3" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  variant = 'supplier',
}: {
  count?: number;
  variant?: 'supplier' | 'branch';
}) {
  if (variant === 'branch') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="card flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-6 w-6 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="card flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4 gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="w-11 h-11 rounded-lg shrink-0" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="flex gap-1">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
            </div>
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BillingHistorySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-3 p-3 border-b border-border last:border-0"
        >
          <div className="space-y-1.5 min-w-0 flex-1">
            <Skeleton className="h-4 w-44 max-w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="space-y-1.5 flex flex-col items-end shrink-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InspectorModalSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-lg border border-border bg-surface-alt space-y-2"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-border space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="p-4 rounded-xl border border-border space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function SmartImportSkeleton({ fileName }: { fileName?: string }) {
  return (
    <div className="py-3 space-y-4 text-left" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-bold text-primary truncate">
            Reading &amp; mapping {fileName || 'document'}...
          </p>
          <p className="text-xs text-text-muted">
            Detecting tables, running OCR if scanned, normalizing UGX figures &amp; reconciling fields.
          </p>
        </div>
        <Skeleton className="h-6 w-24 rounded-md shrink-0" />
      </div>
      <div className="border border-border rounded-xl overflow-hidden bg-surface">
        <div className="grid grid-cols-4 gap-3 px-4 py-2.5 bg-surface-alt/60 border-b border-border">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-16 ml-auto" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-3 px-4 py-3 items-center">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-3.5 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CameraViewfinderSkeleton() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-surface-alt/95 p-6 gap-4"
      aria-live="polite"
    >
      <div className="relative w-52 h-32 rounded-xl border-2 border-dashed border-accent/40 bg-surface/70 overflow-hidden flex items-center justify-center">
        <Skeleton className="w-36 h-1.5 rounded-full" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <Skeleton className="h-3 w-36" />
        <p className="text-[11px] font-medium text-text-muted">Initializing camera viewfinder...</p>
      </div>
    </div>
  );
}

export function PageContentSkeleton({
  variant = 'default',
}: {
  variant?: 'dashboard' | 'table' | 'pos' | 'cards' | 'master' | 'default';
}) {
  if (variant === 'pos') {
    return (
      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] min-h-[540px]" aria-hidden="true">
        <div className="flex-1 flex flex-col space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-12 flex-1 rounded-lg" />
            <Skeleton className="h-12 w-28 rounded-lg" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="skeleton h-8 w-20 rounded-md" />
            ))}
          </div>
          <PosProductGridSkeleton count={8} />
        </div>
        <div className="w-full lg:w-[380px] xl:w-[420px] card p-0 overflow-hidden flex flex-col">
          <div className="h-14 bg-primary/90 px-4 flex items-center justify-between">
            <Skeleton dark className="h-5 w-32" />
            <Skeleton dark className="h-5 w-16" />
          </div>
          <div className="p-4 space-y-3 flex-1">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div className="space-y-6" aria-hidden="true">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2.5">
            <Skeleton className="h-11 w-32 rounded-md" />
            <Skeleton className="h-11 w-32 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="card flex items-start justify-between gap-3">
              <div className="space-y-2.5 flex-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
            </div>
          ))}
        </div>
        <div className="dashboard-grid">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <div className="card space-y-4">
            <Skeleton className="h-5 w-36" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className="space-y-6" aria-hidden="true">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-11 w-36 rounded-md" />
        </div>
        <div className="card p-4">
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <CardGridSkeleton count={6} variant="supplier" />
      </div>
    );
  }

  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2.5">
          <Skeleton className="h-11 w-32 rounded-md" />
          <Skeleton className="h-11 w-32 rounded-md" />
        </div>
      </div>

      {variant === 'master' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-10 w-64 rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-border">
              <TableRowsSkeleton rows={6} columns={5} withAvatar />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceBootSkeleton() {
  return (
    <div className="flex min-h-screen bg-canvas" aria-busy="true" aria-label="Loading workspace">
      {/* Sidebar rail placeholder matching 256px desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#0B1F3A] flex-col shrink-0 border-r border-slate-800/70">
        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
          <Skeleton dark className="w-9 h-9 rounded-lg shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton dark className="h-4 w-28" />
            <Skeleton dark className="h-2.5 w-20" />
          </div>
        </div>
        <div className="flex-1 px-3 py-5 space-y-2">
          {Array.from({ length: 9 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton dark className="w-4 h-4 rounded shrink-0" />
              <Skeleton dark className="h-3.5 w-28" />
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/10 space-y-2.5">
          <Skeleton dark className="h-12 w-full rounded-lg" />
          <Skeleton dark className="h-8 w-full rounded-lg" />
        </div>
      </aside>

      {/* Main viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-surface border-b border-border px-4 md:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-lg lg:hidden" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-24 rounded-md hidden sm:block" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </header>
        <main className="p-4 md:p-8 max-w-[1400px] mx-auto w-full flex-1">
          <PageContentSkeleton variant="dashboard" />
        </main>
      </div>
    </div>
  );
}
