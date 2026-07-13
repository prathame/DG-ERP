import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Package, ShoppingCart, Gift, AlertTriangle, Users, CreditCard, Link2, Plus, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import { LoadingSpinner, DashboardSkeleton } from '../../components/ui';
import type { Tab } from '../../types';
import { CustomerMasterView } from '../masters/CustomerMasterView';
import { VendorMasterView } from '../masters/VendorMasterView';
import { BankMasterView } from '../masters/BankMasterView';
import { VendorCustomerMappingView } from '../masters/VendorCustomerMappingView';
import { RewardRulesView } from '../masters/RewardRulesView';
import { StaffMasterView } from '../masters/StaffMasterView';

type MasterType = 'customer' | 'vendor' | 'item' | 'bank' | 'mapping' | 'rewardRules' | 'staff';

export function DashboardView({ user, setActiveTab, businessType = 'manufacturer' }: { user: { id: string; role?: string; vendorId?: string } | null; setActiveTab: (tab: Tab) => void; businessType?: string }) {
  const isDirectSell = businessType === 'dealer' || businessType === 'retail';
  const [stats, setStats] = useState<{ label: string; value: string; change: string; icon: typeof TrendingUp; color: string; bg: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockProducts, setLowStockProducts] = useState<{ id: string; name: string; stock: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; sold: number }[]>([]);
  const [masterCounts, setMasterCounts] = useState({ customer: 0, vendor: 0, item: 0, bank: 0, staff: 0 });
  const [selectedMaster, setSelectedMaster] = useState<MasterType | null>(null);
  const isVendor = user?.role === 'Vendor' && user?.vendorId;

  const refreshCounts = () => {
    api.masters.counts().then((c) => {
      setMasterCounts({ customer: c.customerMaster, vendor: c.vendorMaster, item: c.itemMaster, bank: c.bankMaster, staff: (c as Record<string, number>).staffCount ?? 0 });
    }).catch(() => {});
  };

  useEffect(() => {
    if (isVendor && user?.vendorId) {
      api.dashboard.vendor(user.vendorId)
        .then((v) => {
          setStats([
            { label: 'Products with Vendor', value: String(v.assignedProducts?.length ?? 0), change: '', icon: Package, color: 'text-cyan-600', bg: 'bg-cyan-50' },
            { label: 'Products Sold', value: String(v.vendor?.totalSales ?? 0), change: '', icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Reward Points', value: String(v.vendor?.totalRewardPoints ?? 0) + ' pts', change: '', icon: Gift, color: 'text-purple-600', bg: 'bg-purple-50' },
          ]);
        })
        .catch(() => { setStats([]); })
        .finally(() => setLoading(false));
      return;
    }
    api.dashboard.stats()
      .then((s) => {
        const lms = Number((s as { lastMonthSales?: number }).lastMonthSales) || 0;
        const tms = Number((s as { thisMonthSales?: number }).thisMonthSales) || 0;
        const monthChange = lms > 0 ? `${Math.round((tms / lms - 1) * 100)}%` : '';
        const sx = s as Record<string, unknown>;
        setStats([
          { label: "Today's Sales", value: String(sx.todaySales ?? 0), change: '', icon: TrendingUp, color: 'text-brand', bg: 'bg-orange-50' },
          { label: 'This Month', value: String(sx.thisMonthSales ?? 0), change: monthChange ? (monthChange.startsWith('-') ? monthChange : `+${monthChange}`) : '', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Inventory', value: (s.totalBeforeDistribution ?? 0).toLocaleString(), change: '', icon: Package, color: 'text-gray-600', bg: 'bg-gray-50' },
          { label: 'With Admin', value: (Number(sx.withAdmin) ?? 0).toLocaleString(), change: '', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'With Vendors', value: (Number(sx.withVendors) ?? 0).toLocaleString(), change: '', icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Total Sold', value: (s.productsSold ?? 0).toLocaleString(), change: '', icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ]);
        setLowStockProducts((s as { lowStockProducts?: { id: string; name: string; stock: number }[] }).lowStockProducts ?? []);
        setTopProducts((s as { topProducts?: { name: string; sold: number }[] }).topProducts ?? []);
      })
      .catch(() => {
        setStats([
          { label: "Today's Sales", value: '0', change: '', icon: TrendingUp, color: 'text-brand', bg: 'bg-orange-50' },
          { label: 'This Month', value: '0', change: '', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Inventory', value: '0', change: '', icon: Package, color: 'text-gray-600', bg: 'bg-gray-50' },
          { label: 'With Admin', value: '0', change: '', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'With Vendors', value: '0', change: '', icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Total Sold', value: '0', change: '', icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ]);
      })
      .finally(() => setLoading(false));
    refreshCounts();
  }, [isVendor, user?.vendorId]);

  if (loading) return <DashboardSkeleton />;

  if (selectedMaster === 'customer') return <CustomerMasterView onBack={() => { setSelectedMaster(null); refreshCounts(); }} onRefresh={refreshCounts} user={user} />;
  if (selectedMaster === 'vendor') return <VendorMasterView onBack={() => { setSelectedMaster(null); refreshCounts(); }} onRefresh={refreshCounts} businessType={businessType} />;
  if (selectedMaster === 'bank') return <BankMasterView onBack={() => { setSelectedMaster(null); refreshCounts(); }} onRefresh={refreshCounts} />;
  if (selectedMaster === 'mapping') return <VendorCustomerMappingView onBack={() => setSelectedMaster(null)} />;
  if (selectedMaster === 'rewardRules') return <RewardRulesView onBack={() => setSelectedMaster(null)} />;
  if (selectedMaster === 'staff') return <StaffMasterView onBack={() => { setSelectedMaster(null); refreshCounts(); }} onRefresh={refreshCounts} />;

  const tabConfig = ((user as Record<string, unknown>)?.tabConfig ?? {}) as Record<string, { label?: string; visible?: boolean }>;
  const tv = (key: string) => tabConfig[key]?.visible !== false;

  const hasCustomerTracking = tv('sales');
  const allMasters = [
    ...(hasCustomerTracking && !isDirectSell ? [{ id: 'customer' as const, name: 'Customers', count: masterCounts.customer, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' }] : []),
    { id: 'vendor' as const, name: isDirectSell ? 'Customers' : 'Vendors', count: masterCounts.vendor, icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50' },
    ...(tv('rewards') ? [{ id: 'rewardRules' as const, name: 'Reward Rules', count: null as number | null, icon: Gift, color: 'text-amber-600', bg: 'bg-amber-50' }] : []),
    ...(hasCustomerTracking ? [{ id: 'mapping' as const, name: 'Vendor-Customer Map', count: null as number | null, icon: Link2, color: 'text-cyan-600', bg: 'bg-cyan-50' }] : []),
    { id: 'item' as const, name: 'Products', count: masterCounts.item, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
    { id: 'bank' as const, name: 'Banks', count: masterCounts.bank, icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'staff' as const, name: 'Staff', count: masterCounts.staff, icon: Wallet, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];
  const masters = isVendor ? allMasters.filter((m) => m.id === 'customer') : allMasters;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className={cn("bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow border-l-[3px]", stat.bg.replace('bg-', 'border-l-').replace('-50', '-400'))}>
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-xl", stat.bg)}>
                <stat.icon className={stat.color} size={24} />
              </div>
              {stat.change && (
                <span className={cn("text-xs font-bold px-2 py-1 rounded-full", stat.change.startsWith('+') ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                  {stat.change}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs sm:text-sm font-medium">{stat.label}</p>
            <h3 className="text-xl sm:text-3xl font-bold mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      {(lowStockProducts.length > 0 || topProducts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {lowStockProducts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="font-bold text-amber-800 flex items-center gap-2 mb-3"><AlertTriangle size={18} /> Low Stock Alerts</h3>
              <div className="space-y-2">
                {lowStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-amber-100">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", p.stock === 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{p.stock} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {topProducts.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold flex items-center gap-2 mb-3"><TrendingUp size={18} className="text-emerald-600" /> Top Selling Products</h3>
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span><span className="text-sm font-medium truncate">{p.name}</span></div>
                    <span className="text-xs font-bold text-emerald-600">{p.sold} sold</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold mb-4">Manage</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {masters.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => m.id === 'item' ? setActiveTab('inventory') : setSelectedMaster(m.id)}
              className={cn("bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left group border-l-[3px]", m.bg.replace('bg-', 'border-l-').replace('-50', '-400'))}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2.5 rounded-xl transition-transform group-hover:scale-110", m.bg)}>
                  <m.icon className={m.color} size={20} />
                </div>
                <Plus size={16} className="text-gray-300 group-hover:text-brand transition-colors" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{m.name}</p>
              {m.count !== null && <p className="text-xs text-gray-400 mt-0.5">{m.count} records</p>}
            </button>
          ))}
        </div>
      </div>

    </motion.div>
  );
}
