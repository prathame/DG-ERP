import { BadgeCheck, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

export function isBillFullyPaid(billValue: number, balance: number): boolean {
  return billValue > 0 && balance <= 0;
}

/**
 * Amount still to collect from a party. Never the absolute value of a credit/advance.
 * Miracle cash with no matching invoice is an advance (net balance negative) — due stays 0.
 * When there are bills and advances, use net balance (bill due minus advances), not gross bill due.
 */
export function partyBillDue(billDue: number | null | undefined, balance: number | null | undefined): number {
  if (balance != null && Number.isFinite(Number(balance))) return Math.max(0, Number(balance));
  return Math.max(0, Number(billDue) || 0);
}

/** Some money received, but not fully cleared — common after collective / partial pay. */
export function isBillPartiallyPaid(billValue: number, balance: number, paid = billValue - balance): boolean {
  return billValue > 0 && balance > 0.001 && paid > 0.001;
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

/** Part-paid pill — collective / installment payments */
export function PartialBadge({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold uppercase tracking-wide shrink-0',
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
        className,
      )}
      title="Partially paid"
    >
      <Clock size={size === 'sm' ? 12 : 14} strokeWidth={2.5} />
      Partial
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
