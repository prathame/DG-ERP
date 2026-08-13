/**
 * Small “i” control — hover / focus shows what a metric means.
 */
import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export function MetricInfoTip({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  return (
    <span className={cn('relative inline-flex shrink-0 group/info', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center justify-center rounded-full',
          'w-4 h-4 text-current opacity-45 hover:opacity-90 focus:opacity-90',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dg-primary)]',
        )}
        aria-label={text}
        title={text}
      >
        <Info size={12} strokeWidth={2.25} aria-hidden />
      </button>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-30 w-52 sm:w-56 p-2 rounded-lg text-[11px] leading-snug font-medium',
          'bg-[var(--dg-ink,#111)] text-white shadow-lg',
          'left-1/2 -translate-x-1/2 top-full mt-1.5',
          'opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible',
          'group-focus-within/info:opacity-100 group-focus-within/info:visible',
          'transition-opacity duration-150',
        )}
      >
        {text}
      </span>
    </span>
  );
}
