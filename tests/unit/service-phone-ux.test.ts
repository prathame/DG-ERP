import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isServicePhoneUx } from '../../src/platforms/service-cloud/mode';
import { isServiceMobileMode } from '../../src/platforms/service-mobile/mode';

function stubWindow(opts: { Capacitor?: { isNativePlatform?: () => boolean } }) {
  vi.stubGlobal('window', {
    location: { search: '' },
    Capacitor: opts.Capacitor,
  });
}

describe('isServicePhoneUx', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true whenever Offline Mobile mode is on', () => {
    // Vitest for this repo often runs without VITE_DEPLOYMENT_MODE=service-mobile;
    // when it is set (service-mobile builds), helper must follow Offline regardless of type/Capacitor.
    if (isServiceMobileMode()) {
      expect(isServicePhoneUx('service')).toBe(true);
      expect(isServicePhoneUx('manufacturer')).toBe(true);
      expect(isServicePhoneUx(null)).toBe(true);
    } else {
      // Cloud browser / non-Capacitor: service type alone is not enough
      expect(isServicePhoneUx('service')).toBe(false);
      expect(isServicePhoneUx('manufacturer')).toBe(false);
    }
  });

  it('Capacitor cloud + businessType=service → true (when not Offline Mobile)', () => {
    if (isServiceMobileMode()) return; // Offline short-circuits; covered above
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    expect(isServicePhoneUx('service')).toBe(true);
  });

  it('Capacitor cloud + businessType=manufacturer → false', () => {
    if (isServiceMobileMode()) return;
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
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
