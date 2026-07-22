import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildPdfMock = vi.fn();
const openExternalMock = vi.fn();
const sharePdfWhatsAppMock = vi.fn();

vi.mock('../../src/lib/standaloneInvoicePdf', () => ({
  buildStandaloneInvoicePdfBlob: (...args: unknown[]) => buildPdfMock(...args),
}));

vi.mock('../../src/lib/session', () => ({
  session: {
    getUser: () => ({ companyName: 'Test Co', phone: '999', gstNumber: 'GST1' }),
    getToken: () => null,
  },
}));

vi.mock('../../src/api', () => ({
  api: {
    settings: {
      getBillSettings: vi.fn().mockResolvedValue({ primaryColor: '#F27D26' }),
    },
  },
  fetchApi: vi.fn(),
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

function stubElectron(opts?: { ipc?: boolean }) {
  const loc = { pathname: '/', href: 'http://localhost/?desktop=1', search: '?desktop=1', hash: '' };
  openExternalMock.mockReset();
  openExternalMock.mockResolvedValue(undefined);
  sharePdfWhatsAppMock.mockReset();
  sharePdfWhatsAppMock.mockResolvedValue({
    ok: true,
    clipboardOk: true,
    revealed: true,
    whatsappOpened: true,
    filePath: '/tmp/Acme_Corp.pdf',
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-pdf');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
  const fakeDoc = {
    createElement: vi.fn(() => anchor),
    body: { appendChild: vi.fn() },
  };
  const electronAPI: Record<string, unknown> = {
    isElectron: true,
    deploymentMode: 'cloud',
    openExternal: (...args: unknown[]) => openExternalMock(...args),
  };
  if (opts?.ipc !== false) {
    electronAPI.sharePdfWhatsApp = (...args: unknown[]) => sharePdfWhatsAppMock(...args);
  }
  vi.stubGlobal('window', {
    Capacitor: undefined,
    electronAPI,
    open: vi.fn(),
    location: loc,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage,
    document: fakeDoc,
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
  });
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true });
}

function stubBrowser() {
  const loc = { pathname: '/', href: 'http://localhost/', search: '', hash: '' };
  vi.stubGlobal('window', {
    ...globalThis.window,
    Capacitor: undefined,
    electronAPI: undefined,
    open: vi.fn(),
    location: loc,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage,
    document: globalThis.document,
  });
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true });
}

describe('Electron WhatsApp invoice share (separate from Cap)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    buildPdfMock.mockReset();
    buildPdfMock.mockResolvedValue(new Blob(['%PDF-1.4 electron'], { type: 'application/pdf' }));
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('Electron IPC path saves PDF + clipboard + WhatsApp (Cap unchanged)', async () => {
    stubElectron();
    const preparing = vi.fn();

    const { shareStandaloneInvoiceWhatsApp } = await import('../../src/lib/printStandaloneInvoice');
    const { getClientBreadcrumbs } = await import('../../src/lib/logger');

    const result = await shareStandaloneInvoiceWhatsApp(sampleInv, { onPreparing: preparing });

    expect(preparing).toHaveBeenCalledOnce();
    expect(buildPdfMock).toHaveBeenCalledOnce();
    expect(result.how).toBe('shared');
    expect(sharePdfWhatsAppMock).toHaveBeenCalledOnce();
    const payload = sharePdfWhatsAppMock.mock.calls[0][0] as {
      base64: string;
      filename: string;
      phone?: string;
      message?: string;
    };
    expect(payload.base64).toBeTruthy();
    expect(payload.filename).toMatch(/\.pdf$/i);
    expect(payload.phone).toBe('9876543210');
    expect(payload.message).toContain('INV-1');
    expect(openExternalMock).not.toHaveBeenCalled();

    const crumbs = getClientBreadcrumbs(30).join('\n');
    expect(crumbs).toMatch(/WhatsApp invoice share start/);
    expect(crumbs).toMatch(/WhatsApp Electron PDF build start/);
    expect(crumbs).toMatch(/WhatsApp Electron PDF build ok/);
    expect(crumbs).toMatch(/WhatsApp Electron IPC share start/);
    expect(crumbs).toMatch(/WhatsApp Electron share ok/);
    expect(crumbs).not.toMatch(/html2pdf/);
  });

  it('Electron falls back to download + wa.me when IPC missing', async () => {
    stubElectron({ ipc: false });

    const { shareStandaloneInvoiceWhatsApp } = await import('../../src/lib/printStandaloneInvoice');

    const result = await shareStandaloneInvoiceWhatsApp(sampleInv);

    expect(result.how).toBe('text');
    expect(sharePdfWhatsAppMock).not.toHaveBeenCalled();
    expect(openExternalMock).toHaveBeenCalledWith(expect.stringContaining('wa.me/919876543210'));
  });

  it('Electron path falls back to text with error breadcrumbs on PDF failure', async () => {
    stubElectron();
    buildPdfMock.mockRejectedValue(new Error('no items'));

    const { shareStandaloneInvoiceWhatsApp } = await import('../../src/lib/printStandaloneInvoice');
    const { getClientBreadcrumbs } = await import('../../src/lib/logger');

    const result = await shareStandaloneInvoiceWhatsApp(sampleInv);

    expect(result.how).toBe('pdf_fallback');
    expect(result.errorHint).toMatch(/no items/i);

    const crumbs = getClientBreadcrumbs(30).join('\n');
    expect(crumbs).toMatch(/WhatsApp Electron PDF build fail/);
    expect(crumbs).toMatch(/WhatsApp Electron text fallback start/);
  });

  it('shareElectronInvoiceWhatsApp is a no-op outside Electron (Cap/web unchanged)', async () => {
    stubBrowser();
    const { shareElectronInvoiceWhatsApp } = await import('../../src/lib/electronWhatsAppInvoiceShare');
    const result = await shareElectronInvoiceWhatsApp(sampleInv, 'Invoice INV-1');
    expect(result).toBeNull();
    expect(buildPdfMock).not.toHaveBeenCalled();
  });
});
