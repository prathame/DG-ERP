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

describe('mobile seatStorage', () => {
  let shim: ReturnType<typeof installBrowserShim>;

  beforeEach(() => {
    vi.resetModules();
    shim = installBrowserShim();
  });

  afterEach(() => {
    shim.resetStore();
    vi.unstubAllGlobals();
  });

  it('saves, reads, and clears seat + entitlement flag', async () => {
    const { getStoredSeat, saveStoredSeat, clearStoredSeat, isOfflineEntitled, setOfflineEntitled } =
      await import('../../src/platforms/mobile/online/seatStorage');

    expect(getStoredSeat()).toBeNull();
    expect(isOfflineEntitled()).toBe(false);

    saveStoredSeat({
      seatKey: 'DG-MS-AAAA-BBBB-CCCC',
      slug: 'acme-svc',
      companyName: 'Acme',
      activatedAt: '2026-01-01T00:00:00.000Z',
      offlineEnabled: true,
    });
    expect(getStoredSeat()?.slug).toBe('acme-svc');
    expect(isOfflineEntitled()).toBe(true);

    setOfflineEntitled(false);
    expect(isOfflineEntitled()).toBe(false);
    expect(getStoredSeat()?.offlineEnabled).toBe(false);

    setOfflineEntitled(true);
    expect(isOfflineEntitled()).toBe(true);

    clearStoredSeat();
    expect(getStoredSeat()).toBeNull();
    expect(isOfflineEntitled()).toBe(false);
  });

  it('returns null for corrupt or incomplete seat JSON', async () => {
    const { getStoredSeat } = await import('../../src/platforms/mobile/online/seatStorage');
    shim.localStorage.setItem('dg_mobile_seat_v1', '{bad');
    expect(getStoredSeat()).toBeNull();
    shim.localStorage.setItem('dg_mobile_seat_v1', JSON.stringify({ seatKey: 'DG-MS-X' }));
    expect(getStoredSeat()).toBeNull();
  });
});
