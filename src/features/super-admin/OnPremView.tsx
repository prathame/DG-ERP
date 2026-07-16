import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Monitor, Plus, X, Copy, Check, Wifi, WifiOff, RefreshCw, Trash2, AlertTriangle, Settings, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToast } from '../../components/ui';

const BUSINESS_TYPES = ['manufacturer','dealer','retail','service'] as const;

const TAB_PRESETS: Record<string, Record<string, { label: string; visible: boolean }>> = {
  manufacturer: { analytics:{label:'Analytics',visible:true}, masters:{label:'Masters',visible:true}, inventory:{label:'Inventory',visible:true}, distribution:{label:'Dispatch',visible:true}, sales:{label:'Warranty Registration',visible:true}, purchases:{label:'Purchases',visible:true}, verification:{label:'Search / Verify',visible:true}, quotations:{label:'Quotes & Orders',visible:true}, invoices:{label:'Invoices',visible:true}, finance:{label:'Vendor Payments',visible:true}, accounts:{label:'Accounts',visible:true}, warranty:{label:'Warranty',visible:true}, replacements:{label:'Replacements',visible:true}, rewards:{label:'Rewards',visible:true}, chatbot:{label:'Chatbot',visible:true} },
  dealer: { analytics:{label:'Analytics',visible:true}, masters:{label:'Masters',visible:true}, inventory:{label:'Inventory',visible:true}, distribution:{label:'Sales',visible:true}, sales:{label:'Sales Entry',visible:false}, purchases:{label:'Purchases',visible:true}, verification:{label:'Search / Verify',visible:true}, quotations:{label:'Quotes & Orders',visible:true}, invoices:{label:'Invoices',visible:true}, finance:{label:'Dealer Payments',visible:true}, accounts:{label:'Accounts',visible:true}, warranty:{label:'Warranty',visible:false}, replacements:{label:'Replacements',visible:false}, rewards:{label:'Rewards',visible:false}, chatbot:{label:'Chatbot',visible:true} },
  retail: { analytics:{label:'Analytics',visible:true}, masters:{label:'Masters',visible:true}, inventory:{label:'Stock',visible:true}, distribution:{label:'Purchase',visible:true}, sales:{label:'Sales Entry',visible:false}, purchases:{label:'Purchases',visible:true}, verification:{label:'Search / Verify',visible:true}, quotations:{label:'Quotes & Orders',visible:true}, invoices:{label:'Invoices',visible:true}, finance:{label:'Supplier Payments',visible:true}, accounts:{label:'Accounts',visible:true}, warranty:{label:'Warranty',visible:false}, replacements:{label:'Replacements',visible:false}, rewards:{label:'Rewards',visible:false}, chatbot:{label:'Chatbot',visible:true} },
  service: { analytics:{label:'Analytics',visible:true}, masters:{label:'Masters',visible:true}, inventory:{label:'Inventory',visible:false}, distribution:{label:'Distribution',visible:false}, sales:{label:'Sales Entry',visible:false}, purchases:{label:'Expenses',visible:true}, verification:{label:'Search / Verify',visible:false}, quotations:{label:'Quotes & Orders',visible:true}, invoices:{label:'Invoices',visible:true}, finance:{label:'Invoice Finance',visible:true}, accounts:{label:'Accounts',visible:true}, warranty:{label:'Warranty',visible:false}, replacements:{label:'Replacements',visible:false}, rewards:{label:'Rewards',visible:false}, chatbot:{label:'Chatbot',visible:true} },
};

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
  settingsPushedAt: string | null;
  settingsAppliedAt: string | null;
  settings?: Record<string, unknown>;
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

export function OnPremView({ saToken }: { saToken: string }) {
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<License | null>(null);
  const [copied, setCopied] = useState('');
  const [settingsTab, setSettingsTab] = useState<'tabs' | 'features' | 'updates'>('tabs');
  const [localSettings, setLocalSettings] = useState<Record<string, unknown>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [minVersion, setMinVersion] = useState('');
  const [githubReleases, setGithubReleases] = useState<{ tag: string; name: string; published: string }[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);

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

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // auto-refresh every 30s
    return () => clearInterval(t);
  }, []);

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

  const saveSettings = async () => {
    if (!selected) return;
    setSavingSettings(true);
    await handleUpdate(selected.id, { settings: localSettings });
    setSavingSettings(false);
    toast('Settings saved — will apply on next heartbeat (up to 15 min)', 'success');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this license? The installation will stop working.')) return;
    await fetch(`/api/super-admin/onprem/${id}`, { method: 'DELETE', headers: h });
    toast('License deleted', 'success');
    setSelected(null);
    load();
  };

  const whatsappMsg = (lic: License) =>
    encodeURIComponent(`🖥️ *Dhandho — On-Prem License*\n\nCompany: ${lic.companyName}\nLicense Key: \`${lic.licenseKey}\`\n\n📥 Download: https://dhandho.in/download\n\n1. Install Dhandho\n2. Enter your license key\n3. Set your admin password\n\nValid till: ${lic.validUntil || 'Lifetime'}`);

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
            { label: 'Last Sync', value: timeAgo(selected.lastSeen) },
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

        {/* Remote Settings — pushed via heartbeat */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2"><Settings size={16} /> Remote Settings</h3>
            <p className="text-xs text-gray-400">Applied on next heartbeat (up to 15 min)</p>
          </div>
          <div className="flex gap-2 mb-4 border-b border-gray-100 pb-3">
            {(['tabs','features','updates'] as const).map(t => (
              <button key={t} onClick={() => setSettingsTab(t)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors capitalize",
                  settingsTab === t ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                {t === 'tabs' ? 'Tab Config' : t === 'features' ? 'Features' : 'Updates'}
              </button>
            ))}
          </div>

          {settingsTab === 'tabs' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-3">Toggle which tabs are visible. Changes push to the on-prem app on next sync.</p>
              {[
                'analytics','masters','inventory','distribution','sales','purchases',
                'verification','quotations','invoices','finance','accounts',
                'warranty','replacements','rewards','chatbot'
              ].map(tab => {
                const businessType = (selected?.businessType as string) || 'manufacturer';
                const presetCfg = TAB_PRESETS[businessType]?.[tab] || { label: tab, visible: true };
                const cfg = ((localSettings.tabConfig || selected?.settings?.tabConfig || {}) as Record<string, { label: string; visible: boolean }>)[tab] || presetCfg;
                return (
                  <div key={tab} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{tab}</span>
                      <input
                        value={cfg.label}
                        onChange={e => setLocalSettings(prev => ({
                          ...prev,
                          tabConfig: { ...(prev.tabConfig as Record<string, unknown> || {}), [tab]: { ...cfg, label: e.target.value } }
                        }))}
                        className="text-sm border border-gray-200 rounded px-2 py-1 w-32 focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <button onClick={() => setLocalSettings(prev => ({
                      ...prev,
                      tabConfig: { ...(prev.tabConfig as Record<string, unknown> || {}), [tab]: { ...cfg, visible: !cfg.visible } }
                    }))} className={cn("relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors", cfg.visible ? 'bg-emerald-500' : 'bg-gray-300')}>
                      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", cfg.visible ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {settingsTab === 'features' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 mb-3">Toggle system features. Changes push to the on-prem app on next sync.</p>
              {[
                { key: 'barcodeSystemEnabled', label: 'Barcode System', desc: 'Auto-generated barcodes, scanner, label printing' },
                { key: 'multiLanguageEnabled', label: 'Multi-Language', desc: 'Switch UI between English, Hindi, Gujarati' },
                { key: 'inventoryTrackingEnabled', label: 'Inventory Tracking', desc: 'Stock count, barcode quantity, Add Stock' },
                { key: 'vendorPortalEnabled', label: 'Vendor Portal', desc: 'Vendors get login credentials and portal access' },
                { key: 'quotationsEnabled', label: 'Quotations', desc: 'Create quotes, share via WhatsApp, convert to distribution' },
                { key: 'accountsEnabled', label: 'Accounts & Reports', desc: 'P&L, Balance Sheet, GST reports' },
                { key: 'purchasesEnabled', label: 'Purchases', desc: 'Supplier management and purchase batches' },
                { key: 'chatbotEnabled', label: 'AI Chatbot', desc: 'Ask business questions in natural language' },
              ].map(({ key, label, desc }) => {
                const val = (localSettings[key] ?? (selected?.settings as Record<string, unknown>)?.[key] ?? true) as boolean;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                    <button onClick={() => setLocalSettings(prev => ({ ...prev, [key]: !val }))}
                      className={cn("relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors shrink-0 ml-4", val ? 'bg-emerald-500' : 'bg-gray-300')}>
                      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", val ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {settingsTab === 'updates' && (
            <div className="space-y-4">
              {/* Current version prominently shown */}
              <div className={cn("rounded-xl p-4 border", selected?.appVersion ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200")}>
                <p className="text-xs text-gray-500 font-medium mb-1">This installation</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-blue-700">v{selected?.appVersion || 'Not yet synced'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Last sync: {timeAgo(selected?.lastSeen || null)}</p>
                  </div>
                  {selected?.appVersion && latestVersion && selected.appVersion !== latestVersion && (
                    <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-full">
                      Update available: v{latestVersion}
                    </span>
                  )}
                  {selected?.appVersion && latestVersion && selected.appVersion === latestVersion && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-full">
                      ✓ Up to date
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-400">Control which version this installation runs. Applied on next heartbeat (up to 15 min).</p>

              {/* Latest version dropdown */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Latest Version (shows update notification)</label>
                  <button onClick={async () => {
                    if (githubReleases.length) return;
                    setReleasesLoading(true);
                    try {
                      const r = await fetch('https://api.github.com/repos/prathame/DG-ERP/releases');
                      if (r.ok) {
                        const releases = await r.json() as { tag_name: string; name: string; published_at: string }[];
                        setGithubReleases(releases.map(rel => ({
                          tag: rel.tag_name.replace(/^v/, ''),
                          name: rel.name || rel.tag_name,
                          published: rel.published_at.slice(0, 10),
                        })));
                      }
                    } catch {}
                    setReleasesLoading(false);
                  }} className="text-xs text-brand hover:underline font-medium">
                    {releasesLoading ? 'Loading...' : githubReleases.length ? `${githubReleases.length} releases loaded` : 'Load from GitHub'}
                  </button>
                </div>
                {githubReleases.length > 0 ? (
                  <select value={latestVersion} onChange={e => setLatestVersion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand bg-white">
                    <option value="">— Select version —</option>
                    {githubReleases.map(r => (
                      <option key={r.tag} value={r.tag}>v{r.tag} · {r.published}</option>
                    ))}
                  </select>
                ) : (
                  <input value={latestVersion} onChange={e => setLatestVersion(e.target.value)} placeholder="e.g. 2.2.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand" />
                )}
              </div>

              {/* Min version dropdown */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Minimum Version (force update — blocks old)</label>
                {githubReleases.length > 0 ? (
                  <select value={minVersion} onChange={e => setMinVersion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand bg-white">
                    <option value="">— No minimum (optional update) —</option>
                    {githubReleases.map(r => (
                      <option key={r.tag} value={r.tag}>v{r.tag} · {r.published}</option>
                    ))}
                  </select>
                ) : (
                  <input value={minVersion} onChange={e => setMinVersion(e.target.value)} placeholder="e.g. 2.1.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand" />
                )}
              </div>

              <button onClick={() => {
                setLocalSettings(prev => ({ ...prev, latestVersion: latestVersion || null, minVersion: minVersion || null }));
                toast('Version staged — click Save & Push to apply', 'success');
              }} className="w-full py-2 border border-brand text-brand rounded-xl text-sm font-bold hover:bg-orange-50 flex items-center justify-center gap-1.5">
                <Zap size={14} /> Stage Update
              </button>
            </div>
          )}

          <button onClick={saveSettings} disabled={savingSettings || Object.keys(localSettings).length === 0}
            className="mt-4 w-full py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
            {savingSettings ? 'Saving...' : Object.keys(localSettings).length > 0 ? '💾 Save & Push to Device' : 'No changes'}
          </button>

          {/* Sync status log */}
          {(selected.settingsPushedAt || selected.settingsAppliedAt) && (
            <div className="mt-3 text-xs space-y-1 bg-gray-50 rounded-xl p-3">
              {selected.settingsPushedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Settings saved</span>
                  <span className="font-medium">{timeAgo(selected.settingsPushedAt)}</span>
                </div>
              )}
              {selected.settingsAppliedAt ? (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Applied on device</span>
                  <span className="font-medium text-emerald-600">✓ {timeAgo(selected.settingsAppliedAt)}</span>
                </div>
              ) : selected.settingsPushedAt ? (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Applied on device</span>
                  <span className="font-medium text-amber-500">⏳ Pending next sync</span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Renew License */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-1">Renew / Extend License</h3>
          <p className="text-xs text-gray-400 mb-3">
            Current expiry: <span className="font-bold text-gray-600">
              {selected.validUntil ? new Date(selected.validUntil).toLocaleDateString('en-IN') : 'Lifetime'}
            </span>
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              id="renewDate"
              defaultValue={selected.validUntil?.slice(0, 10) || ''}
              min={new Date().toISOString().slice(0, 10)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
            />
            <button
              onClick={() => {
                const input = document.getElementById('renewDate') as HTMLInputElement;
                if (!input.value) { toast('Select a new expiry date', 'error'); return; }
                handleUpdate(selected.id, { validUntil: input.value, status: 'active' });
                setSelected(prev => prev ? { ...prev, validUntil: input.value, status: 'active' } : prev);
              }}
              className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-orange-600"
            >
              Renew
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            {[
              { label: '+3 months', months: 3 },
              { label: '+6 months', months: 6 },
              { label: '+1 year', months: 12 },
            ].map(({ label, months }) => (
              <button key={label} onClick={() => {
                const base = selected.validUntil ? new Date(selected.validUntil) : new Date();
                base.setMonth(base.getMonth() + months);
                const newDate = base.toISOString().slice(0, 10);
                handleUpdate(selected.id, { validUntil: newDate, status: 'active' });
                setSelected(prev => prev ? { ...prev, validUntil: newDate, status: 'active' } : prev);
              }}
                className="flex-1 py-1.5 border border-gray-200 rounded-lg text-xs font-bold hover:border-brand hover:text-brand transition-colors">
                {label}
              </button>
            ))}
          </div>
        </div>

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
              <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">Last Sync</th>
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
