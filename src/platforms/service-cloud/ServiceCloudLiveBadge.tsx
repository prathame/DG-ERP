/**
 * Online Capacitor only — Live status + Refresh config (no N‑min polling).
 * Reloads SA mobile_features / access mode / tabs / permissions into session.
 */
import React, { useEffect, useState } from 'react';
import { Cloud, WifiOff, RefreshCw } from 'lucide-react';
import { isServiceCloudMobile } from './mode';
import { api } from '../../api';
import { session } from '../../lib/session';

type Props = {
  collapsed?: boolean;
  userId?: string;
  /** When true, hint mentions company-wide session lock (service tenants). */
  companySessionLock?: boolean;
  onConfigRefreshed?: (merged: Record<string, unknown>) => void;
};

export function ServiceCloudLiveBadge({ collapsed, userId, companySessionLock = false, onConfigRefreshed }: Props) {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [hintOpen, setHintOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!isServiceCloudMobile()) return null;

  const refreshConfig = async () => {
    if (!userId || refreshing) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const fresh = await api.settings.getProfile(userId);
      const prev = (session.getUser() || {}) as Record<string, unknown>;
      const merged = { ...prev, ...fresh };
      session.setUser(merged);
      onConfigRefreshed?.(merged);
      setRefreshMsg('Config updated');
      setTimeout(() => setRefreshMsg(null), 2500);
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <div
          className={`${online ? 'text-sky-600' : 'text-rose-500'}`}
          title={online ? 'Live · Online' : 'No internet'}
        >
          {online ? <Cloud size={18} /> : <WifiOff size={18} />}
        </div>
        {userId && (
          <button
            type="button"
            onClick={() => void refreshConfig()}
            disabled={refreshing || !online}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            title="Refresh config"
            aria-label="Refresh config"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-0.5 space-y-1.5">
      <button
        type="button"
        onClick={() => setHintOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-lg text-left text-[12px] font-semibold border ${
          online ? 'bg-sky-50 text-sky-800 border-sky-100' : 'bg-rose-50 text-rose-700 border-rose-100'
        }`}
      >
        {online ? <Cloud size={16} className="shrink-0" /> : <WifiOff size={16} className="shrink-0" />}
        <span className="truncate">{online ? 'Live · Online' : 'No internet'}</span>
      </button>
      {userId && (
        <button
          type="button"
          onClick={() => void refreshConfig()}
          disabled={refreshing || !online}
          className="w-full flex items-center justify-center gap-2 px-2.5 py-2 min-h-[40px] rounded-lg text-[12px] font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh config'}
        </button>
      )}
      {refreshMsg && <p className="px-1 text-[11px] text-gray-500 leading-snug">{refreshMsg}</p>}
      {hintOpen && (
        <p className="px-1 text-[11px] text-gray-500 leading-snug">
          Cloud Online needs internet. Invoices and stock load from the server when you open a screen.
          {companySessionLock
            ? ' Only one person can use the company app at a time.'
            : ' Several users can work at once.'}{' '}
          Use <strong>Refresh config</strong> after Super Admin changes mobile features or access mode (not needed for
          normal data).
        </p>
      )}
    </div>
  );
}
