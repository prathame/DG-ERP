import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Monitor, Plus, X, Copy, Check, Wifi, WifiOff, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToast } from '../../components/ui';

const BUSINESS_TYPES = ['manufacturer','dealer','retail','service'] as const;

interface License {
  id: string;
  licenseKey: string;
  companyName: string;
  businessType: string;
  adminEmail: string | null;
  maxUsers: number;
  validUntil: string | null;
  status: string;
  machineId: string | null;
  machineOs: string | null;
  appVersion: string | null;
  lastSeen: string | null;
  activeUsers: number;
  diskMB: number;
  isOnline: boolean;
  createdAt: string;
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function OnPremView({ saToken }: { saToken: string }) {
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<License | null>(null);
  const [copied, setCopied] = useState('');

  const [form, setForm] = useState({
    companyName: '', businessType: 'manufacturer' as typeof BUSINESS_TYPES[number],
    adminEmail: '', maxUsers: 5, validUntil: '',
  });

  const h = { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' };

  const load = () => {
    setLoading(true);
    fetch('/api/super-admin/onprem', { headers: h })
      .then(r => r.json()).then(setLicenses).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleCreate = async () => {
    if (!form.companyName) { toast('Company name required', 'error'); return; }
    const r = await fetch('/api/super-admin/onprem', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        companyName: form.companyName,
        businessType: form.businessType,
        adminEmail: form.adminEmail || undefined,
        maxUsers: form.maxUsers,
        validUntil: form.validUntil || undefined,
      }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Failed', 'error'); return; }
    toast('License created', 'success');
    setShowNew(false);
    setForm({ companyName: '', businessType: 'manufacturer', adminEmail: '', maxUsers: 5, validUntil: '' });
    load();
    // Show the new license details
    setSelected({ ...d, isOnline: false, lastSeen: null, machineId: null, machineOs: null, appVersion: null, activeUsers: 0, diskMB: 0, createdAt: new Date().toISOString(), status: 'active' });
  };

  const handleUpdate = async (id: string, patch: Record<string, unknown>) => {
    const r = await fetch(`/api/super-admin/onprem/${id}`, {
      method: 'PUT', headers: h, body: JSON.stringify(patch),
    });
    if (!r.ok) { toast('Update failed', 'error'); return; }
    toast('Updated', 'success');
    load();
    setSelected(prev => prev ? { ...prev, ...patch } : prev);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this license? The installation will stop working.')) return;
    await fetch(`/api/super-admin/onprem/${id}`, { method: 'DELETE', headers: h });
    toast('License deleted', 'success');
    setSelected(null);
    load();
  };

  const whatsappMsg = (lic: License) =>
    encodeURIComponent(`🖥️ *DG ERP — On-Prem License*\n\nCompany: ${lic.companyName}\nLicense Key: \`${lic.licenseKey}\`\n\n📥 Download: https://dg-erp.in/download\n\n1. Install DG ERP\n2. Enter your license key\n3. Set your admin password\n\nValid till: ${lic.validUntil || 'Lifetime'}`);

  if (selected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Monitor size={20} /> {selected.companyName}
            </h2>
            <p className="text-sm text-gray-500 font-mono">{selected.licenseKey}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={cn("flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full", selected.isOnline ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")}>
              {selected.isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {selected.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Status', value: selected.status, color: selected.status === 'active' ? 'text-emerald-600' : 'text-rose-600' },
            { label: 'App Version', value: selected.appVersion || '—' },
            { label: 'Last Seen', value: timeAgo(selected.lastSeen) },
            { label: 'Active Users', value: String(selected.activeUsers || 0) },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase font-bold">{c.label}</p>
              <p className={cn("text-lg font-bold mt-1", c.color || '')}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* License key + share */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-4">License Key</h3>
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 font-mono text-lg">
            <span className="flex-1">{selected.licenseKey}</span>
            <button onClick={() => copyKey(selected.licenseKey)} className="text-brand hover:text-orange-600">
              {copied === selected.licenseKey ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <a href={`https://wa.me/?text=${whatsappMsg(selected)}`} target="_blank" rel="noopener noreferrer"
              className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold text-center hover:bg-emerald-700">
              Share via WhatsApp
            </a>
          </div>
        </div>

        {/* Machine info */}
        {selected.machineId && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold mb-3">Machine</h3>
            <p className="text-sm text-gray-600">OS: {selected.machineOs || '—'}</p>
            <p className="text-sm text-gray-400 font-mono mt-1 truncate">{selected.machineId}</p>
            <button onClick={() => handleUpdate(selected.id, { clearMachine: true })}
              className="mt-3 text-sm text-brand font-bold hover:underline">
              Transfer License (clear machine binding)
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="font-bold mb-1">Actions</h3>
          {selected.status === 'active'
            ? <button onClick={() => handleUpdate(selected.id, { status: 'suspended' })}
                className="w-full py-2 border border-amber-300 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-50">
                Suspend License
              </button>
            : <button onClick={() => handleUpdate(selected.id, { status: 'active' })}
                className="w-full py-2 border border-emerald-300 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-50">
                Reactivate License
              </button>
          }
          <button onClick={() => handleDelete(selected.id)}
            className="w-full py-2 border border-rose-300 text-rose-700 rounded-xl text-sm font-bold hover:bg-rose-50 flex items-center justify-center gap-2">
            <Trash2 size={14} /> Delete License
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Monitor size={20} /> On-Prem Installations</h2>
          <p className="text-sm text-gray-500">{licenses.length} license{licenses.length !== 1 ? 's' : ''} issued</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-lg"><RefreshCw size={18} /></button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold">
            <Plus size={16} /> Issue License
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: licenses.length },
          { label: 'Online Now', value: licenses.filter(l => l.isOnline).length, color: 'text-emerald-600' },
          { label: 'Active', value: licenses.filter(l => l.status === 'active').length },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-gray-400 uppercase mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* License list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : licenses.length === 0 ? (
          <div className="py-12 text-center">
            <Monitor size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No on-prem licenses yet</p>
            <p className="text-gray-400 text-sm mt-1">Issue a license to a customer to get started</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">Company</th>
              <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">License Key</th>
              <th className="px-5 py-3 text-center text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="px-5 py-3 text-center text-xs font-bold text-gray-400 uppercase">Version</th>
              <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">Last Seen</th>
              <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">Valid Until</th>
              <th className="px-5 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {licenses.map(lic => (
                <tr key={lic.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(lic)}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{lic.companyName}</p>
                    <p className="text-xs text-gray-400 capitalize">{lic.businessType}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{lic.licenseKey}</span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={cn("flex items-center justify-center gap-1 text-xs font-bold",
                      lic.isOnline ? "text-emerald-600" : "text-gray-400")}>
                      {lic.isOnline ? <><Wifi size={12} /> Online</> : <><WifiOff size={12} /> Offline</>}
                    </span>
                    {lic.status !== 'active' && (
                      <span className="text-xs text-rose-600 flex items-center justify-center gap-1 mt-0.5">
                        <AlertTriangle size={10} /> {lic.status}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center text-gray-500">{lic.appVersion || '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{timeAgo(lic.lastSeen)}</td>
                  <td className="px-5 py-3 text-gray-500">{lic.validUntil ? new Date(lic.validUntil).toLocaleDateString('en-IN') : 'Lifetime'}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={e => { e.stopPropagation(); copyKey(lic.licenseKey); }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-brand">
                      {copied === lic.licenseKey ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New license modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNew(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Issue On-Prem License</h3>
              <button onClick={() => setShowNew(false)}><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Company Name *</label>
                <input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand text-sm" placeholder="Shah Seeds Pvt Ltd" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Business Type</label>
                <select value={form.businessType} onChange={e => setForm(f => ({ ...f, businessType: e.target.value as typeof BUSINESS_TYPES[number] }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand text-sm bg-white">
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Admin Email</label>
                <input value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand text-sm" placeholder="admin@shahseeds.com (optional)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Max Users</label>
                  <select value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: Number(e.target.value) }))}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand text-sm bg-white">
                    {[1,3,5,10,25,0].map(n => <option key={n} value={n}>{n === 0 ? 'Unlimited' : n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Valid Until</label>
                  <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowNew(false)} className="flex-1 py-2 border rounded-lg font-medium text-sm">Cancel</button>
                <button onClick={handleCreate} className="flex-1 py-2 bg-brand text-white rounded-lg font-bold text-sm">Generate License</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
