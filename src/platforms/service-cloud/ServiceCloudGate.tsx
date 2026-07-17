import React, { useCallback, useEffect, useRef, useState } from 'react';
import { claimAndAcquire, heartbeatSession, releaseSession, type GateState } from './session';
import { isServiceCloudClient } from './mode';

const HEARTBEAT_MS = 60_000;
const RETRY_BUSY_MS = 15_000;

type Props = {
  /** Only enforce for service business_type tenants */
  enabled: boolean;
  children: React.ReactNode;
};

/**
 * Company-wide session lock + offline freeze for service cloud clients
 * (Electron cloud / online Capacitor). Browser web skips this gate.
 */
export function ServiceCloudGate({ enabled, children }: Props) {
  const applicable = enabled && isServiceCloudClient();
  const [state, setState] = useState<GateState>({ kind: applicable ? 'loading' : 'idle' });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (busyRef.current) clearInterval(busyRef.current);
    timerRef.current = null;
    busyRef.current = null;
  };

  const apply = useCallback(async (next: GateState) => {
    setState(next);
    clearTimers();
    if (next.kind === 'active') {
      timerRef.current = setInterval(() => {
        void heartbeatSession().then(apply);
      }, HEARTBEAT_MS);
    } else if (next.kind === 'busy' || next.kind === 'offline') {
      busyRef.current = setInterval(() => {
        void claimAndAcquire().then(apply);
      }, RETRY_BUSY_MS);
    }
  }, []);

  useEffect(() => {
    if (!applicable) {
      setState({ kind: 'idle' });
      return;
    }
    void claimAndAcquire().then(apply);

    const onOffline = () => setState({ kind: 'offline' });
    const onOnline = () => {
      void claimAndAcquire().then(apply);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    const onUnload = () => {
      void releaseSession();
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      clearTimers();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onUnload);
      void releaseSession();
    };
  }, [applicable, apply]);

  if (!applicable || state.kind === 'idle' || state.kind === 'active') {
    return <>{children}</>;
  }

  const frozen =
    state.kind === 'busy' || state.kind === 'offline' || state.kind === 'blocked' || state.kind === 'loading';

  return (
    <div className="relative min-h-[100dvh]">
      <div
        className={frozen ? 'pointer-events-none select-none blur-[1px] opacity-60' : undefined}
        aria-hidden={frozen || undefined}
      >
        {children}
      </div>
      {frozen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 text-center max-h-[85dvh] overflow-y-auto">
            {state.kind === 'loading' && (
              <>
                <p className="text-lg font-bold text-gray-900">Connecting…</p>
                <p className="text-sm text-gray-500 mt-2">Checking device seat and session.</p>
              </>
            )}
            {state.kind === 'busy' && (
              <>
                <p className="text-lg font-bold text-gray-900">In use</p>
                <p className="text-sm text-gray-600 mt-2">
                  <strong>{state.holder.userName || 'Another user'}</strong> is using the app
                  {state.holder.client ? ` on ${state.holder.client}` : ''}.
                </p>
                <p className="text-xs text-gray-500 mt-3">
                  This screen stays locked until they leave or are idle for 5 minutes. No takeover in this version.
                </p>
              </>
            )}
            {state.kind === 'offline' && (
              <>
                <p className="text-lg font-bold text-gray-900">No internet</p>
                <p className="text-sm text-gray-600 mt-2">
                  Service cloud seats require a live connection. The app is frozen until you are back online.
                </p>
              </>
            )}
            {state.kind === 'blocked' && (
              <>
                <p className="text-lg font-bold text-gray-900">Access blocked</p>
                <p className="text-sm text-gray-600 mt-2">{state.message}</p>
                <p className="text-xs text-gray-500 mt-3">Contact your Super Admin to adjust seats or access mode.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
