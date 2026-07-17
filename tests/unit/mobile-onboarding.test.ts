/**
 * Mobile company-slug onboarding storage helpers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installBrowserShim } from '../helpers/browser-shim';

describe('mobile companyStorage', () => {
  let shim: ReturnType<typeof installBrowserShim>;

  beforeEach(() => {
    vi.resetModules();
    shim = installBrowserShim();
  });

  afterEach(() => {
    shim.resetStore();
    vi.unstubAllGlobals();
  });

  it('saves and reads company slug', async () => {
    const { saveCompanySlug, getSavedCompanySlug, clearSavedCompanySlug } =
      await import('../../src/platforms/mobile/online/companyStorage');
    expect(getSavedCompanySlug()).toBeNull();
    saveCompanySlug('  Acme-Co/ ');
    expect(getSavedCompanySlug()).toBe('acme-co');
    expect(shim.localStorage.getItem('dg_last_slug')).toBe('acme-co');
    clearSavedCompanySlug();
    expect(getSavedCompanySlug()).toBeNull();
  });

  it('creates stable device id for heartbeat', async () => {
    const { getMobileDeviceId } = await import('../../src/platforms/mobile/online/mobileSync');
    const a = getMobileDeviceId();
    const b = getMobileDeviceId();
    expect(a).toBe(b);
    expect(a.startsWith('dev_')).toBe(true);
  });
});
