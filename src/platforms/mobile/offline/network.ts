import { Network } from '@capacitor/network';
import { isNativeApp, resolveApiUrl } from '../../shared/apiBase';
import { session } from '../../../lib/session';
import { flushOfflineQueue } from './queue';

export type ConnectionState = { connected: boolean; connectionType: string };

type Listener = (s: ConnectionState) => void;
const listeners = new Set<Listener>();
let state: ConnectionState = { connected: typeof navigator !== 'undefined' ? navigator.onLine : true, connectionType: 'unknown' };

function emit() {
  listeners.forEach((l) => l(state));
  window.dispatchEvent(new CustomEvent('dg-network', { detail: state }));
}

export function getConnectionState(): ConnectionState {
  return state;
}

export function subscribeConnection(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}

async function tryFlush() {
  if (!state.connected) return;
  const token = session.getToken();
  const tenantId = session.getTenantId();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  await flushOfflineQueue((path, init) => {
    const url = path.startsWith('http') ? path : resolveApiUrl(path.startsWith('/') ? path : `/${path}`);
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), ...headers },
    });
  });
}

export async function initNetworkMonitor(): Promise<void> {
  if (isNativeApp()) {
    try {
      const status = await Network.getStatus();
      state = { connected: status.connected, connectionType: status.connectionType };
      emit();
      Network.addListener('networkStatusChange', (s) => {
        state = { connected: s.connected, connectionType: s.connectionType };
        emit();
        if (s.connected) void tryFlush();
      });
      // Cold start while online — replay any queue left from a prior offline session
      if (status.connected) void tryFlush();
      return;
    } catch { /* fall through to browser events */ }
  }

  const sync = () => {
    state = { connected: navigator.onLine, connectionType: navigator.onLine ? 'web' : 'none' };
    emit();
    if (navigator.onLine) void tryFlush();
  };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}
