import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, RefreshCw, Copy, MessageCircle, KeyRound, Radio } from 'lucide-react';
import { session } from '../../lib/session';
import { useToast } from '../../components/ui';

interface Device {
  id: string;
  deviceId: string;
  platform: string;
  appVersion: string | null;
  lastSeen: string | null;
  userName: string | null;
  userEmail: string | null;
  isOnline: boolean;
}

interface Props {
  tenantId: string;
  phone?: string;
}

export function MobileTenantPanel({ tenantId, phone }: Props) {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [forceSyncAt, setForceSyncAt] = useState<string | null>(null);
  const [minVersion, setMinVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [shareText, setShareText] = useState('');
  const [busy, setBusy] = useState('');

  const auth = () => ({ Authorization: `Bearer ${session.getToken()}` });

  const load = useCallback(async () => {
    const [inv, dev] = await Promise.all([
      fetch(`/api/super-admin/tenants/${tenantId}/mobile-invite`, { headers: auth() }).then(r => r.json()),
      fetch(`/api/super-admin/tenants/${tenantId}/mobile-devices`, { headers: auth() }).then(r => r.json()),
    ]);
    setCode(inv.code || null);
    setExpiresAt(inv.expiresAt || null);
    setSlug(inv.slug || '');
    setCompanyName(inv.companyName || '');
    setForceSyncAt(inv.forceSyncAt || null);
    setMinVersion(inv.minVersion || '');
    setLatestVersion(inv.latestVersion || '');
    setDevices(dev.devices || []);
  }, [tenantId]);

  useEffect(() => {
    void load().catch(() => toast('Failed to load mobile status', 'error'));
  }, [load, toast]);

  const issueInvite = async () => {
    setBusy('invite');
    try {
      const r = await fetch(`/api/super-admin/tenants/${tenantId}/mobile-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ daysValid: 30 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setCode(d.code);
      setExpiresAt(d.expiresAt);
      setShareText(d.shareText || '');
      toast('Mobile invite issued', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const forceSync = async () => {
    setBusy('sync');
    try {
      const r = await fetch(`/api/super-admin/tenants/${tenantId}/mobile-force-sync`, {
        method: 'POST',
        headers: auth(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setForceSyncAt(d.forceSyncAt);
      toast('Force sync pushed — devices will refresh on next heartbeat', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const saveVersions = async () => {
    setBusy('ver');
    try {
      const r = await fetch(`/api/super-admin/tenants/${tenantId}/mobile-version`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ minVersion: minVersion || null, latestVersion: latestVersion || null }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      toast('Mobile version policy saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const waShare = () => {
    const text =
      shareText ||
      [
        `Welcome to ${companyName || 'Dhandho'} Mobile!`,
        ``,
        `Invite code: ${code}`,
        `Company code: ${slug}`,
        `Login: ${window.location.origin}/${slug}`,
      ].join('\n');
    const p = (phone || '').replace(/[^0-9]/g, '');
    window.open(
      `https://wa.me/${p ? (p.startsWith('91') ? p : '91' + p) : ''}?text=${encodeURIComponent(text)}`,
      '_blank',
    );
  };

  const qrUrl = code
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(code)}`
    : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
          <Smartphone size={20} className="text-brand" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Mobile app</h2>
          <p className="text-xs text-gray-500">Onboard phones via invite · push sync · track devices</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1.5">
            <KeyRound size={12} /> Invite code
          </p>
          {code ? (
            <>
              <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <code className="text-sm font-bold tracking-wider text-gray-900">{code}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(code);
                    toast('Copied', 'success');
                  }}
                  className="p-1.5 hover:bg-gray-200 rounded-lg"
                >
                  <Copy size={14} />
                </button>
              </div>
              {expiresAt && (
                <p className="text-[11px] text-gray-400">Expires {new Date(expiresAt).toLocaleDateString('en-IN')}</p>
              )}
              {qrUrl && (
                <img src={qrUrl} alt="Invite QR" className="w-36 h-36 rounded-lg border border-gray-100 mx-auto" />
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">No invite yet — issue one to share with the company.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'invite'}
              onClick={() => void issueInvite()}
              className="px-3 py-2 bg-brand text-white rounded-xl text-xs font-bold hover:bg-brand-dark disabled:opacity-50"
            >
              {busy === 'invite' ? '…' : code ? 'Rotate invite' : 'Issue invite'}
            </button>
            {code && (
              <button
                type="button"
                onClick={waShare}
                className="px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 flex items-center gap-1.5"
              >
                <MessageCircle size={14} /> WhatsApp
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            Company code (slug): <span className="font-mono text-gray-600">{slug || '—'}</span>
          </p>
        </div>

        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1.5">
            <Radio size={12} /> Push updates
          </p>
          <p className="text-xs text-gray-500">
            Force sync makes every mobile device clear offline cache and reload settings on its next heartbeat (~1 min).
          </p>
          <button
            type="button"
            disabled={busy === 'sync'}
            onClick={() => void forceSync()}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy === 'sync' ? 'animate-spin' : ''} />
            Force sync now
          </button>
          {forceSyncAt && (
            <p className="text-[11px] text-gray-400">Last push: {new Date(forceSyncAt).toLocaleString('en-IN')}</p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Min version</label>
              <input
                value={minVersion}
                onChange={e => setMinVersion(e.target.value)}
                placeholder="2.1.0"
                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Latest version</label>
              <input
                value={latestVersion}
                onChange={e => setLatestVersion(e.target.value)}
                placeholder="2.2.0"
                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={busy === 'ver'}
            onClick={() => void saveVersions()}
            className="text-xs font-bold text-brand hover:underline disabled:opacity-50"
          >
            Save version policy
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-400 uppercase mb-2">Registered devices ({devices.length})</p>
        {devices.length === 0 ? (
          <p className="text-sm text-gray-400">No devices yet — they appear after someone opens the app and logs in.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.id} className="border-t border-gray-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{d.userName || '—'}</p>
                      <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{d.userEmail}</p>
                    </td>
                    <td className="px-3 py-2 capitalize">{d.platform}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.appVersion || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {d.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {d.lastSeen ? new Date(d.lastSeen).toLocaleString('en-IN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
