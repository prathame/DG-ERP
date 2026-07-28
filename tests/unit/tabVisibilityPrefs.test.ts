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

// Node's built-in EventTarget gives real addEventListener/dispatchEvent semantics
// without pulling in jsdom just for this one CustomEvent dispatch.
vi.stubGlobal('window', new EventTarget());

let currentUserId = 'user-1';
vi.mock('../../src/lib/session', () => ({
  session: {
    getTenantId: () => 'tenant-1',
    getUser: () => ({ id: currentUserId }),
  },
}));

import {
  getTabVisiblePref,
  setTabVisiblePref,
  tabVisibleStorageKey,
  TAB_VISIBLE_PREF_CHANGED_EVENT,
} from '../../src/lib/tabVisibilityPrefs';

describe('tabVisibilityPrefs (per-device/user Settings nav toggle)', () => {
  beforeEach(() => {
    mem.clear();
    currentUserId = 'user-1';
  });

  it('defaults every tab visible when no pref has been set', () => {
    expect(getTabVisiblePref('finance')).toBe(true);
    expect(getTabVisiblePref('hosp_floor')).toBe(true);
    expect(getTabVisiblePref('accounts')).toBe(true);
  });

  it('persists show/hide under a scoped key, generalized for any tab id', () => {
    expect(tabVisibleStorageKey('finance')).toBe('dg_tab_visible:finance:tenant-1:user-1');
    setTabVisiblePref('finance', false);
    expect(mem.get(tabVisibleStorageKey('finance'))).toBe('0');
    expect(getTabVisiblePref('finance')).toBe(false);

    setTabVisiblePref('finance', true);
    expect(mem.get(tabVisibleStorageKey('finance'))).toBe('1');
    expect(getTabVisiblePref('finance')).toBe(true);
  });

  it('keeps the legacy dg_accounts_visible key for the Accounts tab (back-compat)', () => {
    expect(tabVisibleStorageKey('accounts')).toBe('dg_accounts_visible:tenant-1:user-1');
    setTabVisiblePref('accounts', false);
    expect(mem.get('dg_accounts_visible:tenant-1:user-1')).toBe('0');
    expect(mem.has('dg_tab_visible:accounts:tenant-1:user-1')).toBe(false);
  });

  it('scopes prefs per user — a different user on the same device gets fresh defaults', () => {
    setTabVisiblePref('finance', false);
    expect(getTabVisiblePref('finance')).toBe(false);

    currentUserId = 'user-2';
    expect(getTabVisiblePref('finance')).toBe(true);

    currentUserId = 'user-1';
    expect(getTabVisiblePref('finance')).toBe(false);
  });

  it('toggling different tabs does not affect each other', () => {
    setTabVisiblePref('finance', false);
    expect(getTabVisiblePref('warranty')).toBe(true);
    expect(getTabVisiblePref('hosp_kitchen')).toBe(true);
  });

  it('dispatches a change event so the nav can re-render live', () => {
    const seen: Array<{ tabId: string; visible: boolean }> = [];
    const onChange = (e: Event) => seen.push((e as CustomEvent<{ tabId: string; visible: boolean }>).detail);
    window.addEventListener(TAB_VISIBLE_PREF_CHANGED_EVENT, onChange);
    try {
      setTabVisiblePref('purchases', false);
      setTabVisiblePref('purchases', true);
    } finally {
      window.removeEventListener(TAB_VISIBLE_PREF_CHANGED_EVENT, onChange);
    }
    expect(seen).toEqual([
      { tabId: 'purchases', visible: false },
      { tabId: 'purchases', visible: true },
    ]);
  });
});
