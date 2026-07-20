import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('GST bill settings flags', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('manufacturer cloud: GST on by default (opt-out)', async () => {
    vi.doMock('../../src/lib/session', () => ({
      session: { getUser: () => ({ businessType: 'manufacturer' }) },
    }));
    vi.doMock('../../src/platforms/service-cloud/mode', () => ({
      isServicePhoneUx: () => false,
    }));
    const { isGstBillingEnabled, invoiceHasGst } = await import('../../src/lib/billSettingsFlags');
    expect(isGstBillingEnabled(null)).toBe(true);
    expect(isGstBillingEnabled({})).toBe(true);
    expect(isGstBillingEnabled({ showGst: true })).toBe(true);
    expect(isGstBillingEnabled({ showGst: false })).toBe(false);
    // legacy HSN key still works
    expect(isGstBillingEnabled({ showHsnSac: false })).toBe(false);
    expect(invoiceHasGst({ gstEnabled: true, taxTotal: 0 })).toBe(true);
    expect(invoiceHasGst({ gstEnabled: false, taxTotal: 100 })).toBe(false);
    expect(invoiceHasGst({ taxTotal: 50 })).toBe(true);
    expect(invoiceHasGst({ taxTotal: 0 })).toBe(false);
  });

  it('service phone UX: GST off by default (opt-in)', async () => {
    vi.doMock('../../src/lib/session', () => ({
      session: { getUser: () => ({ businessType: 'service' }) },
    }));
    vi.doMock('../../src/platforms/service-cloud/mode', () => ({
      isServicePhoneUx: () => true,
    }));
    const { isGstBillingEnabled, isServicePhoneBillUx } = await import('../../src/lib/billSettingsFlags');
    expect(isServicePhoneBillUx()).toBe(true);
    expect(isGstBillingEnabled(null)).toBe(false);
    expect(isGstBillingEnabled({})).toBe(false);
    expect(isGstBillingEnabled({ showGst: false })).toBe(false);
    expect(isGstBillingEnabled({ showGst: true })).toBe(true);
    expect(isGstBillingEnabled({ showHsnSac: true })).toBe(true);
  });

  it('showGst takes precedence over legacy showHsnSac', async () => {
    vi.doMock('../../src/lib/session', () => ({
      session: { getUser: () => ({ businessType: 'manufacturer' }) },
    }));
    vi.doMock('../../src/platforms/service-cloud/mode', () => ({
      isServicePhoneUx: () => false,
    }));
    const { isGstBillingEnabled } = await import('../../src/lib/billSettingsFlags');
    expect(isGstBillingEnabled({ showGst: false, showHsnSac: true })).toBe(false);
    expect(isGstBillingEnabled({ showGst: true, showHsnSac: false })).toBe(true);
  });

  it('quotationLineWithGst follows bill toggle on create; keeps draft lines when editing', async () => {
    vi.doMock('../../src/lib/session', () => ({
      session: { getUser: () => ({ businessType: 'service' }) },
    }));
    vi.doMock('../../src/platforms/service-cloud/mode', () => ({
      isServicePhoneUx: () => true,
    }));
    const { quotationLineWithGst } = await import('../../src/lib/billSettingsFlags');
    expect(quotationLineWithGst(false, false, true)).toBe(false);
    expect(quotationLineWithGst(true, false, true)).toBe(true);
    expect(quotationLineWithGst(true, false, false)).toBe(false);
    expect(quotationLineWithGst(false, true, true)).toBe(true);
    expect(quotationLineWithGst(false, true, false)).toBe(false);
  });
});
