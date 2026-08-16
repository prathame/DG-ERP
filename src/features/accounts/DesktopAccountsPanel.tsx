/**
 * Desktop-only glass Accounts chrome. Cap / phone UX untouched.
 * Selection + generate wiring stays in AccountsView.
 */
import React from 'react';
import { BarChart3, Download, Search, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AccountsHelpButton } from './AccountsGuideModal';

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
  onApplyFy?: () => void;
  fyLabel?: string;
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
  /** Self-contained panels (ledgers/vouchers/day book) — no Generate bar. */
  hideToolbar?: boolean;
  onHelp?: () => void;
};

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
  onApplyFy,
  fyLabel = 'This FY',
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
  hideToolbar = false,
  onHelp,
}: Props) {
  const fieldLabel = 'text-[10px] font-bold dg-muted uppercase tracking-wider block mb-1.5';
  const fieldInput =
    'w-full bg-[var(--dg-bg)] border border-[var(--dg-card-border)] rounded-lg py-2.5 px-3 text-sm dg-ink focus:ring-2 focus:ring-[var(--dg-primary)] focus:border-transparent';

  const selected =
    accountTabs.find(t => t.key === tab) || reportTabs.find(t => t.key === tab) || accountTabs[0] || reportTabs[0];
  const SelectedIcon = selected?.icon;

  return (
    <div className="space-y-5 w-full max-w-none">
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
        <div className="flex items-center gap-2 shrink-0">
          {onHelp && <AccountsHelpButton onClick={onHelp} />}
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
      </div>

      <section className="dg-glass-card rounded-2xl p-4 sm:p-5">
        <div
          className={cn(
            'grid gap-3 sm:flex sm:items-end sm:gap-4 sm:flex-wrap',
            !hideToolbar && (showDateRange || tab === 'gst' || tab === 'gstr3b' || tab === 'ledger') && 'grid-cols-2',
          )}
        >
          <div className="col-span-2 sm:col-span-1 min-w-0 sm:min-w-[16rem] sm:flex-1 sm:max-w-md">
            <label className={fieldLabel} htmlFor="accounts-statement-select">
              Statement
            </label>
            <div className="relative">
              {SelectedIcon ? (
                <SelectedIcon
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dg-primary)] pointer-events-none"
                  aria-hidden
                />
              ) : null}
              <select
                id="accounts-statement-select"
                value={tab}
                onChange={e => onSelectTab(e.target.value)}
                className={cn(fieldInput, SelectedIcon && 'pl-9')}
              >
                {accountTabs.length > 0 && (
                  <optgroup label="Accounts">
                    {accountTabs.map(t => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {reportTabs.length > 0 && (
                  <optgroup label="Compliance">
                    {reportTabs.map(t => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {tab !== 'gstr2b' && !hideToolbar && (
            <>
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
                  {onApplyFy && (
                    <div className="min-w-0 sm:w-auto">
                      <label className={fieldLabel}>&nbsp;</label>
                      <button
                        type="button"
                        onClick={onApplyFy}
                        className="h-[42px] px-3 rounded-lg text-xs font-bold border border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)] whitespace-nowrap"
                      >
                        {fyLabel}
                      </button>
                    </div>
                  )}
                </>
              )}
              {tab === 'ledger' && onLedgerFilter && (
                <div className="col-span-2 sm:col-span-1 min-w-0 sm:min-w-[10rem]">
                  <label className={fieldLabel}>Type</label>
                  <select value={ledgerFilter} onChange={e => onLedgerFilter(e.target.value)} className={fieldInput}>
                    <option value="all">Cash book</option>
                    <option value="sales">Sales/Distribution</option>
                    <option value="purchases">Purchases</option>
                    <option value="payments">Payments</option>
                  </select>
                </div>
              )}
              {(tab === 'gst' || tab === 'gstr3b') &&
                onGstMonth &&
                onGstYear &&
                gstMonth != null &&
                gstYear != null && (
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
            </>
          )}
        </div>
      </section>

      {children}

      {showEmpty && (
        <div className="dg-glass-card rounded-2xl p-12 sm:p-16 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-[color-mix(in_srgb,var(--dg-primary)_10%,transparent)] text-[var(--dg-primary)]">
            <BarChart3 size={28} className="opacity-80" />
          </div>
          <p className="text-lg font-bold dg-ink">Ready for Analysis</p>
          <p className="text-sm dg-muted mt-2 max-w-md mx-auto leading-relaxed">
            Choose a statement above, set the date range if needed, then click Generate. Ledgers and vouchers (when
            enabled) load on their own.
          </p>
        </div>
      )}
    </div>
  );
}
