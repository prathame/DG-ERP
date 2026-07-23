/**
 * Desktop-only glass Accounts chrome. Cap / phone UX untouched.
 * Selection + generate wiring stays in AccountsView.
 */
import React from 'react';
import { BarChart3, Download, Search, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type DesktopAccountTile = {
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
};

type Props = {
  title: string;
  subtitle: string;
  accountTabs: DesktopAccountTile[];
  reportTabs: DesktopAccountTile[];
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
  gstr1Slot?: React.ReactNode;
  children: React.ReactNode;
  showEmpty: boolean;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--dg-primary)]" aria-hidden />
      <p className="text-[10px] font-bold dg-muted uppercase tracking-[0.14em]">{children}</p>
    </div>
  );
}

export function DesktopAccountsPanel({
  title,
  subtitle,
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
  gstr1Slot,
  children,
  showEmpty,
}: Props) {
  const fieldLabel = 'text-[10px] font-bold dg-muted uppercase tracking-wider block mb-1.5';
  const fieldInput =
    'w-full bg-[var(--dg-bg)] border border-[var(--dg-card-border)] rounded-lg py-2.5 px-3 text-sm dg-ink focus:ring-2 focus:ring-[var(--dg-primary)] focus:border-transparent';

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)]">
            <BarChart3 size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-3xl font-bold dg-ink tracking-tight">{title}</h2>
            <p className="text-sm dg-muted mt-1.5 max-w-xl leading-relaxed">{subtitle}</p>
          </div>
        </div>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={!canExport}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-all',
              'border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <Download size={16} /> Export Data
          </button>
        )}
      </div>

      <section>
        <SectionLabel>Accounts</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {accountTabs.map(t => {
            const Icon = t.icon;
            const selected = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onSelectTab(t.key)}
                className={cn(
                  'dg-glass-card rounded-2xl p-4 flex flex-col items-center gap-3 text-center transition-all min-h-[120px] justify-center',
                  selected
                    ? 'border-2 border-[var(--dg-primary)] !bg-[color-mix(in_srgb,var(--dg-primary)_8%,var(--dg-card))]'
                    : 'hover:-translate-y-0.5',
                )}
              >
                <div
                  className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center transition-colors',
                    selected
                      ? 'dg-bg-primary'
                      : 'bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)]',
                  )}
                >
                  <Icon size={22} />
                </div>
                <span className={cn('text-xs font-bold leading-snug', selected ? 'dg-ink' : 'dg-muted')}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {reportTabs.length > 0 && (
        <section>
          <SectionLabel>Compliance Reports</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
            {reportTabs.map(t => {
              const Icon = t.icon;
              const selected = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onSelectTab(t.key)}
                  className={cn(
                    'dg-glass-card rounded-xl px-3 py-3 flex items-center gap-2.5 text-left transition-all',
                    selected
                      ? 'border-2 border-[var(--dg-primary)] !bg-[color-mix(in_srgb,var(--dg-primary)_8%,var(--dg-card))]'
                      : 'hover:bg-[var(--dg-card-hover)]',
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      selected
                        ? 'dg-bg-primary'
                        : 'bg-[color-mix(in_srgb,var(--dg-primary)_10%,transparent)] text-[var(--dg-primary)]',
                    )}
                  >
                    <Icon size={15} />
                  </div>
                  <span className={cn('text-[11px] font-bold leading-tight', selected ? 'dg-ink' : 'dg-muted')}>
                    {t.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {tab !== 'gstr2b' && (
        <section className="dg-glass-card rounded-2xl p-4 sm:p-5">
          <div
            className={cn(
              'grid gap-3 sm:flex sm:items-end sm:gap-4 sm:flex-wrap',
              showDateRange || tab === 'gst' || tab === 'gstr3b' || tab === 'ledger' ? 'grid-cols-2' : 'grid-cols-1',
            )}
          >
            {showDateRange && (
              <>
                <div className="min-w-0 sm:w-40">
                  <label className={fieldLabel}>From Date</label>
                  <input type="date" value={from} onChange={e => onFrom(e.target.value)} className={fieldInput} />
                </div>
                <div className="min-w-0 sm:w-40">
                  <label className={fieldLabel}>To Date</label>
                  <input type="date" value={to} onChange={e => onTo(e.target.value)} className={fieldInput} />
                </div>
              </>
            )}
            {tab === 'ledger' && onLedgerFilter && (
              <div className="col-span-2 sm:col-span-1 min-w-0 sm:min-w-[10rem]">
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
                <div className="min-w-0 sm:w-40">
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
                <div className="min-w-0 sm:w-28">
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
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading}
              className={cn(
                'col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 h-11 px-6 rounded-lg text-sm font-bold text-white',
                'disabled:opacity-60 hover:opacity-90 active:scale-[0.98] transition-all shadow-sm',
              )}
              style={{ background: 'var(--dg-primary-bright)' }}
            >
              <Search size={15} /> {loading ? 'Loading...' : 'Generate'}
            </button>
            {gstr1Slot}
          </div>
        </section>
      )}

      {children}

      {showEmpty && (
        <div className="dg-glass-card rounded-2xl p-12 sm:p-16 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-[color-mix(in_srgb,var(--dg-primary)_10%,transparent)] text-[var(--dg-primary)]">
            <BarChart3 size={28} className="opacity-80" />
          </div>
          <p className="text-lg font-bold dg-ink">Ready for Analysis</p>
          <p className="text-sm dg-muted mt-2 max-w-md mx-auto leading-relaxed">
            Select a statement above, set the date range if needed, then click Generate.
          </p>
        </div>
      )}
    </div>
  );
}
