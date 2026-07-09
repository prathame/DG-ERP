import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp, DollarSign, Activity, Calendar } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui';
import { session } from '../../lib/session';

interface MonthlyTenant {
  month: string;
  count: string | number;
}

interface RevenueByTenant {
  company_name: string;
  revenue: string | number;
  sales: string | number;
}

interface ActiveToday {
  company_name: string;
  sales_today: string | number;
}

interface AnalyticsData {
  monthlyTenants: MonthlyTenant[];
  revenueByTenant: RevenueByTenant[];
  mostActiveToday: ActiveToday[];
}

export function SuperAdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = session.getToken();
    fetch('/api/super-admin/analytics', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch((err) => console.error('Failed to load analytics', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  const monthlyList = data?.monthlyTenants ?? [];
  const revenueList = data?.revenueByTenant ?? [];
  const activeTodayList = data?.mostActiveToday ?? [];

  // Find max values for progress bar scaling
  const maxMonthly = Math.max(...monthlyList.map((m) => Number(m.count)), 1);
  const maxRevenue = Math.max(...revenueList.map((r) => Number(r.revenue)), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics & Insights</h1>
        <p className="text-gray-500 text-sm mt-1">Advanced business intelligence and activity trends</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Tenants by Revenue */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
            <DollarSign size={20} className="text-emerald-500" />
            <h2 className="text-lg font-bold text-gray-900">Top Revenue Leaders</h2>
          </div>
          
          <div className="space-y-4">
            {revenueList.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No sales revenue data available</p>
            ) : (
              revenueList.map((tenant, idx) => {
                const revenue = Number(tenant.revenue);
                const sales = Number(tenant.sales);
                const pct = Math.round((revenue / maxRevenue) * 100);
                return (
                  <div key={tenant.company_name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-400 w-4">#{idx + 1}</span>
                        <span className="font-medium text-gray-800">{tenant.company_name}</span>
                      </div>
                      <span className="font-semibold text-emerald-600">
                        ₹{revenue.toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">({sales} sales)</span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tenant Registrations (Growth) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
            <TrendingUp size={20} className="text-brand" />
            <h2 className="text-lg font-bold text-gray-900">Tenant Registrations</h2>
          </div>
          
          <div className="space-y-4">
            {monthlyList.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No registration data available</p>
            ) : (
              monthlyList.map((monthData) => {
                const count = Number(monthData.count);
                const pct = Math.round((count / maxMonthly) * 100);
                return (
                  <div key={monthData.month} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span className="font-medium text-gray-800">{monthData.month}</span>
                      </div>
                      <span className="font-semibold text-brand">
                        {count} {count === 1 ? 'tenant' : 'tenants'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-brand h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Most Active Tenants Today */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
          <Activity size={20} className="text-blue-500 animate-pulse" />
          <h2 className="text-lg font-bold text-gray-900">Most Active Tenants Today</h2>
        </div>
        
        {activeTodayList.length === 0 ? (
          <div className="py-8 text-center">
            <BarChart3 size={36} className="mx-auto mb-2 text-gray-300 opacity-50" />
            <p className="text-sm text-gray-400">No active transactions processed today yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTodayList.map((tenant, idx) => (
              <div 
                key={tenant.company_name}
                className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase">Rank #{idx + 1}</span>
                  <p className="font-bold text-gray-800 text-sm mt-0.5">{tenant.company_name}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400">Sales Today</span>
                  <p className="text-lg font-extrabold text-blue-600">{tenant.sales_today}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
