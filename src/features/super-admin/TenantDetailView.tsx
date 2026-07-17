import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Building2,
  Users,
  Package,
  ShoppingCart,
  IndianRupee,
  ExternalLink,
  Pause,
  Play,
  ChevronDown,
  Mail,
  Phone,
  Calendar,
  Shield,
  Pencil,
  RotateCcw,
  Save,
  KeyRound,
  Copy,
  Check,
  Download,
  Bell,
  BarChart3,
  Clock,
  HardDrive,
  Zap,
} from 'lucide-react';
import { cn, bizTypeLabel } from '../../lib/utils';
import { LoadingSpinner, useToast } from '../../components/ui';
import { session } from '../../lib/session';
import { ServiceCloudSeatsPanel } from './ServiceCloudSeatsPanel';
interface TenantDetail {
  id: string;
  companyName: string;
  adminEmail: string;
  adminName: string;
  phone: string;
  gstNumber: string;
  plan: string;
  planId?: string;
  planName?: string;
  status: string;
  subscriptionEndsAt?: string;
  barcodeSystemEnabled: boolean;
  multiLanguageEnabled: boolean;
  vendorPortalEnabled: boolean;
  inventoryTrackingEnabled: boolean;
  quotationsEnabled: boolean;
  accountsEnabled: boolean;
  purchasesEnabled: boolean;
  chatbotEnabled: boolean;
  tabConfig: Record<string, { label: string; visible: boolean }> | null;
  businessType?: string;
  createdAt: string;
  stats: {
    products: number;
    vendors: number;
    users: number;
    sales: number;
    revenue: number;
  };
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt?: string;
  }[];
}

interface TenantDetailViewProps {
  tenantId: string;
  onBack: () => void;
}

export function TenantDetailView({ tenantId, onBack }: TenantDetailViewProps) {
  const { toast } = useToast();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingPlan, setChangingPlan] = useState(false);
  const [renewalPlan, setRenewalPlan] = useState<string>('');
  const [renewalCycle, setRenewalCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<{ id: string; name: string; priceMonthly: number; priceYearly: number }[]>([]);
  const [resetTokenModal, setResetTokenModal] = useState<{
    email: string;
    userName: string;
    token: string;
    resetLink: string;
    expiresAt: string;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState<{
    loginHistory: Record<string, unknown>[];
    counts: Record<string, number>;
    revenueHistory: { month: string; revenue: number }[];
    estimatedStorageRows: number;
  } | null>(null);
  const [showNotify, setShowNotify] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ title: '', message: '', type: 'info' });
  const [sendingNotify, setSendingNotify] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeUsers, setActiveUsers] = useState<{
    activeCount: number;
    users: { id: string; name: string; email: string; role: string; last_active_at: string }[];
  } | null>(null);
  const [activeUsersLoading, setActiveUsersLoading] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState('');
  const [upgradeEnd, setUpgradeEnd] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  React.useEffect(() => {
    const token = session.getToken();
    fetch('/api/super-admin/plans', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.plans ?? []);
        setPlans(
          list.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            name: p.name as string,
            priceMonthly: Number(p.priceMonthly ?? 0),
            priceYearly: Number(p.priceYearly ?? 0),
          })),
        );
      })
      .catch(() => {});
  }, []);

  const fetchTenant = () => {
    const token = session.getToken();
    fetch(`/api/super-admin/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setTenant({ ...data.tenant, stats: data.stats, users: data.users }))
      .catch(() => toast('Failed to load tenant', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTenant();
  }, [tenantId]);

  const handleResetToken = async (email: string) => {
    setResetLoading(email);
    try {
      const token = session.getToken();
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/reset-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const data = await res.json();
      setResetTokenModal(data);
      setCopied(false);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setResetLoading(null);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const token = session.getToken();
    try {
      await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      toast(`Tenant ${newStatus === 'active' ? 'activated' : 'suspended'}`, 'success');
      fetchTenant();
    } catch {
      toast('Failed to update status', 'error');
    }
  };

  const subscriptionActive = (() => {
    const end = tenant?.subscriptionEndsAt || tenant?.trialEndsAt;
    if (!end) return false;
    return new Date(end).getTime() > Date.now();
  })();

  const handleChangePlan = async (newPlan: string) => {
    const currentPlanId = tenant?.planId || tenant?.plan;
    if (newPlan === currentPlanId) {
      setChangingPlan(false);
      return;
    }

    if (subscriptionActive) {
      toast('Cannot change plan while subscription is active. Wait for expiry or update the end date first.', 'error');
      setChangingPlan(false);
      return;
    }

    const token = session.getToken();
    try {
      await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: newPlan }),
      });
      toast('Plan updated', 'success');
      setChangingPlan(false);
      fetchTenant();
    } catch {
      toast('Failed to change plan', 'error');
    }
  };

  const handleImpersonate = async () => {
    const token = session.getToken();
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Impersonation failed');
      const data = (await res.json()) as {
        token: string;
        slug?: string;
        tenantId: string;
        user: { id: string; email: string; name: string; role: string; companyName?: string };
      };
      if (!data.slug || !data.token) throw new Error('Impersonation failed');
      // Open tenant ERP; App.tsx consumes impersonate_token once and strips it from the URL
      const url = new URL(`/${data.slug}`, window.location.origin);
      url.searchParams.set('impersonate_token', data.token);
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      toast('Impersonation failed', 'error');
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  if (!tenant) return <div className="text-center py-20 text-gray-400">Tenant not found</div>;

  const stats = tenant.stats ?? { products: 0, vendors: 0, users: 0, sales: 0, revenue: 0 };

  const statCards = [
    { label: 'Products', value: stats.products, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Vendors', value: stats.vendors, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Users', value: stats.users, icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Sales', value: stats.sales, icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    {
      label: 'Revenue',
      value: `₹${(stats.revenue ?? 0).toLocaleString()}`,
      icon: IndianRupee,
      color: 'text-brand',
      bg: 'bg-orange-50',
    },
  ];

  const statusBadge =
    tenant.status === 'active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tenant.status === 'trial'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-rose-50 text-rose-700 border-rose-200';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tenant.companyName}</h1>
            <p className="text-gray-500 text-sm">Tenant details and management</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleImpersonate}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            <ExternalLink size={16} />
            Impersonate
          </button>
          {/* Quick plan upgrade inline */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-2 py-1.5 bg-white">
            <Zap size={14} className="text-purple-500 shrink-0" />
            <select
              value={upgradePlan}
              onChange={e => setUpgradePlan(e.target.value)}
              className="text-xs font-medium bg-transparent border-none outline-none text-gray-600 cursor-pointer pr-1"
            >
              <option value="">Change Plan...</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {upgradePlan && (
              <button
                onClick={async () => {
                  setUpgrading(true);
                  const saToken = session.getToken();
                  const r = await fetch(`/api/super-admin/tenants/${tenantId}/upgrade-plan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saToken}` },
                    body: JSON.stringify({ planId: upgradePlan }),
                  });
                  const d = await r.json();
                  if (r.ok) {
                    toast(`Changed to ${d.plan}`, 'success');
                    fetchTenant();
                    setUpgradePlan('');
                  } else toast(d.error, 'error');
                  setUpgrading(false);
                }}
                disabled={upgrading}
                className="text-xs font-bold text-purple-600 hover:text-purple-800 disabled:opacity-50 shrink-0"
              >
                {upgrading ? '...' : 'Apply'}
              </button>
            )}
          </div>
          {tenant.status === 'suspended' ? (
            <button
              onClick={() => handleStatusChange('active')}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
            >
              <Play size={16} />
              Activate
            </button>
          ) : (
            <button
              onClick={() => handleStatusChange('suspended')}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 transition-colors"
            >
              <Pause size={16} />
              Suspend
            </button>
          )}
        </div>
      </div>

      {/* Tenant Info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
            <Building2 size={24} className="text-brand" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{tenant.companyName}</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusBadge}`}>
              {tenant.status}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <Mail size={16} className="text-gray-400" />
            <span className="text-gray-600">{tenant.adminEmail}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone size={16} className="text-gray-400" />
            <span className="text-gray-600">{tenant.phone || 'Not provided'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Shield size={16} className="text-gray-400" />
            <span className="text-gray-600">GST: {tenant.gstNumber || 'Not provided'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-gray-600">
              Created: {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400 text-xs font-bold uppercase">Plan:</span>
            <span className="font-medium text-gray-700">
              {tenant.planName || tenant.plan || tenant.planId || 'No plan'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400 text-xs font-bold uppercase">Type:</span>
            <span className="px-2 py-1 bg-gray-100 rounded-lg text-sm font-medium">
              {bizTypeLabel(tenant.businessType, tenant.companyName)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-gray-600">
              {tenant.subscriptionEndsAt
                ? `Expires: ${new Date(tenant.subscriptionEndsAt).toLocaleDateString()}`
                : tenant.trialEndsAt
                  ? `Trial ends: ${new Date(tenant.trialEndsAt).toLocaleDateString()}`
                  : 'No expiry set'}
            </span>
            {(() => {
              const end = tenant.subscriptionEndsAt || tenant.trialEndsAt;
              if (!end) return null;
              const days = Math.ceil((new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    days <= 0
                      ? 'bg-rose-100 text-rose-700'
                      : days <= 7
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700',
                  )}
                >
                  {days <= 0 ? 'Expired' : `${days}d left`}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Subscription Renewal / Upgrade / Downgrade */}
      {!subscriptionActive && (
        <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
            <h2 className="text-lg font-bold text-amber-800">
              Subscription {tenant.subscriptionEndsAt || tenant.trialEndsAt ? 'Expired' : 'Not Set'} — Renew or Change
              Plan
            </h2>
            <p className="text-sm text-amber-600 mt-0.5">Select a plan and billing cycle to activate this tenant</p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Select Plan</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {plans.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setRenewalPlan(p.id)}
                    className={cn(
                      'p-3 rounded-xl border-2 text-left transition-all',
                      renewalPlan === p.id ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <p className="font-bold text-sm">{p.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.priceMonthly > 0 ? `₹${p.priceMonthly.toLocaleString()}/mo` : 'Free'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            {renewalPlan && renewalPlan !== 'TRIAL' && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Billing Cycle</label>
                <div className="flex gap-2">
                  {(['monthly', 'yearly'] as const).map(c => {
                    const p = plans.find(pl => pl.id === renewalPlan);
                    const price = c === 'monthly' ? p?.priceMonthly : p?.priceYearly;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setRenewalCycle(c)}
                        className={cn(
                          'flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors',
                          renewalCycle === c
                            ? 'bg-brand text-white border-brand'
                            : 'border-gray-200 text-gray-600 hover:border-brand',
                        )}
                      >
                        {c === 'monthly' ? 'Monthly' : 'Yearly'}
                        {price ? ` — ₹${price.toLocaleString()}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {renewalPlan && (
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                <div>
                  <p className="text-sm text-gray-500">New subscription period</p>
                  <p className="font-bold">
                    {new Date().toLocaleDateString()} →{' '}
                    {(() => {
                      const d = new Date();
                      if (renewalPlan === 'TRIAL') {
                        d.setDate(d.getDate() + 14);
                      } else if (renewalCycle === 'yearly') {
                        d.setFullYear(d.getFullYear() + 1);
                      } else {
                        d.setMonth(d.getMonth() + 1);
                      }
                      return d.toLocaleDateString();
                    })()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const token = session.getToken();
                    const d = new Date();
                    if (renewalPlan === 'TRIAL') {
                      d.setDate(d.getDate() + 14);
                    } else if (renewalCycle === 'yearly') {
                      d.setFullYear(d.getFullYear() + 1);
                    } else {
                      d.setMonth(d.getMonth() + 1);
                    }
                    try {
                      await fetch(`/api/super-admin/tenants/${tenantId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                          planId: renewalPlan,
                          subscriptionEndsAt: d.toISOString().split('T')[0],
                          status: renewalPlan === 'TRIAL' ? 'trial' : 'active',
                        }),
                      });
                      toast(
                        `Subscription renewed — ${plans.find(p => p.id === renewalPlan)?.name} until ${d.toLocaleDateString()}`,
                        'success',
                      );
                      fetchTenant();
                    } catch {
                      toast('Failed to renew', 'error');
                    }
                  }}
                  className="px-6 py-2.5 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark"
                >
                  {tenant.planId === renewalPlan
                    ? 'Renew'
                    : plans.findIndex(p => p.id === renewalPlan) > plans.findIndex(p => p.id === tenant.planId)
                      ? 'Upgrade'
                      : 'Downgrade'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                <card.icon size={20} className={card.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Tab Customization */}
      <TabCustomization
        tenantId={tenantId}
        tabConfig={tenant.tabConfig}
        tenant={tenant as unknown as Record<string, unknown>}
        onSaved={fetchTenant}
      />

      {tenant.businessType === 'service' && <ServiceCloudSeatsPanel tenantId={tenantId} />}

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500">{(tenant.users ?? []).length} users in this tenant</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Created</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(tenant.users ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-gray-400">
                    No users found
                  </td>
                </tr>
              )}
              {(tenant.users ?? []).map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleResetToken(u.email)}
                      disabled={resetLoading === u.email}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-60"
                    >
                      <KeyRound size={12} /> {resetLoading === u.email ? 'Generating...' : 'Reset Password'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Analytics + Storage + Login History */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 size={18} /> Usage & Activity
          </h2>
          <button
            onClick={() => {
              if (activity) {
                setActivity(null);
                return;
              }
              const saToken = session.getToken();
              fetch(`/api/super-admin/tenants/${tenantId}/activity`, {
                headers: { Authorization: `Bearer ${saToken}` },
              })
                .then(r => r.json())
                .then(setActivity)
                .catch(() => {});
            }}
            className="text-sm text-brand font-bold hover:underline"
          >
            {activity ? 'Hide' : 'Load'}
          </button>
        </div>
        {activity && (
          <div className="p-5 space-y-5">
            {/* Counts */}
            <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
              {Object.entries(activity.counts).map(([k, v]) => (
                <div key={k} className="text-center bg-gray-50 rounded-xl p-3">
                  <p className="text-xl font-bold">{v}</p>
                  <p className="text-[10px] text-gray-400 uppercase capitalize">{k}</p>
                </div>
              ))}
            </div>

            {/* Revenue trend */}
            {activity.revenueHistory.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Revenue — Last 6 months</p>
                <div className="flex items-end gap-1.5 h-16">
                  {activity.revenueHistory.map(r => {
                    const max = Math.max(...activity.revenueHistory.map(x => x.revenue), 1);
                    return (
                      <div key={r.month} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-brand/80 rounded-t"
                          style={{ height: `${(r.revenue / max) * 48}px` }}
                          title={`₹${r.revenue.toLocaleString()}`}
                        />
                        <p className="text-[9px] text-gray-400">{r.month.slice(5)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Storage */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
              <HardDrive size={18} className="text-gray-400" />
              <div>
                <p className="text-sm font-bold">~{(activity.estimatedStorageRows * 0.5).toFixed(0)} KB estimated</p>
                <p className="text-xs text-gray-400">{activity.estimatedStorageRows.toLocaleString()} total records</p>
              </div>
            </div>

            {/* Login history */}
            {activity.loginHistory.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                  <Clock size={11} /> Recent Logins
                </p>
                <div className="space-y-1.5">
                  {activity.loginHistory.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{l.user_name as string}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(l.created_at as string).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions — Export, Notify, Upgrade */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Zap size={18} /> Quick Actions
        </h2>

        {/* Data export */}
        <button
          onClick={async () => {
            setExporting(true);
            try {
              const saToken = session.getToken();
              const r = await fetch(`/api/super-admin/tenants/${tenantId}/export`, {
                headers: { Authorization: `Bearer ${saToken}` },
              });
              const blob = await r.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${tenant.companyName}_backup_${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch {
              toast('Export failed', 'error');
            }
            setExporting(false);
          }}
          disabled={exporting}
          className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 text-left"
        >
          <Download size={16} className="text-blue-500" />
          <div>
            <p className="text-sm font-bold">Export Tenant Data</p>
            <p className="text-xs text-gray-400">Download full backup as JSON</p>
          </div>
          {exporting && <span className="ml-auto text-xs text-gray-400">Downloading...</span>}
        </button>

        {/* Push notification */}
        <button
          onClick={() => setShowNotify(true)}
          className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 text-left"
        >
          <Bell size={16} className="text-amber-500" />
          <div>
            <p className="text-sm font-bold">Send In-App Notification</p>
            <p className="text-xs text-gray-400">Message appears on tenant's next login</p>
          </div>
        </button>

        {/* Real-time active users */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={async () => {
              if (activeUsers) {
                setActiveUsers(null);
                return;
              }
              setActiveUsersLoading(true);
              const saToken = session.getToken();
              const r = await fetch(`/api/super-admin/tenants/${tenantId}/active-users`, {
                headers: { Authorization: `Bearer ${saToken}` },
              });
              const d = await r.json();
              setActiveUsers(d);
              setActiveUsersLoading(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
          >
            <Users size={16} className="text-emerald-500" />
            <div className="flex-1">
              <p className="text-sm font-bold">Active Users Right Now</p>
              <p className="text-xs text-gray-400">Users active in last 15 minutes</p>
            </div>
            {activeUsersLoading && <span className="text-xs text-gray-400">Loading...</span>}
            {activeUsers && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {activeUsers.activeCount} online
              </span>
            )}
          </button>
          {activeUsers && activeUsers.users.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2">
              {activeUsers.users.map(u => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{u.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{u.role}</span>
                  </div>
                  <span className="text-xs text-emerald-600">
                    ● {new Date(u.last_active_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
          {activeUsers && activeUsers.users.length === 0 && (
            <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
              No users active in last 15 minutes
            </div>
          )}
        </div>

        {/* Upgrade plan */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-purple-500" />
            <p className="text-sm font-bold">Upgrade / Change Plan</p>
            <span className="ml-auto text-xs bg-gray-100 px-2 py-0.5 rounded-full">Current: {tenant.planId}</span>
          </div>
          <div className="flex gap-2">
            <select
              value={upgradePlan}
              onChange={e => setUpgradePlan(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select new plan...</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{p.priceMonthly}/mo
                </option>
              ))}
            </select>
            <input
              type="date"
              value={upgradeEnd}
              onChange={e => setUpgradeEnd(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              title="Valid until"
            />
            <button
              disabled={!upgradePlan || upgrading}
              onClick={async () => {
                setUpgrading(true);
                const saToken = session.getToken();
                const r = await fetch(`/api/super-admin/tenants/${tenantId}/upgrade-plan`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saToken}` },
                  body: JSON.stringify({ planId: upgradePlan, subscriptionEnd: upgradeEnd || undefined }),
                });
                const d = await r.json();
                if (r.ok) {
                  toast(`Upgraded to ${d.plan}`, 'success');
                  fetchTenant();
                  setUpgradePlan('');
                  setUpgradeEnd('');
                } else toast(d.error, 'error');
                setUpgrading(false);
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
            >
              {upgrading ? '...' : 'Upgrade'}
            </button>
          </div>
        </div>
      </div>

      {/* Notify modal */}
      {showNotify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNotify(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Bell size={18} /> Send Notification
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Title</label>
                <input
                  value={notifyForm.title}
                  onChange={e => setNotifyForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="System Update"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Message</label>
                <textarea
                  value={notifyForm.message}
                  onChange={e => setNotifyForm(f => ({ ...f, message: e.target.value }))}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  placeholder="Your message to the tenant..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Type</label>
                <select
                  value={notifyForm.type}
                  onChange={e => setNotifyForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="info">ℹ️ Info</option>
                  <option value="warning">⚠️ Warning</option>
                  <option value="success">✅ Success</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowNotify(false)}
                  className="flex-1 py-2 border rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  disabled={sendingNotify || !notifyForm.title || !notifyForm.message}
                  onClick={async () => {
                    setSendingNotify(true);
                    const saToken = session.getToken();
                    await fetch(`/api/super-admin/tenants/${tenantId}/notify`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saToken}` },
                      body: JSON.stringify(notifyForm),
                    });
                    toast('Notification sent', 'success');
                    setShowNotify(false);
                    setNotifyForm({ title: '', message: '', type: 'info' });
                    setSendingNotify(false);
                  }}
                  className="flex-1 py-2 bg-brand text-white rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  {sendingNotify ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetTokenModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setResetTokenModal(null)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound size={28} />
            </div>
            <h3 className="text-lg font-bold text-center mb-1">Password Reset Link</h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              For {resetTokenModal.userName} ({resetTokenModal.email})
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Reset Link (share with user)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={resetTokenModal.resetLink}
                  className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-mono select-all"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(resetTokenModal.resetLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-bold transition-colors',
                    copied ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300',
                  )}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Expires: {new Date(resetTokenModal.expiresAt).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setResetTokenModal(null)}
              className="w-full py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

const TAB_PRESETS: Record<string, Record<string, { label: string; visible: boolean }>> = {
  manufacturer: {
    analytics: { label: 'Analytics', visible: true },
    masters: { label: 'Masters', visible: true },
    inventory: { label: 'Inventory', visible: true },
    distribution: { label: 'Dispatch', visible: true },
    sales: { label: 'Warranty Registration', visible: true },
    purchases: { label: 'Purchases', visible: true },
    verification: { label: 'Search / Verify', visible: true },
    quotations: { label: 'Quotes & Orders', visible: true },
    invoices: { label: 'Invoices', visible: true },
    finance: { label: 'Vendor Payments', visible: true },
    accounts: { label: 'Accounts', visible: true },
    warranty: { label: 'Warranty', visible: true },
    replacements: { label: 'Replacements', visible: true },
    rewards: { label: 'Rewards', visible: true },
    chatbot: { label: 'Chatbot', visible: true },
    settings: { label: 'Settings', visible: true },
  },
  dealer: {
    analytics: { label: 'Analytics', visible: true },
    masters: { label: 'Masters', visible: true },
    inventory: { label: 'Inventory', visible: true },
    distribution: { label: 'Sales', visible: true },
    sales: { label: 'Sales Entry', visible: false },
    purchases: { label: 'Purchases', visible: true },
    verification: { label: 'Search / Verify', visible: true },
    quotations: { label: 'Quotes & Orders', visible: true },
    invoices: { label: 'Invoices', visible: true },
    finance: { label: 'Dealer Payments', visible: true },
    accounts: { label: 'Accounts', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
    chatbot: { label: 'Chatbot', visible: true },
    settings: { label: 'Settings', visible: true },
  },
  retail: {
    analytics: { label: 'Analytics', visible: true },
    masters: { label: 'Masters', visible: true },
    inventory: { label: 'Stock', visible: true },
    distribution: { label: 'Purchase', visible: true },
    sales: { label: 'Sales Entry', visible: false },
    purchases: { label: 'Purchases', visible: true },
    verification: { label: 'Search / Verify', visible: true },
    quotations: { label: 'Quotes & Orders', visible: true },
    invoices: { label: 'Invoices', visible: true },
    finance: { label: 'Supplier Payments', visible: true },
    accounts: { label: 'Accounts', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
    chatbot: { label: 'Chatbot', visible: true },
    settings: { label: 'Settings', visible: true },
  },
  service: {
    analytics: { label: 'Analytics', visible: true },
    masters: { label: 'Masters', visible: true },
    inventory: { label: 'Inventory', visible: false },
    distribution: { label: 'Distribution', visible: false },
    sales: { label: 'Sales Entry', visible: false },
    purchases: { label: 'Expenses', visible: true },
    verification: { label: 'Search / Verify', visible: false },
    quotations: { label: 'Quotes & Orders', visible: true },
    invoices: { label: 'Invoices', visible: true },
    finance: { label: 'Invoice Finance', visible: true },
    accounts: { label: 'Accounts', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
    chatbot: { label: 'Chatbot', visible: true },
    settings: { label: 'Settings', visible: true },
  },
};
const DEFAULT_TAB_CONFIG = TAB_PRESETS.manufacturer;

function getDefaultTabConfig(businessType?: string): Record<string, { label: string; visible: boolean }> {
  return TAB_PRESETS[businessType || 'manufacturer'] || TAB_PRESETS.manufacturer;
}

const TAB_KEYS = [
  'analytics',
  'masters',
  'inventory',
  'distribution',
  'sales',
  'purchases',
  'verification',
  'quotations',
  'invoices',
  'finance',
  'accounts',
  'warranty',
  'replacements',
  'rewards',
  'chatbot',
  'settings',
] as const;

function TabCustomization({
  tenantId,
  tabConfig,
  tenant,
  onSaved,
}: {
  tenantId: string;
  tabConfig: Record<string, { label: string; visible: boolean }> | null;
  tenant: Record<string, unknown>;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [config, setConfig] = useState<Record<string, { label: string; visible: boolean }>>(
    tabConfig ?? getDefaultTabConfig(tenant.businessType as string),
  );
  const [barcodeSystem, setBarcodeSystem] = useState(tenant.barcodeSystemEnabled !== false);
  const [multiLanguage, setMultiLanguage] = useState(tenant.multiLanguageEnabled !== false);
  const [inventoryTracking, setInventoryTracking] = useState(tenant.inventoryTrackingEnabled !== false);
  const [vendorPortal, setVendorPortal] = useState(tenant.vendorPortalEnabled !== false);
  const [quotationsEnabled, setQuotationsEnabled] = useState(tenant.quotationsEnabled !== false);
  const [accountsEnabled, setAccountsEnabled] = useState(tenant.accountsEnabled !== false);
  const [purchasesEnabled, setPurchasesEnabled] = useState(tenant.purchasesEnabled !== false);
  const [chatbotEnabled, setChatbotEnabled] = useState(tenant.chatbotEnabled !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(tabConfig ?? getDefaultTabConfig(tenant.businessType as string));
    setBarcodeSystem(tenant.barcodeSystemEnabled !== false);
    setMultiLanguage(tenant.multiLanguageEnabled !== false);
    setInventoryTracking(tenant.inventoryTrackingEnabled !== false);
    setVendorPortal(tenant.vendorPortalEnabled !== false);
    setQuotationsEnabled(tenant.quotationsEnabled !== false);
    setAccountsEnabled(tenant.accountsEnabled !== false);
    setPurchasesEnabled(tenant.purchasesEnabled !== false);
    setChatbotEnabled(tenant.chatbotEnabled !== false);
  }, [
    tabConfig,
    tenant.barcodeSystemEnabled,
    tenant.multiLanguageEnabled,
    tenant.inventoryTrackingEnabled,
    tenant.vendorPortalEnabled,
    tenant.quotationsEnabled,
    tenant.accountsEnabled,
    tenant.purchasesEnabled,
    tenant.chatbotEnabled,
  ]);

  const updateLabel = (key: string, label: string) => setConfig(prev => ({ ...prev, [key]: { ...prev[key], label } }));
  const toggleVisible = (key: string) =>
    setConfig(prev => ({ ...prev, [key]: { ...prev[key], visible: !prev[key].visible } }));
  const isLocked = (key: string) => key === 'dashboard' || key === 'settings';

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = session.getToken();
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tabConfig: config,
          barcodeSystemEnabled: barcodeSystem,
          multiLanguageEnabled: multiLanguage,
          inventoryTrackingEnabled: inventoryTracking,
          vendorPortalEnabled: vendorPortal,
          quotationsEnabled,
          accountsEnabled,
          purchasesEnabled,
          chatbotEnabled,
        }),
      });
      if (!res.ok) throw new Error();
      toast('Tab configuration saved', 'success');
      onSaved();
    } catch {
      toast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Pencil size={18} /> Tab Customization
            </h2>
            <p className="text-sm text-gray-500">Rename tabs and control visibility for this tenant</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfig(DEFAULT_TAB_CONFIG)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-brand hover:bg-brand-dark rounded-lg disabled:opacity-60"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase">Internal Feature</th>
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase">Display Name</th>
              <th className="text-center px-6 py-3 text-xs font-bold text-gray-400 uppercase">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {TAB_KEYS.map(key => (
              <tr key={key} className={cn(!config[key]?.visible && !isLocked(key) && 'bg-gray-50/50 opacity-60')}>
                <td className="px-6 py-3">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{key}</span>
                </td>
                <td className="px-6 py-3">
                  <input
                    type="text"
                    value={config[key]?.label ?? DEFAULT_TAB_CONFIG[key].label}
                    onChange={e => updateLabel(key, e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-full max-w-[200px] focus:ring-2 focus:ring-brand"
                  />
                </td>
                <td className="px-6 py-3 text-center">
                  {isLocked(key) ? (
                    <span className="text-xs text-gray-400">Always ON</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleVisible(key)}
                      className={cn(
                        'relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors',
                        config[key]?.visible ? 'bg-green-500' : 'bg-gray-300',
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform',
                          config[key]?.visible ? 'translate-x-4' : 'translate-x-0',
                        )}
                      />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-6 border-t border-gray-100">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Options</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Barcode System</p>
            <p className="text-xs text-gray-500">
              When OFF, uses simple SKU codes. No auto-generated barcodes, scanner, or label printing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBarcodeSystem(!barcodeSystem)}
            className={cn(
              'relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors',
              barcodeSystem ? 'bg-green-500' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform',
                barcodeSystem ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="font-medium text-sm">Multi-Language</p>
            <p className="text-xs text-gray-500">When ON, tenant can switch UI between English, Hindi, and Gujarati.</p>
          </div>
          <button
            type="button"
            onClick={() => setMultiLanguage(!multiLanguage)}
            className={cn(
              'relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors',
              multiLanguage ? 'bg-green-500' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform',
                multiLanguage ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="font-medium text-sm">Inventory Tracking</p>
            <p className="text-xs text-gray-500">
              When OFF, products are a simple catalog (name + price). No stock count, barcode quantity, or "Add Stock".
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInventoryTracking(!inventoryTracking)}
            className={cn(
              'relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors',
              inventoryTracking ? 'bg-green-500' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform',
                inventoryTracking ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="font-medium text-sm">Vendor Management</p>
            <p className="text-xs text-gray-500">
              When ON, new vendors get login credentials and portal access. Turn OFF for retail/shop tenants.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVendorPortal(!vendorPortal)}
            className={cn(
              'relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors',
              vendorPortal ? 'bg-green-500' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform',
                vendorPortal ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>
        {[
          {
            label: 'Quotations',
            desc: 'Create quotes, share via WhatsApp, convert to distribution.',
            value: quotationsEnabled,
            setter: setQuotationsEnabled,
          },
          {
            label: 'Accounts & Reports',
            desc: 'P&L, Balance Sheet, Cash Flow, GST reports, stock summary.',
            value: accountsEnabled,
            setter: setAccountsEnabled,
          },
          {
            label: 'Purchases',
            desc: 'Supplier management, purchase batches, supplier finance.',
            value: purchasesEnabled,
            setter: setPurchasesEnabled,
          },
          {
            label: 'AI Chatbot',
            desc: 'Ask business questions in natural language, get instant answers.',
            value: chatbotEnabled,
            setter: setChatbotEnabled,
          },
        ].map(f => (
          <div key={f.label} className="flex items-center justify-between mt-4">
            <div>
              <p className="font-medium text-sm">{f.label}</p>
              <p className="text-xs text-gray-500">{f.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => f.setter(!f.value)}
              className={cn(
                'relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors',
                f.value ? 'bg-green-500' : 'bg-gray-300',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform',
                  f.value ? 'translate-x-4' : 'translate-x-0',
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
