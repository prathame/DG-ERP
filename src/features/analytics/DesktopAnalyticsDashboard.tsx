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

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString();

type MoneyTile = {
  id: string;
  label: string;
  value: number;
  accent: 'brand' | 'blue' | 'green' | 'rose' | 'amber';
  hint?: string;
};

type Activity = { type: string; id: string; label: string; amount: number; date: string };

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
  revenueHighlight: number;
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
  payroll,
  counts,
  setActiveTab,
  revenueHighlight,
}: Props) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
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
                <p className="text-[10px] dg-muted uppercase tracking-widest font-black mb-3">{tile.label}</p>
                <h4 className={cn('text-2xl font-bold tabular-nums', ACCENT_VALUE[tile.accent])}>{fmt(tile.value)}</h4>
                {tile.hint ? <p className="text-[10px] dg-faint mt-1">{tile.hint}</p> : null}
              </div>
            ))}
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="dg-glass-card p-8 rounded-3xl">
            <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-bold dg-ink mb-1">Revenue Performance</h3>
                <p className="dg-faint text-xs">Actual data trends from Unified Dashboard</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black dg-ink tabular-nums">{fmt(revenueHighlight)}</span>
                <div className="flex items-center justify-end gap-1 dg-success text-[11px] font-bold mt-1">
                  <TrendingUp size={14} />
                  {t('dashboard.moneyOverview')}
                </div>
              </div>
            </div>
            <div className="h-64 relative">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 300">
                <defs>
                  <linearGradient id="dgChartFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#994700" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#994700" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="50" x2="1000" y2="50" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4" />
                <line
                  x1="0"
                  y1="150"
                  x2="1000"
                  y2="150"
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeDasharray="4"
                />
                <line
                  x1="0"
                  y1="250"
                  x2="1000"
                  y2="250"
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeDasharray="4"
                />
                <path
                  d="M0,280 C100,270 200,265 300,275 C400,285 500,240 600,210 C700,180 850,120 1000,40"
                  fill="none"
                  stroke="#994700"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d="M0,280 C100,270 200,265 300,275 C400,285 500,240 600,210 C700,180 850,120 1000,40 V300 H0 Z"
                  fill="url(#dgChartFill)"
                />
                <circle cx="300" cy="275" r="5" fill="var(--dg-bg)" stroke="#994700" strokeWidth="2" />
                <circle cx="600" cy="210" r="5" fill="var(--dg-bg)" stroke="#994700" strokeWidth="2" />
                <circle cx="1000" cy="40" r="6" fill="#994700" stroke="#fff" strokeWidth="2" />
              </svg>
              <div className="flex justify-between mt-4 text-[10px] dg-faint font-bold uppercase tracking-widest px-1">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>
            </div>
          </div>

          {payroll && (
            <div className="dg-glass-card p-8 rounded-3xl">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <Wallet className="dg-primary" size={22} />
                  <h3 className="text-lg font-bold dg-ink">
                    {t('dashboard.staffPayroll')} — {year}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('masters')}
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

        <div className="col-span-12 lg:col-span-4 space-y-8">
          <div className="dg-glass-card p-8 rounded-3xl flex flex-col min-h-[28rem]">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-bold dg-ink">{t('dashboard.recentActivity')}</h3>
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
              <div className="space-y-6 relative">
                <div className="absolute left-[19px] top-4 bottom-4 w-px bg-[var(--dg-card-border)]" />
                {activity.slice(0, 8).map(a => {
                  const Icon = activityIcon(a.type);
                  const outflow = a.type === 'expense';
                  return (
                    <div key={a.id + a.type} className="relative flex items-start gap-4">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full dg-glass-card flex items-center justify-center z-10 shrink-0',
                          outflow ? 'dg-error' : 'dg-success',
                        )}
                      >
                        <Icon size={16} />
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
                        <p className="text-xs dg-muted mt-1">{activityLabel(a.type)}</p>
                        <p className="text-[10px] dg-faint mt-2 font-bold uppercase tracking-tighter">
                          {relativeTime(a.date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-auto pt-8">
              <button
                type="button"
                onClick={() => setActiveTab('accounts')}
                className="w-full py-4 dg-glass-card rounded-2xl dg-ink font-bold text-xs hover:opacity-90 transition-all"
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
              { label: t('masters.customers'), count: counts.customerMaster, icon: Users, tab: 'sales' as Tab },
              { label: t('masters.vendors'), count: counts.vendorMaster, icon: UserRound, tab: 'finance' as Tab },
              { label: t('dashboard.products'), count: counts.itemMaster, icon: Package, tab: 'inventory' as Tab },
              { label: t('masters.banks'), count: counts.bankMaster, icon: Landmark, tab: 'accounts' as Tab },
            ] as const
          ).map(({ label, count, icon: Icon, tab }) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveTab(tab)}
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
