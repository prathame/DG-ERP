/**
 * SA panel: Service Mobile offline phone licenses (separate from on-prem desktop).
 * 1 license = 1 user = 1 device; business type fixed to service.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Smartphone,
  Plus,
  X,
  Copy,
  Check,
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Bell,
  Unlink,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToast } from '../../components/ui';

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
  isOnline: boolean;
  createdAt: string;
  settingsPushedAt: string | null;
  settingsAppliedAt: string | null;
  latestBackupAt: string | null;
  settings?: Record<string, unknown>;
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

export function ServiceMobileView({ saToken }: { saToken: string }) {
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<License | null>(null);
  const [copied, setCopied] = useState('');
  const [notifyForm, setNotifyForm] = useState({ title: '', message: '', type: 'info' });
  const [sendingNotify, setSendingNotify] = useState(false);
  const [form, setForm] = useState({ companyName: '', adminEmail: '', validUntil: '' });

  const h = { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' };

  const load = (silent = false): Promise<License[]> => {
    if (!silent) setLoading(true);
    return fetch('/api/super-admin/service-mobile', { headers: h })
      .then(r => r.json())
      .then((rows: License[]) => {
        setLicenses(Array.isArray(rows) ? rows : []);
        return Array.isArray(rows) ? rows : [];
      })
      .catch(() => {
        toast('Failed to load service mobile licenses', 'error');
        return [] as License[];
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  };

  const issue = async () => {
    if (!form.companyName.trim()) {
      toast('Company name required', 'error');
      return;
    }
    const r = await fetch('/api/super-admin/service-mobile', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        companyName: form.companyName.trim(),
        adminEmail: form.adminEmail || null,
        validUntil: form.validUntil || null,
      }),
    });
    const data = (await r.json()) as { error?: string; licenseKey?: string };
    if (!r.ok) {
      toast(data.error || 'Failed to issue license', 'error');
      return;
    }
    toast('Service mobile license issued', 'success');
    setShowNew(false);
    setForm({ companyName: '', adminEmail: '', validUntil: '' });
    const rows = await load(true);
    const created = rows.find(l => l.licenseKey === data.licenseKey);
    if (created) setSelected(created);
  };

  const setStatus = async (id: string, status: string) => {
    const r = await fetch(`/api/super-admin/service-mobile/${id}`, {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      toast('Update failed', 'error');
      return;
    }
    toast(status === 'active' ? 'License activated' : 'License suspended', 'success');
    const rows = await load(true);
    if (selected?.id === id) setSelected(rows.find(l => l.id === id) || null);
  };

  const unbind = async (id: string) => {
    if (!confirm('Unbind this phone? Staff can activate the same key on a new device and restore backup.')) {
      return;
    }
    const r = await fetch(`/api/super-admin/service-mobile/${id}/unbind`, {
      method: 'POST',
      headers: h,
    });
    if (!r.ok) {
      toast('Unbind failed', 'error');
      return;
    }
    toast('Device unbound', 'success');
    const rows = await load(true);
    if (selected?.id === id) setSelected(rows.find(l => l.id === id) || null);
  };

  const forceSync = async (id: string) => {
    const r = await fetch(`/api/super-admin/service-mobile/${id}/force-sync`, {
      method: 'POST',
      headers: h,
    });
    if (!r.ok) {
      toast('Force sync failed', 'error');
      return;
    }
    toast('Force sync stamped — device will reload on next heartbeat', 'success');
    const rows = await load(true);
    if (selected?.id === id) setSelected(rows.find(l => l.id === id) || null);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this license permanently? Backups will be removed.')) return;
    await fetch(`/api/super-admin/service-mobile/${id}`, { method: 'DELETE', headers: h });
    toast('License deleted', 'success');
    setSelected(null);
    await load(true);
  };

  const sendNotify = async () => {
    if (!selected) return;
    if (!notifyForm.title.trim() || !notifyForm.message.trim()) {
      toast('Title and message required', 'error');
      return;
    }
    setSendingNotify(true);
    try {
      const res = await fetch(`/api/super-admin/service-mobile/${selected.id}/notify`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(notifyForm),
      });
      if (!res.ok) {
        toast('Notify failed', 'error');
        return;
      }
      toast('Notification queued for next heartbeat', 'success');
      setNotifyForm({ title: '', message: '', type: 'info' });
    } finally {
      setSendingNotify(false);
    }
  };

  if (selected) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-sm font-medium text-gray-500 hover:text-gray-800"
          >
            ← Back to list
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Smartphone size={20} className="text-emerald-600" />
                {selected.companyName}
              </h2>
              <p className="text-xs text-gray-500 mt-1">Service mobile · 1 user · 1 device</p>
            </div>
            <span
              className={cn(
                'text-xs font-bold px-2.5 py-1 rounded-full',
                selected.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
            >
              {selected.status}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <code className="text-xs font-mono flex-1 break-all">{selected.licenseKey}</code>
            <button
              type="button"
              onClick={() => copy(selected.licenseKey, selected.id)}
              className="p-1.5 rounded-lg hover:bg-white text-gray-500"
            >
              {copied === selected.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Device</p>
              <p className="font-medium flex items-center gap-1.5">
                {selected.isOnline ? (
                  <Wifi size={14} className="text-emerald-500" />
                ) : (
                  <WifiOff size={14} className="text-gray-300" />
                )}
                {selected.machineId ? selected.machineOs || 'Bound' : 'Not activated'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Last seen</p>
              <p className="font-medium">{timeAgo(selected.lastSeen)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">App version</p>
              <p className="font-medium">{selected.appVersion || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Latest backup</p>
              <p className="font-medium">{timeAgo(selected.latestBackupAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Valid until</p>
              <p className="font-medium">{selected.validUntil || 'No expiry'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Admin email</p>
              <p className="font-medium truncate">{selected.adminEmail || '—'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {selected.machineId && (
              <button
                type="button"
                onClick={() => void unbind(selected.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                <Unlink size={14} /> Unbind device
              </button>
            )}
            <button
              type="button"
              onClick={() => void forceSync(selected.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              <Zap size={14} /> Force sync
            </button>
            {selected.status === 'active' ? (
              <button
                type="button"
                onClick={() => void setStatus(selected.id, 'suspended')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <AlertTriangle size={14} /> Suspend
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setStatus(selected.id, 'active')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                Reactivate
              </button>
            )}
            <button
              type="button"
              onClick={() => void remove(selected.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Bell size={16} /> Notify phone
          </h3>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Title"
            value={notifyForm.title}
            onChange={e => setNotifyForm(f => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm min-h-[80px]"
            placeholder="Message"
            value={notifyForm.message}
            onChange={e => setNotifyForm(f => ({ ...f, message: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <select
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={notifyForm.type}
              onChange={e => setNotifyForm(f => ({ ...f, type: e.target.value }))}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </select>
            <button
              type="button"
              disabled={sendingNotify}
              onClick={() => void sendNotify()}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-brand text-white disabled:opacity-50"
            >
              Queue notification
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Smartphone size={20} className="text-emerald-600" /> Service Mobile
          </h2>
          <p className="text-sm text-gray-500">Offline phone licenses (service only). Separate from desktop on-prem.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-brand text-white"
          >
            <Plus size={16} /> Issue license
          </button>
        </div>
      </div>

      {showNew && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">New service mobile license</h3>
            <button type="button" onClick={() => setShowNew(false)} className="p-1 text-gray-400">
              <X size={18} />
            </button>
          </div>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Company name"
            value={form.companyName}
            onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
          />
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Admin email (optional)"
            value={form.adminEmail}
            onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
          />
          <input
            type="date"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.validUntil}
            onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
          />
          <p className="text-xs text-gray-400">Business type is always Service · max 1 user / 1 device</p>
          <button
            type="button"
            onClick={() => void issue()}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-brand text-white"
          >
            Create key
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : licenses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Smartphone size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No service mobile licenses yet</p>
          <p className="text-sm mt-1">Issue a DG-SM key, share it with staff, they activate on the phone app.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 font-medium">Backup</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map(lic => (
                <tr
                  key={lic.id}
                  onClick={() => setSelected(lic)}
                  className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{lic.companyName}</p>
                    <p className="text-xs font-mono text-gray-400 truncate max-w-[200px]">{lic.licenseKey}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        lic.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                      )}
                    >
                      {lic.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      {lic.isOnline ? (
                        <Wifi size={14} className="text-emerald-500" />
                      ) : (
                        <WifiOff size={14} className="text-gray-300" />
                      )}
                      {lic.machineId ? 'Bound' : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{timeAgo(lic.lastSeen)}</td>
                  <td className="px-4 py-3 text-gray-500">{timeAgo(lic.latestBackupAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
