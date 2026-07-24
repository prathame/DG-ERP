/**
 * Cap non-service phone Accounts chrome (immersive mock).
 * Service phone UX keeps AccountsView’s existing layout.
 * Selection + generate wiring stays in AccountsView.
 */
import React from 'react';
import { BarChart3, Download, Search, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type MobileAccountChip = {
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
};

type Props = {
  accountTabs: MobileAccountChip[];
  reportTabs: MobileAccountChip[];
  tab: string;
  onSelectTab: (key: string) => void;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  showDateRange: boolean;
  ledgerFilter?: string;
  onLedgerFilter?: (v: string) => void;
  gstMonth?: number;
  gstYear?: number;
  onGstMonth?: (v: number) => void;
  onGstYear?: (v: number) => void;
  loading: boolean;
  onGenerate: () => void;
  onExport?: () => void;
  canExport?: boolean;
  onPrint?: () => void;
  gstr1Slot?: React.ReactNode;
  children: React.ReactNode;
  showEmpty: boolean;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] font-bold uppercase tracking-widest dg-m-faint mb-2 px-0.5">{children}</h2>;
}

function ChipRow({
  tabs,
  tab,
  onSelectTab,
}: {
  tabs: MobileAccountChip[];
  tab: string;
  onSelectTab: (key: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
      {tabs.map(t => {
        const Icon = t.icon;
        const selected = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelectTab(t.key)}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-bold border border-solid transition-all active:scale-95',
              selected
                ? 'dg-m-chip-active border-transparent shadow-sm'
                : 'bg-white/80 dg-m-muted border-[var(--dg-card-border)]',
            )}
          >
            <Icon size={16} aria-hidden />
            {t.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

export function MobileAccountsPanel({
  accountTabs,
  reportTabs,
  tab,
  onSelectTab,
  from,
  to,
  onFrom,
  onTo,
  showDateRange,
  ledgerFilter,
  onLedgerFilter,
  gstMonth,
  gstYear,
  onGstMonth,
  onGstYear,
  loading,
  onGenerate,
  onExport,
  canExport,
  onPrint,
  gstr1Slot,
  children,
  showEmpty,
}: Props) {
  const fieldLabel = 'text-[10px] font-bold dg-m-faint uppercase tracking-wider block mb-1';
  const fieldInput =
    'w-full h-10 bg-white/80 border border-[var(--dg-card-border)] rounded-xl px-3 text-sm dg-m-ink focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary-bright)]';

  return (
    <div className="dg-mobile-glass space-y-4 -mx-3 px-3 pb-2 min-h-full">
      <div className="flex items-start justify-between gap-2 pt-0.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest dg-m-faint">Statements</p>
          <h2 className="text-xl font-bold dg-m-ink tracking-tight">Accounts</h2>
        </div>
        {(onExport || onPrint) && (
          <div className="flex items-center gap-1.5 shrink-0">
            {onExport && (
              <button
                type="button"
                onClick={onExport}
                disabled={!canExport}
                className="h-9 px-3 rounded-full border border-[var(--dg-card-border)] bg-white/80 text-[11px] font-bold dg-m-ink inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Download size={14} /> CSV
              </button>
            )}
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                className="h-9 px-3 rounded-full border border-[var(--dg-card-border)] bg-white/80 text-[11px] font-bold dg-m-muted"
              >
                Print
              </button>
            )}
          </div>
        )}
      </div>

      <section>
        <SectionLabel>Accounts</SectionLabel>
        <ChipRow tabs={accountTabs} tab={tab} onSelectTab={onSelectTab} />
      </section>

      {reportTabs.length > 0 && (
        <section>
          <SectionLabel>Reports</SectionLabel>
          <ChipRow tabs={reportTabs} tab={tab} onSelectTab={onSelectTab} />
        </section>
      )}

      {tab !== 'gstr2b' && (
        <section className="dg-m-glass-card rounded-2xl p-3.5 space-y-3">
          <div
            className={cn(
              'grid gap-2',
              showDateRange || tab === 'gst' || tab === 'gstr3b' || tab === 'ledger' ? 'grid-cols-2' : 'grid-cols-1',
            )}
          >
            {showDateRange && (
              <>
                <div className="min-w-0">
                  <label className={fieldLabel}>From</label>
                  <input type="date" value={from} onChange={e => onFrom(e.target.value)} className={fieldInput} />
                </div>
                <div className="min-w-0">
                  <label className={fieldLabel}>To</label>
                  <input type="date" value={to} onChange={e => onTo(e.target.value)} className={fieldInput} />
                </div>
              </>
            )}
            {tab === 'ledger' && onLedgerFilter && (
              <div className="col-span-2 min-w-0">
                <label className={fieldLabel}>Type</label>
                <select value={ledgerFilter} onChange={e => onLedgerFilter(e.target.value)} className={fieldInput}>
                  <option value="all">All</option>
                  <option value="sales">Sales/Distribution</option>
                  <option value="purchases">Purchases</option>
                  <option value="payments">Payments</option>
                </select>
              </div>
            )}
            {(tab === 'gst' || tab === 'gstr3b') && onGstMonth && onGstYear && gstMonth != null && gstYear != null && (
              <>
                <div className="min-w-0">
                  <label className={fieldLabel}>Month</label>
                  <select
                    value={gstMonth}
                    onChange={e => onGstMonth(parseInt(e.target.value, 10))}
                    className={fieldInput}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className={fieldLabel}>Year</label>
                  <input
                    type="number"
                    value={gstYear}
                    onChange={e => onGstYear(parseInt(e.target.value, 10))}
                    className={fieldInput}
                  />
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="w-full h-11 rounded-xl text-[13px] font-bold dg-m-bg-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.98] transition-transform"
          >
            <Search size={16} aria-hidden />
            {loading ? 'Loading…' : 'Generate Statement'}
          </button>
          {gstr1Slot}
        </section>
      )}

      {children}

      {showEmpty && (
        <section className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--dg-input)] flex items-center justify-center">
            <BarChart3 size={36} className="dg-m-faint" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold dg-m-ink">Ready to Analyze</p>
            <p className="text-[12px] dg-m-muted max-w-[240px] mx-auto leading-relaxed">
              Select a statement type and range to generate your detailed financial report.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
