import type { OnlineStatusAdapter } from '../desktop/offline/OnlineStatus';
import { runServiceMobileSync } from './sync';
import { getServiceMobileConnectionStatus, subscribeSyncState } from './syncState';

export const serviceMobileOnlineStatusAdapter: OnlineStatusAdapter = {
  getConnectionStatus: () => getServiceMobileConnectionStatus(),
  subscribe: subscribeSyncState,
  syncNow: async () => {
    await runServiceMobileSync();
    const s = getServiceMobileConnectionStatus();
    return { status: s.status, lastSync: s.lastSync };
  },
};
