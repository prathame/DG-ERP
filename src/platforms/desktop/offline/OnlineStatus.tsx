import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface ConnectionStatus {
  status: 'online' | 'offline' | 'syncing';
  lastSync: string | null;
  version: string;
  validUntil: string | null;
}

export type OnlineStatusAdapter = {
  getConnectionStatus: () => Promise<ConnectionStatus | null | undefined> | ConnectionStatus | null | undefined;
  syncNow: () => Promise<{ status?: ConnectionStatus['status']; lastSync?: string | null } | void>;
  /** Optional live updates (service-mobile syncState). */
  subscribe?: (listener: () => void) => () => void;
};

function formatSync(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

const electronAdapter: OnlineStatusAdapter = {
  getConnectionStatus: async () => {
    // @ts-expect-error — electronAPI injected by preload
    return (await window.electronAPI?.getConnectionStatus?.()) as ConnectionStatus | undefined;
  },
  syncNow: async () => {
    // @ts-expect-error — electronAPI injected by preload
    return (await window.electronAPI?.syncNow?.()) as {
      status?: ConnectionStatus['status'];
      lastSync?: string | null;
    };
  },
};

export function OnlineStatus({
  collapsed,
  adapter = electronAdapter,
}: {
  collapsed: boolean;
  adapter?: OnlineStatusAdapter;
}) {
  const [conn, setConn] = useState<ConnectionStatus>({
    status: 'offline',
    lastSync: null,
    version: '',
    validUntil: null,
  });
  const [showPopup, setShowPopup] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await adapter.getConnectionStatus();
      if (data) setConn(data);
    } catch {
      /* ignore */
    }
  }, [adapter]);

  // Phone More drawer / sidebar collapsed — dismiss Cloud Connection popup so it does not float over content.
  useEffect(() => {
    if (collapsed) setShowPopup(false);
  }, [collapsed]);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 30000);
    const unsub = adapter.subscribe?.(() => void refresh());
    const onOnline = () => setConn(p => ({ ...p, status: p.status === 'syncing' ? p.status : 'online' }));
    const onOffline = () => setConn(p => ({ ...p, status: 'offline' }));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(iv);
      unsub?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh, adapter]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await adapter.syncNow();
      if (result) {
        setConn(prev => ({
          ...prev,
          status: result.status ?? prev.status,
          lastSync: result.lastSync !== undefined ? result.lastSync : prev.lastSync,
        }));
      }
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const daysLeft = conn.validUntil ? Math.ceil((new Date(conn.validUntil).getTime() - Date.now()) / 86400000) : null;
  const expiringWarning = daysLeft !== null && daysLeft <= 30;

  const statusColor =
    conn.status === 'online' ? 'text-emerald-500' : conn.status === 'syncing' ? 'text-amber-500' : 'text-gray-400';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPopup(p => !p)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-gray-50 text-left',
          collapsed ? 'justify-center' : '',
        )}
      >
        <span className={cn('text-sm', statusColor, conn.status === 'syncing' && 'animate-spin')}>
          {conn.status === 'online' ? (
            <Wifi size={16} />
          ) : conn.status === 'syncing' ? (
            <RefreshCw size={16} />
          ) : (
            <WifiOff size={16} />
          )}
        </span>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs font-bold', statusColor)}>
              {conn.status === 'online' ? 'Online · Synced' : conn.status === 'syncing' ? 'Syncing...' : 'Offline'}
              {expiringWarning && <AlertTriangle size={10} className="inline ml-1 text-amber-500" />}
            </p>
            <p className="text-[10px] text-gray-400 truncate">Last sync: {formatSync(conn.lastSync)}</p>
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
                <span className={cn('font-bold capitalize', statusColor)}>{conn.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last sync</span>
                <span className="font-medium">{formatSync(conn.lastSync)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">App version</span>
                <span className="font-medium">{conn.version || '—'}</span>
              </div>
              {conn.validUntil && (
                <div className="flex justify-between">
                  <span className="text-gray-500">License expires</span>
                  <span
                    className={cn(
                      'font-medium',
                      daysLeft !== null && daysLeft <= 30
                        ? 'text-amber-600'
                        : daysLeft !== null && daysLeft <= 7
                          ? 'text-red-600'
                          : '',
                    )}
                  >
                    {new Date(conn.validUntil).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {daysLeft !== null && <span className="text-xs ml-1 text-gray-400">({daysLeft}d)</span>}
                  </span>
                </div>
              )}
            </div>
            {expiringWarning && (
              <div className="mt-3 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                License expiring soon. Contact Dhandho to renew.
              </div>
            )}
            <button
              type="button"
              onClick={() => void syncNow()}
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
