/**
 * Explains Expenses ↔ Accounts when Books is active.
 */
import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';

type Props = {
  onOpenProfitLoss?: () => void;
  onOpenCashBook?: () => void;
  /** Compact mobile styling */
  compact?: boolean;
  className?: string;
};

export function BooksExpensesHint({ onOpenProfitLoss, onOpenCashBook, compact, className }: Props) {
  const hasLinks = Boolean(onOpenProfitLoss || onOpenCashBook);
  return (
    <div
      className={cn(
        'rounded-xl border border-[color-mix(in_srgb,var(--dg-primary)_28%,transparent)]',
        'bg-[color-mix(in_srgb,var(--dg-primary)_8%,transparent)]',
        compact ? 'p-3' : 'p-4',
        className,
      )}
      role="note"
    >
      <div className="flex gap-2.5 items-start">
        <div
          className={cn(
            'shrink-0 rounded-lg flex items-center justify-center',
            'bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] text-[var(--dg-primary)]',
            compact ? 'w-8 h-8' : 'w-9 h-9',
          )}
        >
          <BookOpen size={compact ? 15 : 17} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('font-bold dg-ink', compact ? 'text-[13px]' : 'text-sm')}>Same expenses as Accounts</p>
          <p className={cn('dg-muted mt-1 leading-relaxed', compact ? 'text-[11px]' : 'text-xs')}>
            This list shows Books expense payments (including Miracle import). Salary stays under Staff → Staff Salary.
            Add here and it posts to Accounts; delete here removes it from Accounts too.
          </p>
          {hasLinks && (
            <div className={cn('flex flex-wrap gap-2', compact ? 'mt-2.5' : 'mt-3')}>
              {onOpenProfitLoss && (
                <button
                  type="button"
                  onClick={onOpenProfitLoss}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg font-bold border transition-all',
                    'border-[var(--dg-primary)] text-[var(--dg-primary)]',
                    'hover:bg-[color-mix(in_srgb,var(--dg-primary)_10%,transparent)]',
                    compact ? 'h-8 px-2.5 text-[11px]' : 'h-9 px-3 text-xs',
                  )}
                >
                  View Profit &amp; Loss <ExternalLink size={12} aria-hidden />
                </button>
              )}
              {onOpenCashBook && (
                <button
                  type="button"
                  onClick={onOpenCashBook}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg font-bold border transition-all',
                    'border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)]',
                    compact ? 'h-8 px-2.5 text-[11px]' : 'h-9 px-3 text-xs',
                  )}
                >
                  Open Cash Book <ExternalLink size={12} aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
