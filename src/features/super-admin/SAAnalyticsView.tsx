/**
 * Super Admin Analytics — unified view with Cloud / On-Prem / Combined toggle.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Cloud, Monitor, BarChart3, Users, Package, IndianRupee, Wifi, WifiOff, TrendingUp, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { session } from '../../lib/session';

type Mode = 'cloud' | 'onprem' | 'combined';

function StatCard({ label, value, sub, icon: Icon, color = 'text-brand' }: {
  label: string; value: string | number; sub?: string; icon: typeof BarChart3; color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-400 uppercase">{label}</p>
        <Icon size={18} className={color} />
      </div>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function SAAnalyticsView() {
  const [mode, setMode] = useState<Mode>('combined');
  const [cloudData, setCloudData] = useState<Record<string, unknown> | null>(null);
  const [onpremData, setOnpremData] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(true);

  const saToken = session.getToken() || '';
  const h = { Authorization: `Bearer ${saToken}` };

  const load = async () => {
    setLoading(true);
    try {
      const [cloud, onprem] = await Promise.all([
        fetch('/api/super-admin/analytics', { headers: h }).then(r => r.json()),
        fetch('/api/super-admin/onprem', { headers: h }).then(r => r.json()),
      ]);
      setCloudData(cloud);
      setOnpremData(Array.isArray(onprem) ? onprem : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onpremList = (onpremData || []) as Record<string, unknown>[];
  const onpremOnline = onpremList.filter(l => l.isOnline).length;
  const onpremOffline = onpremList.length - onpremOnline;
  const onpremActive = onpremList.filter(l => l.status === 'active').length;

  const c = cloudData as Record<string, unknown> | null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2"><BarChart3 size={22} /> Platform Analytics</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(['combined','cloud','onprem'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                  mode === m ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700')}>
                {m === 'cloud' ? <Cloud size={12} /> : m === 'onprem' ? <Monitor size={12} /> : <BarChart3 size={12} />}
                {m === 'combined' ? 'All' : m === 'cloud' ? 'Cloud' : 'On-Prem'}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} className="text-gray-400" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Loading analytics...</div>
      ) : (
        <>
          {/* ── CLOUD SECTION ── */}
          {(mode === 'cloud' || mode === 'combined') && c && (
            <div>
              {mode === 'combined' && (
                <div className="flex items-center gap-2 mb-3">
                  <Cloud size={16} className="text-blue-500" />
                  <h3 className="font-bold text-blue-600">Cloud</h3>
                  <div className="flex-1 h-px bg-blue-100" />
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Tenants" value={String(c.totalTenants ?? '—')} icon={Users} color="text-blue-600" sub="Cloud accounts" />
                <StatCard label="Active" value={String(c.activeTenants ?? '—')} icon={TrendingUp} color="text-emerald-600" sub="Active subscriptions" />
                <StatCard label="Total Revenue" value={c.totalRevenue ? `₹${Number(c.totalRevenue).toLocaleString()}` : '—'} icon={IndianRupee} color="text-brand" />
                <StatCard label="Total Products" value={String(c.totalProducts ?? '—')} icon={Package} color="text-purple-600" sub="Across all tenants" />
              </div>

              {/* Revenue by tenant */}
              {Array.isArray(c.tenantStats) && (c.tenantStats as Record<string,unknown>[]).length > 0 && (
                <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <h4 className="font-bold text-sm">Cloud Tenants — Revenue</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-400 uppercase">Company</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-400 uppercase">Revenue</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-400 uppercase">Sales</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-400 uppercase">Products</th>
                      <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {(c.tenantStats as Record<string,unknown>[]).map((t, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium">{t.companyName as string}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-600">₹{Number(t.revenue || 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{String(t.saleCount ?? 0)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{String(t.productCount ?? 0)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                              {t.status as string}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── ON-PREM SECTION ── */}
          {(mode === 'onprem' || mode === 'combined') && (
            <div>
              {mode === 'combined' && (
                <div className="flex items-center gap-2 mb-3 mt-2">
                  <Monitor size={16} className="text-purple-500" />
                  <h3 className="font-bold text-purple-600">On-Prem</h3>
                  <div className="flex-1 h-px bg-purple-100" />
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Licenses" value={onpremList.length} icon={Monitor} color="text-purple-600" />
                <StatCard label="Online Now" value={onpremOnline} icon={Wifi} color="text-emerald-600" sub={`${onpremOffline} offline`} />
                <StatCard label="Active Licenses" value={onpremActive} icon={TrendingUp} color="text-blue-600" sub={`${onpremList.length - onpremActive} inactive`} />
                <StatCard label="Avg Users" value={onpremList.length ? Math.round(onpremList.reduce((s, l) => s + (Number(l.activeUsers) || 0), 0) / onpremList.length) : 0} icon={Users} color="text-brand" sub="Per installation" />
              </div>

              {/* Per-installation table */}
              {onpremList.length > 0 && (
                <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <h4 className="font-bold text-sm">On-Prem Installations</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-400 uppercase">Company</th>
                      <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase">Version</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-400 uppercase">Last Seen</th>
                      <th className="px-4 py-2 text-center text-xs font-bold text-gray-400 uppercase">Users</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {onpremList.map((l, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium">{l.companyName as string}</td>
                          <td className="px-4 py-2.5 text-center">
                            {l.isOnline
                              ? <span className="flex items-center justify-center gap-1 text-emerald-600 text-xs font-bold"><Wifi size={11} /> Online</span>
                              : <span className="flex items-center justify-center gap-1 text-gray-400 text-xs font-bold"><WifiOff size={11} /> Offline</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-500">{(l.appVersion as string) || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">
                            {l.lastSeen ? new Date(l.lastSeen as string).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                          </td>
                          <td className="px-4 py-2.5 text-center">{String(l.activeUsers ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {onpremList.length === 0 && cloudData === null && (
            <div className="text-center py-16 text-gray-400">
              <BarChart3 size={48} className="mx-auto mb-3 opacity-20" />
              <p>No data available yet</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
