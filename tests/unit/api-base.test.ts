import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_ORIGIN_FALLBACK,
  resolveConfiguredApiOrigin,
  resolveApiUrl,
  getApiOrigin,
  getPublicAppHostPrefix,
} from '../../src/platforms/shared/apiBase';

describe('resolveConfiguredApiOrigin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty for unset (same-origin web)', () => {
    expect(resolveConfiguredApiOrigin(undefined)).toBe('');
    expect(resolveConfiguredApiOrigin('')).toBe('');
  });

  it('keeps the live Render origin', () => {
    expect(resolveConfiguredApiOrigin('https://dg-erp.onrender.com/')).toBe('https://dg-erp.onrender.com');
  });

  it('remaps premature dhandho.onrender.com to the live Render host', () => {
    expect(resolveConfiguredApiOrigin('https://dhandho.onrender.com/')).toBe(CLOUD_ORIGIN_FALLBACK);
  });

  it('remaps broken dhandho.app to Render on Cap/localhost', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'https://localhost' } });
    expect(resolveConfiguredApiOrigin('https://dhandho.app')).toBe(CLOUD_ORIGIN_FALLBACK);
    expect(resolveConfiguredApiOrigin('https://www.dhandho.app/')).toBe(CLOUD_ORIGIN_FALLBACK);
  });

  it('uses same-origin when page is already on a working host and env points at dhandho.app', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'dg-erp.onrender.com', origin: 'https://dg-erp.onrender.com' },
    });
    expect(resolveConfiguredApiOrigin('https://dhandho.app')).toBe('');
  });
});

describe('resolveApiUrl / getApiOrigin (no VITE_API_ORIGIN)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses relative /api paths for hosted web', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'dg-erp.onrender.com', origin: 'https://dg-erp.onrender.com' },
    });
    // vitest does not set VITE_API_ORIGIN by default
    expect(getApiOrigin()).toBe('');
    expect(resolveApiUrl('/api/tenant/by-slug/test')).toBe('/api/tenant/by-slug/test');
  });

  it('falls back to Render for Online Cap WebView when env is unset', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', origin: 'https://localhost' },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(getApiOrigin()).toBe(CLOUD_ORIGIN_FALLBACK);
    expect(resolveApiUrl('/api/tenant/by-slug/test')).toBe(`${CLOUD_ORIGIN_FALLBACK}/api/tenant/by-slug/test`);
  });
});

describe('getPublicAppHostPrefix', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the live page host on Render web', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'dg-erp.onrender.com',
        host: 'dg-erp.onrender.com',
        origin: 'https://dg-erp.onrender.com',
      },
    });
    expect(getPublicAppHostPrefix()).toBe('dg-erp.onrender.com/');
  });

  it('uses cloud API host on Cap localhost (not Cap loopback)', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', host: 'localhost', origin: 'https://localhost' },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(getPublicAppHostPrefix()).toBe('dg-erp.onrender.com/');
  });

  it('keeps dhandho.app when that is the live page host', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'dhandho.app', host: 'dhandho.app', origin: 'https://dhandho.app' },
    });
    expect(getPublicAppHostPrefix()).toBe('dhandho.app/');
  });
});
