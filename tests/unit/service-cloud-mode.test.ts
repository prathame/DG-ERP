import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isServiceCloudDesktop,
  isServiceCloudMobile,
  isServiceCloudClient,
  serviceCloudClientHeader,
  serviceCloudClientKind,
} from '../../src/platforms/service-cloud/mode';
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

function stubWindow(opts: {
  search?: string;
  electronAPI?: { deploymentMode?: string; isElectron?: boolean };
  Capacitor?: { isNativePlatform?: () => boolean };
}) {
  const ls = memoryLocalStorage();
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('window', {
    location: { search: opts.search ?? '' },
    electronAPI: opts.electronAPI,
    Capacitor: opts.Capacitor,
    localStorage: ls,
  });
}

describe('service-cloud mode detection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    __resetPhoneModeForTests();
  });

  it('detects ?desktop=1 as cloud desktop', () => {
    stubWindow({ search: '?desktop=1' });
    expect(isServiceCloudDesktop()).toBe(true);
    expect(serviceCloudClientKind()).toBe('desktop');
    expect(serviceCloudClientHeader()).toBe('electron-cloud');
    expect(isServiceCloudClient()).toBe(true);
  });

  it('detects electron cloud bridge', () => {
    stubWindow({ electronAPI: { deploymentMode: 'cloud' } });
    expect(isServiceCloudDesktop()).toBe(true);
    expect(isServiceCloudMobile()).toBe(false);
  });

  it('ignores on-prem electron', () => {
    stubWindow({ electronAPI: { deploymentMode: 'onprem' } });
    expect(isServiceCloudDesktop()).toBe(false);
    expect(isServiceCloudClient()).toBe(false);
  });

  it('Capacitor native is cloud mobile only after Online latch', () => {
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    expect(isServiceCloudMobile()).toBe(false);
    setPhoneModeOnce('online');
    expect(isServiceCloudMobile()).toBe(true);
    expect(serviceCloudClientHeader()).toBe('capacitor-cloud');
  });

  it('Live badge surface is Cap-only (desktop cloud must stay false)', () => {
    stubWindow({ electronAPI: { deploymentMode: 'cloud' } });
    expect(isServiceCloudDesktop()).toBe(true);
    expect(isServiceCloudMobile()).toBe(false);

    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    __resetPhoneModeForTests();
    setPhoneModeOnce('online');
    expect(isServiceCloudMobile()).toBe(true);
    expect(isServiceCloudDesktop()).toBe(false);
  });
});
