import { beforeEach, describe, expect, it, vi } from 'vitest';

const shareMock = vi.fn();

vi.mock('@capacitor/share', () => ({
  Share: { share: (...args: unknown[]) => shareMock(...args) },
}));

function stubCap(native: boolean) {
  vi.stubGlobal('window', {
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
    open: vi.fn(),
  });
}

const sampleInv = {
  invoiceNumber: 'INV-1',
  customerName: 'Acme Corp',
  customerPhone: '9876543210',
  items: [{ description: 'Service', qty: 1, rate: 100, gstPercent: 18, taxable: 100, tax: 18, total: 118 }],
  subtotal: 100,
  taxTotal: 18,
  grandTotal: 118,
  status: 'sent',
  invoiceDate: '2026-07-20',
};

describe('Cap WhatsApp invoice share (text only, no PDF gen)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    shareMock.mockReset();
    shareMock.mockResolvedValue(undefined);
  });

  it('standaloneInvoicePdfBasename is ClientName-datetime', async () => {
    const { standaloneInvoicePdfBasename } = await import('../../src/lib/printStandaloneInvoice');
    const when = new Date(2026, 6, 20, 13, 45, 7);
    expect(standaloneInvoicePdfBasename('Acme Corp', when)).toBe('Acme Corp-2026-07-20_13-45-07');
  });

  it('whatsAppInvoiceShareToast covers summary and PDF web outcomes', async () => {
    const { whatsAppInvoiceShareToast } = await import('../../src/lib/printStandaloneInvoice');
    expect(whatsAppInvoiceShareToast('summary')).toMatch(/Print → Save as PDF/);
    expect(whatsAppInvoiceShareToast('shared')).toMatch(/PDF shared/i);
  });

  it('buildStandaloneInvoicePdfBlob helper still builds a PDF (future Share PDF)', async () => {
    const { buildStandaloneInvoicePdfBlob } = await import('../../src/lib/standaloneInvoicePdf');
    const blob = await buildStandaloneInvoicePdfBlob(sampleInv, { companyName: 'Test Co' }, { hasGst: true });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(200);
    expect(blob.type).toMatch(/pdf/i);
  });

  it('shareHtmlPdfViaWhatsApp on Cap skips html2pdf (text summary)', async () => {
    stubCap(true);
    const { shareHtmlPdfViaWhatsApp } = await import('../../src/lib/utils');
    const how = await shareHtmlPdfViaWhatsApp({
      html: '<html><body><h1>heavy invoice</h1></body></html>',
      filename: 'test.pdf',
      phone: '9876543210',
      message: 'Invoice INV-1\nAcme\nTotal: ₹100',
    });
    expect(how).toBe('summary');
    expect(shareMock).toHaveBeenCalledWith(expect.objectContaining({ text: expect.any(String) }));
  });

  it('shareStandaloneInvoiceWhatsApp on Cap shares text only (no PDF)', async () => {
    stubCap(true);
    const { shareStandaloneInvoiceWhatsApp } = await import('../../src/lib/printStandaloneInvoice');
    const how = await shareStandaloneInvoiceWhatsApp(sampleInv);
    expect(how).toBe('summary');
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('INV-1'),
        dialogTitle: 'Share via WhatsApp',
      }),
    );
    expect(shareMock.mock.calls[0][0]).not.toHaveProperty('url');
  });
});
