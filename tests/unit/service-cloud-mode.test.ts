import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isServiceCloudDesktop,
  isServiceCloudMobile,
  isServiceCloudClient,
  serviceCloudClientHeader,
  serviceCloudClientKind,
} from '../../src/platforms/service-cloud/mode';

function stubWindow(opts: {
  search?: string;
  electronAPI?: { deploymentMode?: string; isElectron?: boolean };
  Capacitor?: { isNativePlatform?: () => boolean };
}) {
  vi.stubGlobal('window', {
    location: { search: opts.search ?? '' },
    electronAPI: opts.electronAPI,
    Capacitor: opts.Capacitor,
  });
}

describe('service-cloud mode detection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
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

  it('detects Capacitor native as cloud mobile', () => {
    stubWindow({ Capacitor: { isNativePlatform: () => true } });
    expect(isServiceCloudMobile()).toBe(true);
    expect(serviceCloudClientHeader()).toBe('capacitor-cloud');
  });
});
