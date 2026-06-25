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
  ShieldCheck,
  Gift,
  RefreshCw,
  MessageSquare,
  FileText,
  Languages,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { LoadingSpinner, useToast } from '../../components/ui';

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
  warrantyEnabled: boolean;
  replacementEnabled: boolean;
  rewardsEnabled: boolean;
  financeEnabled: boolean;
  chatbotEnabled: boolean;
  billCustomizationEnabled: boolean;
  multiLanguageEnabled: boolean;
  vendorPortalEnabled: boolean;
  barcodeSystemEnabled: boolean;
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
  const [plans, setPlans] = useState<{ id: string; name: string; priceMonthly: number }[]>([]);

  React.useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    fetch('/api/super-admin/plans', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.plans ?? [];
        setPlans(list.map((p: Record<string, unknown>) => ({ id: p.id as string, name: p.name as string, priceMonthly: Number(p.priceMonthly ?? 0) })));
      })
      .catch(() => {});
  }, []);

  const fetchTenant = () => {
    const token = sessionStorage.getItem('auth_token');
    fetch(`/api/super-admin/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setTenant({ ...data.tenant, stats: data.stats, users: data.users }))
      .catch(() => toast('Failed to load tenant', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTenant(); }, [tenantId]);

  const handleStatusChange = async (newStatus: string) => {
    const token = sessionStorage.getItem('auth_token');
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

  const handleChangePlan = async (newPlan: string) => {
    const currentPlanId = tenant?.planId || tenant?.plan;
    if (newPlan === currentPlanId) { setChangingPlan(false); return; }

    const subEnd = tenant?.subscriptionEndsAt;
    const daysLeft = subEnd ? Math.ceil((new Date(subEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    if (daysLeft > 0) {
      const confirmed = window.confirm(`This tenant has ${daysLeft} days left on their current plan. Changing the plan will take effect immediately but won't affect existing data.\n\nProceed?`);
      if (!confirmed) { setChangingPlan(false); return; }
    }

    const token = sessionStorage.getItem('auth_token');
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
    const token = sessionStorage.getItem('auth_token');
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Impersonation failed');
      const data = await res.json();
      // Open ERP in new tab with the impersonation token
      const url = new URL(window.location.origin);
      url.searchParams.set('impersonate_token', data.token);
      window.open(url.toString(), '_blank');
    } catch {
      toast('Impersonation failed', 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (!tenant) return <div className="text-center py-20 text-gray-400">Tenant not found</div>;

  const stats = tenant.stats ?? { products: 0, vendors: 0, users: 0, sales: 0, revenue: 0 };

  const statCards = [
    { label: 'Products', value: stats.products, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Vendors', value: stats.vendors, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Users', value: stats.users, icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Sales', value: stats.sales, icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Revenue', value: `₹${(stats.revenue ?? 0).toLocaleString()}`, icon: IndianRupee, color: 'text-[#F27D26]', bg: 'bg-orange-50' },
  ];

  const statusBadge = tenant.status === 'active'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : tenant.status === 'trial'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-rose-50 text-rose-700 border-rose-200';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tenant.companyName}</h1>
            <p className="text-gray-500 text-sm">Tenant details and management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImpersonate}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            <ExternalLink size={16} />
            Impersonate
          </button>
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
            <Building2 size={24} className="text-[#F27D26]" />
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
            <span className="text-gray-600">Created: {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-gray-600">Expires:</span>
            <input
              type="date"
              value={tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt).toISOString().split('T')[0] : tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toISOString().split('T')[0] : ''}
              onChange={async (e) => {
                const token = sessionStorage.getItem('auth_token');
                await fetch(`/api/super-admin/tenants/${tenantId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ subscriptionEndsAt: e.target.value || null }),
                });
                fetchTenant();
                toast(e.target.value ? `Expiry set to ${e.target.value}` : 'Expiry removed', 'success');
              }}
              className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-[#F27D26]"
            />
            {(() => {
              const end = tenant.subscriptionEndsAt || tenant.trialEndsAt;
              if (!end) return null;
              const days = Math.ceil((new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", days <= 0 ? "bg-rose-100 text-rose-700" : days <= 7 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>{days <= 0 ? 'Expired' : `${days}d left`}</span>;
            })()}
          </div>
          <div className="flex items-center gap-2 text-sm relative">
            <span className="text-gray-400 text-xs font-bold uppercase">Plan:</span>
            {changingPlan ? (
              <select
                defaultValue={tenant.planId || tenant.plan}
                onChange={(e) => handleChangePlan(e.target.value)}
                onBlur={() => setChangingPlan(false)}
                autoFocus
                className="px-2 py-1 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26] focus:border-transparent bg-white"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.priceMonthly > 0 ? ` — ₹${p.priceMonthly.toLocaleString()}/mo` : ' (Free)'}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setChangingPlan(true)}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-[#F27D26] transition-colors capitalize"
              >
                {tenant.planName || tenant.plan || tenant.planId || 'No plan'} <ChevronDown size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((card) => (
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

      {/* Feature Toggles */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Feature Toggles</h2>
          <p className="text-sm text-gray-500">Enable or disable features for this tenant</p>
        </div>
        <div className="p-6 space-y-4">
          {([
            { key: 'warrantyEnabled', label: 'Warranty Management', desc: 'Auto-create warranties on sale. Hides warranty tab when disabled.', icon: ShieldCheck },
            { key: 'replacementEnabled', label: 'Replacement Tracking', desc: 'Track product replacements under warranty. Hides replacements tab when disabled.', icon: RefreshCw },
            { key: 'rewardsEnabled', label: 'Rewards & Points', desc: 'Vendor reward points on each sale. Hides rewards tab when disabled.', icon: Gift },
            { key: 'financeEnabled', label: 'Finance Module', desc: 'Vendor payment tracking, reminders, and balance management.', icon: IndianRupee },
            { key: 'chatbotEnabled', label: 'AI Chatbot', desc: '30+ natural language commands for quick data access.', icon: MessageSquare },
            { key: 'billCustomizationEnabled', label: 'Bill Customization', desc: 'Custom logo, colors, bank details, signatory on bills.', icon: FileText },
            { key: 'multiLanguageEnabled', label: 'Multi-Language', desc: 'Switch UI between English, Hindi, and Gujarati.', icon: Languages },
            { key: 'vendorPortalEnabled', label: 'Vendor Portal', desc: 'When OFF, vendors are just names — no login, no dashboard. Distribution still works.', icon: Users },
            { key: 'barcodeSystemEnabled', label: 'Barcode System', desc: 'When OFF, uses simple SKU codes instead of auto-generated barcodes. No scanner, no label printing.', icon: Package },
          ] as const).map((toggle) => (
            <div key={toggle.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center">
                  <toggle.icon size={18} className="text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">{toggle.label}</p>
                  <p className="text-xs text-gray-500">{toggle.desc}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const token = sessionStorage.getItem('auth_token');
                  const currentVal = (tenant as Record<string, unknown>)[toggle.key] !== false;
                  try {
                    await fetch(`/api/super-admin/tenants/${tenantId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ [toggle.key]: !currentVal }),
                    });
                    fetchTenant();
                    toast(`${toggle.label} ${!currentVal ? 'enabled' : 'disabled'}`, 'success');
                  } catch { toast('Failed to update', 'error'); }
                }}
                className={cn("relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors", (tenant as Record<string, unknown>)[toggle.key] !== false ? "bg-green-500" : "bg-gray-300")}
              >
                <span className={cn("pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform", (tenant as Record<string, unknown>)[toggle.key] !== false ? "translate-x-5" : "translate-x-0")} />
              </button>
            </div>
          ))}
        </div>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {(tenant.users ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-400">No users found</td>
                </tr>
              )}
              {(tenant.users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
