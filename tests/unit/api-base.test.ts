import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_ORIGIN_FALLBACK,
  resolveConfiguredApiOrigin,
  resolveApiUrl,
  getApiOrigin,
} from '../../src/platforms/shared/apiBase';

describe('resolveConfiguredApiOrigin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty for unset (same-origin web)', () => {
    expect(resolveConfiguredApiOrigin(undefined)).toBe('');
    expect(resolveConfiguredApiOrigin('')).toBe('');
  });

  it('keeps a working absolute origin', () => {
    expect(resolveConfiguredApiOrigin('https://dg-erp.onrender.com/')).toBe('https://dg-erp.onrender.com');
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
  it('uses relative /api paths for hosted web', () => {
    // vitest does not set VITE_API_ORIGIN by default
    expect(getApiOrigin()).toBe('');
    expect(resolveApiUrl('/api/tenant/by-slug/test')).toBe('/api/tenant/by-slug/test');
  });
});
