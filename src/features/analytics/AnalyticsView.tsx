import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CreditCard, TrendingUp, ShoppingCart, IndianRupee, Users, Package, Landmark, UserRound, ArrowRight, FileText } from 'lucide-react';
import { cn, formatDate , useTabLabel } from '../../lib/utils';
import { api } from '../../api';
import type { Tab } from '../../types';

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString();

const RANGE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'overall', label: 'Overall' },
  { id: 'custom', label: 'Custom' },
] as const;
type RangeId = typeof RANGE_PRESETS[number]['id'];

const ACTIVITY_ICONS: Record<string, { icon: typeof IndianRupee; color: string; label: string }> = {
  sale:         { icon: ShoppingCart, color: 'text-blue-600',    label: 'Sale' },
  invoice:      { icon: FileText,     color: 'text-violet-600',  label: 'Invoice' },
  payment:      { icon: IndianRupee,  color: 'text-emerald-600', label: 'Payment' },
  distribution: { icon: Package,      color: 'text-orange-600',  label: 'Dispatch' },
  expense:      { icon: CreditCard,   color: 'text-rose-600',    label: 'Expense' },
};

function relativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

export function AnalyticsView({ setActiveTab, businessType = 'manufacturer' }: { setActiveTab: (tab: Tab) => void; businessType?: string }) {
  const isService = businessType === 'service';
  const [range, setRange] = useState<RangeId>('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [money, setMoney] = useState<{ collections: number; revenue: number; distribution: number; expenses: number; outstanding: number; invoiceOutstanding: number } | null>(null);
  const [vendors, setVendors] = useState<{ vendorId: string; vendorName: string; balance: number }[]>([]);
  const [activity, setActivity] = useState<{ type: string; id: string; label: string; amount: number; date: string }[]>([]);
  const [counts, setCounts] = useState<{ customerMaster: number; vendorMaster: number; itemMaster: number; bankMaster: number; staffCount?: number } | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    let from: string | undefined, to: string | undefined;
    if (range === 'today') { from = today; to = today; }
    else if (range === 'week') { const d = new Date(); d.setDate(d.getDate() - 6); from = d.toISOString().slice(0, 10); to = today; }
    else if (range === 'month') { from = today.slice(0, 7) + '-01'; to = today; }
    else if (range === 'custom') { from = fromDate || undefined; to = toDate || undefined; }
    // Single call replaces 4 separate requests
    api.dashboard.overview(from, to).then(data => {
      setMoney(data.money);
      setActivity(data.recentActivity);
      setVendors(data.topVendors);
      setCounts(data.counts);
    }).catch(() => {});
  }, [range, fromDate, toDate]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{useTabLabel('analytics', 'Analytics')}</h2>
        <p className="text-sm text-gray-500">Business overview and activity</p>
      </div>

      {/* Money Overview */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <h3 className="font-bold flex items-center gap-2"><CreditCard size={18} className="text-emerald-500" /> Money Overview</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {RANGE_PRESETS.map(r => (
              <button key={r.id} type="button" onClick={() => setRange(r.id)}
                className={cn("px-3 py-1 rounded-full text-xs font-bold transition-colors", range === r.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>
        )}
        {money ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {([
              { label: isService ? 'Received' : 'Collected', value: money.collections, color: 'text-emerald-600', bg: 'bg-emerald-50', show: true },
              { label: isService ? 'Invoice Revenue' : 'Sales', value: money.revenue, color: 'text-blue-600', bg: 'bg-blue-50', show: true },
              { label: 'Dispatched', value: money.distribution, color: 'text-orange-600', bg: 'bg-orange-50', show: !isService },
              { label: 'Expenses', value: money.expenses, color: 'text-rose-600', bg: 'bg-rose-50', show: true },
              {
                label: isService ? 'Unpaid Invoices' : 'Outstanding',
                value: isService ? money.invoiceOutstanding : money.outstanding,
                color: (isService ? money.invoiceOutstanding : money.outstanding) > 0 ? 'text-rose-600' : 'text-emerald-600',
                bg: (isService ? money.invoiceOutstanding : money.outstanding) > 0 ? 'bg-rose-50' : 'bg-emerald-50',
                show: true,
              },
              { label: 'Net In', value: money.collections + money.revenue - money.expenses, color: (money.collections + money.revenue - money.expenses) >= 0 ? 'text-emerald-700' : 'text-rose-600', bg: (money.collections + money.revenue - money.expenses) >= 0 ? 'bg-emerald-50' : 'bg-rose-50', show: true },
            ] as { label: string; value: number; color: string; bg: string; show: boolean }[]).filter(t => t.show).map(({ label, value, color, bg }) => (
              <div key={label} className={cn("rounded-xl p-3", bg)}>
                <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
                <p className={cn("text-base font-bold", color)}>{fmt(value)}</p>
                {label === 'Outstanding' && value < 0 && <p className="text-[10px] text-emerald-600 font-medium">credit</p>}
              </div>
            ))}
          </div>
        ) : <div className="h-16 flex items-center justify-center text-gray-400 text-sm">Loading...</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vendor Outstanding Leaderboard */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2"><IndianRupee size={18} className="text-rose-500" /> Outstanding Vendors</h3>
            <button type="button" onClick={() => setActiveTab('finance')} className="text-xs text-brand font-bold flex items-center gap-1 hover:underline">View All <ArrowRight size={12} /></button>
          </div>
          {vendors.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No outstanding balances</p>
          ) : (
            <div className="space-y-2">
              {vendors.map((v, i) => (
                <div key={v.vendorId} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                    <span className="text-sm font-medium truncate max-w-[140px]">{v.vendorName}</span>
                  </div>
                  <span className="text-sm font-bold text-rose-600">{fmt(v.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold flex items-center gap-2 mb-4"><TrendingUp size={18} className="text-brand" /> Recent Activity</h3>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {activity.map((a) => {
                const meta = ACTIVITY_ICONS[a.type] ?? ACTIVITY_ICONS.sale;
                const Icon = meta.icon;
                return (
                  <div key={a.id + a.type} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className={cn("p-1.5 rounded-lg bg-gray-50", meta.color)}><Icon size={14} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.label}</p>
                      <p className="text-xs text-gray-400">{meta.label} · {relativeTime(a.date)}</p>
                    </div>
                    <span className={cn("text-sm font-bold shrink-0", a.type === 'expense' ? 'text-rose-600' : 'text-emerald-600')}>
                      {a.type === 'expense' ? '-' : '+'}{fmt(a.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {counts && (
        <div>
          <h3 className="font-bold mb-3">Master Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Customers', count: counts.customerMaster, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', tab: 'sales' as Tab },
              { label: 'Vendors', count: counts.vendorMaster, icon: UserRound, color: 'text-purple-600', bg: 'bg-purple-50', tab: 'finance' as Tab },
              { label: 'Products', count: counts.itemMaster, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50', tab: 'inventory' as Tab },
              { label: 'Banks', count: counts.bankMaster, icon: Landmark, color: 'text-emerald-600', bg: 'bg-emerald-50', tab: 'accounts' as Tab },
            ].map(({ label, count, icon: Icon, color, bg, tab }) => (
              <button key={label} type="button" onClick={() => setActiveTab(tab)}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("p-2 rounded-xl", bg)}><Icon className={color} size={18} /></div>
                  <ArrowRight size={14} className="text-gray-300 group-hover:text-brand transition-colors" />
                </div>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
