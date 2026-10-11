/**
 * Desktop-only glass Analytics (dark charcoal + light cream). Cap / phone UX untouched.
 */
import React from 'react';
import {
  TrendingUp,
  CreditCard,
  IndianRupee,
  Package,
  ShoppingCart,
  FileText,
  Wallet,
  Users,
  UserRound,
  Landmark,
  ArrowUpRight,
} from 'lucide-react';
import { cn, getTabLabel } from '../../lib/utils';
import { useTranslation } from '../../i18n';
import type { Tab } from '../../types';
import type { GlobalSearchNavigate } from '../../lib/globalSearch';
import { MetricInfoTip } from './MetricInfoTip';
import { TransactionCalendar } from './TransactionCalendar';

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN');

type MoneyTile = {
  id: string;
  label: string;
  value: number;
  accent: 'brand' | 'blue' | 'green' | 'rose' | 'amber';
  hint?: string;
  info?: string;
};

type Activity = { type: string; id: string; label: string; amount: number; date: string };

type OutstandingParty = { vendorId: string; vendorName: string; balance: number };

type Props = {
  range: string;
  rangePresets: { id: string; label: string }[];
  onRange: (id: string) => void;
  customSlot?: React.ReactNode;
  moneyTiles: MoneyTile[];
  moneyLoading: boolean;
  activity: Activity[];
  relativeTime: (dateStr: string) => string;
  activityLabel: (type: string) => string;
  vendors: OutstandingParty[];
  outstandingLabel: string;
  onOpenOutstandingParty: (party: OutstandingParty) => void;
  onOpenActivity: (activity: Activity) => void;
  payroll: {
    grandTotal: number;
    advanceOutstanding: number;
    byStaff: { name: string; total: number; payments: number }[];
  } | null;
  counts: {
    customerMaster: number;
    vendorMaster: number;
    itemMaster: number;
    bankMaster: number;
  } | null;
  setActiveTab: (tab: Tab) => void;
  /** Masters / Inventory deep-links (same App path as ⌘K). */
  onNavigateEntity: (nav: GlobalSearchNavigate) => void;
  revenueHighlight: number;
  payrollPeriodLabel?: string;
  vendorsLabel?: string;
  hideCustomerMaster?: boolean;
};

const ACCENT_BORDER: Record<MoneyTile['accent'], string> = {
  green: 'border-l-[color:var(--dg-success)]',
  rose: 'border-l-[color:var(--dg-error)]',
  amber: 'border-l-[color:var(--dg-primary-bright)]',
  brand: 'border-l-[color:var(--dg-primary)]',
  blue: 'border-l-[color:var(--dg-primary)]',
};

const ACCENT_VALUE: Record<MoneyTile['accent'], string> = {
  green: 'dg-success',
  rose: 'dg-error',
  amber: 'dg-primary',
  brand: 'dg-ink',
  blue: 'dg-ink',
};

function activityIcon(type: string) {
  if (type === 'expense') return CreditCard;
  if (type === 'payment') return IndianRupee;
  if (type === 'distribution') return Package;
  if (type === 'invoice') return FileText;
  return ShoppingCart;
}

export function DesktopAnalyticsDashboard({
  range,
  rangePresets,
  onRange,
  customSlot,
  moneyTiles,
  moneyLoading,
  activity,
  relativeTime,
  activityLabel,
  vendors,
  outstandingLabel,
  onOpenOutstandingParty,
  onOpenActivity,
  payroll,
  counts,
  setActiveTab,
  onNavigateEntity,
  revenueHighlight,
  payrollPeriodLabel,
  vendorsLabel,
  hideCustomerMaster,
}: Props) {
  const { t } = useTranslation();
  const spotlight = vendors[0] || null;

  return (
    <div className="space-y-8 w-full max-w-none">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold dg-ink mb-2 tracking-tight">
            {getTabLabel('analytics', t('nav.analytics'))}
          </h2>
          <p className="text-sm dg-muted">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex p-1 rounded-xl border dg-glass-card gap-0.5">
          {rangePresets
            .filter(r => r.id !== 'custom' && r.id !== 'overall')
            .concat(rangePresets.filter(r => r.id === 'overall' || r.id === 'custom'))
            .map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRange(r.id)}
                className={cn(
                  'px-4 py-1.5 text-xs font-bold rounded-lg transition-all',
                  range === r.id ? 'dg-bg-primary shadow-lg' : 'dg-muted hover:opacity-80',
                )}
              >
                {r.label}
              </button>
            ))}
        </div>
      </div>

      {customSlot}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {moneyLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dg-glass-card p-5 rounded-2xl h-24 animate-pulse" />
            ))
          : moneyTiles.map(tile => (
              <div
                key={tile.id}
                className={cn('dg-glass-card p-5 rounded-2xl border-l-4 metric-card', ACCENT_BORDER[tile.accent])}
              >
                <p className="text-[10px] dg-muted uppercase tracking-widest font-black mb-3 flex items-center gap-1">
                  <span className="min-w-0 truncate">{tile.label}</span>
                  {tile.info ? <MetricInfoTip text={tile.info} className="dg-muted" /> : null}
                </p>
                <h4 className={cn('text-2xl font-bold tabular-nums', ACCENT_VALUE[tile.accent])}>{fmt(tile.value)}</h4>
                {tile.hint ? <p className="text-[10px] dg-faint mt-1">{tile.hint}</p> : null}
              </div>
            ))}
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="space-y-3">
            <div className="flex justify-between items-end flex-wrap gap-2 px-1">
              <div className="flex items-center gap-1.5 dg-success text-[11px] font-bold">
                <TrendingUp size={14} />
                {t('dashboard.moneyOverview')}
              </div>
              <span className="text-xl font-black dg-ink tabular-nums">{fmt(revenueHighlight)}</span>
            </div>
            <TransactionCalendar variant="desktop" activityLabel={activityLabel} onOpenActivity={onOpenActivity} />
          </div>

          {payroll && (
            <div className="dg-glass-card p-8 rounded-3xl">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <Wallet className="dg-primary" size={22} />
                  <h3 className="text-lg font-bold dg-ink">
                    {t('dashboard.staffPayroll')}
                    {payrollPeriodLabel ? ` — ${payrollPeriodLabel}` : ''}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateEntity({ tab: 'masters', master: 'staff' })}
                  className="text-xs font-bold dg-primary hover:underline"
                >
                  {t('dashboard.manageStaff')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {[
                  { label: t('dashboard.totalPaid'), value: fmt(payroll.grandTotal) },
                  { label: t('dashboard.staff'), value: String(payroll.byStaff.length) },
                  { label: t('dashboard.advances'), value: fmt(payroll.advanceOutstanding) },
                ].map(s => (
                  <div
                    key={s.label}
                    className="rounded-2xl p-6 border border-[var(--dg-card-border)] bg-[var(--dg-input)]"
                  >
                    <p className="text-[10px] dg-faint uppercase font-bold mb-2">{s.label}</p>
                    <p className="text-2xl font-black dg-ink tabular-nums">{s.value}</p>
                  </div>
                ))}
              </div>
              {(payroll.byStaff?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] dg-faint uppercase font-bold tracking-widest">
                    {t('dashboard.topStaffByPayment')}
                  </p>
                  {payroll.byStaff.slice(0, 5).map(s => (
                    <div
                      key={s.name}
                      className="rounded-xl p-4 flex items-center justify-between border border-[var(--dg-card-border)] bg-[var(--dg-input)]"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--dg-primary-bright)_20%,transparent)] flex items-center justify-center text-xs font-bold dg-primary shrink-0">
                          {s.name
                            .split(/\s+/)
                            .map(p => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold dg-ink truncate">{s.name}</p>
                          <p className="text-[10px] dg-muted">
                            {s.payments} {t('dashboard.payments')}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold dg-ink tabular-nums shrink-0">{fmt(s.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="dg-glass-card p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider dg-faint">
                  {outstandingLabel} {vendorsLabel}
                </p>
                <h3 className="text-base font-bold dg-ink mt-0.5">{t('dashboard.partySpotlight')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('finance')}
                className="text-xs font-bold dg-primary hover:underline flex items-center gap-0.5"
              >
                {t('common.viewAll')} <ArrowUpRight size={14} />
              </button>
            </div>
            {!spotlight ? (
              <div className="text-center py-6">
                <Wallet size={28} className="mx-auto dg-faint mb-2" />
                <p className="text-sm font-bold dg-ink">{t('dashboard.noOutstanding')}</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--dg-input)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => onOpenOutstandingParty(spotlight)}
                  className="w-full text-left p-4 hover:opacity-90 transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--dg-primary)_18%,transparent)] flex items-center justify-center text-sm font-bold dg-primary shrink-0">
                      {spotlight.vendorName
                        .split(/\s+/)
                        .map(p => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold dg-ink truncate">{spotlight.vendorName}</p>
                      <p className="text-[11px] dg-muted">#1 · {t('dashboard.toCollect')}</p>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider dg-faint">
                      {t('dashboard.outstanding')}
                    </span>
                    <span className="text-xl font-black dg-error tabular-nums">{fmt(spotlight.balance)}</span>
                  </div>
                </button>
                {vendors.length > 1 ? (
                  <ul className="px-3 pb-3 space-y-1 border-t border-[var(--dg-card-border)] pt-2">
                    {vendors.slice(1, 4).map((v, i) => (
                      <li key={v.vendorId}>
                        <button
                          type="button"
                          onClick={() => onOpenOutstandingParty(v)}
                          className="w-full flex items-center justify-between gap-2 text-left rounded-lg px-1 py-1.5 hover:bg-[var(--dg-card-bg)]"
                        >
                          <span className="text-[12px] dg-ink truncate">
                            <span className="dg-faint font-bold mr-1">#{i + 2}</span>
                            {v.vendorName}
                          </span>
                          <span className="text-[12px] font-bold dg-error tabular-nums shrink-0">{fmt(v.balance)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>

          <div className="dg-glass-card p-6 rounded-3xl flex flex-col min-h-[22rem]">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-bold dg-ink">{t('dashboard.recentActivity')}</h3>
              <button
                type="button"
                onClick={() => setActiveTab('finance')}
                className="p-2 rounded-lg dg-muted hover:opacity-80"
                title={t('common.viewAll')}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
            {activity.length === 0 ? (
              <p className="text-sm dg-muted text-center py-10">{t('dashboard.noActivity')}</p>
            ) : (
              <div className="space-y-3 relative">
                <div className="absolute left-[17px] top-3 bottom-3 w-px bg-[var(--dg-card-border)]" />
                {activity.slice(0, 8).map(a => {
                  const Icon = activityIcon(a.type);
                  const outflow = a.type === 'expense' || a.amount < 0;
                  return (
                    <button
                      key={a.id + a.type}
                      type="button"
                      onClick={() => onOpenActivity(a)}
                      className="relative flex items-start gap-3 w-full text-left rounded-xl hover:bg-[var(--dg-input)]/60 px-1 py-1 transition-colors"
                    >
                      <div
                        className={cn(
                          'w-9 h-9 rounded-full dg-glass-card flex items-center justify-center z-10 shrink-0',
                          outflow ? 'dg-error' : 'dg-success',
                        )}
                      >
                        <Icon size={15} />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-sm font-bold dg-ink truncate">{a.label}</p>
                          <span
                            className={cn(
                              'text-sm font-black tabular-nums shrink-0',
                              outflow ? 'dg-error' : 'dg-success',
                            )}
                          >
                            {outflow ? '-' : '+'}
                            {fmt(a.amount)}
                          </span>
                        </div>
                        <p className="text-xs dg-muted mt-0.5">{activityLabel(a.type)}</p>
                        <p className="text-[10px] dg-faint mt-1 font-bold uppercase tracking-tighter">
                          {relativeTime(a.date)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => setActiveTab('accounts')}
                className="w-full py-3 dg-glass-card rounded-2xl dg-ink font-bold text-xs hover:opacity-90 transition-all"
              >
                View Full Audit Ledger
              </button>
            </div>
          </div>
        </div>
      </div>

      {counts && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pb-6">
          {(
            [
              ...(!hideCustomerMaster
                ? [
                    {
                      label: t('masters.customers'),
                      count: counts.customerMaster,
                      icon: Users,
                      nav: { tab: 'masters' as Tab, master: 'customer' as const },
                    },
                  ]
                : []),
              {
                label: vendorsLabel || t('masters.vendors'),
                count: counts.vendorMaster,
                icon: UserRound,
                nav: { tab: 'masters' as Tab, master: 'vendor' as const },
              },
              // Same destination as Masters hub Products tile → Inventory.
              {
                label: t('dashboard.products'),
                count: counts.itemMaster,
                icon: Package,
                nav: { tab: 'inventory' as Tab },
              },
              {
                label: t('masters.banks'),
                count: counts.bankMaster,
                icon: Landmark,
                nav: { tab: 'masters' as Tab, master: 'bank' as const },
              },
            ] as const
          ).map(({ label, count, icon: Icon, nav }) => (
            <button
              key={label}
              type="button"
              onClick={() => onNavigateEntity(nav)}
              className="dg-glass-card p-6 rounded-2xl flex items-center justify-between text-left group"
            >
              <div>
                <p className="text-2xl font-black dg-ink tabular-nums">{count}</p>
                <p className="text-[10px] dg-muted uppercase font-bold tracking-widest mt-1">{label}</p>
              </div>
              <Icon size={28} className="dg-faint group-hover:text-[var(--dg-primary)] transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
