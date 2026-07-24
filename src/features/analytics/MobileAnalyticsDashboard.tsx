/**
 * Cap non-service phone Analytics chrome (immersive mock).
 * Service phone UX keeps AnalyticsView’s existing layout.
 */
import React from 'react';
import {
  CreditCard,
  IndianRupee,
  Package,
  ShoppingCart,
  FileText,
  Wallet,
  Users,
  UserRound,
  Landmark,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../i18n';
import type { Tab } from '../../types';
import type { GlobalSearchNavigate } from '../../lib/globalSearch';

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString();

type MoneyTile = {
  id: string;
  label: string;
  value: number;
  accent: 'brand' | 'blue' | 'green' | 'rose' | 'amber';
};

type Activity = { type: string; id: string; label: string; amount: number; date: string };

type Props = {
  range: string;
  rangePresets: { id: string; label: string }[];
  onRange: (id: string) => void;
  customSlot?: React.ReactNode;
  moneyTiles: MoneyTile[];
  moneyLoading: boolean;
  vendors: { vendorId: string; vendorName: string; balance: number }[];
  outstandingLabel: string;
  vendorsLabel: string;
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
  onNavigateEntity: (nav: GlobalSearchNavigate) => void;
};

const ACCENT_BORDER: Record<MoneyTile['accent'], string> = {
  green: 'border-l-[color:var(--dg-success)]',
  rose: 'border-l-[color:var(--dg-error)]',
  amber: 'border-l-[color:var(--dg-primary-bright)]',
  brand: 'border-l-[color:var(--dg-primary)]',
  blue: 'border-l-[color:var(--dg-primary)]',
};

const ACCENT_VALUE: Record<MoneyTile['accent'], string> = {
  green: 'dg-m-success',
  rose: 'dg-m-error',
  amber: 'dg-m-bright',
  brand: 'dg-m-ink',
  blue: 'dg-m-ink',
};

function activityIcon(type: string) {
  if (type === 'expense') return CreditCard;
  if (type === 'payment') return IndianRupee;
  if (type === 'distribution') return Package;
  if (type === 'invoice') return FileText;
  return ShoppingCart;
}

export function MobileAnalyticsDashboard({
  range,
  rangePresets,
  onRange,
  customSlot,
  moneyTiles,
  moneyLoading,
  vendors,
  outstandingLabel,
  vendorsLabel,
  activity,
  relativeTime,
  activityLabel,
  payroll,
  counts,
  setActiveTab,
  onNavigateEntity,
}: Props) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <div className="dg-mobile-glass space-y-4 -mx-3 px-3 -mt-1 pb-2 min-h-full">
      <div className="flex items-center justify-between gap-2 pt-1">
        <h2 className="text-lg font-bold dg-m-ink tracking-tight flex items-center gap-1.5">
          <TrendingUp size={18} className="dg-m-bright" />
          {t('dashboard.moneyOverview')}
        </h2>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {rangePresets.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => onRange(r.id)}
            className={cn(
              'dg-pill-tab shrink-0 h-8 px-3 rounded-full text-[11px] font-bold border border-solid transition-colors',
              range === r.id
                ? 'dg-m-chip-active border-transparent'
                : 'dg-m-surface dg-m-muted border-[var(--dg-card-border)]',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {customSlot}

      <div className="grid grid-cols-2 gap-2">
        {moneyLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dg-m-glass-card rounded-2xl h-20 animate-pulse" />
            ))
          : moneyTiles.map(tile => (
              <div
                key={tile.id}
                className={cn('dg-m-glass-card rounded-2xl p-3 border-l-[3px]', ACCENT_BORDER[tile.accent])}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider dg-m-faint">{tile.label}</p>
                <p className={cn('text-lg font-bold tabular-nums mt-1', ACCENT_VALUE[tile.accent])}>
                  {fmt(tile.value)}
                </p>
                {tile.id === 'outstanding' && tile.value < 0 ? (
                  <p className="text-[10px] dg-m-success font-medium">{t('common.credit')}</p>
                ) : null}
              </div>
            ))}
      </div>

      <div className="dg-m-glass-card rounded-2xl p-3.5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold dg-m-ink flex items-center gap-1.5">
            <IndianRupee size={15} className="dg-m-error" />
            {outstandingLabel} {vendorsLabel}
          </h3>
          <button
            type="button"
            onClick={() => setActiveTab('finance')}
            className="text-[11px] font-bold dg-m-bright flex items-center gap-0.5"
          >
            {t('common.viewAll')} <ArrowRight size={12} />
          </button>
        </div>
        {vendors.length === 0 ? (
          <div className="text-center py-6">
            <Wallet size={28} className="mx-auto dg-m-faint mb-2" />
            <p className="text-sm font-bold dg-m-ink">{t('dashboard.noOutstanding')}</p>
            <p className="text-[11px] dg-m-muted mt-1">All accounts are currently settled.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {vendors.map((v, i) => (
              <div
                key={v.vendorId}
                className="flex items-center justify-between rounded-xl px-2.5 py-2 bg-[var(--dg-input)]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold dg-m-faint w-5 shrink-0">#{i + 1}</span>
                  <span className="text-[13px] font-medium truncate dg-m-ink">{v.vendorName}</span>
                </div>
                <span className="text-[13px] font-bold dg-m-error tabular-nums shrink-0">{fmt(v.balance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dg-m-glass-card rounded-2xl p-3.5">
        <h3 className="text-[13px] font-bold dg-m-ink flex items-center gap-1.5 mb-3">
          <TrendingUp size={15} className="dg-m-bright" /> {t('dashboard.recentActivity')}
        </h3>
        {activity.length === 0 ? (
          <p className="text-sm dg-m-muted text-center py-6">{t('dashboard.noActivity')}</p>
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 8).map(a => {
              const Icon = activityIcon(a.type);
              const outflow = a.type === 'expense';
              return (
                <div key={a.id + a.type} className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[var(--dg-input)]',
                      outflow ? 'dg-m-error' : 'dg-m-success',
                    )}
                  >
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold dg-m-ink truncate">{a.label}</p>
                    <p className="text-[11px] dg-m-muted">
                      {activityLabel(a.type)} · {relativeTime(a.date)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[13px] font-bold tabular-nums shrink-0',
                      outflow ? 'dg-m-error' : 'dg-m-success',
                    )}
                  >
                    {outflow ? '-' : '+'}
                    {fmt(a.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {payroll && (
        <div className="dg-m-glass-card rounded-2xl p-3.5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold dg-m-ink flex items-center gap-1.5">
              <Wallet size={15} className="dg-m-bright" /> {t('dashboard.staffPayroll')} — {year}
            </h3>
            <button
              type="button"
              onClick={() => onNavigateEntity({ tab: 'masters', master: 'staff' })}
              className="text-[11px] font-bold dg-m-bright flex items-center gap-0.5"
            >
              {t('dashboard.manageStaff')} <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: t('dashboard.totalPaid'), value: fmt(payroll.grandTotal) },
              { label: t('dashboard.staff'), value: String(payroll.byStaff.length) },
              { label: t('dashboard.advances'), value: fmt(payroll.advanceOutstanding) },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-2.5 bg-[var(--dg-input)]">
                <p className="text-[10px] dg-m-muted mb-0.5">{s.label}</p>
                <p className="text-sm font-bold dg-m-ink tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
          {(payroll.byStaff?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold dg-m-faint uppercase tracking-wider">
                {t('dashboard.topStaffByPayment')}
              </p>
              {payroll.byStaff.slice(0, 5).map(s => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-xl px-2.5 py-2 bg-[var(--dg-input)]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--dg-primary-bright)_18%,transparent)] flex items-center justify-center text-[10px] font-bold dg-m-bright shrink-0">
                      {s.name
                        .split(/\s+/)
                        .map(p => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate dg-m-ink">{s.name}</p>
                      <p className="text-[10px] dg-m-muted">
                        {s.payments} {t('dashboard.payments')}
                      </p>
                    </div>
                  </div>
                  <span className="text-[13px] font-bold dg-m-ink tabular-nums shrink-0">{fmt(s.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {counts && (
        <div>
          <h3 className="text-[13px] font-bold dg-m-ink mb-2">{t('dashboard.masterSummary')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  label: t('masters.customers'),
                  count: counts.customerMaster,
                  icon: Users,
                  nav: { tab: 'masters' as Tab, master: 'customer' as const },
                },
                {
                  label: t('masters.vendors'),
                  count: counts.vendorMaster,
                  icon: UserRound,
                  nav: { tab: 'masters' as Tab, master: 'vendor' as const },
                },
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
                className="dg-m-glass-card rounded-2xl p-3 text-left active:scale-[0.98] transition-transform"
              >
                <Icon size={18} className="dg-m-faint mb-2" />
                <p className="text-lg font-bold dg-m-ink tabular-nums">{count}</p>
                <p className="text-[10px] dg-m-muted mt-0.5">{label}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
