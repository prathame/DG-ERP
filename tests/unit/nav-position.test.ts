import { afterEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, string> = {};

vi.mock('../../src/lib/session', () => ({
  session: {
    getTenantId: () => 't1',
    getUser: () => ({ id: 'u1' }),
  },
}));

vi.stubGlobal('localStorage', {
  getItem: (k: string) => (k in store ? store[k]! : null),
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
});

vi.stubGlobal('window', {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

import {
  applyNavChrome,
  getNavPositionPref,
  isNavHorizontal,
  isNavPosition,
  navPositionStorageKey,
  setNavPositionPref,
} from '../../src/lib/navPositionPref';

describe('nav position pref', () => {
  afterEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('defaults to left', () => {
    expect(getNavPositionPref()).toBe('left');
  });

  it('persists each edge', () => {
    for (const pos of ['left', 'right', 'top', 'bottom'] as const) {
      setNavPositionPref(pos);
      expect(getNavPositionPref()).toBe(pos);
    }
  });

  it('ignores junk in storage', () => {
    store[navPositionStorageKey()] = 'diagonal';
    expect(getNavPositionPref()).toBe('left');
  });

  it('treats top and bottom as a horizontal bar', () => {
    expect(isNavPosition('top')).toBe(true);
    expect(isNavHorizontal('top')).toBe(true);
    expect(isNavHorizontal('left')).toBe(false);
  });

  it('writes menu gutters onto html for floating chrome', () => {
    const setProperty = vi.fn();
    const html = { dataset: {} as Record<string, string>, style: { setProperty } };
    vi.stubGlobal('document', { documentElement: html });
    applyNavChrome('right', false);
    expect(html.dataset.navPos).toBe('right');
    expect(html.dataset.navCollapsed).toBe('0');
    expect(setProperty).toHaveBeenCalledWith('--dg-nav-side', '16rem');
    applyNavChrome('bottom', true);
    expect(html.dataset.navPos).toBe('bottom');
    expect(html.dataset.navCollapsed).toBe('1');
    expect(setProperty).toHaveBeenCalledWith('--dg-nav-bar', '3.5rem');
  });
});
