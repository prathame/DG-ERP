import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('isShowHsnSacEnabled', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../src/platforms/service-mobile/mode');
  });

  it('cloud: defaults ON when setting missing (opt-out)', async () => {
    vi.doMock('../../src/platforms/service-mobile/mode', () => ({
      isServiceMobileMode: () => false,
    }));
    const { isShowHsnSacEnabled } = await import('../../src/lib/billSettingsFlags');
    expect(isShowHsnSacEnabled(null)).toBe(true);
    expect(isShowHsnSacEnabled({})).toBe(true);
    expect(isShowHsnSacEnabled({ showHsnSac: true })).toBe(true);
    expect(isShowHsnSacEnabled({ showHsnSac: false })).toBe(false);
  });

  it('offline: defaults OFF when setting missing (opt-in)', async () => {
    vi.doMock('../../src/platforms/service-mobile/mode', () => ({
      isServiceMobileMode: () => true,
    }));
    const { isShowHsnSacEnabled } = await import('../../src/lib/billSettingsFlags');
    expect(isShowHsnSacEnabled(null)).toBe(false);
    expect(isShowHsnSacEnabled({})).toBe(false);
    expect(isShowHsnSacEnabled({ showHsnSac: false })).toBe(false);
    expect(isShowHsnSacEnabled({ showHsnSac: true })).toBe(true);
  });
});
