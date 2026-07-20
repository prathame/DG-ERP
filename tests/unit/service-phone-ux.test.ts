import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isServicePhoneUx } from '../../src/platforms/service-cloud/mode';
import { isServiceMobileMode } from '../../src/platforms/service-mobile/mode';
import { __resetPhoneModeForTests, setPhoneModeOnce } from '../../src/platforms/mobileMode';

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

function stubWindow(opts: { Capacitor?: { isNativePlatform?: () => boolean } }) {
  const ls = memoryLocalStorage();
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('window', {
    location: { search: '' },
    Capacitor: opts.Capacitor,
    localStorage: ls,
  });
}

describe('isServicePhoneUx', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    __resetPhoneModeForTests();
  });

  it('is true whenever Offline Mobile mode is on', () => {
    if (isServiceMobileMode()) {
      expect(isServicePhoneUx('service')).toBe(true);
      expect(isServicePhoneUx('manufacturer')).toBe(true);
      expect(isServicePhoneUx(null)).toBe(true);
    } else {
      expect(isServicePhoneUx('service')).toBe(false);
      expect(isServicePhoneUx('manufacturer')).toBe(false);
    }
  });

  it('Capacitor + Online latch + businessType=service → true (when not Offline Mobile)', () => {
    if (isServiceMobileMode()) return;
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    setPhoneModeOnce('online');
    expect(isServicePhoneUx('service')).toBe(true);
  });

  it('Capacitor without latch is not phone UX', () => {
    if (isServiceMobileMode()) return;
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    expect(isServicePhoneUx('service')).toBe(false);
  });

  it('Capacitor cloud + businessType=manufacturer → false', () => {
    if (isServiceMobileMode()) return;
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    setPhoneModeOnce('online');
    expect(isServicePhoneUx('manufacturer')).toBe(false);
    expect(isServicePhoneUx(null)).toBe(false);
    expect(isServicePhoneUx(undefined)).toBe(false);
  });

  it('service businessType in browser (no Capacitor) → false', () => {
    if (isServiceMobileMode()) return;
    stubWindow({});
    expect(isServicePhoneUx('service')).toBe(false);
  });

  it('Capacitor with isNativePlatform false → false for service', () => {
    if (isServiceMobileMode()) return;
    stubWindow({ Capacitor: { isNativePlatform: () => false } });
    expect(isServicePhoneUx('service')).toBe(false);
  });
});
