/**
 * End-user Accounts help — plain language, current report first.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  ACCOUNTS_GUIDE_ENTRIES,
  ACCOUNTS_GUIDE_INTRO,
  guideEntryForTab,
  type AccountsGuideEntry,
} from './accountsGuideContent';

type Props = {
  open: boolean;
  onClose: () => void;
  activeTab?: string;
};

function EntryCard({ entry, highlight }: { entry: AccountsGuideEntry; highlight?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 sm:p-4',
        highlight
          ? 'border-[var(--dg-primary)] bg-[color-mix(in_srgb,var(--dg-primary)_8%,transparent)]'
          : 'border-[var(--dg-card-border)] bg-[var(--dg-bg)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('font-bold dg-ink', highlight ? 'text-base' : 'text-sm')}>{entry.label}</p>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider dg-muted">
          {entry.group === 'accounts' ? 'Accounts' : 'Compliance'}
        </span>
      </div>
      <p className={cn('dg-ink mt-2 leading-snug', highlight ? 'text-sm' : 'text-sm')}>
        <span className="font-semibold">Shows: </span>
        {entry.shows}
      </p>
      <p className="text-sm dg-muted mt-2 leading-relaxed">
        <span className="font-semibold dg-ink">What to do: </span>
        {entry.steps}
      </p>
    </div>
  );
}

function OtherList({ title, entries }: { title: string; entries: AccountsGuideEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <details className="rounded-xl border border-[var(--dg-card-border)] bg-[var(--dg-bg)] open:pb-2">
      <summary className="cursor-pointer list-none px-3.5 py-3 text-sm font-bold dg-ink flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>
          {title} <span className="font-semibold dg-muted">({entries.length})</span>
        </span>
        <span className="text-xs font-bold dg-muted">Tap to open</span>
      </summary>
      <div className="px-3 pb-1 space-y-2">
        {entries.map(e => (
          <EntryCard key={e.key} entry={e} />
        ))}
      </div>
    </details>
  );
}

export function AccountsGuideModal({ open, onClose, activeTab }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = useMemo(() => (activeTab ? guideEntryForTab(activeTab) : undefined), [activeTab]);
  const rest = useMemo(() => ACCOUNTS_GUIDE_ENTRIES.filter(e => e.key !== current?.key), [current?.key]);
  const accounts = rest.filter(e => e.group === 'accounts');
  const compliance = rest.filter(e => e.group === 'compliance');

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounts-guide-title"
        className={cn(
          'relative z-10 w-full sm:max-w-lg max-h-[88vh] flex flex-col',
          'rounded-t-2xl sm:rounded-2xl border border-[var(--dg-card-border)]',
          'bg-[var(--dg-card)] shadow-xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-[var(--dg-card-border)] shrink-0">
          <div className="min-w-0 flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)]">
              <HelpCircle size={18} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="accounts-guide-title" className="text-lg font-bold dg-ink tracking-tight">
                {ACCOUNTS_GUIDE_INTRO.title}
              </h2>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg dg-muted hover:bg-[var(--dg-input)] hover:dg-ink"
            aria-label="Close help"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
          <section className="rounded-xl border border-[var(--dg-card-border)] bg-[var(--dg-bg)] p-3.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest dg-muted mb-2.5">3 easy steps</h3>
            <ol className="space-y-2">
              {ACCOUNTS_GUIDE_INTRO.steps.map((step, i) => (
                <li key={step} className="flex gap-2.5 text-sm dg-ink leading-snug">
                  <span
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: 'var(--dg-primary-bright)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {current && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-widest dg-muted mb-2">Report you selected</h3>
              <EntryCard entry={current} highlight />
            </section>
          )}

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest dg-muted mb-2">Remember</h3>
            <ul className="space-y-1.5 text-sm dg-muted leading-relaxed list-disc pl-4">
              {ACCOUNTS_GUIDE_INTRO.tips.map(tip => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>

          <section className="space-y-2.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest dg-muted">Other reports</h3>
            <OtherList title="Accounts" entries={accounts} />
            <OtherList title="Compliance" entries={compliance} />
          </section>
        </div>
      </div>
    </div>
  );
}

export function AccountsHelpButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border transition-all',
        'border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)]',
        className,
      )}
      aria-label="Accounts help"
      title="How to use Accounts"
    >
      <HelpCircle size={16} aria-hidden />
      Help
    </button>
  );
}
