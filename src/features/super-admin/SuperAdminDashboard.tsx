import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Building2,
  Users,
  Package,
  ShoppingCart,
  IndianRupee,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Pause,
} from 'lucide-react';
import { LoadingSpinner } from '../../components/ui';

interface DashboardData {
  totals: {
    tenants: number;
    active: number;
    trial: number;
    suspended: number;
    users: number;
    products: number;
    vendors: number;
    sales: number;
    revenue: number;
  };
  recentTenants: {
    id: string;
    companyName: string;
    adminEmail: string;
    plan: string;
    status: string;
    createdAt: string;
  }[];
  tenantsByPlan: {
    plan: string;
    count: number;
  }[];
}

export function SuperAdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    fetch('/api/super-admin/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  const totals = data?.totals ?? {
    tenants: 0, active: 0, trial: 0, suspended: 0,
    users: 0, products: 0, vendors: 0, sales: 0, revenue: 0,
  };

  const kpiCards = [
    { label: 'Total Tenants', value: totals.tenants, icon: Building2, color: 'text-[#F27D26]', bg: 'bg-orange-50' },
    { label: 'Active', value: totals.active, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Trial', value: totals.trial, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Suspended', value: totals.suspended, icon: Pause, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Total Users', value: totals.users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Products', value: totals.products, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Total Sales', value: totals.sales, icon: ShoppingCart, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Revenue', value: `₹${totals.revenue.toLocaleString()}`, icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Platform overview across all tenants</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                <card.icon size={20} className={card.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tenants */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-[#F27D26]" />
            <h2 className="text-lg font-bold text-gray-900">Recent Tenants</h2>
          </div>
          <div className="space-y-3">
            {(data?.recentTenants ?? []).length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No tenants yet</p>
            )}
            {(data?.recentTenants ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.companyName}</p>
                  <p className="text-xs text-gray-400">{t.adminEmail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{t.plan}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    t.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                    t.status === 'trial' ? 'bg-amber-50 text-amber-700' :
                    'bg-rose-50 text-rose-700'
                  }`}>
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tenants by Plan */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-[#F27D26]" />
            <h2 className="text-lg font-bold text-gray-900">Tenants by Plan</h2>
          </div>
          <div className="space-y-3">
            {(data?.tenantsByPlan ?? []).length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No plan data</p>
            )}
            {(data?.tenantsByPlan ?? []).map((p) => {
              const total = totals.tenants || 1;
              const pct = Math.round((p.count / total) * 100);
              return (
                <div key={p.plan} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 capitalize">{p.plan}</span>
                    <span className="text-sm text-gray-500">{p.count} tenants ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-[#F27D26] h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
