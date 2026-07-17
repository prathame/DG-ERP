import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Monitor, Plus, Unlink, RefreshCw } from 'lucide-react';
import { session } from '../../lib/session';
import { useToast } from '../../components/ui';

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
            Online-only mobile/desktop access. One live session company-wide; 5‑minute idle release.
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
                {m === 'both' ? 'Mobile + Desktop' : m === 'mobile' ? 'Mobile only' : 'Desktop only'}
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
          <p className="text-xs font-bold text-gray-500 uppercase">Users & device slots</p>
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
                Mobile slots
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
                Desktop slots
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
            return (
              <div key={u.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">
                      {u.email} · {u.role}
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
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
                        <Monitor size={12} /> Desktop
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
                        Save
                      </button>
                    )}
                  </div>
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
                          <span className="font-semibold text-gray-700 capitalize">{d.deviceKind}</span>
                          {d.machineId ? (
                            <span className="ml-2 font-mono text-gray-500 truncate">
                              {d.label || d.machineId.slice(0, 12)}…
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
    </div>
  );
}
