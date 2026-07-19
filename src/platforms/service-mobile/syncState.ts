/**
 * Connection / sync status for Offline Mobile OnlineStatus UI.
 */
import { loadLicense } from './licenseStore';
import { serviceMobileAppVersion } from './mode';

export type SyncConnectionStatus = {
  status: 'online' | 'offline' | 'syncing';
  lastSync: string | null;
  version: string;
  validUntil: string | null;
  licenseValid: boolean | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();

let state: SyncConnectionStatus = {
  status: typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
  lastSync: null,
  version: serviceMobileAppVersion(),
  validUntil: loadLicense()?.validUntil ?? null,
  licenseValid: null,
};

export function getSyncState(): SyncConnectionStatus {
  return { ...state };
}

/** Alias for OnlineStatus adapter. */
export function getServiceMobileConnectionStatus(): SyncConnectionStatus {
  return getSyncState();
}

export function subscribeSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const l of listeners) l();
}

export function patchSyncState(partial: Partial<SyncConnectionStatus>): void {
  state = { ...state, ...partial };
  emit();
}
