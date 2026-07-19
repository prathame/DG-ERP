import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    mem.set(k, String(v));
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
});

vi.mock('../../src/lib/session', () => ({
  session: {
    getTenantId: () => 'tenant-1',
    getUser: () => ({ id: 'user-1' }),
  },
}));

import {
  accountsVisibleStorageKey,
  getAccountsTabVisiblePref,
  setAccountsTabVisiblePref,
} from '../../src/platforms/service-mobile/tabPrefs';

describe('service-mobile tabPrefs', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('defaults Accounts visible when unset', () => {
    expect(getAccountsTabVisiblePref()).toBe(true);
  });

  it('persists show/hide under scoped localStorage key', () => {
    expect(accountsVisibleStorageKey()).toBe('dg_accounts_visible:tenant-1:user-1');
    setAccountsTabVisiblePref(false);
    expect(mem.get(accountsVisibleStorageKey())).toBe('0');
    expect(getAccountsTabVisiblePref()).toBe(false);
    setAccountsTabVisiblePref(true);
    expect(mem.get(accountsVisibleStorageKey())).toBe('1');
    expect(getAccountsTabVisiblePref()).toBe(true);
  });
});
