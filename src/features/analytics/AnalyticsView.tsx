import React, { useState, useEffect, Fragment } from 'react';
import { motion } from 'motion/react';
import {
  CreditCard,
  TrendingUp,
  ShoppingCart,
  IndianRupee,
  Users,
  Package,
  Landmark,
  UserRound,
  ArrowRight,
  FileText,
  Wallet,
} from 'lucide-react';
import { cn, formatDate, getTabLabel } from '../../lib/utils';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { isServicePhoneUx } from '../../platforms/service-cloud/mode';
import { isDesktopGlassUi } from '../../lib/desktopGlass';
import { isMobileAppShell } from '../../lib/mobileAppShell';
import { api } from '../../api';
import { useTranslation } from '../../i18n';
import type { Tab } from '../../types';
import type { GlobalSearchNavigate } from '../../lib/globalSearch';
import {
  MobilePillTabs,
  MobileKpiCard,
  MobileSectionTitle,
  MobileListRow,
  dateControlClass,
} from '../../components/ui';
import { DesktopAnalyticsDashboard } from './DesktopAnalyticsDashboard';
import { MobileAnalyticsDashboard } from './MobileAnalyticsDashboard';

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString();

const RANGE_IDS = ['today', 'week', 'month', 'overall', 'custom'] as const;
type RangeId = (typeof RANGE_IDS)[number];

const ACTIVITY_META: Record<string, { icon: typeof IndianRupee; color: string; labelKey: string }> = {
  sale: { icon: ShoppingCart, color: 'text-blue-600', labelKey: 'dashboard.sale' },
  invoice: { icon: FileText, color: 'text-violet-600', labelKey: 'dashboard.invoice' },
  payment: { icon: IndianRupee, color: 'text-emerald-600', labelKey: 'dashboard.payment' },
  distribution: { icon: Package, color: 'text-orange-600', labelKey: 'dashboard.dispatch' },
  expense: { icon: CreditCard, color: 'text-rose-600', labelKey: 'dashboard.expense' },
};

function relativeTime(dateStr: string, t: (key: string) => string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

export function AnalyticsView({
  setActiveTab,
  onNavigateEntity,
}: {
  setActiveTab: (tab: Tab) => void;
  /** Desktop glass deep-links (Manage Staff / count tiles). Cap path unused. */
  onNavigateEntity?: (nav: GlobalSearchNavigate) => void;
}) {
  const { t } = useTranslation();
  const cfg = useBusinessConfig();
  /** Offline Mobile + online Cap service — same phone analytics chrome */
  const servicePhoneUx = isServicePhoneUx(cfg.type);
  const desktopGlass = isDesktopGlassUi(cfg.type);
  /** Cap non-service immersive analytics — leave service phone layout alone */
  const capMobileGlass = isMobileAppShell() && !servicePhoneUx;
  const rangePresets = [
    { id: 'today' as const, label: t('common.today') },
    { id: 'week' as const, label: t('common.thisWeek') },
    { id: 'month' as const, label: t('common.thisMonth') },
    { id: 'overall' as const, label: t('common.overall') },
    { id: 'custom' as const, label: t('common.custom') },
  ];
  const outstandingLabel = t('dashboard.outstanding');
  const [range, setRange] = useState<RangeId>('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [money, setMoney] = useState<{
    collections: number;
    revenue: number;
    distribution: number;
    expenses: number;
    outstanding: number;
    invoiceOutstanding: number;
  } | null>(null);
  const [vendors, setVendors] = useState<{ vendorId: string; vendorName: string; balance: number }[]>([]);
  const [activity, setActivity] = useState<{ type: string; id: string; label: string; amount: number; date: string }[]>(
    [],
  );
  const [counts, setCounts] = useState<{
    customerMaster: number;
    vendorMaster: number;
    itemMaster: number;
    bankMaster: number;
    staffCount?: number;
  } | null>(null);
  const [payroll, setPayroll] = useState<{
    grandTotal: number;
    advanceOutstanding: number;
    byStaff: { name: string; total: number; payments: number }[];
    byMonth: { month: string; total: number }[];
  } | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    let from: string | undefined, to: string | undefined;
    if (range === 'today') {
      from = today;
      to = today;
    } else if (range === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0, 10);
      to = today;
    } else if (range === 'month') {
      from = today.slice(0, 7) + '-01';
      to = today;
    } else if (range === 'custom') {
      from = fromDate || undefined;
      to = toDate || undefined;
    }
    api.dashboard
      .overview(from, to)
      .then(data => {
        // Offline stubs / partial payloads must not leave arrays undefined (crashes .length).
        setMoney(data?.money ?? null);
        setActivity(Array.isArray(data?.recentActivity) ? data.recentActivity : []);
        setVendors(Array.isArray(data?.topVendors) ? data.topVendors : []);
        setCounts(data?.counts ?? null);
      })
      .catch(() => {});
    const year = new Date().getFullYear();
    api.payroll
      .summary(year)
      .then(data => {
        // Wrong stub shape ({ totalPaid }) used to crash on payroll.byStaff.length → blank screen.
        if (!data || typeof data !== 'object') {
          setPayroll(null);
          return;
        }
        setPayroll({
          grandTotal: Number((data as { grandTotal?: number }).grandTotal) || 0,
          advanceOutstanding: Number((data as { advanceOutstanding?: number }).advanceOutstanding) || 0,
          byStaff: Array.isArray((data as { byStaff?: unknown }).byStaff)
            ? (data as { byStaff: { name: string; total: number; payments: number }[] }).byStaff
            : [],
          byMonth: Array.isArray((data as { byMonth?: unknown }).byMonth)
            ? (data as { byMonth: { month: string; total: number }[] }).byMonth
            : [],
        });
      })
      .catch(() => {});
  }, [range, fromDate, toDate]);

  const moneyTiles = money
    ? (
        [
          {
            id: 'collections',
            label: cfg.analytics.collectionsLabel,
            value: money.collections,
            accent: 'green' as const,
            show: true,
          },
          {
            id: 'revenue',
            label: cfg.analytics.revenueLabel,
            value: money.revenue,
            accent: 'blue' as const,
            show: true,
          },
          {
            id: 'dispatched',
            label: t('dashboard.dispatched'),
            value: money.distribution,
            accent: 'amber' as const,
            show: cfg.analytics.showDispatched,
          },
          {
            id: 'expenses',
            label: t('dashboard.expenses'),
            value: money.expenses,
            accent: 'rose' as const,
            show: true,
          },
          {
            id: 'outstanding',
            label: cfg.analytics.outstandingLabel || outstandingLabel,
            value: money[cfg.analytics.outstandingKey],
            accent: (money[cfg.analytics.outstandingKey] > 0 ? 'rose' : 'green') as 'rose' | 'green',
            show: true,
          },
          {
            id: 'netIn',
            label: t('dashboard.netIn'),
            // Offline Service: collections = invoice_payments and revenue = invoice totals —
            // summing both double-counts the same money. Use cash in − expenses instead.
            value: servicePhoneUx
              ? money.collections - money.expenses
              : money.collections + money.revenue - money.expenses,
            accent: ((servicePhoneUx
              ? money.collections - money.expenses
              : money.collections + money.revenue - money.expenses) >= 0
              ? 'green'
              : 'rose') as 'green' | 'rose',
            show: true,
          },
        ] as {
          id: string;
          label: string;
          value: number;
          accent: 'brand' | 'blue' | 'green' | 'rose' | 'amber';
          show: boolean;
        }[]
      ).filter(tile => tile.show)
    : [];

  const customSlot =
    range === 'custom' ? (
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-2">
        <div className="min-w-0">
          <label
            className={cn(
              'text-[10px] font-bold uppercase tracking-wide block mb-1',
              desktopGlass || capMobileGlass ? 'dg-muted dg-m-muted' : 'text-gray-400',
            )}
          >
            {t('common.from')}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className={dateControlClass}
          />
        </div>
        <div className="min-w-0">
          <label
            className={cn(
              'text-[10px] font-bold uppercase tracking-wide block mb-1',
              desktopGlass || capMobileGlass ? 'dg-muted dg-m-muted' : 'text-gray-400',
            )}
          >
            {t('common.to')}
          </label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={dateControlClass} />
        </div>
      </div>
    ) : null;

  const navigateEntity = (nav: GlobalSearchNavigate) => {
    if (onNavigateEntity) onNavigateEntity(nav);
    else setActiveTab(nav.tab);
  };

  if (desktopGlass) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <DesktopAnalyticsDashboard
          range={range}
          rangePresets={rangePresets}
          onRange={id => setRange(id as RangeId)}
          customSlot={customSlot}
          moneyTiles={moneyTiles.map(tile => ({
            ...tile,
            hint:
              tile.id === 'outstanding' && tile.value < 0
                ? t('common.credit')
                : tile.id === 'collections'
                  ? 'Verified Credits'
                  : tile.id === 'revenue'
                    ? 'Direct Billing'
                    : tile.id === 'dispatched'
                      ? 'In-transit Value'
                      : tile.id === 'expenses'
                        ? 'Operating Costs'
                        : tile.id === 'outstanding'
                          ? 'To be collected'
                          : tile.id === 'netIn'
                            ? 'Current Position'
                            : undefined,
          }))}
          moneyLoading={!money}
          activity={activity}
          relativeTime={d => relativeTime(d, t)}
          activityLabel={type => t(ACTIVITY_META[type]?.labelKey ?? 'dashboard.sale')}
          payroll={payroll}
          counts={counts}
          setActiveTab={setActiveTab}
          onNavigateEntity={navigateEntity}
          revenueHighlight={money?.collections ?? money?.revenue ?? 0}
        />
      </motion.div>
    );
  }

  if (capMobileGlass) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <MobileAnalyticsDashboard
          range={range}
          rangePresets={rangePresets}
          onRange={id => setRange(id as RangeId)}
          customSlot={customSlot}
          moneyTiles={moneyTiles}
          moneyLoading={!money}
          vendors={vendors}
          outstandingLabel={cfg.analytics.outstandingLabel || outstandingLabel}
          vendorsLabel={cfg.labels.vendors}
          activity={activity}
          relativeTime={d => relativeTime(d, t)}
          activityLabel={type => t(ACTIVITY_META[type]?.labelKey ?? 'dashboard.sale')}
          payroll={payroll}
          counts={counts}
          setActiveTab={setActiveTab}
          onNavigateEntity={navigateEntity}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
      <div className="hidden sm:block">
        <h2 className="text-xl font-bold">{getTabLabel('analytics', t('nav.analytics'))}</h2>
        <p className="text-sm text-gray-500">{t('dashboard.subtitle')}</p>
      </div>

      {/* Money Overview */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3 mb-3 sm:mb-5">
          <h3 className="font-bold text-[13px] sm:text-base flex items-center gap-1.5 sm:gap-2">
            <CreditCard size={16} className="text-emerald-500 sm:hidden" />
            <CreditCard size={18} className="text-emerald-500 hidden sm:block" /> {t('dashboard.moneyOverview')}
          </h3>
          {/* Desktop pills */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            {rangePresets.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  'dg-pill-tab inline-flex items-center justify-center box-border h-7 min-h-7 max-h-7 px-3 py-0 leading-none rounded-full text-xs font-bold transition-colors',
                  range === r.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {/* Phone pills */}
        <div className="sm:hidden mb-3">
          <MobilePillTabs
            items={rangePresets.map(r => ({ id: r.id, label: r.label }))}
            value={range}
            onChange={id => setRange(id as RangeId)}
          />
        </div>
        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mb-3 sm:mb-4 sm:flex sm:items-end sm:gap-2">
            <div className="min-w-0">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">
                {t('common.from')}
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className={dateControlClass}
              />
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">
                {t('common.to')}
              </label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className={dateControlClass}
              />
            </div>
          </div>
        )}
        {money ? (
          <>
            {/* Phone KPI cards */}
            <div className="sm:hidden grid grid-cols-2 gap-2">
              {moneyTiles.map(({ id, label, value, accent }) => (
                <Fragment key={id}>
                  <MobileKpiCard
                    label={label}
                    value={fmt(value)}
                    accent={accent}
                    hint={id === 'outstanding' && value < 0 ? t('common.credit') : undefined}
                  />
                </Fragment>
              ))}
            </div>
            {/* Desktop tiles */}
            <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {moneyTiles.map(({ id, label, value, accent }) => {
                const bgMap: Record<string, string> = {
                  green: 'bg-emerald-50',
                  blue: 'bg-blue-50',
                  amber: 'bg-orange-50',
                  rose: 'bg-rose-50',
                  brand: 'bg-orange-50',
                };
                const colorMap: Record<string, string> = {
                  green: 'text-emerald-600',
                  blue: 'text-blue-600',
                  amber: 'text-orange-600',
                  rose: 'text-rose-600',
                  brand: 'text-brand',
                };
                return (
                  <div key={id} className={cn('rounded-xl p-3', bgMap[accent] || 'bg-gray-50')}>
                    <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
                    <p className={cn('text-base font-bold', colorMap[accent])}>{fmt(value)}</p>
                    {id === 'outstanding' && value < 0 && (
                      <p className="text-[10px] text-emerald-600 font-medium">{t('common.credit')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="h-16 flex items-center justify-center text-gray-400 text-sm">{t('common.loading')}</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Client / vendor outstanding — service: invoice dues; View All → Invoice Finance */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-bold text-[13px] sm:text-base flex items-center gap-1.5 sm:gap-2">
              <IndianRupee size={16} className="text-rose-500" /> {outstandingLabel} {cfg.labels.vendors}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('finance')}
              className="text-[11px] sm:text-xs text-brand font-bold flex items-center gap-1 hover:underline"
            >
              {t('common.viewAll')} <ArrowRight size={12} />
            </button>
          </div>
          {vendors.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('dashboard.noOutstanding')}</p>
          ) : (
            <div className="space-y-1.5 sm:space-y-2">
              {vendors.map((v, i) => (
                <div
                  key={v.vendorId}
                  className="flex items-center justify-between bg-gray-50 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2 sm:py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] sm:text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                    <span className="text-[13px] sm:text-sm font-medium truncate">{v.vendorName}</span>
                  </div>
                  <span className="text-[13px] sm:text-sm font-bold text-rose-600 tabular-nums shrink-0">
                    {fmt(v.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5">
          <h3 className="font-bold text-[13px] sm:text-base flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            <TrendingUp size={16} className="text-brand" /> {t('dashboard.recentActivity')}
          </h3>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('dashboard.noActivity')}</p>
          ) : (
            <>
              <div className="sm:hidden space-y-1.5">
                {activity.map(a => {
                  const meta = ACTIVITY_META[a.type] ?? ACTIVITY_META.sale;
                  const Icon = meta.icon;
                  return (
                    <Fragment key={a.id + a.type}>
                      <MobileListRow
                        icon={<Icon className={meta.color} />}
                        title={a.label}
                        subtitle={`${t(meta.labelKey)} · ${relativeTime(a.date, t)}`}
                        trailing={
                          <span className={a.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}>
                            {a.type === 'expense' ? '-' : '+'}
                            {fmt(a.amount)}
                          </span>
                        }
                      />
                    </Fragment>
                  );
                })}
              </div>
              <div className="hidden sm:block space-y-2">
                {activity.map(a => {
                  const meta = ACTIVITY_META[a.type] ?? ACTIVITY_META.sale;
                  const Icon = meta.icon;
                  return (
                    <div
                      key={a.id + a.type}
                      className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
                    >
                      <div className={cn('p-1.5 rounded-lg bg-gray-50', meta.color)}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.label}</p>
                        <p className="text-xs text-gray-400">
                          {t(meta.labelKey)} · {relativeTime(a.date, t)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-sm font-bold shrink-0',
                          a.type === 'expense' ? 'text-rose-600' : 'text-emerald-600',
                        )}
                      >
                        {a.type === 'expense' ? '-' : '+'}
                        {fmt(a.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {payroll && (
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-bold text-[13px] sm:text-base flex items-center gap-1.5 sm:gap-2">
              <Wallet size={16} className="text-indigo-500" /> {t('dashboard.staffPayroll')} —{' '}
              {new Date().getFullYear()}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('masters')}
              className="text-[11px] sm:text-xs text-brand font-bold flex items-center gap-1 hover:underline"
            >
              {t('dashboard.manageStaff')} <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3 sm:mb-4">
            <div className="bg-indigo-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">{t('dashboard.totalPaid')}</p>
              <p className="text-sm sm:text-lg font-bold text-indigo-600 tabular-nums">{fmt(payroll.grandTotal)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">{t('dashboard.staff')}</p>
              <p className="text-sm sm:text-lg font-bold tabular-nums">{payroll.byStaff?.length ?? 0}</p>
            </div>
            <div className="bg-amber-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">{t('dashboard.advances')}</p>
              <p className="text-sm sm:text-lg font-bold text-amber-600 tabular-nums">
                {fmt(payroll.advanceOutstanding ?? 0)}
              </p>
            </div>
          </div>
          {(payroll.byStaff?.length ?? 0) > 0 && (
            <div className="space-y-1.5 sm:space-y-2">
              <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase">
                {t('dashboard.topStaffByPayment')}
              </p>
              {payroll.byStaff.slice(0, 5).map(s => (
                <div
                  key={s.name}
                  className="flex items-center justify-between bg-gray-50 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] sm:text-sm font-medium truncate">{s.name}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400">
                      {s.payments} {t('dashboard.payments')}
                    </p>
                  </div>
                  <span className="text-[13px] sm:text-sm font-bold text-indigo-600 tabular-nums shrink-0">
                    {fmt(s.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!servicePhoneUx && counts && (
        <div>
          <MobileSectionTitle title={t('dashboard.masterSummary')} className="mb-2 sm:mb-3 sm:[&_h3]:text-base" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              {
                label: t('masters.customers'),
                count: counts.customerMaster,
                icon: Users,
                color: 'text-blue-600',
                bg: 'bg-blue-50',
                tab: 'sales' as Tab,
              },
              {
                label: t('masters.vendors'),
                count: counts.vendorMaster,
                icon: UserRound,
                color: 'text-purple-600',
                bg: 'bg-purple-50',
                tab: 'finance' as Tab,
              },
              {
                label: t('dashboard.products'),
                count: counts.itemMaster,
                icon: Package,
                color: 'text-orange-600',
                bg: 'bg-orange-50',
                tab: 'inventory' as Tab,
              },
              {
                label: t('masters.banks'),
                count: counts.bankMaster,
                icon: Landmark,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                tab: 'accounts' as Tab,
              },
            ].map(({ label, count, icon: Icon, color, bg, tab }) => (
              <button
                key={label}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 text-left hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className={cn('p-1.5 sm:p-2 rounded-lg sm:rounded-xl', bg)}>
                    <Icon className={color} size={16} />
                  </div>
                  <ArrowRight size={12} className="text-gray-300 group-hover:text-brand transition-colors" />
                </div>
                <p className="text-lg sm:text-2xl font-bold tabular-nums">{count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{label}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
