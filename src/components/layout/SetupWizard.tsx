import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, MapPin, FileText, Package, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';

const BUSINESS_TYPES = [
  { value: 'manufacturer', label: 'Manufacturer', desc: 'You make products and distribute to dealers/wholesalers' },
  { value: 'dealer', label: 'Dealer / Wholesaler', desc: 'You buy from manufacturers and sell to retailers' },
  { value: 'retail', label: 'Retail Shop', desc: 'You sell directly to end customers' },
];

const INDUSTRIES = [
  'Agriculture & Agro Chemicals', 'Auto Parts', 'Building Materials', 'Chemicals',
  'Electronics', 'FMCG / Consumer Goods', 'Food & Beverages', 'Furniture',
  'Garments & Textiles', 'Hardware & Tools', 'Medical & Pharma', 'Pumps & Motors',
  'Stationery', 'Other',
];

type Props = {
  user: { id: string; name: string; companyName?: string };
  onComplete: () => void;
};

export function SetupWizard({ user, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    companyName: user.companyName || '',
    address: '',
    phone: '',
    gstNumber: '',
    businessType: 'manufacturer',
    industry: '',
  });
  const [saving, setSaving] = useState(false);

  const steps = [
    { icon: Building2, label: 'Business' },
    { icon: MapPin, label: 'Details' },
    { icon: FileText, label: 'GST' },
    { icon: Package, label: 'Type' },
  ];

  const canNext = step === 0 ? !!form.companyName.trim()
    : step === 1 ? true
    : step === 2 ? true
    : !!form.businessType;

  const handleFinish = async () => {
    setSaving(true);
    try {
      await api.settings.updateProfile(user.id, {
        name: user.name,
        companyName: form.companyName,
        address: form.address,
        phone: form.phone,
        gstNumber: form.gstNumber || undefined,
      });
      // ponytail: businessType update via separate settings endpoint if exists
      try {
        await fetch('/api/settings/tenant', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await import('../../lib/session')).session.getToken()}`, 'X-Tenant-ID': (await import('../../lib/session')).session.getTenantId() || '' },
          body: JSON.stringify({ businessType: form.businessType }),
        });
      } catch {}
      onComplete();
    } catch {
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={20} className="text-brand" />
            <h1 className="text-lg font-bold text-gray-900">Welcome to DG ERP</h1>
          </div>
          <p className="text-sm text-gray-500">Let's set up your business in 4 quick steps</p>
        </div>

        {/* Step indicators */}
        <div className="px-6 flex items-center gap-1 mb-6">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 flex items-center gap-1">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0",
                i < step ? "bg-emerald-500 text-white" :
                i === step ? "bg-brand text-white" : "bg-gray-100 text-gray-400"
              )}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={cn("flex-1 h-0.5 rounded-full", i < step ? "bg-emerald-300" : "bg-gray-100")} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 pb-6 min-h-[200px]">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }}>
              {step === 0 && (
                <div className="space-y-4">
                  <h2 className="font-semibold text-gray-900">What's your business name?</h2>
                  <input
                    autoFocus
                    value={form.companyName}
                    onChange={e => setForm({ ...form, companyName: e.target.value })}
                    placeholder="e.g. Patel Agro Industries"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                  />
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Industry (optional)</label>
                    <select value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand">
                      <option value="">Select industry...</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="font-semibold text-gray-900">Business details</h2>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Address</label>
                    <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, City, State — PIN" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
                    <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h2 className="font-semibold text-gray-900">GST Registration</h2>
                  <p className="text-xs text-gray-400">Optional — you can add this later in Settings</p>
                  <input value={form.gstNumber} onChange={e => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })} placeholder="e.g. 24AABCT1332L1ZS" maxLength={15} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand font-mono tracking-wider" />
                  {form.gstNumber.length > 0 && form.gstNumber.length !== 15 && (
                    <p className="text-[11px] text-amber-600">GSTIN must be 15 characters</p>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-gray-900">What type of business?</h2>
                  {BUSINESS_TYPES.map(bt => (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => setForm({ ...form, businessType: bt.value })}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border-2 transition-all",
                        form.businessType === bt.value
                          ? "border-brand bg-brand/5"
                          : "border-gray-100 hover:border-gray-200"
                      )}
                    >
                      <p className={cn("font-semibold text-sm", form.businessType === bt.value ? "text-brand" : "text-gray-900")}>{bt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{bt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer buttons */}
        <div className="px-6 pb-6 flex items-center justify-between">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <button type="button" onClick={onComplete} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Skip setup</button>
          )}
          {step < 3 ? (
            <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext} className="flex items-center gap-1 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors hover:bg-brand-dark">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={handleFinish} disabled={saving} className="flex items-center gap-1 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors hover:bg-brand-dark">
              {saving ? 'Setting up...' : 'Finish Setup'} <Check size={16} />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
