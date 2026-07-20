import { beforeEach, describe, expect, it, vi } from 'vitest';

const shareMock = vi.fn();
const writeFileMock = vi.fn();
const getUriMock = vi.fn();
const mkdirMock = vi.fn();
const saveDhandhoMock = vi.fn();
const buildPdfMock = vi.fn();
const loadCacheMock = vi.fn();

vi.mock('@capacitor/share', () => ({
  Share: { share: (...args: unknown[]) => shareMock(...args) },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => writeFileMock(...args),
    getUri: (...args: unknown[]) => getUriMock(...args),
    mkdir: (...args: unknown[]) => mkdirMock(...args),
  },
  Directory: { Cache: 'CACHE', External: 'EXTERNAL', Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
}));

vi.mock('../../src/lib/dhandhoFiles', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/dhandhoFiles')>('../../src/lib/dhandhoFiles');
  return {
    ...actual,
    saveDhandhoFile: (...args: unknown[]) => saveDhandhoMock(...args),
    isNativeCapacitor: () =>
      Boolean(
        (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
      ),
  };
});

vi.mock('../../src/lib/standaloneInvoicePdf', () => ({
  buildStandaloneInvoicePdfBlob: (...args: unknown[]) => buildPdfMock(...args),
}));

vi.mock('../../src/lib/capBillPdfCache', () => ({
  loadFreshCapBillPdfCache: (...args: unknown[]) => loadCacheMock(...args),
  scheduleBakeCapBillPdfCache: vi.fn(),
  bakeCapBillPdfCache: vi.fn(),
  billPdfContentKey: () => 'test-key',
}));

function stubCap(native: boolean) {
  const loc = { pathname: '/', href: 'http://localhost/', search: '', hash: '' };
  vi.stubGlobal('window', {
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
    open: vi.fn(),
    location: loc,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage,
  });
  // session.ts reads window.location; keep it defined after stubGlobal
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true });
}

vi.mock('../../src/lib/session', () => ({
  session: {
    getUser: () => ({ companyName: 'Test Co', phone: '999', gstNumber: 'GST1' }),
    getToken: () => null,
  },
}));

const sampleInv = {
  id: 'inv-uuid-1',
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

describe('Cap WhatsApp invoice share (light PDF + timeout fallback + debug logs)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    shareMock.mockReset();
    writeFileMock.mockReset();
    getUriMock.mockReset();
    mkdirMock.mockReset();
    saveDhandhoMock.mockReset();
    buildPdfMock.mockReset();
    loadCacheMock.mockReset();
    shareMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue({});
    getUriMock.mockResolvedValue({ uri: 'content://cache/share/inv.pdf' });
    mkdirMock.mockResolvedValue({});
    saveDhandhoMock.mockResolvedValue({
      path: 'Dhandho/invoices/x.pdf',
      relativePath: 'Dhandho/invoices/x.pdf',
      uri: 'file://dhandho/x.pdf',
      filename: 'x.pdf',
    });
    buildPdfMock.mockResolvedValue(new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' }));
    loadCacheMock.mockResolvedValue(null);
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('standaloneInvoicePdfBasename is ClientName-datetime', async () => {
    const { standaloneInvoicePdfBasename } = await import('../../src/lib/printStandaloneInvoice');
    const when = new Date(2026, 6, 20, 13, 45, 7);
    expect(standaloneInvoicePdfBasename('Acme Corp', when)).toBe('Acme Corp-2026-07-20_13-45-07');
  });

  it('whatsAppInvoiceShareToast covers pdf_fallback with error hint', async () => {
    const { whatsAppInvoiceShareToast } = await import('../../src/lib/printStandaloneInvoice');
    expect(whatsAppInvoiceShareToast('shared')).toMatch(/PDF shared/i);
    expect(whatsAppInvoiceShareToast('pdf_fallback')).toMatch(/PDF failed/i);
    expect(whatsAppInvoiceShareToast('pdf_fallback', 'PDF_TIMEOUT')).toMatch(/PDF_TIMEOUT/);
  });

  it('shareHtmlPdfViaWhatsApp on Cap skips html2pdf (wa.me text, not Share sheet)', async () => {
    stubCap(true);
    const { shareHtmlPdfViaWhatsApp } = await import('../../src/lib/utils');
    const how = await shareHtmlPdfViaWhatsApp({
      html: '<html><body><h1>heavy invoice</h1></body></html>',
      filename: 'test.pdf',
      phone: '9876543210',
      message: 'Invoice INV-1\nAcme\nTotal: ₹100',
    });
    expect(how).toBe('summary');
    expect(shareMock).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('wa.me/'), '_blank');
    expect(buildPdfMock).not.toHaveBeenCalled();
  });

  it('Cap WhatsApp shares light PDF file-only on success', async () => {
    stubCap(true);
    const preparing = vi.fn();
    const { shareStandaloneInvoiceWhatsApp } = await import('../../src/lib/printStandaloneInvoice');
    const { getClientBreadcrumbs, getRecentClientLogs } = await import('../../src/lib/logger');

    const result = await shareStandaloneInvoiceWhatsApp(sampleInv, { onPreparing: preparing });

    expect(preparing).toHaveBeenCalledOnce();
    expect(loadCacheMock).toHaveBeenCalledOnce();
    expect(buildPdfMock).toHaveBeenCalledOnce();
    expect(result.how).toBe('shared');
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'content://cache/share/inv.pdf',
        dialogTitle: 'Share via WhatsApp',
      }),
    );
    expect(shareMock.mock.calls[0][0]).not.toHaveProperty('text');
    expect(saveDhandhoMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalled();

    const crumbs = getClientBreadcrumbs(20).join('\n');
    expect(crumbs).toMatch(/WhatsApp invoice share start/);
    expect(crumbs).toMatch(/PDF build ok|Share\.share ok/);
    const logs = getRecentClientLogs(40).join('\n');
    expect(logs).toMatch(/correlationId/);
    expect(logs).toMatch(/INV-1/);
  });

  it('Cap WhatsApp uses fresh baked cache and skips jsPDF build', async () => {
    stubCap(true);
    loadCacheMock.mockResolvedValue(new Blob(['%PDF-1.4 cached'], { type: 'application/pdf' }));

    const { shareStandaloneInvoiceWhatsApp } = await import('../../src/lib/printStandaloneInvoice');
    const { getClientBreadcrumbs } = await import('../../src/lib/logger');

    const result = await shareStandaloneInvoiceWhatsApp(sampleInv);

    expect(result.how).toBe('shared');
    expect(loadCacheMock).toHaveBeenCalledOnce();
    expect(buildPdfMock).not.toHaveBeenCalled();
    expect(shareMock).toHaveBeenCalled();
    const crumbs = getClientBreadcrumbs(20).join('\n');
    expect(crumbs).toMatch(/PDF cache hit/);
  });

  it('Cap WhatsApp falls back to text on PDF timeout', async () => {
    stubCap(true);
    buildPdfMock.mockImplementation(() => new Promise(() => {})); // never resolves

    const { shareStandaloneInvoiceWhatsApp, CAP_WHATSAPP_PDF_TIMEOUT_MS } =
      await import('../../src/lib/printStandaloneInvoice');
    const { getClientBreadcrumbs } = await import('../../src/lib/logger');

    vi.useFakeTimers();
    try {
      const pending = shareStandaloneInvoiceWhatsApp(sampleInv);
      // flush yieldToUi setTimeout(0), then fire PDF timeout
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(CAP_WHATSAPP_PDF_TIMEOUT_MS + 10);
      const result = await pending;

      expect(result.how).toBe('pdf_fallback');
      expect(result.errorHint).toMatch(/PDF_TIMEOUT/i);
      expect(shareMock).not.toHaveBeenCalled();
      expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/wa\.me\/91.*INV-1|wa\.me\/.*text=/), '_blank');

      const crumbs = getClientBreadcrumbs(20).join('\n');
      expect(crumbs).toMatch(/PDF build timeout|text fallback/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Cap WhatsApp falls back to text on PDF build failure', async () => {
    stubCap(true);
    buildPdfMock.mockRejectedValue(new Error('no items'));

    const { shareStandaloneInvoiceWhatsApp } = await import('../../src/lib/printStandaloneInvoice');
    const result = await shareStandaloneInvoiceWhatsApp(sampleInv);

    expect(result.how).toBe('pdf_fallback');
    expect(result.errorHint).toMatch(/no items/i);
    expect(shareMock).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('wa.me/'), '_blank');
  });
});
