import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Package, ShoppingCart, Gift, AlertTriangle, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn, exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import { LoadingSpinner } from '../../components/ui';
import type { Transaction, Tab } from '../../types';

export function DashboardView({ user, setActiveTab }: { user: { id: string; role?: string; vendorId?: string } | null; setActiveTab: (tab: Tab) => void }) {
  const [stats, setStats] = useState<{ label: string; value: string; change: string; icon: typeof TrendingUp; color: string; bg: string }[]>([]);
  const [chartData, setChartData] = useState<{ name: string; sales: number; claims: number }[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockProducts, setLowStockProducts] = useState<{ id: string; name: string; stock: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; sold: number }[]>([]);
  const isVendor = user?.role === 'Vendor' && user?.vendorId;

  useEffect(() => {
    if (isVendor && user?.vendorId) {
      api.dashboard.vendor(user.vendorId)
        .then((v) => {
          setStats([
            { label: 'Products with Vendor', value: String(v.assignedProducts?.length ?? 0), change: '', icon: Package, color: 'text-cyan-600', bg: 'bg-cyan-50' },
            { label: 'Products Sold', value: String(v.vendor?.totalSales ?? 0), change: '', icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Reward Points', value: String(v.vendor?.totalRewardPoints ?? 0) + ' pts', change: '', icon: Gift, color: 'text-purple-600', bg: 'bg-purple-50' },
          ]);
          setChartData(v.salesHistory?.length ? v.salesHistory.slice(0, 6).map((s, i) => ({ name: s.purchaseDate || `Sale ${i + 1}`, sales: s.rewardPointsEarned ?? 0, claims: 0 })) : []);
          setTransactions([]);
        })
        .catch(() => { setStats([]); setChartData([]); })
        .finally(() => setLoading(false));
      return;
    }
    Promise.all([
      api.dashboard.stats(),
      api.dashboard.chart(),
      api.transactions.list({ page: 1 }),
    ])
      .then(([s, c, tResult]) => {
        const t = tResult.data;
        const monthChange = (s as { lastMonthSales?: number }).lastMonthSales ? `${Math.round((((s as { thisMonthSales?: number }).thisMonthSales ?? 0) / ((s as { lastMonthSales?: number }).lastMonthSales ?? 1) - 1) * 100)}%` : '';
        const sx = s as Record<string, unknown>;
        setStats([
          { label: "Today's Sales", value: String(sx.todaySales ?? 0), change: '', icon: TrendingUp, color: 'text-[#F27D26]', bg: 'bg-orange-50' },
          { label: 'This Month', value: String(sx.thisMonthSales ?? 0), change: monthChange ? (monthChange.startsWith('-') ? monthChange : `+${monthChange}`) : '', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Inventory', value: (s.totalBeforeDistribution ?? 0).toLocaleString(), change: '', icon: Package, color: 'text-gray-600', bg: 'bg-gray-50' },
          { label: 'With Admin', value: (Number(sx.withAdmin) ?? 0).toLocaleString(), change: '', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'With Vendors', value: (Number(sx.withVendors) ?? 0).toLocaleString(), change: '', icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Total Sold', value: (s.productsSold ?? 0).toLocaleString(), change: '', icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ]);
        setLowStockProducts((s as { lowStockProducts?: { id: string; name: string; stock: number }[] }).lowStockProducts ?? []);
        setTopProducts((s as { topProducts?: { name: string; sold: number }[] }).topProducts ?? []);
        setChartData(c.length ? c : [{ name: 'No data', sales: 0, claims: 0 }]);
        setTransactions(t.slice(0, 5));
      })
      .catch(() => {
        setStats([
          { label: "Today's Sales", value: '0', change: '', icon: TrendingUp, color: 'text-[#F27D26]', bg: 'bg-orange-50' },
          { label: 'This Month', value: '0', change: '', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Inventory', value: '0', change: '', icon: Package, color: 'text-gray-600', bg: 'bg-gray-50' },
          { label: 'With Admin', value: '0', change: '', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'With Vendors', value: '0', change: '', icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Total Sold', value: '0', change: '', icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ]);
        setChartData([{ name: 'No data', sales: 0, claims: 0 }]);
      })
      .finally(() => setLoading(false));
  }, [isVendor, user?.vendorId]);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
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
            <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
            <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">Sales & Claims Overview</h3>
            <span className="text-xs font-medium text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">Last 6 Months</span>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F27D26" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9CA3AF'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9CA3AF'}} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#F27D26" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="claims" stroke="#1A1A1A" strokeWidth={3} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold">Recent Transactions</h3>
            <button type="button" onClick={() => transactions.length && exportToCsv(transactions.map((t) => ({ id: t.id, date: t.date, type: t.type, amount: t.amount, description: t.description, status: t.status })), 'dashboard-transactions')} disabled={!transactions.length} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#F27D26] hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Download size={16} /> Export CSV
            </button>
          </div>
          <div className="space-y-6">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-2 rounded-lg",
                    t.type === 'Sales' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  )}>
                    {t.type === 'Sales' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{t.description}</p>
                    <p className="text-xs text-gray-500">{t.date}</p>
                  </div>
                </div>
                <p className={cn("text-sm font-bold", t.type === 'Sales' ? 'text-emerald-600' : 'text-rose-600')}>
                  {t.type === 'Sales' ? '+' : '-'}₹{t.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setActiveTab('accounts')} className="w-full mt-8 py-3 text-sm font-bold text-[#F27D26] hover:bg-[#F27D26]/5 rounded-xl transition-colors">
            View All Transactions
          </button>
        </div>
      </div>
    </motion.div>
  );
}
