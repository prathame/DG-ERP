import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ConnectionStatus {
  status: 'online' | 'offline' | 'syncing';
  lastSync: string | null;
  version: string;
  validUntil: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function OnlineStatus({ collapsed }: { collapsed: boolean }) {
  const [conn, setConn] = useState<ConnectionStatus>({ status: 'offline', lastSync: null, version: '', validUntil: null });
  const [showPopup, setShowPopup] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // @ts-ignore — electronAPI injected by preload
      const data = await window.electronAPI?.getConnectionStatus?.();
      if (data) setConn(data);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 30000); // poll every 30s for UI freshness
    const onOnline = () => setConn(p => ({ ...p, status: 'online' }));
    const onOffline = () => setConn(p => ({ ...p, status: 'offline' }));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { clearInterval(iv); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [refresh]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      // @ts-ignore
      const result = await window.electronAPI?.syncNow?.();
      if (result) setConn(prev => ({ ...prev, status: result.status, lastSync: result.lastSync }));
    } finally { setSyncing(false); }
  };

  const daysLeft = conn.validUntil
    ? Math.ceil((new Date(conn.validUntil).getTime() - Date.now()) / 86400000)
    : null;
  const expiringWarning = daysLeft !== null && daysLeft <= 30;

  const statusColor = conn.status === 'online' ? 'text-emerald-500' : conn.status === 'syncing' ? 'text-amber-500' : 'text-gray-400';
  const statusDot = conn.status === 'online' ? '●' : conn.status === 'syncing' ? '↻' : '⚪';

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopup(p => !p)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-gray-50 text-left",
          collapsed ? "justify-center" : ""
        )}
      >
        <span className={cn("text-sm", statusColor, conn.status === 'syncing' && "animate-spin")}>
          {conn.status === 'online' ? <Wifi size={16} /> : conn.status === 'syncing' ? <RefreshCw size={16} /> : <WifiOff size={16} />}
        </span>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className={cn("text-xs font-bold", statusColor)}>
              {conn.status === 'online' ? 'Online · Synced' : conn.status === 'syncing' ? 'Syncing...' : 'Offline'}
              {expiringWarning && <AlertTriangle size={10} className="inline ml-1 text-amber-500" />}
            </p>
            <p className="text-[10px] text-gray-400 truncate">Last sync: {timeAgo(conn.lastSync)}</p>
          </div>
        )}
      </button>

      {showPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPopup(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50">
            <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Wifi size={14} className={statusColor} /> Cloud Connection
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={cn("font-bold capitalize", statusColor)}>{conn.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last sync</span>
                <span className="font-medium">{timeAgo(conn.lastSync)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">App version</span>
                <span className="font-medium">{conn.version || '—'}</span>
              </div>
              {conn.validUntil && (
                <div className="flex justify-between">
                  <span className="text-gray-500">License valid</span>
                  <span className={cn("font-medium", expiringWarning ? 'text-amber-600' : '')}>
                    {daysLeft} days left
                  </span>
                </div>
              )}
            </div>
            {expiringWarning && (
              <div className="mt-3 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                License expiring soon. Contact DG Business to renew.
              </div>
            )}
            <button
              onClick={syncNow}
              disabled={syncing}
              className="mt-3 w-full py-1.5 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
