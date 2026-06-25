import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  CreditCard,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { LoadingSpinner, useToast } from '../../components/ui';

interface Plan {
  id: string;
  name: string;
  maxProducts: number;
  maxVendors: number;
  maxUsers: number;
  priceMonthly: number;
  priceYearly: number;
  features: {
    warranty: boolean;
    replacements: boolean;
    rewards: boolean;
    finance: boolean;
    chatbot: boolean;
    billCustomization: boolean;
    multiLanguage: boolean;
    vendorPortal: boolean;
    barcodeSystem: boolean;
  };
  tenantCount: number;
}

export function PlanManagementView() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchPlans = () => {
    const token = sessionStorage.getItem('auth_token');
    fetch('/api/super-admin/plans', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setPlans(Array.isArray(data) ? data : data.plans ?? []))
      .catch(() => toast('Failed to load plans', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlans(); }, []);

  const handleDelete = async (plan: Plan) => {
    if (plan.tenantCount > 0) {
      toast('Cannot delete plan with active tenants', 'error');
      return;
    }
    const confirmed = window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`);
    if (!confirmed) return;
    const token = sessionStorage.getItem('auth_token');
    try {
      const res = await fetch(`/api/super-admin/plans/${plan.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast('Plan deleted', 'success');
      fetchPlans();
    } catch {
      toast('Failed to delete plan', 'error');
    }
  };

  const openCreate = () => {
    setEditingPlan(null);
    setShowModal(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setShowModal(true);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plans</h1>
          <p className="text-gray-500 text-sm mt-1">Manage subscription plans and features</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F27D26] text-white rounded-xl font-medium hover:bg-[#D96A1C] transition-colors"
        >
          <Plus size={18} />
          New Plan
        </button>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.length === 0 && (
          <p className="text-gray-400 text-sm col-span-full text-center py-8">No plans configured</p>
        )}
        {plans.map((plan) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                    <CreditCard size={20} className="text-[#F27D26]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 capitalize">{plan.name}</h3>
                    <p className="text-xs text-gray-500">{plan.tenantCount} tenants</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-[#F27D26]">
                  ₹{(plan.priceMonthly ?? 0).toLocaleString()}<span className="text-xs text-gray-400 font-normal">/mo</span>
                  {plan.priceYearly > 0 && <span className="text-xs text-gray-400 font-normal ml-1">(₹{plan.priceYearly.toLocaleString()}/yr)</span>}
                </p>
              </div>

              {/* Limits */}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Max Products</span>
                  <span className="font-medium text-gray-700">{plan.maxProducts === -1 ? 'Unlimited' : plan.maxProducts}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Max Vendors</span>
                  <span className="font-medium text-gray-700">{plan.maxVendors === -1 ? 'Unlimited' : plan.maxVendors}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Max Users</span>
                  <span className="font-medium text-gray-700">{plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers}</span>
                </div>
              </div>

              {/* Features */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                {([['warranty', 'Warranty'], ['replacements', 'Replacements'], ['rewards', 'Rewards'], ['finance', 'Finance'], ['chatbot', 'Chatbot'], ['billCustomization', 'Bill Customization'], ['multiLanguage', 'Multi-Language'], ['vendorPortal', 'Vendor Portal'], ['barcodeSystem', 'Barcode System']] as const).map(([feat, label]) => (
                  <div key={feat} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    {plan.features?.[feat] ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <ToggleRight size={18} /> Enabled
                      </span>
                    ) : (
                      <span className="text-gray-400 flex items-center gap-1">
                        <ToggleLeft size={18} /> Disabled
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex border-t border-gray-100">
              <button
                onClick={() => openEdit(plan)}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Pencil size={14} /> Edit
              </button>
              <div className="w-px bg-gray-100" />
              <button
                onClick={() => handleDelete(plan)}
                disabled={plan.tenantCount > 0}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-gray-600 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Plan Modal */}
      <AnimatePresence>
        {showModal && (
          <PlanModal
            plan={editingPlan}
            onClose={() => { setShowModal(false); setEditingPlan(null); }}
            onSaved={() => {
              setShowModal(false);
              setEditingPlan(null);
              fetchPlans();
              toast(editingPlan ? 'Plan updated' : 'Plan created', 'success');
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PlanModal({ plan, onClose, onSaved }: {
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    maxProducts: plan?.maxProducts ?? 100,
    maxVendors: plan?.maxVendors ?? 10,
    maxUsers: plan?.maxUsers ?? 5,
    price: plan?.priceMonthly ?? 0,
    priceYearly: plan?.priceYearly ?? 0,
    warranty: plan?.features?.warranty ?? true,
    replacements: plan?.features?.replacements ?? true,
    rewards: plan?.features?.rewards ?? true,
    finance: plan?.features?.finance ?? false,
    chatbot: plan?.features?.chatbot ?? false,
    billCustomization: plan?.features?.billCustomization ?? true,
    multiLanguage: plan?.features?.multiLanguage ?? true,
    vendorPortal: plan?.features?.vendorPortal ?? true,
    barcodeSystem: plan?.features?.barcodeSystem ?? true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const token = sessionStorage.getItem('auth_token');
    const body = {
      name: form.name,
      maxProducts: form.maxProducts,
      maxVendors: form.maxVendors,
      maxUsers: form.maxUsers,
      priceMonthly: form.price,
      priceYearly: form.priceYearly,
      features: {
        warranty: form.warranty,
        replacements: form.replacements,
        rewards: form.rewards,
        finance: form.finance,
        chatbot: form.chatbot,
        billCustomization: form.billCustomization,
        multiLanguage: form.multiLanguage,
        vendorPortal: form.vendorPortal,
        barcodeSystem: form.barcodeSystem,
      },
    };
    try {
      const url = plan ? `/api/super-admin/plans/${plan.id}` : '/api/super-admin/plans';
      const method = plan ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save plan');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const FeatureToggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-2"
    >
      <span className="text-sm text-gray-700 capitalize">{label}</span>
      {checked ? (
        <ToggleRight size={24} className="text-[#F27D26]" />
      ) : (
        <ToggleLeft size={24} className="text-gray-300" />
      )}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{plan ? 'Edit Plan' : 'Create Plan'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Plan Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26] focus:border-transparent"
              placeholder="e.g., Professional"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Max Products</label>
              <input
                type="number"
                required
                value={form.maxProducts}
                onChange={(e) => setForm({ ...form, maxProducts: Number(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26] focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Max Vendors</label>
              <input
                type="number"
                required
                value={form.maxVendors}
                onChange={(e) => setForm({ ...form, maxVendors: Number(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26] focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Max Users</label>
              <input
                type="number"
                required
                value={form.maxUsers}
                onChange={(e) => setForm({ ...form, maxUsers: Number(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26] focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Monthly Price (₹)</label>
              <input
                type="number"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26] focus:border-transparent"
                placeholder="999"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Yearly Price (₹)</label>
              <input
                type="number"
                value={form.priceYearly}
                onChange={(e) => setForm({ ...form, priceYearly: Number(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26] focus:border-transparent"
                placeholder="9999"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Features</label>
            <div className="border border-gray-200 rounded-xl px-4 divide-y divide-gray-100">
              <FeatureToggle label="Warranty Management" checked={form.warranty} onChange={(v) => setForm({ ...form, warranty: v })} />
              <FeatureToggle label="Replacement Tracking" checked={form.replacements} onChange={(v) => setForm({ ...form, replacements: v })} />
              <FeatureToggle label="Rewards System" checked={form.rewards} onChange={(v) => setForm({ ...form, rewards: v })} />
              <FeatureToggle label="Finance Module" checked={form.finance} onChange={(v) => setForm({ ...form, finance: v })} />
              <FeatureToggle label="AI Chatbot" checked={form.chatbot} onChange={(v) => setForm({ ...form, chatbot: v })} />
              <FeatureToggle label="Bill Customization" checked={form.billCustomization} onChange={(v) => setForm({ ...form, billCustomization: v })} />
              <FeatureToggle label="Multi-Language" checked={form.multiLanguage} onChange={(v) => setForm({ ...form, multiLanguage: v })} />
              <FeatureToggle label="Vendor Portal" checked={form.vendorPortal} onChange={(v) => setForm({ ...form, vendorPortal: v })} />
              <FeatureToggle label="Barcode System" checked={form.barcodeSystem} onChange={(v) => setForm({ ...form, barcodeSystem: v })} />
            </div>
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 py-3 bg-[#F27D26] text-white rounded-xl font-bold hover:bg-[#D96A1C] transition-colors disabled:opacity-60">
              {submitting ? 'Saving...' : plan ? 'Update Plan' : 'Create Plan'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
