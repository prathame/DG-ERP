import { beforeEach, describe, expect, it } from 'vitest';
import { getSyncState, patchSyncState, subscribeSyncState } from '../../src/platforms/service-mobile/syncState';

describe('service-mobile syncState', () => {
  beforeEach(() => {
    patchSyncState({
      status: 'offline',
      lastSync: null,
      version: 'test',
      validUntil: null,
      licenseValid: null,
    });
  });

  it('notifies subscribers on patch', () => {
    let n = 0;
    const unsub = subscribeSyncState(() => {
      n += 1;
    });
    patchSyncState({ status: 'syncing' });
    patchSyncState({ status: 'online', lastSync: '2026-07-19T10:00:00.000Z' });
    expect(n).toBe(2);
    expect(getSyncState().status).toBe('online');
    expect(getSyncState().lastSync).toBe('2026-07-19T10:00:00.000Z');
    unsub();
    patchSyncState({ status: 'offline' });
    expect(n).toBe(2);
  });
});
