import React, { useEffect, useState } from 'react';
import { WifiOff, CloudUpload, Wifi, Download } from 'lucide-react';
import { subscribeConnection } from './network';
import { offlineQueueCount } from './queue';

/** Status strip for native / mobile offline awareness + update policy. */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [backOnline, setBackOnline] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    let backTimer: ReturnType<typeof setTimeout>;
    let wasOffline = !navigator.onLine;
    const unsub = subscribeConnection((s) => {
      if (s.connected && wasOffline) {
        setBackOnline(true);
        clearTimeout(backTimer);
        backTimer = setTimeout(() => setBackOnline(false), 3000);
      }
      wasOffline = !s.connected;
      setOnline(s.connected);
    });
    const refreshQueue = () => setQueued(offlineQueueCount());
    refreshQueue();
    window.addEventListener('dg-offline-queue', refreshQueue);

    const onForce = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { latestVersion?: string };
      setUpdateMsg(`Update required${d?.latestVersion ? ` (v${d.latestVersion})` : ''} — open /download`);
    };
    const onAvail = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { latestVersion?: string };
      setUpdateMsg(`Update available${d?.latestVersion ? `: v${d.latestVersion}` : ''} — /download`);
    };
    window.addEventListener('dg-mobile-force-update', onForce);
    window.addEventListener('dg-mobile-update-available', onAvail);

    return () => {
      unsub();
      window.removeEventListener('dg-offline-queue', refreshQueue);
      window.removeEventListener('dg-mobile-force-update', onForce);
      window.removeEventListener('dg-mobile-update-available', onAvail);
      clearTimeout(backTimer);
    };
  }, []);

  if (online && queued === 0 && !backOnline && !updateMsg) return null;

  const bg = !online ? '#dc2626' : updateMsg?.startsWith('Update required') ? '#b45309'
    : backOnline && queued === 0 && !updateMsg ? '#059669' : '#2563eb';

  return (
    <div
      className="fixed top-0 inset-x-0 z-[9998] flex flex-col items-center justify-center gap-1 px-4 py-2 text-sm font-bold text-white"
      style={{ background: bg, paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      role="status"
    >
      {!online ? (
        <span className="inline-flex items-center gap-1.5 text-center">
          <WifiOff size={14} className="shrink-0" />
          <span className="sm:hidden">Offline — changes will sync later</span>
          <span className="hidden sm:inline">Offline — queued changes sync when you are back online</span>
        </span>
      ) : queued > 0 ? (
        <span className="inline-flex items-center gap-1.5"><CloudUpload size={14} /> Syncing {queued}…</span>
      ) : backOnline && !updateMsg ? (
        <span className="inline-flex items-center gap-1.5"><Wifi size={14} /> Back online</span>
      ) : null}
      {updateMsg && (
        <a href="/download" className="inline-flex items-center gap-1.5 underline decoration-white/40">
          <Download size={14} /> {updateMsg}
        </a>
      )}
    </div>
  );
}
