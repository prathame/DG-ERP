import type { OnlineStatusAdapter } from '../desktop/offline/OnlineStatus';
import { runServiceMobileSync } from './sync';
import { getSyncState, subscribeSyncState } from './syncState';

export const serviceMobileOnlineStatusAdapter: OnlineStatusAdapter = {
  getConnectionStatus: () => getSyncState(),
  subscribe: subscribeSyncState,
  syncNow: async () => {
    await runServiceMobileSync();
    const s = getSyncState();
    return { status: s.status, lastSync: s.lastSync };
  },
};
