import { describe, it, expect, beforeEach, vi } from 'vitest';
import { skipMarketingLanding, isElectronAppShell } from '../../src/lib/mobileAppShell';
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
  electronAPI?: { deploymentMode?: string; isElectron?: boolean; platform?: string };
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

describe('skipMarketingLanding', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    __resetPhoneModeForTests();
  });

  it('keeps marketing landing in a plain browser tab', () => {
    stubWindow({});
    expect(skipMarketingLanding()).toBe(false);
  });

  it('ignores ?desktop=1 without Electron preload (browser on Win or Mac)', () => {
    stubWindow({ search: '?desktop=1' });
    expect(skipMarketingLanding()).toBe(false);
  });

  it('skips landing for Online desktop on Windows', () => {
    stubWindow({ electronAPI: { isElectron: true, deploymentMode: 'cloud', platform: 'win32' } });
    expect(isElectronAppShell()).toBe(true);
    expect(skipMarketingLanding()).toBe(true);
  });

  it('skips landing for Online desktop on Mac', () => {
    stubWindow({ electronAPI: { isElectron: true, deploymentMode: 'cloud', platform: 'darwin' } });
    expect(skipMarketingLanding()).toBe(true);
  });

  it('skips landing for Offline desktop (Win or Mac)', () => {
    stubWindow({ electronAPI: { isElectron: true, deploymentMode: 'onprem', platform: 'win32' } });
    expect(skipMarketingLanding()).toBe(true);
  });

  it('skips landing for Online Cap after mode latch', () => {
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    expect(skipMarketingLanding()).toBe(false);
    setPhoneModeOnce('online');
    expect(skipMarketingLanding()).toBe(true);
  });
});
