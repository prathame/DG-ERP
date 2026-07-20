import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  __resetPhoneModeForTests,
  getPhoneMode,
  setPhoneModeOnce,
  isPhoneModeChosen,
  needsPhoneModePicker,
  isNativeCapacitorShell,
  isBakedServiceMobile,
  PHONE_MODE_STORAGE_KEY,
} from '../../src/platforms/mobileMode';
import { isServiceMobileMode } from '../../src/platforms/service-mobile/mode';
import {
  isServiceCloudMobile,
  serviceCloudClientHeader,
  isServiceCloudClient,
} from '../../src/platforms/service-cloud/mode';
import { isMobileAppShell } from '../../src/lib/mobileAppShell';

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function stubCap(native: boolean) {
  const ls = memoryLocalStorage();
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('window', {
    location: { search: '' },
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
    localStorage: ls,
  });
}

describe('phone mode latch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubCap(false);
    __resetPhoneModeForTests();
  });

  it('sets mode once and rejects overwrite', () => {
    expect(isPhoneModeChosen()).toBe(false);
    expect(setPhoneModeOnce('offline')).toEqual({ ok: true, mode: 'offline' });
    expect(getPhoneMode()).toBe('offline');
    expect(setPhoneModeOnce('online')).toMatchObject({ ok: false, mode: 'offline' });
    expect(getPhoneMode()).toBe('offline');
    expect(localStorage.getItem(PHONE_MODE_STORAGE_KEY)).toBe('offline');
  });

  it('allows idempotent set of the same mode', () => {
    setPhoneModeOnce('online');
    expect(setPhoneModeOnce('online')).toEqual({ ok: true, mode: 'online' });
  });

  it('stores mode latch without secrets (plain offline|online only)', () => {
    setPhoneModeOnce('offline');
    expect(localStorage.getItem(PHONE_MODE_STORAGE_KEY)).toBe('offline');
    expect(localStorage.getItem(PHONE_MODE_STORAGE_KEY)).not.toMatch(/Bearer|DG-SM-|jwt/i);
  });
});

describe('exclusive Cap gates (security isolation)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubCap(true);
    __resetPhoneModeForTests();
  });

  it('Cap without latch is neither offline nor online', () => {
    expect(isNativeCapacitorShell()).toBe(true);
    expect(needsPhoneModePicker()).toBe(true);
    expect(isServiceMobileMode()).toBe(false);
    expect(isServiceCloudMobile()).toBe(false);
    expect(serviceCloudClientHeader()).toBeNull();
  });

  it('offline latch enables Offline stack and blocks cloud seat header', () => {
    setPhoneModeOnce('offline');
    expect(isServiceMobileMode()).toBe(true);
    expect(isServiceCloudMobile()).toBe(false);
    expect(isServiceCloudClient()).toBe(false);
    expect(serviceCloudClientHeader()).toBeNull();
    expect(needsPhoneModePicker()).toBe(false);
  });

  it('online latch enables Online Cap stack only', () => {
    setPhoneModeOnce('online');
    expect(isServiceMobileMode()).toBe(false);
    expect(isServiceCloudMobile()).toBe(true);
    expect(serviceCloudClientHeader()).toBe('capacitor-cloud');
    expect(needsPhoneModePicker()).toBe(false);
  });

  it('cannot flip offline → online to reach cloud client header', () => {
    setPhoneModeOnce('offline');
    const flip = setPhoneModeOnce('online');
    expect(flip.ok).toBe(false);
    expect(isServiceMobileMode()).toBe(true);
    expect(isServiceCloudMobile()).toBe(false);
    expect(serviceCloudClientHeader()).toBeNull();
  });

  it('cannot flip online → offline to enable Offline stack', () => {
    setPhoneModeOnce('online');
    const flip = setPhoneModeOnce('offline');
    expect(flip.ok).toBe(false);
    expect(isServiceMobileMode()).toBe(false);
    expect(isServiceCloudMobile()).toBe(true);
  });

  it('unified Cap shell is mobile app shell before and after latch', () => {
    expect(isMobileAppShell()).toBe(true);
    setPhoneModeOnce('online');
    expect(isMobileAppShell()).toBe(true);
  });
});

describe('web (non-Cap) unchanged', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubCap(false);
    __resetPhoneModeForTests();
  });

  it('does not require picker and is not Cap mobile', () => {
    expect(needsPhoneModePicker()).toBe(false);
    expect(isServiceCloudMobile()).toBe(false);
    // Baked offline-only Vite mode may still be true in some CI env files
    if (!isBakedServiceMobile()) {
      expect(isServiceMobileMode()).toBe(false);
    }
  });
});
