/**
 * Super Admin Analytics — tailored metrics per deployment type.
 * Cloud: MRR, growth, plan distribution, feature adoption, churn
 * On-Prem: version distribution, expiry timeline, business types, license health
 * Offline Mobile (Service Mobile): fleet/license health from heartbeats only — no ERP KPIs
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Cloud,
  Monitor,
  Smartphone,
  BarChart3,
  Users,
  IndianRupee,
  TrendingUp,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Zap,
} from 'lucide-react';
import { cn, bizTypeLabel } from '../../lib/utils';
import { session } from '../../lib/session';

type Mode = 'cloud' | 'onprem' | 'service-mobile';

// ── Shared UI pieces ───────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'text-brand',
  badge,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof BarChart3;
  color?: string;
  badge?: { text: string; color: string };
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <Icon size={18} className={color} />
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {badge && (
        <span className={cn('inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full', badge.color)}>
          {badge.text}
        </span>
      )}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-bold text-base">{title}</h3>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color = 'bg-brand',
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-28 truncate shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold w-8 text-right">{value}</span>
    </div>
  );
}

// ── Cloud Analytics ────────────────────────────────────────────────────────────
function CloudAnalytics() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await fetch('/api/super-admin/cloud-analytics', {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    });
    if (r.ok) setData(await r.json());
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading cloud analytics...</div>;
  if (!data) return <div className="py-12 text-center text-gray-400 text-sm">Failed to load</div>;

  const planDist = data.planDistribution as { name: string; count: string }[];
  const growth = data.tenantGrowth as { month: string; count: string }[];
  const topTenants = data.topTenants as Record<string, unknown>[];
  const statusBreakdown = data.statusBreakdown as { status: string; count: string }[];
  const features = data.featureAdoption as Record<string, string>;
  const total = Number(features?.total) || 1;

  const active = Number(statusBreakdown.find(s => s.status === 'active')?.count) || 0;
  const trial = Number(statusBreakdown.find(s => s.status === 'trial')?.count) || 0;
  const totalTenants = statusBreakdown.reduce((s, r) => s + Number(r.count), 0);
  const maxGrowth = Math.max(...growth.map(g => Number(g.count)), 1);

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div>
        <SectionHeader title="Key Metrics" sub="Revenue and subscription health" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="MRR"
            value={`₹${Number(data.mrr || 0).toLocaleString()}`}
            icon={IndianRupee}
            color="text-emerald-600"
            sub="Monthly recurring revenue"
            badge={{ text: 'Monthly', color: 'bg-emerald-50 text-emerald-700' }}
          />
          <StatCard
            label="Total Tenants"
            value={totalTenants}
            icon={Users}
            color="text-blue-600"
            sub={`${active} active · ${trial} trial`}
          />
          <StatCard
            label="Active This Week"
            value={Number(data.activeThisWeek) || 0}
            icon={TrendingUp}
            color="text-brand"
            sub="Logged in last 7 days"
          />
          <StatCard
            label="Churned (30d)"
            value={Number(data.churn30d) || 0}
            icon={AlertTriangle}
            color="text-rose-500"
            sub="Suspended this month"
            badge={Number(data.churn30d) > 0 ? { text: 'Watch', color: 'bg-rose-50 text-rose-600' } : undefined}
          />
        </div>
      </div>

      {/* Growth + Plan distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="Tenant Growth" sub="New signups per month (last 12 months)" />
          {growth.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No data yet</p>
          ) : (
            <div className="flex items-end gap-1.5 h-24 mt-2">
              {growth.map(g => (
                <div key={g.month} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {g.count}
                  </span>
                  <div
                    className="w-full bg-blue-500/80 rounded-t hover:bg-blue-600 transition-colors"
                    style={{ height: `${(Number(g.count) / maxGrowth) * 64}px` }}
                    title={`${g.month}: ${g.count} new`}
                  />
                  <p className="text-[9px] text-gray-400">{g.month.slice(5)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="Plan Distribution" sub="Tenants per plan" />
          <div className="space-y-3 mt-2">
            {planDist.map(p => (
              <React.Fragment key={p.name}>
                <BarRow
                  label={p.name || 'Unknown'}
                  value={Number(p.count)}
                  max={Math.max(...planDist.map(x => Number(x.count)), 1)}
                  color={p.name === 'Trial' ? 'bg-amber-400' : p.name === 'Standard' ? 'bg-blue-500' : 'bg-purple-500'}
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Feature adoption */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionHeader title="Feature Adoption" sub={`Across ${total} tenants — which features are enabled`} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
          {features &&
            [
              { key: 'barcode', label: 'Barcode System' },
              { key: 'inventory', label: 'Inventory Tracking' },
              { key: 'vendor_portal', label: 'Vendor Portal' },
              { key: 'multilang', label: 'Multi-Language' },
              { key: 'quotations', label: 'Quotations' },
              { key: 'accounts', label: 'Accounts' },
              { key: 'purchases', label: 'Purchases' },
              { key: 'chatbot', label: 'AI Chatbot' },
            ].map(({ key, label }) => {
              const count = Number(features[key]) || 0;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={key} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-lg font-bold">{pct}%</p>
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1.5">
                    <div className="bg-brand h-1 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {count}/{total} tenants
                  </p>
                </div>
              );
            })}
        </div>
      </div>

      {/* Top tenants */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <SectionHeader title="Top Tenants by Revenue" />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-400 uppercase">Company</th>
              <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase">Type</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-400 uppercase">Revenue</th>
              <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase">Users</th>
              <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {topTenants.map((t, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium">{t.company_name as string}</td>
                <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                  {bizTypeLabel(t.business_type as string, t.company_name as string)}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                  ₹{Number(t.revenue || 0).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-center text-gray-500">{String(t.users ?? 0)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      t.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                    )}
                  >
                    {t.status as string}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Version Control Panel ──────────────────────────────────────────────────────
function VersionControlPanel() {
  const [cfg, setCfg] = useState<{
    latestOnpremVersion: string | null;
    minOnpremVersion: string | null;
    latestServiceMobileVersion: string | null;
    minServiceMobileVersion: string | null;
    serviceCloudAppUrl: string | null;
    serviceCloudIosUrl: string | null;
    serviceMobileAppUrl: string | null;
    serviceMobileIosUrl: string | null;
    desktopMacArm64Url: string | null;
    desktopMacX64Url: string | null;
    desktopWinUrl: string | null;
    desktopAppUrl: string | null;
    cloudVersion: string;
    onpremVersions: { version: string; count: string; latest_seen: string }[];
    serviceMobileVersions: { version: string; count: string; latest_seen: string }[];
  } | null>(null);
  const [latest, setLatest] = useState('');
  const [min, setMin] = useState('');
  const [latestSm, setLatestSm] = useState('');
  const [minSm, setMinSm] = useState('');
  const [serviceCloudUrl, setServiceCloudUrl] = useState('');
  const [serviceCloudIosUrl, setServiceCloudIosUrl] = useState('');
  const [serviceMobileUrl, setServiceMobileUrl] = useState('');
  const [serviceMobileIosUrl, setServiceMobileIosUrl] = useState('');
  const [desktopMacArm64Url, setDesktopMacArm64Url] = useState('');
  const [desktopMacX64Url, setDesktopMacX64Url] = useState('');
  const [desktopWinUrl, setDesktopWinUrl] = useState('');
  const [desktopUrl, setDesktopUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await fetch('/api/super-admin/version-config', {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    });
    if (r.ok) {
      const d = await r.json();
      setCfg(d);
      setLatest(d.latestOnpremVersion || '');
      setMin(d.minOnpremVersion || '');
      setLatestSm(d.latestServiceMobileVersion || '');
      setMinSm(d.minServiceMobileVersion || '');
      setServiceCloudUrl(d.serviceCloudAppUrl || '');
      setServiceCloudIosUrl(d.serviceCloudIosUrl || '');
      setServiceMobileUrl(d.serviceMobileAppUrl || '');
      setServiceMobileIosUrl(d.serviceMobileIosUrl || '');
      setDesktopMacArm64Url(d.desktopMacArm64Url || '');
      setDesktopMacX64Url(d.desktopMacX64Url || '');
      setDesktopWinUrl(d.desktopWinUrl || '');
      setDesktopUrl(d.desktopAppUrl || '');
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const r = await fetch('/api/super-admin/version-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.getToken()}` },
      body: JSON.stringify({
        latestOnpremVersion: latest || null,
        minOnpremVersion: min || null,
        latestServiceMobileVersion: latestSm || null,
        minServiceMobileVersion: minSm || null,
        serviceCloudAppUrl: serviceCloudUrl || null,
        serviceCloudIosUrl: serviceCloudIosUrl || null,
        serviceMobileAppUrl: serviceMobileUrl || null,
        serviceMobileIosUrl: serviceMobileIosUrl || null,
        desktopMacArm64Url: desktopMacArm64Url || null,
        desktopMacX64Url: desktopMacX64Url || null,
        desktopWinUrl: desktopWinUrl || null,
        desktopAppUrl: desktopUrl || null,
      }),
    });
    if (r.ok) {
      alert(
        'Saved. Download page (/download) uses these evergreen URLs — overwrite the file on rebuild, keep the same link.',
      );
      load();
    } else {
      const err = await r.json().catch(() => ({}));
      alert((err as { error?: string }).error || 'Save failed');
    }
    setSaving(false);
  };

  if (!cfg) return null;

  const versionList = cfg.onpremVersions || [];
  const needing = latest
    ? versionList.filter(v => v.version !== latest && v.version !== 'Unknown').reduce((s, v) => s + Number(v.count), 0)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold flex items-center gap-2">
            <Zap size={16} className="text-purple-500" /> Version Control
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Manage what version on-prem customers run</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Cloud version</p>
          <p className="text-sm font-bold text-blue-600">v{cfg.cloudVersion}</p>
        </div>
      </div>

      {/* Current on-prem version distribution */}
      {versionList.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {versionList.map(v => (
            <div
              key={v.version}
              className={cn(
                'rounded-xl p-3 text-center border',
                v.version === latest ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50',
              )}
            >
              <p className="text-xs text-gray-500 mb-0.5">v{v.version}</p>
              <p className="text-lg font-bold">{v.count}</p>
              <p className="text-[10px] text-gray-400">install{Number(v.count) !== 1 ? 's' : ''}</p>
              {v.version === latest && <p className="text-[10px] text-emerald-600 font-bold mt-0.5">✓ Latest</p>}
            </div>
          ))}
        </div>
      )}

      {needing > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700">
            {needing} installation{needing !== 1 ? 's' : ''} not on latest version
          </p>
        </div>
      )}

      {/* Evergreen download URLs — testing (no versioned releases) */}
      <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-gray-800">App download URLs (testing)</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Unified Cap shell: one Android + one iOS URL on <code className="bg-white px-1 rounded">/download</code>.
            First launch picks Online or Offline once. Prefer the Mobile fields; Cloud fields are legacy aliases.
          </p>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Phone — Android APK</label>
          <input
            value={serviceMobileUrl}
            onChange={e => setServiceMobileUrl(e.target.value)}
            placeholder="https://github.com/prathame/DG-ERP/releases/download/dhandho-mobile/dhandho-mobile-debug.apk"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Phone — iOS (.app.zip)</label>
          <input
            value={serviceMobileIosUrl}
            onChange={e => setServiceMobileIosUrl(e.target.value)}
            placeholder="https://github.com/prathame/DG-ERP/releases/download/dhandho-mobile/dhandho-mobile-debug.app.zip"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Legacy alias — Cloud Android (optional)</label>
          <input
            value={serviceCloudUrl}
            onChange={e => setServiceCloudUrl(e.target.value)}
            placeholder="Same as Phone Android (optional override)"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Legacy alias — Cloud iOS (optional)</label>
          <input
            value={serviceCloudIosUrl}
            onChange={e => setServiceCloudIosUrl(e.target.value)}
            placeholder="Same as Phone iOS (optional override)"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Desktop — Mac Apple Silicon</label>
          <input
            value={desktopMacArm64Url}
            onChange={e => setDesktopMacArm64Url(e.target.value)}
            placeholder="https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-mac-arm64.dmg"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Desktop — Mac Intel</label>
          <input
            value={desktopMacX64Url}
            onChange={e => setDesktopMacX64Url(e.target.value)}
            placeholder="https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-mac-x64.dmg"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Desktop — Windows x64</label>
          <input
            value={desktopWinUrl}
            onChange={e => setDesktopWinUrl(e.target.value)}
            placeholder="https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-win-x64.exe"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Legacy alias — Desktop (optional)</label>
          <input
            value={desktopUrl}
            onChange={e => setDesktopUrl(e.target.value)}
            placeholder="Falls back to Mac arm64 if unset"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* On-prem version gates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">On-Prem Latest Version</label>
          <input
            value={latest}
            onChange={e => setLatest(e.target.value)}
            placeholder="e.g. 2.2.0"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
          <p className="text-[10px] text-gray-400 mt-1">Shows update notification in on-prem app</p>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">On-Prem Minimum Version</label>
          <input
            value={min}
            onChange={e => setMin(e.target.value)}
            placeholder="e.g. 2.0.0"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
          <p className="text-[10px] text-gray-400 mt-1">Blocks on-prem until customer updates</p>
        </div>
      </div>

      {/* Offline Mobile version gates (heartbeat keys) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Offline Mobile Latest Version</label>
          <input
            value={latestSm}
            onChange={e => setLatestSm(e.target.value)}
            placeholder="e.g. 1.2.0"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
          <p className="text-[10px] text-gray-400 mt-1">Optional update nudge via Service Mobile heartbeat</p>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Offline Mobile Minimum Version</label>
          <input
            value={minSm}
            onChange={e => setMinSm(e.target.value)}
            placeholder="e.g. 1.0.0"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand"
          />
          <p className="text-[10px] text-gray-400 mt-1">Force-update gate for Offline Mobile APK</p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save download links & version config'}
      </button>
    </div>
  );
}

// ── On-Prem Analytics ──────────────────────────────────────────────────────────
function OnPremAnalytics() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await fetch('/api/super-admin/onprem-analytics', {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    });
    if (r.ok) setData(await r.json());
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading on-prem analytics...</div>;
  if (!data) return <div className="py-12 text-center text-gray-400 text-sm">Failed to load</div>;

  const versions = data.versionDistribution as { version: string; count: string }[];
  const bizTypes = data.businessTypeDistribution as { type: string; count: string }[];
  const expiry = data.expiryTimeline as Record<string, string>;
  const statusRows = data.statusBreakdown as { status: string; count: string }[];
  const total = Number(data.total) || 0;
  const maxVer = Math.max(...versions.map(v => Number(v.count)), 1);
  const maxBiz = Math.max(...bizTypes.map(b => Number(b.count)), 1);

  const BIZ_COLORS: Record<string, string> = {
    manufacturer: 'bg-purple-500',
    dealer: 'bg-emerald-500',
    retail: 'bg-blue-500',
    service: 'bg-orange-500',
  };

  return (
    <div className="space-y-8">
      {/* Version control panel */}
      <VersionControlPanel />

      {/* KPIs */}
      <div>
        <SectionHeader title="License Health" sub="Real-time status of all on-prem installations" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Licenses"
            value={total}
            icon={Monitor}
            color="text-purple-600"
            sub={`${statusRows.find(s => s.status === 'active')?.count || 0} active`}
          />
          <StatCard
            label="Online Now"
            value={Number(data.online) || 0}
            icon={Wifi}
            color="text-emerald-600"
            sub="Heartbeat < 70 min ago"
            badge={{
              text: `${total > 0 ? Math.round((Number(data.online) / total) * 100) : 0}% connected`,
              color: 'bg-emerald-50 text-emerald-700',
            }}
          />
          <StatCard
            label="Offline"
            value={Number(data.offline) || 0}
            icon={WifiOff}
            color="text-gray-400"
            sub="Not seen recently"
          />
          <StatCard
            label="Expiring Soon"
            value={Number(data.expiringSoon) || 0}
            icon={AlertTriangle}
            color={Number(data.expiringSoon) > 0 ? 'text-amber-500' : 'text-gray-400'}
            sub="Within 30 days"
            badge={
              Number(data.expiringSoon) > 0 ? { text: 'Action needed', color: 'bg-amber-50 text-amber-600' } : undefined
            }
          />
        </div>
      </div>

      {/* Expiry timeline + Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="License Expiry Timeline" sub="When active licenses expire" />
          <div className="space-y-3 mt-2">
            {[
              { label: 'Expired', value: Number(expiry?.expired) || 0, color: 'bg-rose-500' },
              { label: 'Expires in 30 days', value: Number(expiry?.expiring_30d) || 0, color: 'bg-amber-500' },
              { label: 'Expires in 31–90 days', value: Number(expiry?.expiring_90d) || 0, color: 'bg-yellow-400' },
              { label: 'Expires later', value: Number(expiry?.expiring_later) || 0, color: 'bg-emerald-500' },
              { label: 'Lifetime', value: Number(expiry?.lifetime) || 0, color: 'bg-blue-500' },
            ].map(e => (
              <div key={e.label} className="flex items-center gap-3">
                <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', e.color)} />
                <span className="text-sm text-gray-600 flex-1">{e.label}</span>
                <span className="text-sm font-bold">{e.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="License Status" sub="Active, suspended, revoked" />
          <div className="space-y-3 mt-2">
            {statusRows.map(s => (
              <div key={s.status} className="flex items-center gap-3">
                <CheckCircle
                  size={14}
                  className={
                    s.status === 'active'
                      ? 'text-emerald-500'
                      : s.status === 'suspended'
                        ? 'text-amber-500'
                        : 'text-rose-500'
                  }
                />
                <span className="text-sm text-gray-600 flex-1 capitalize">{s.status}</span>
                <span className="text-sm font-bold">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Version distribution + Business types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="App Version Distribution" sub="Which version each installation is running" />
          {versions.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No version data yet (first heartbeat needed)</p>
          ) : (
            <div className="space-y-3 mt-2">
              {versions.map(v => (
                <React.Fragment key={v.version}>
                  <BarRow label={`v${v.version}`} value={Number(v.count)} max={maxVer} color="bg-purple-500" />
                </React.Fragment>
              ))}
            </div>
          )}
          {versions.length > 1 && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
              <AlertTriangle size={11} /> {versions.length - 1} version{versions.length - 1 !== 1 ? 's' : ''} behind
              latest — consider pushing update
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="Business Type Distribution" sub="What kind of businesses use on-prem" />
          <div className="space-y-3 mt-2">
            {bizTypes.map(b => (
              <React.Fragment key={b.type}>
                <BarRow
                  label={b.type.charAt(0).toUpperCase() + b.type.slice(1)}
                  value={Number(b.count)}
                  max={maxBiz}
                  color={BIZ_COLORS[b.type] || 'bg-gray-400'}
                />
              </React.Fragment>
            ))}
          </div>
          {bizTypes.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-4">
              {bizTypes.map(b => (
                <span
                  key={b.type}
                  className="text-[10px] bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 capitalize"
                >
                  {b.type}: {Math.round((Number(b.count) / total) * 100)}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Offline Mobile (Service Mobile) Analytics — fleet health only ──────────────
function ServiceMobileAnalytics() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await fetch('/api/super-admin/service-mobile-analytics', {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    });
    if (r.ok) setData(await r.json());
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-gray-400 text-sm">Loading Offline Mobile analytics...</div>;
  }
  if (!data) return <div className="py-12 text-center text-gray-400 text-sm">Failed to load</div>;

  const versions = data.versionDistribution as { version: string; count: string }[];
  const expiry = data.expiryTimeline as Record<string, string>;
  const statusRows = data.statusBreakdown as { status: string; count: string }[];
  const total = Number(data.total) || 0;
  const maxVer = Math.max(...versions.map(v => Number(v.count)), 1);
  const activeCount = Number(statusRows.find(s => s.status === 'active')?.count) || 0;

  return (
    <div className="space-y-8">
      <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3 text-sm text-sky-800">
        Fleet and license health from device heartbeats only. Offline Mobile ERP data (invoices, clients, revenue) never
        leaves the phone — nothing here is business analytics.
      </div>

      {/* KPIs */}
      <div>
        <SectionHeader title="License Health" sub="Real-time status of Offline Mobile installations" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Licenses"
            value={total}
            icon={Smartphone}
            color="text-sky-600"
            sub={`${activeCount} active`}
          />
          <StatCard
            label="Online Now"
            value={Number(data.online) || 0}
            icon={Wifi}
            color="text-emerald-600"
            sub="Heartbeat < 70 min ago"
            badge={{
              text: `${total > 0 ? Math.round((Number(data.online) / total) * 100) : 0}% connected`,
              color: 'bg-emerald-50 text-emerald-700',
            }}
          />
          <StatCard
            label="Offline"
            value={Number(data.offline) || 0}
            icon={WifiOff}
            color="text-gray-400"
            sub="Not seen recently"
          />
          <StatCard
            label="Expiring Soon"
            value={Number(data.expiringSoon) || 0}
            icon={AlertTriangle}
            color={Number(data.expiringSoon) > 0 ? 'text-amber-500' : 'text-gray-400'}
            sub="Within 30 days"
            badge={
              Number(data.expiringSoon) > 0 ? { text: 'Action needed', color: 'bg-amber-50 text-amber-600' } : undefined
            }
          />
        </div>
      </div>

      {/* Expiry timeline + Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="License Expiry Timeline" sub="When active licenses expire" />
          <div className="space-y-3 mt-2">
            {[
              { label: 'Expired', value: Number(expiry?.expired) || 0, color: 'bg-rose-500' },
              { label: 'Expires in 30 days', value: Number(expiry?.expiring_30d) || 0, color: 'bg-amber-500' },
              { label: 'Expires in 31–90 days', value: Number(expiry?.expiring_90d) || 0, color: 'bg-yellow-400' },
              { label: 'Expires later', value: Number(expiry?.expiring_later) || 0, color: 'bg-emerald-500' },
              { label: 'Lifetime', value: Number(expiry?.lifetime) || 0, color: 'bg-blue-500' },
            ].map(e => (
              <div key={e.label} className="flex items-center gap-3">
                <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', e.color)} />
                <span className="text-sm text-gray-600 flex-1">{e.label}</span>
                <span className="text-sm font-bold">{e.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader title="License Status" sub="Active vs suspended" />
          <div className="space-y-3 mt-2">
            {statusRows.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No licenses yet</p>
            ) : (
              statusRows.map(s => (
                <div key={s.status} className="flex items-center gap-3">
                  <CheckCircle
                    size={14}
                    className={
                      s.status === 'active'
                        ? 'text-emerald-500'
                        : s.status === 'suspended'
                          ? 'text-amber-500'
                          : 'text-rose-500'
                    }
                  />
                  <span className="text-sm text-gray-600 flex-1 capitalize">{s.status}</span>
                  <span className="text-sm font-bold">{s.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* App version distribution */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionHeader title="App Version Distribution" sub="Which Offline Mobile APK each license last reported" />
        {versions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No version data yet (first heartbeat needed)</p>
        ) : (
          <div className="space-y-3 mt-2 max-w-xl">
            {versions.map(v => (
              <React.Fragment key={v.version}>
                <BarRow label={`v${v.version}`} value={Number(v.count)} max={maxVer} color="bg-sky-500" />
              </React.Fragment>
            ))}
          </div>
        )}
        {versions.length > 1 && (
          <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
            <AlertTriangle size={11} /> {versions.length} distinct versions in the field — set Offline Mobile gates in
            the On-Prem Version Control panel if you need a force update
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Analytics View ────────────────────────────────────────────────────────
export function SAAnalyticsView() {
  const [mode, setMode] = useState<Mode>('cloud');

  const subtitle =
    mode === 'cloud'
      ? 'SaaS business metrics — MRR, growth, feature adoption'
      : mode === 'onprem'
        ? 'Deployment health — versions, expiry, license distribution'
        : 'Offline Mobile fleet health — heartbeats, versions, license status (no ERP KPIs)';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 size={22} /> Platform Analytics
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setMode('cloud')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all',
              mode === 'cloud' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Cloud size={14} /> Cloud
          </button>
          <button
            onClick={() => setMode('onprem')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all',
              mode === 'onprem' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Monitor size={14} /> On-Prem
          </button>
          <button
            onClick={() => setMode('service-mobile')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all',
              mode === 'service-mobile' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Smartphone size={14} /> Offline Mobile
          </button>
        </div>
      </div>

      {mode === 'cloud' ? <CloudAnalytics /> : mode === 'onprem' ? <OnPremAnalytics /> : <ServiceMobileAnalytics />}
    </motion.div>
  );
}
