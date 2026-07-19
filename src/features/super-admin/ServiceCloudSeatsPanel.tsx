import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Monitor, Plus, Unlink, RefreshCw, KeyRound, Bell, Copy, Check } from 'lucide-react';
import { session } from '../../lib/session';
import { useToast } from '../../components/ui';
import { cn } from '../../lib/utils';

type AccessMode = 'mobile' | 'desktop' | 'both';

type DeviceSlot = {
  id: string;
  userId: string;
  deviceKind: 'mobile' | 'desktop';
  machineId: string | null;
  label: string | null;
  boundAt: string | null;
  lastSeen: string | null;
};

type SeatUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  mobileSlots: number;
  desktopSlots: number;
  devices: DeviceSlot[];
};

type SeatsPayload = {
  clientAccessMode: AccessMode | null;
  activeSession: {
    userId: string;
    userName: string;
    client: string;
    expiresAt: string;
  } | null;
  users: SeatUser[];
};

type ResetModal = {
  resetLink: string;
  expiresAt: string;
  userName: string;
  email: string;
};

interface Props {
  tenantId: string;
}

export function ServiceCloudSeatsPanel({ tenantId }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<SeatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    mobileSlots: 1,
    desktopSlots: 1,
  });
  const [editSlots, setEditSlots] = useState<Record<string, { mobile: number; desktop: number }>>({});
  const [resetModal, setResetModal] = useState<ResetModal | null>(null);
  const [copied, setCopied] = useState(false);
  const [notifyUser, setNotifyUser] = useState<SeatUser | null>(null);
  const [notifyForm, setNotifyForm] = useState({ title: '', message: '' });

  const token = () => session.getToken();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/super-admin/tenants/${tenantId}/service-cloud`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load');
        return r.json();
      })
      .then((payload: SeatsPayload) => {
        setData(payload);
        const next: Record<string, { mobile: number; desktop: number }> = {};
        for (const u of payload.users) {
          next[u.id] = { mobile: u.mobileSlots, desktop: u.desktopSlots };
        }
        setEditSlots(next);
      })
      .catch(err => toast((err as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, [tenantId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setMode = async (mode: AccessMode) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/service-cloud/access-mode`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ clientAccessMode: mode }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Access mode updated', 'success');
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/service-cloud/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('User created with device slots', 'success');
      setShowAdd(false);
      setForm({ name: '', email: '', password: '', mobileSlots: 1, desktopSlots: 1 });
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveSlots = async (userId: string) => {
    const slots = editSlots[userId];
    if (!slots) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/service-cloud/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ mobileSlots: slots.mobile, desktopSlots: slots.desktop }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Device slots updated', 'success');
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const unbind = async (slotId: string) => {
    if (!confirm('Unbind this device? The user can claim a new device on next login.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/service-cloud/slots/${slotId}/unbind`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Device unbound', 'success');
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const shareReset = async (u: SeatUser) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/reset-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ email: u.email }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const body = (await res.json()) as ResetModal;
      setResetModal(body);
      setCopied(false);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          title: notifyForm.title,
          message: notifyForm.message,
          userId: notifyUser.id,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast(`Notification sent to ${notifyUser.name}`, 'success');
      setNotifyUser(null);
      setNotifyForm({ title: '', message: '' });
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <p className="text-sm text-gray-500">Loading service cloud seats…</p>
      </div>
    );
  }

  const mode = data?.clientAccessMode;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Service cloud seats</h2>
          <p className="text-sm text-gray-500 mt-1">
            Online-only. Manage each user (Mobile phone + Laptop/Desktop slots). One live session company-wide; 5‑minute
            idle release. Not Offline Mobile.
          </p>
        </div>
        <button type="button" onClick={load} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500" title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Client access mode</p>
          <div className="flex flex-wrap gap-2">
            {(['mobile', 'desktop', 'both'] as AccessMode[]).map(m => (
              <button
                key={m}
                type="button"
                disabled={saving}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  mode === m
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-brand/40'
                }`}
              >
                {m === 'both' ? 'Mobile + Laptop' : m === 'mobile' ? 'Mobile only' : 'Laptop only'}
              </button>
            ))}
          </div>
          {!mode && (
            <p className="text-xs text-amber-600 mt-2">
              Not set — clients cannot claim devices until you choose a mode.
            </p>
          )}
        </div>

        {data?.activeSession && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
            Live session: <strong>{data.activeSession.userName}</strong> on {data.activeSession.client}
            <span className="text-amber-600"> · expires {new Date(data.activeSession.expiresAt).toLocaleString()}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase">Users (password, devices, notify)</p>
          <button
            type="button"
            onClick={() => setShowAdd(v => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 text-brand text-sm font-semibold"
          >
            <Plus size={14} /> Add user
          </button>
        </div>

        {showAdd && (
          <form
            onSubmit={addUser}
            className="grid sm:grid-cols-2 gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100"
          >
            <input
              required
              placeholder="Name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
            <input
              required
              type="password"
              minLength={8}
              placeholder="Password (min 8)"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
            <div className="flex gap-3">
              <label className="flex-1 text-xs text-gray-500">
                Mobile (phone app)
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={form.mobileSlots}
                  onChange={e => setForm(f => ({ ...f, mobileSlots: Number(e.target.value) }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
              </label>
              <label className="flex-1 text-xs text-gray-500">
                Laptop / Desktop
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={form.desktopSlots}
                  onChange={e => setForm(f => ({ ...f, desktopSlots: Number(e.target.value) }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
              </label>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-2 text-sm text-gray-600">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {(data?.users ?? []).map(u => {
            const slots = editSlots[u.id] || { mobile: u.mobileSlots, desktop: u.desktopSlots };
            const dirty = slots.mobile !== u.mobileSlots || slots.desktop !== u.desktopSlots;
            const isLive = data?.activeSession?.userId === u.id;
            return (
              <div key={u.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      {u.name}
                      {isLive && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          Live
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {u.email} · {u.role}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void shareReset(u)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-100"
                    >
                      <KeyRound size={12} /> Share reset link
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setNotifyUser(u);
                        setNotifyForm({ title: '', message: '' });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-100"
                    >
                      <Bell size={12} /> Notify
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Smartphone size={12} /> Mobile
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={slots.mobile}
                      onChange={e =>
                        setEditSlots(s => ({
                          ...s,
                          [u.id]: { ...slots, mobile: Number(e.target.value) },
                        }))
                      }
                      className="mt-1 w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Monitor size={12} /> Laptop / Desktop
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={slots.desktop}
                      onChange={e =>
                        setEditSlots(s => ({
                          ...s,
                          [u.id]: { ...slots, desktop: Number(e.target.value) },
                        }))
                      }
                      className="mt-1 w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                    />
                  </label>
                  {dirty && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveSlots(u.id)}
                      className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Save slots
                    </button>
                  )}
                </div>

                {u.devices.length === 0 ? (
                  <p className="text-xs text-gray-400">No device slots yet — set counts above and save.</p>
                ) : (
                  <ul className="space-y-2">
                    {u.devices.map(d => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-gray-700">
                            {d.deviceKind === 'mobile' ? 'Mobile' : 'Laptop / Desktop'}
                          </span>
                          {d.machineId ? (
                            <span className="ml-2 font-mono text-gray-500 truncate">
                              {d.label || `${d.machineId.slice(0, 12)}…`}
                            </span>
                          ) : (
                            <span className="ml-2 text-gray-400">Unbound</span>
                          )}
                        </div>
                        {d.machineId && (
                          <button
                            type="button"
                            onClick={() => unbind(d.id)}
                            className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-semibold shrink-0"
                          >
                            <Unlink size={12} /> Unbind
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {resetModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setResetModal(null)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <div className="w-14 h-14 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound size={28} />
            </div>
            <h3 className="text-lg font-bold text-center mb-1">Share password reset</h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              For {resetModal.userName} ({resetModal.email}) — works on Mobile or Laptop after they set a new password.
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Reset link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={resetModal.resetLink}
                  className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-mono select-all"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(resetModal.resetLink);
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
              <p className="text-xs text-gray-400 mt-2">Expires: {new Date(resetModal.expiresAt).toLocaleString()}</p>
            </div>
            <button
              type="button"
              onClick={() => setResetModal(null)}
              className="w-full py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {notifyUser && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNotifyUser(null)} />
          <form
            onSubmit={e => void sendNotify(e)}
            className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6 space-y-3"
          >
            <h3 className="text-lg font-bold">Notify {notifyUser.name}</h3>
            <p className="text-xs text-gray-500">In-app message for this user only (Bell feed).</p>
            <input
              required
              placeholder="Title"
              value={notifyForm.title}
              onChange={e => setNotifyForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
            <textarea
              required
              rows={3}
              placeholder="Message"
              value={notifyForm.message}
              onChange={e => setNotifyForm(f => ({ ...f, message: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setNotifyUser(null)} className="px-3 py-2 text-sm text-gray-600">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
