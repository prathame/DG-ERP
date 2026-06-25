import { BadgeCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

export function isBillFullyPaid(billValue: number, balance: number): boolean {
  return billValue > 0 && balance <= 0;
}

/** Compact pill — lists and inline use */
export function PaidBadge({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold uppercase tracking-wide shrink-0',
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
        className,
      )}
      title="Bill fully paid"
    >
      <BadgeCheck size={size === 'sm' ? 12 : 14} strokeWidth={2.5} />
      Paid
    </span>
  );
}

/** Stamp style — vendor cards and headers */
export function PaidStamp({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none select-none flex items-center justify-center border-[3px] border-emerald-500 text-emerald-600 rounded-lg bg-emerald-50/95 shadow-sm',
        'text-sm font-black uppercase tracking-[0.2em] px-3 py-1.5 rotate-[-12deg]',
        className,
      )}
      aria-label="Fully paid"
    >
      <BadgeCheck size={18} className="mr-1.5" strokeWidth={2.5} />
      Paid
    </div>
  );
}
