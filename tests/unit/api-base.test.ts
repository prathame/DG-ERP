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

  it('keeps the current Render origin', () => {
    expect(resolveConfiguredApiOrigin('https://dhandho-2kdx.onrender.com/')).toBe('https://dhandho-2kdx.onrender.com');
  });

  it('remaps legacy dg-erp.onrender.com to current Render host', () => {
    expect(resolveConfiguredApiOrigin('https://dg-erp.onrender.com/')).toBe(CLOUD_ORIGIN_FALLBACK);
  });

  it('remaps aspirational dhandho.onrender.com to live dhandho-2kdx host', () => {
    expect(resolveConfiguredApiOrigin('https://dhandho.onrender.com/')).toBe(CLOUD_ORIGIN_FALLBACK);
  });

  it('remaps broken dhandho.app to Render on Cap/localhost', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'https://localhost' } });
    expect(resolveConfiguredApiOrigin('https://dhandho.app')).toBe(CLOUD_ORIGIN_FALLBACK);
    expect(resolveConfiguredApiOrigin('https://www.dhandho.app/')).toBe(CLOUD_ORIGIN_FALLBACK);
  });

  it('uses same-origin when page is already on a working host and env points at dhandho.app', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'dhandho-2kdx.onrender.com', origin: 'https://dhandho-2kdx.onrender.com' },
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
      location: { hostname: 'dhandho-2kdx.onrender.com', origin: 'https://dhandho-2kdx.onrender.com' },
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
        hostname: 'dhandho-2kdx.onrender.com',
        host: 'dhandho-2kdx.onrender.com',
        origin: 'https://dhandho-2kdx.onrender.com',
      },
    });
    expect(getPublicAppHostPrefix()).toBe('dhandho-2kdx.onrender.com/');
  });

  it('uses cloud API host on Cap localhost (not Cap loopback)', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', host: 'localhost', origin: 'https://localhost' },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(getPublicAppHostPrefix()).toBe('dhandho-2kdx.onrender.com/');
  });

  it('keeps dhandho.app when that is the live page host', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'dhandho.app', host: 'dhandho.app', origin: 'https://dhandho.app' },
    });
    expect(getPublicAppHostPrefix()).toBe('dhandho.app/');
  });
});
