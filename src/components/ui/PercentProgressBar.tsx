import React from 'react';
import { cn } from '../../lib/utils';

/** Determinate 0–100% bar — used by Settings / Offline restore. */
export function PercentProgressBar({
  percent,
  label,
  barClassName = 'bg-amber-500',
  className,
}: {
  percent: number;
  label?: string;
  barClassName?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className={cn('space-y-1.5', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
        <span className="min-w-0 truncate">{label || 'Working…'}</span>
        <span className="shrink-0 font-bold tabular-nums text-gray-700">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-[width] duration-200 ease-out', barClassName)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
