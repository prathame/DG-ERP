import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Plus,
  Eye,
  Pause,
  Play,
  Trash2,
  X,
  Copy,
  ChevronDown,
  Building2,
  MessageCircle,
  Mail,
} from 'lucide-react';
import { LoadingSpinner, useToast } from '../../components/ui';
import { cn } from '../../lib/utils';
import { session } from '../../lib/session';

interface Tenant {
  id: string;
  companyName: string;
  adminEmail: string;
  plan: string;
  status: string;
  users: number;
  products: number;
  sales: number;
  revenue: number;
  createdAt: string;
}

interface TenantListViewProps {
  onSelectTenant: (id: string) => void;
}

export function TenantListView({ onSelectTenant }: TenantListViewProps) {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; phone?: string; companyName?: string; slug?: string } | null>(null);
  const [deleteTenantId, setDeleteTenantId] = useState<string | null>(null);

  const fetchTenants = useCallback(() => {
    const token = session.getToken();
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    fetch(`/api/super-admin/tenants?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setTenants(Array.isArray(data) ? data : data.tenants ?? []))
      .catch(() => toast('Failed to load tenants', 'error'))
      .finally(() => setLoading(false));
  }, [search, statusFilter, toast]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleAction = async (tenantId: string, action: string, body?: Record<string, unknown>) => {
    const token = session.getToken();
    try {
      if (action === 'delete') {
        await fetch(`/api/super-admin/tenants/${tenantId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        toast('Tenant deleted', 'success');
      } else {
        await fetch(`/api/super-admin/tenants/${tenantId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        toast(`Tenant updated`, 'success');
      }
      fetchTenants();
    } catch {
      toast('Action failed', 'error');
    }
  };

  const statusBadge = (status: string) => {
    const cls = status === 'active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'trial'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-rose-50 text-rose-700 border-rose-200';
    return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${cls}`}>{status}</span>;
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-gray-500 text-sm mt-1">{tenants.length} total tenants</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl font-medium hover:bg-brand-dark transition-colors"
        >
          <Plus size={18} />
          Create Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name or email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Company</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Admin Email</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Users</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Products</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Sales</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-400">No tenants found</td>
                </tr>
              )}
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.companyName}</td>
                  <td className="px-4 py-3 text-gray-600">{t.adminEmail}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">☁ Cloud</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 capitalize">{t.planName || t.planId || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(t.status)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{t.users}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{t.products}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{t.sales}</td>
                  <td className="px-4 py-3 text-right text-gray-600">₹{(t.revenue ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onSelectTenant(t.id)}
                        title="View Details"
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                      >
                        <Eye size={16} />
                      </button>
                      {t.status === 'suspended' ? (
                        <button
                          onClick={() => handleAction(t.id, 'update', { status: 'active' })}
                          title="Activate"
                          className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors text-gray-500 hover:text-emerald-600"
                        >
                          <Play size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(t.id, 'update', { status: 'suspended' })}
                          title="Suspend"
                          className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors text-gray-500 hover:text-amber-600"
                        >
                          <Pause size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTenantId(t.id)}
                        title="Delete"
                        className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors text-gray-500 hover:text-rose-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Tenant Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateTenantModal
            onClose={() => { setShowCreateModal(false); setCreatedCredentials(null); }}
            onCreated={(creds) => {
              setCreatedCredentials(creds);
              fetchTenants();
              toast('Tenant created successfully', 'success');
            }}
            createdCredentials={createdCredentials}
          />
        )}
      </AnimatePresence>
      {deleteTenantId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTenantId(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} />
            </div>
            <h3 className="text-lg font-bold mb-2">Delete Tenant?</h3>
            <p className="text-sm text-gray-500 mb-6">This will permanently delete the tenant and all their data. This cannot be undone.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteTenantId(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm">Cancel</button>
              <button type="button" onClick={() => { const id = deleteTenantId; setDeleteTenantId(null); handleAction(id, 'delete'); }} className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

type BusinessType = 'manufacturer' | 'dealer' | 'retail' | 'service' | 'custom';

const BUSINESS_TYPE_CONFIGS: Record<Exclude<BusinessType, 'custom'>, { label: string; desc: string; tabConfig: Record<string, { label: string; visible: boolean }> }> = {
  manufacturer: {
    label: 'Manufacturer',
    desc: 'Full supply chain — dispatch to vendors, warranty, customer tracking',
    tabConfig: {
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
  },
  dealer: {
    label: 'Dealer / Wholesaler',
    desc: 'Sell to dealers/vendors — no customer tracking, no warranty',
    tabConfig: {
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
  },
  retail: {
    label: 'Retail Shop',
    desc: 'Buy stock, sell to walk-in customers — no distribution chain',
    tabConfig: {
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
  },
  service: {
    label: 'Service / Consulting',
    desc: 'No inventory — invoicing, quotes, expenses and accounts for service businesses',
    tabConfig: {
      analytics: { label: 'Analytics', visible: true },
      masters: { label: 'Masters', visible: true },
      inventory: { label: 'Inventory', visible: false },
      distribution: { label: 'Distribution', visible: false },
      sales: { label: 'Sales Entry', visible: false },
      purchases: { label: 'Expenses', visible: true },
      verification: { label: 'Search / Verify', visible: false },
      quotations: { label: 'Quotes & Orders', visible: true },
      invoices: { label: 'Invoices', visible: true },
      finance: { label: 'Payments', visible: true },
      accounts: { label: 'Accounts', visible: true },
      warranty: { label: 'Warranty', visible: false },
      replacements: { label: 'Replacements', visible: false },
      rewards: { label: 'Rewards', visible: false },
      chatbot: { label: 'Chatbot', visible: true },
      settings: { label: 'Settings', visible: true },
    },
  },
};

function CreateTenantModal({ onClose, onCreated, createdCredentials }: {
  onClose: () => void;
  onCreated: (creds: { email: string; password: string; phone?: string; companyName?: string; slug?: string }) => void;
  createdCredentials: { email: string; password: string; phone?: string; companyName?: string; slug?: string } | null;
}) {
  const [form, setForm] = useState({
    companyName: '',
    adminEmail: '',
    adminName: '',
    phone: '',
    address: '',
    gstNumber: '',
    plan: '',
    password: '',
    billingCycle: 'monthly' as 'monthly' | 'yearly',
    subscriptionStart: new Date().toISOString().split('T')[0],
    subscriptionEnd: '',
    businessType: 'manufacturer' as BusinessType,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<{ id: string; name: string; priceMonthly: number; priceYearly: number }[]>([]);

  const calcEndDate = (start: string, plan: string, cycle: 'monthly' | 'yearly') => {
    if (plan === 'TRIAL') {
      const d = new Date(start); d.setDate(d.getDate() + 14); return d.toISOString().split('T')[0];
    }
    const d = new Date(start);
    if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  };

  const updatePlanAndDate = (plan: string, cycle?: 'monthly' | 'yearly') => {
    const c = cycle || form.billingCycle;
    setForm((f) => ({ ...f, plan, billingCycle: c, subscriptionEnd: calcEndDate(f.subscriptionStart, plan, c) }));
  };

  React.useEffect(() => {
    const token = session.getToken();
    fetch('/api/super-admin/plans', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.plans ?? [];
        setPlans(list.map((p: Record<string, unknown>) => ({ id: p.id as string, name: p.name as string, priceMonthly: Number(p.priceMonthly ?? 0), priceYearly: Number(p.priceYearly ?? 0) })));
        if (list.length > 0 && !form.plan) {
          const firstId = list[0].id as string;
          setForm((f) => ({ ...f, plan: firstId, subscriptionEnd: calcEndDate(f.subscriptionStart, firstId, f.billingCycle) }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const token = session.getToken();
      const res = await fetch('/api/super-admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, tabConfig: form.businessType !== 'custom' ? BUSINESS_TYPE_CONFIGS[form.businessType].tabConfig : undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create tenant');
      }
      const data = await res.json();
      const resolvedPassword = data.password || data.credentials?.password || form.password || `${form.companyName.replace(/\s+/g, '').toLowerCase().slice(0, 12)}@123`;
      onCreated({ email: data.adminEmail ?? form.adminEmail, password: resolvedPassword, phone: form.phone || undefined, companyName: form.companyName, slug: data.slug || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !form.companyName && !form.adminEmail && !form.adminName) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <Building2 size={20} className="text-brand" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {createdCredentials ? 'Tenant Created' : 'Create Cloud Tenant'}
              </h2>
              {!createdCredentials && (
                <p className="text-xs text-blue-600 font-medium mt-0.5">☁ Cloud — browser access, you host everything. For on-prem → use On-Prem tab</p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {createdCredentials ? (
          <div className="p-6 space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-medium text-emerald-800 mb-2">Tenant created successfully!</p>
              <p className="text-xs text-emerald-600">Share these credentials with the tenant admin:</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900">{createdCredentials.email}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(createdCredentials.email)}
                  className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Copy size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                <div>
                  <p className="text-xs text-gray-500">Password</p>
                  <p className="text-sm font-medium text-gray-900">{createdCredentials.password}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(createdCredentials.password)}
                  className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Copy size={14} />
                </button>
              </div>
              {createdCredentials.slug && (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div>
                    <p className="text-xs text-gray-500">Login URL</p>
                    <p className="text-sm font-medium text-gray-900">{window.location.origin}/{createdCredentials.slug}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/${createdCredentials.slug}`)}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const loginUrl = createdCredentials.slug ? `${window.location.origin}/${createdCredentials.slug}` : window.location.origin;
                  const msg = `Welcome to ${createdCredentials.companyName || 'DG ERP'}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\n\nPlease change your password after first login.`;
                  const phone = (createdCredentials.phone || '').replace(/[^0-9]/g, '');
                  window.open(`https://wa.me/${phone ? (phone.startsWith('91') ? phone : '91' + phone) : ''}?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-colors"
              >
                <MessageCircle size={16} /> WhatsApp
              </button>
              <button
                onClick={() => {
                  const loginUrl = createdCredentials.slug ? `${window.location.origin}/${createdCredentials.slug}` : window.location.origin;
                  const subject = `Your ${createdCredentials.companyName || 'DG ERP'} Login Credentials`;
                  const body = `Welcome to ${createdCredentials.companyName || 'DG ERP'}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\n\nPlease change your password after first login.\n\nRegards,\nDG ERP Management`;
                  window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(createdCredentials.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
              >
                <Mail size={16} /> Email
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Company Name</label>
              <input
                required
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Admin Name</label>
              <input
                required
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Admin Email</label>
              <input
                type="email"
                required
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="admin@company.com"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="+91 XXXXX XXXXX"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="Street, City, State — PIN"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">GSTIN</label>
              <input
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                maxLength={15}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent font-mono"
                placeholder="24AABCT1332L1ZS"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Plan</label>
              <select
                value={form.plan}
                onChange={(e) => updatePlanAndDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.priceMonthly > 0 ? ` — ₹${p.priceMonthly.toLocaleString()}/mo` : ' (Free)'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Business Type</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'manufacturer' as const, icon: '🏭' },
                  { id: 'dealer' as const, icon: '🤝' },
                  { id: 'retail' as const, icon: '🏪' },
                  { id: 'service' as const, icon: '🔧' },
                  { id: 'custom' as const, icon: '⚙️' },
                ] as const).map((bt) => {
                  const config = bt.id !== 'custom' ? BUSINESS_TYPE_CONFIGS[bt.id] : null;
                  return (
                    <button
                      key={bt.id}
                      type="button"
                      onClick={() => setForm({ ...form, businessType: bt.id })}
                      className={cn(
                        "p-3 rounded-xl border-2 text-left transition-all",
                        form.businessType === bt.id ? "border-brand bg-orange-50" : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <p className="text-sm font-bold">{bt.icon} {config?.label ?? 'Custom'}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{config?.desc ?? 'Configure tabs manually after creation'}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            {form.plan !== 'TRIAL' && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Billing Cycle</label>
                <div className="flex gap-2">
                  {(['monthly', 'yearly'] as const).map((c) => {
                    const selectedPlan = plans.find((p) => p.id === form.plan);
                    const price = c === 'monthly' ? selectedPlan?.priceMonthly : selectedPlan?.priceYearly;
                    return (
                      <button key={c} type="button" onClick={() => updatePlanAndDate(form.plan, c)}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${form.billingCycle === c ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-600 hover:border-brand'}`}>
                        {c === 'monthly' ? 'Monthly' : 'Yearly'}{price ? ` — ₹${price.toLocaleString()}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Password (Optional)</label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent font-mono"
                placeholder={form.companyName ? `${form.companyName.replace(/\s+/g, '').toLowerCase().slice(0, 12)}@123` : 'Auto-generated if blank'}
              />
              <p className="text-[10px] text-gray-400 mt-1">Leave blank to auto-generate: {form.companyName ? `${form.companyName.replace(/\s+/g, '').toLowerCase().slice(0, 12)}@123` : 'companyname@123'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Start Date</label>
                <input type="date" value={form.subscriptionStart} onChange={(e) => { setForm({ ...form, subscriptionStart: e.target.value, subscriptionEnd: calcEndDate(e.target.value, form.plan, form.billingCycle) }); }} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">End Date (auto)</label>
                <input type="date" value={form.subscriptionEnd} readOnly className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-600" />
                <p className="text-[10px] text-gray-400 mt-1">{form.plan === 'TRIAL' ? '14 days trial' : form.billingCycle === 'yearly' ? '1 year from start' : '1 month from start'}</p>
              </div>
            </div>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="flex-1 py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark transition-colors disabled:opacity-60">
                {submitting ? 'Creating...' : 'Create Tenant'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
