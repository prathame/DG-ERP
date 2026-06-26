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
  barcodeSystemEnabled: boolean;
  multiLanguageEnabled: boolean;
  vendorPortalEnabled: boolean;
  inventoryTrackingEnabled: boolean;
  tabConfig: Record<string, { label: string; visible: boolean }> | null;
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

  React.useEffect(() => {
    const token = localStorage.getItem('auth_token');
    fetch('/api/super-admin/plans', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.plans ?? [];
        setPlans(list.map((p: Record<string, unknown>) => ({ id: p.id as string, name: p.name as string, priceMonthly: Number(p.priceMonthly ?? 0), priceYearly: Number(p.priceYearly ?? 0) })));
      })
      .catch(() => {});
  }, []);

  const fetchTenant = () => {
    const token = localStorage.getItem('auth_token');
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
    const token = localStorage.getItem('auth_token');
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
    if (newPlan === currentPlanId) { setChangingPlan(false); return; }

    if (subscriptionActive) {
      toast('Cannot change plan while subscription is active. Wait for expiry or update the end date first.', 'error');
      setChangingPlan(false);
      return;
    }

    const token = localStorage.getItem('auth_token');
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
    const token = localStorage.getItem('auth_token');
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
            <span className="text-gray-400 text-xs font-bold uppercase">Plan:</span>
            <span className="font-medium text-gray-700">{tenant.planName || tenant.plan || tenant.planId || 'No plan'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-gray-600">
              {tenant.subscriptionEndsAt ? `Expires: ${new Date(tenant.subscriptionEndsAt).toLocaleDateString()}` : tenant.trialEndsAt ? `Trial ends: ${new Date(tenant.trialEndsAt).toLocaleDateString()}` : 'No expiry set'}
            </span>
            {(() => {
              const end = tenant.subscriptionEndsAt || tenant.trialEndsAt;
              if (!end) return null;
              const days = Math.ceil((new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", days <= 0 ? "bg-rose-100 text-rose-700" : days <= 7 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>{days <= 0 ? 'Expired' : `${days}d left`}</span>;
            })()}
          </div>
        </div>
      </div>

      {/* Subscription Renewal / Upgrade / Downgrade */}
      {!subscriptionActive && (
        <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
            <h2 className="text-lg font-bold text-amber-800">Subscription {tenant.subscriptionEndsAt || tenant.trialEndsAt ? 'Expired' : 'Not Set'} — Renew or Change Plan</h2>
            <p className="text-sm text-amber-600 mt-0.5">Select a plan and billing cycle to activate this tenant</p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Select Plan</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {plans.map((p) => (
                  <button key={p.id} type="button" onClick={() => setRenewalPlan(p.id)}
                    className={cn("p-3 rounded-xl border-2 text-left transition-all", renewalPlan === p.id ? "border-[#F27D26] bg-[#F27D26]/5" : "border-gray-200 hover:border-gray-300")}>
                    <p className="font-bold text-sm">{p.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.priceMonthly > 0 ? `₹${p.priceMonthly.toLocaleString()}/mo` : 'Free'}</p>
                  </button>
                ))}
              </div>
            </div>
            {renewalPlan && renewalPlan !== 'TRIAL' && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Billing Cycle</label>
                <div className="flex gap-2">
                  {(['monthly', 'yearly'] as const).map((c) => {
                    const p = plans.find((pl) => pl.id === renewalPlan);
                    const price = c === 'monthly' ? p?.priceMonthly : p?.priceYearly;
                    return (
                      <button key={c} type="button" onClick={() => setRenewalCycle(c)}
                        className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors", renewalCycle === c ? "bg-[#F27D26] text-white border-[#F27D26]" : "border-gray-200 text-gray-600 hover:border-[#F27D26]")}>
                        {c === 'monthly' ? 'Monthly' : 'Yearly'}{price ? ` — ₹${price.toLocaleString()}` : ''}
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
                  <p className="font-bold">{new Date().toLocaleDateString()} → {(() => {
                    const d = new Date();
                    if (renewalPlan === 'TRIAL') { d.setDate(d.getDate() + 14); }
                    else if (renewalCycle === 'yearly') { d.setFullYear(d.getFullYear() + 1); }
                    else { d.setMonth(d.getMonth() + 1); }
                    return d.toLocaleDateString();
                  })()}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const token = localStorage.getItem('auth_token');
                    const d = new Date();
                    if (renewalPlan === 'TRIAL') { d.setDate(d.getDate() + 14); }
                    else if (renewalCycle === 'yearly') { d.setFullYear(d.getFullYear() + 1); }
                    else { d.setMonth(d.getMonth() + 1); }
                    try {
                      await fetch(`/api/super-admin/tenants/${tenantId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ planId: renewalPlan, subscriptionEndsAt: d.toISOString().split('T')[0], status: renewalPlan === 'TRIAL' ? 'trial' : 'active' }),
                      });
                      toast(`Subscription renewed — ${plans.find((p) => p.id === renewalPlan)?.name} until ${d.toLocaleDateString()}`, 'success');
                      fetchTenant();
                    } catch { toast('Failed to renew', 'error'); }
                  }}
                  className="px-6 py-2.5 bg-[#F27D26] text-white rounded-xl font-bold hover:bg-[#D96A1C]"
                >
                  {tenant.planId === renewalPlan ? 'Renew' : (plans.findIndex((p) => p.id === renewalPlan) > plans.findIndex((p) => p.id === tenant.planId)) ? 'Upgrade' : 'Downgrade'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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


      {/* Tab Customization */}
      <TabCustomization tenantId={tenantId} tabConfig={tenant.tabConfig} tenant={tenant as unknown as Record<string, unknown>} onSaved={fetchTenant} />

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

const DEFAULT_TAB_CONFIG: Record<string, { label: string; visible: boolean }> = {
  dashboard: { label: 'Dashboard', visible: true },
  inventory: { label: 'Inventory', visible: true },
  distribution: { label: 'Distribution', visible: true },
  sales: { label: 'Sales Entry', visible: true },
  verification: { label: 'Search / Verify', visible: true },
  warranty: { label: 'Warranty', visible: true },
  replacements: { label: 'Replacements', visible: true },
  rewards: { label: 'Rewards', visible: true },
  finance: { label: 'Finance', visible: true },
  chatbot: { label: 'Chatbot', visible: true },
  settings: { label: 'Settings', visible: true },
};

const TAB_KEYS = ['dashboard', 'inventory', 'distribution', 'sales', 'verification', 'warranty', 'replacements', 'rewards', 'finance', 'chatbot', 'settings'] as const;

function TabCustomization({ tenantId, tabConfig, tenant, onSaved }: { tenantId: string; tabConfig: Record<string, { label: string; visible: boolean }> | null; tenant: Record<string, unknown>; onSaved: () => void }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<Record<string, { label: string; visible: boolean }>>(tabConfig ?? DEFAULT_TAB_CONFIG);
  const [barcodeSystem, setBarcodeSystem] = useState(tenant.barcodeSystemEnabled !== false);
  const [multiLanguage, setMultiLanguage] = useState(tenant.multiLanguageEnabled !== false);
  const [inventoryTracking, setInventoryTracking] = useState(tenant.inventoryTrackingEnabled !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(tabConfig ?? DEFAULT_TAB_CONFIG);
    setBarcodeSystem(tenant.barcodeSystemEnabled !== false);
    setMultiLanguage(tenant.multiLanguageEnabled !== false);
    setInventoryTracking(tenant.inventoryTrackingEnabled !== false);
  }, [tabConfig, tenant.barcodeSystemEnabled, tenant.multiLanguageEnabled, tenant.inventoryTrackingEnabled]);

  const updateLabel = (key: string, label: string) => setConfig(prev => ({ ...prev, [key]: { ...prev[key], label } }));
  const toggleVisible = (key: string) => setConfig(prev => ({ ...prev, [key]: { ...prev[key], visible: !prev[key].visible } }));
  const isLocked = (key: string) => key === 'dashboard' || key === 'settings';

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tabConfig: config, barcodeSystemEnabled: barcodeSystem, multiLanguageEnabled: multiLanguage, inventoryTrackingEnabled: inventoryTracking }),
      });
      if (!res.ok) throw new Error();
      toast('Tab configuration saved', 'success');
      onSaved();
    } catch { toast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Pencil size={18} /> Tab Customization</h2>
            <p className="text-sm text-gray-500">Rename tabs and control visibility for this tenant</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfig(DEFAULT_TAB_CONFIG)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"><RotateCcw size={14} /> Reset</button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#F27D26] hover:bg-[#D96A1C] rounded-lg disabled:opacity-60"><Save size={14} /> {saving ? 'Saving...' : 'Save'}</button>
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
          <tbody className="divide-y divide-gray-50">
            {TAB_KEYS.map((key) => (
              <tr key={key} className={cn(!config[key]?.visible && !isLocked(key) && "bg-gray-50/50 opacity-60")}>
                <td className="px-6 py-3">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{key}</span>
                </td>
                <td className="px-6 py-3">
                  <input
                    type="text"
                    value={config[key]?.label ?? DEFAULT_TAB_CONFIG[key].label}
                    onChange={(e) => updateLabel(key, e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-full max-w-[200px] focus:ring-2 focus:ring-[#F27D26]"
                  />
                </td>
                <td className="px-6 py-3 text-center">
                  {isLocked(key) ? (
                    <span className="text-xs text-gray-400">Always ON</span>
                  ) : (
                    <button type="button" onClick={() => toggleVisible(key)} className={cn("relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors", config[key]?.visible ? "bg-green-500" : "bg-gray-300")}>
                      <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform", config[key]?.visible ? "translate-x-4" : "translate-x-0")} />
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
            <p className="text-xs text-gray-500">When OFF, uses simple SKU codes. No auto-generated barcodes, scanner, or label printing.</p>
          </div>
          <button type="button" onClick={() => setBarcodeSystem(!barcodeSystem)} className={cn("relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors", barcodeSystem ? "bg-green-500" : "bg-gray-300")}>
            <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform", barcodeSystem ? "translate-x-4" : "translate-x-0")} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="font-medium text-sm">Multi-Language</p>
            <p className="text-xs text-gray-500">When ON, tenant can switch UI between English, Hindi, and Gujarati.</p>
          </div>
          <button type="button" onClick={() => setMultiLanguage(!multiLanguage)} className={cn("relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors", multiLanguage ? "bg-green-500" : "bg-gray-300")}>
            <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform", multiLanguage ? "translate-x-4" : "translate-x-0")} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="font-medium text-sm">Inventory Tracking</p>
            <p className="text-xs text-gray-500">When OFF, products are a simple catalog (name + price). No stock count, barcode quantity, or "Add Stock".</p>
          </div>
          <button type="button" onClick={() => setInventoryTracking(!inventoryTracking)} className={cn("relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors", inventoryTracking ? "bg-green-500" : "bg-gray-300")}>
            <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform", inventoryTracking ? "translate-x-4" : "translate-x-0")} />
          </button>
        </div>
      </div>
    </div>
  );
}
