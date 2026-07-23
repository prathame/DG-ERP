import { fetchApi } from '../api';
import { api } from '../api';
import { generateStandaloneInvoiceHtml, type BillDocType, type StandaloneInvoicePrint } from './billTemplates';
import { invoiceHasGst } from './billSettingsFlags';
import { clientLogger, ensureCorrelationId, pushClientBreadcrumb } from './logger';
import { isServicePhoneUx } from '../platforms/service-cloud/mode';
import { session } from './session';
import { loadFreshCapBillPdfCache } from './capBillPdfCache';
import { isNativeCapacitor } from './dhandhoFiles';
import { isElectronAppShell } from './mobileAppShell';
import { buildStandaloneInvoicePdfBlob } from './standaloneInvoicePdf';
import {
  closePrintOverlay,
  fetchImageAsDataUrl,
  openPrintWindow,
  printBillInWindow,
  PRINT_POPUP_BLOCKED,
  shareHtmlPdfViaWhatsApp,
  shareInvoiceSummaryViaWhatsApp,
  sharePdfNativeWhatsApp,
  truncateShareError,
} from './utils';

/** Hard timeout for Cap light-jsPDF build before falling back to text share. */
export const CAP_WHATSAPP_PDF_TIMEOUT_MS = 7000;

export type WhatsAppInvoiceShareHow =
  'shared' | 'saved' | 'text' | 'downloaded' | 'cancelled' | 'summary' | 'pdf_fallback';

export type WhatsAppInvoiceShareResult = {
  how: WhatsAppInvoiceShareHow;
  /** Truncated safe error for toast when PDF failed / timed out. */
  errorHint?: string;
};

/** User-facing toast after WhatsApp invoice share (skip for `cancelled`). */
export function whatsAppInvoiceShareToast(
  how: Exclude<WhatsAppInvoiceShareHow, 'cancelled'>,
  errorHint?: string,
): string {
  switch (how) {
    case 'summary':
      return 'Shared summary. For PDF: Print → Save as PDF, then share from Files.';
    case 'pdf_fallback': {
      const hint = errorHint?.trim();
      return hint ? `PDF failed (${hint}) — shared text summary instead` : 'PDF failed — shared text summary instead';
    }
    case 'shared':
      // Cap: Share sheet. Electron: PDF copied to clipboard for paste into chat.
      return isElectronAppShell() ? 'PDF copied — paste into WhatsApp (⌘V / Ctrl+V)' : 'PDF shared';
    case 'saved':
      return 'PDF saved to Dhandho on this phone';
    case 'text':
      return 'WhatsApp opened — PDF also saved/downloaded to attach';
    case 'downloaded':
      return isElectronAppShell()
        ? 'WhatsApp opened — PDF in Downloads; drag into the chat'
        : 'WhatsApp opened — PDF downloaded to attach';
  }
}

export type PrintableStandaloneInvoice = StandaloneInvoicePrint & {
  id?: string;
  gstEnabled?: boolean;
  taxTotal: number;
  customerPhone?: string;
  grandTotal?: number;
};

export type ShareStandaloneInvoiceWhatsAppOptions = {
  billSettings?: Record<string, unknown>;
  businessType?: string;
  /** quotation = shared bill template, title QUOTATION, no bank. */
  docType?: BillDocType;
  /** Cap: called after breadcrumb so UI can toast "Preparing PDF…". */
  onPreparing?: () => void;
};

function waLog(level: 'info' | 'warn' | 'error', message: string, ctx: Record<string, unknown>): void {
  const full = { correlationId: ensureCorrelationId(), ...ctx };
  clientLogger[level](message, full);
  pushClientBreadcrumb(message, full);
}

async function yieldToUi(): Promise<void> {
  // setTimeout(0) lets React paint "Preparing…" before PDF work (rAF is flaky under test / backgrounded WebView).
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function buildStandaloneInvoiceHtml(
  inv: PrintableStandaloneInvoice,
  options?: { billSettings?: Record<string, unknown>; businessType?: string; docType?: BillDocType },
): Promise<{ html: string; filename: string; hasGst: boolean }> {
  if (!Array.isArray(inv.items) || inv.items.length === 0) {
    throw new Error('Invoice has no line items to print');
  }
  const docType = options?.docType || 'invoice';
  const isQuote = docType === 'quotation';
  const user = (session.getUser() || {}) as {
    companyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
  };
  const bs =
    options?.billSettings ||
    ((await api.settings.getBillSettings().catch(() => ({}))) as Record<string, unknown>) ||
    {};
  const color = /^#[0-9a-fA-F]{3,8}$/.test(String(bs.primaryColor || '')) ? String(bs.primaryColor) : '#F27D26';
  const logoSrc = typeof bs.logoBase64 === 'string' && bs.logoBase64.startsWith('data:image/') ? bs.logoBase64 : '';
  const sigSrc =
    typeof bs.signatureBase64 === 'string' && bs.signatureBase64.startsWith('data:image/') ? bs.signatureBase64 : '';
  // Quotations omit bank/UPI — skip QR network fetch.
  const upiQrDataUrl =
    !isQuote && bs.bankUpiId
      ? await fetchImageAsDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${bs.bankUpiId}&pn=${bs.bankAccountName || 'Business'}&cu=INR`)}`,
        )
      : '';
  const phoneUx = isServicePhoneUx(options?.businessType);
  const hasGst = invoiceHasGst(inv);
  const html = generateStandaloneInvoiceHtml(
    inv,
    {
      companyName: user.companyName,
      address: user.address,
      phone: user.phone,
      email: user.email,
      gstNumber: user.gstNumber,
    },
    {
      ...bs,
      logoBase64: logoSrc || bs.logoBase64,
      signatureBase64: sigSrc || bs.signatureBase64,
      primaryColor: color,
    },
    { qrDataUrl: upiQrDataUrl || undefined, hideNotes: phoneUx, hasGst, docType },
  );
  const filename = standaloneInvoicePdfBasename(inv.customerName);
  return { html, filename, hasGst };
}

/** PDF basename: `{ClientName}-{YYYY-MM-DD_HH-mm-ss}` (sanitized; keeps Unicode letters). */
export function standaloneInvoicePdfBasename(customerName?: string, when = new Date()): string {
  const name =
    (customerName || 'Client')
      .trim()
      .replace(/[^\p{L}\p{M}\p{N}.\- ()#]+/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^[_.\s]+|[_.\s]+$/g, '')
      .slice(0, 40) || 'Client';
  const pad = (n: number) => String(n).padStart(2, '0');
  const dt = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`;
  return `${name}-${dt}`;
}

/** Open print/PDF preview for a standalone invoice (customer or vendor/client party). */
export async function printStandaloneInvoice(
  inv: PrintableStandaloneInvoice,
  options?: { billSettings?: Record<string, unknown>; businessType?: string },
): Promise<void> {
  // No html2pdf Download — canvas capture collapses Tax Invoice borders/tables.
  // Use system Print → Save as PDF for correct layout.
  const w = openPrintWindow('Preparing invoice…', { hidePdfDownload: true });
  if (!w) {
    throw new Error(PRINT_POPUP_BLOCKED);
  }
  try {
    const { html, filename } = await buildStandaloneInvoiceHtml(inv, options);
    printBillInWindow(w, html, filename);
  } catch (err) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    closePrintOverlay();
    throw err;
  }
}

function invoiceWhatsAppMessage(inv: PrintableStandaloneInvoice, docType: BillDocType = 'invoice'): string {
  const total = typeof inv.grandTotal === 'number' ? `₹${inv.grandTotal.toLocaleString('en-IN')}` : '';
  const label = docType === 'quotation' ? 'Quotation' : 'Invoice';
  return [`${label} ${inv.invoiceNumber}`, inv.customerName, total && `Total: ${total}`].filter(Boolean).join('\n');
}

async function shareCapInvoicePdfWithFallback(
  inv: PrintableStandaloneInvoice,
  message: string,
  options?: ShareStandaloneInvoiceWhatsAppOptions,
): Promise<WhatsAppInvoiceShareResult> {
  const correlationId = ensureCorrelationId();
  const baseCtx = {
    correlationId,
    invoiceNumber: inv.invoiceNumber,
    native: true,
  };

  waLog('info', 'WhatsApp invoice share start', { ...baseCtx, path: 'pdf' });
  options?.onPreparing?.();

  waLog('info', 'WhatsApp share yield UI', baseCtx);
  await yieldToUi();

  const filename = standaloneInvoicePdfBasename(inv.customerName);
  const user = (session.getUser() || {}) as {
    companyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
  };
  // Saved Bill Customization = WhatsApp PDF template (logo/sig/bank/colors/terms/footer).
  // No separate template file; no UPI QR network fetch (text bank fields only).
  const billSettings =
    options?.billSettings ||
    ((await api.settings.getBillSettings().catch(() => ({}))) as Record<string, unknown>) ||
    {};

  try {
    const docType = options?.docType || 'invoice';
    const pdfOpts = { hasGst: invoiceHasGst(inv), billSettings, docType };

    // Prefer Save-baked cache (Documents/Dhandho/invoices) when contentKey matches.
    let blob: Blob | null = null;
    if (inv.id) {
      waLog('info', 'WhatsApp PDF cache lookup', { ...baseCtx, path: 'pdf', invoiceId: inv.id, docType });
      blob = await loadFreshCapBillPdfCache({ ...inv, id: inv.id }, pdfOpts);
      if (blob) {
        waLog('info', 'WhatsApp PDF cache hit', {
          ...baseCtx,
          path: 'pdf',
          filename,
          bytes: blob.size,
          engine: 'cache',
        });
      }
    }

    if (!blob) {
      waLog('info', 'WhatsApp PDF build start', {
        ...baseCtx,
        path: 'pdf',
        filename,
        timeoutMs: CAP_WHATSAPP_PDF_TIMEOUT_MS,
        engine: 'jspdf-light',
      });
      blob = await withTimeout(
        buildStandaloneInvoicePdfBlob(
          inv,
          {
            companyName: user.companyName,
            address: user.address,
            phone: user.phone,
            email: user.email,
            gstNumber: user.gstNumber,
          },
          pdfOpts,
        ),
        CAP_WHATSAPP_PDF_TIMEOUT_MS,
        'PDF_TIMEOUT',
      );
      waLog('info', 'WhatsApp PDF build ok', {
        ...baseCtx,
        path: 'pdf',
        filename,
        bytes: blob.size,
      });
    }

    const how = await sharePdfNativeWhatsApp(blob, filename, {
      ...baseCtx,
      path: 'pdf',
    });
    if (how === 'failed') {
      const errorHint = 'Share file failed';
      waLog('warn', 'WhatsApp PDF share failed — text fallback', {
        ...baseCtx,
        path: 'fallback',
        errorHint,
      });
      const textHow = await shareInvoiceSummaryViaWhatsApp({
        phone: inv.customerPhone,
        message,
        logCtx: { ...baseCtx, path: 'fallback' },
      });
      return textHow === 'cancelled' ? { how: 'cancelled', errorHint } : { how: 'pdf_fallback', errorHint };
    }
    return { how };
  } catch (err) {
    const timedOut = err instanceof Error && err.message === 'PDF_TIMEOUT';
    const errorHint = truncateShareError(err);
    waLog(timedOut ? 'warn' : 'error', timedOut ? 'WhatsApp PDF build timeout' : 'WhatsApp PDF build fail', {
      ...baseCtx,
      path: 'fallback',
      errorName: err instanceof Error ? err.name : 'Error',
      errorMessage: errorHint,
      timedOut,
    });
    waLog('info', 'WhatsApp text fallback start', { ...baseCtx, path: 'fallback' });
    const textHow = await shareInvoiceSummaryViaWhatsApp({
      phone: inv.customerPhone,
      message,
      logCtx: { ...baseCtx, path: 'fallback' },
    });
    return textHow === 'cancelled' ? { how: 'cancelled', errorHint } : { how: 'pdf_fallback', errorHint };
  }
}

/**
 * Share invoice via WhatsApp.
 * Cap: prefer Save-baked PDF under Dhandho/invoices when fresh; else shared
 * `buildStandaloneInvoicePdfBlob` (billSettings template + invoice fields; no html2canvas)
 * with hard timeout → Dhandho/Cache file-only Share; on fail → text + toast.
 * Electron desktop: separate helper (jsPDF → IPC Downloads/clipboard + WhatsApp) —
 * never Cap Share / html2pdf. WhatsApp Desktop cannot receive files via URL scheme.
 * Web browser: HTML → html2pdf file share / wa.me + download.
 * Print path stays full Tax Invoice HTML + system Print.
 *
 * Branch order is intentional: Cap first (unchanged), then Electron-only, then web.
 */
export async function shareStandaloneInvoiceWhatsApp(
  inv: PrintableStandaloneInvoice,
  options?: ShareStandaloneInvoiceWhatsAppOptions,
): Promise<WhatsAppInvoiceShareResult> {
  const docType = options?.docType || 'invoice';
  const message = invoiceWhatsAppMessage(inv, docType);
  const correlationId = ensureCorrelationId();
  const ctx = {
    correlationId,
    invoiceNumber: inv.invoiceNumber,
    docType,
    native: isNativeCapacitor(),
  };

  // Cap / phone — unchanged path (Filesystem + Share / Cap timeout fallback).
  if (isNativeCapacitor()) {
    return shareCapInvoicePdfWithFallback(inv, message, options);
  }

  // Electron Cloud / Offline desktop only — dynamic import keeps Cap helpers untouched.
  if (isElectronAppShell()) {
    const { shareElectronInvoiceWhatsApp } = await import('./electronWhatsAppInvoiceShare');
    const electronResult = await shareElectronInvoiceWhatsApp(inv, message, options);
    if (electronResult) return electronResult;
  }

  waLog('info', 'WhatsApp invoice share start', { ...ctx, path: 'pdf' });
  const { html, filename } = await buildStandaloneInvoiceHtml(inv, options);
  const how = await shareHtmlPdfViaWhatsApp({
    html,
    filename,
    phone: inv.customerPhone,
    message,
    logCtx: ctx,
  });
  return { how };
}

/** Load full invoice by id then print — for vendor/finance hubs. */
export async function printStandaloneInvoiceById(
  invoiceId: string,
  options?: { businessType?: string },
): Promise<void> {
  const inv = await fetchApi<PrintableStandaloneInvoice & { id: string }>(`/invoices/${invoiceId}`);
  if (!inv?.id) throw new Error('Invoice not found for PDF');
  await printStandaloneInvoice(inv, options);
}

/** Load full invoice by id then share via WhatsApp. */
export async function shareStandaloneInvoiceWhatsAppById(
  invoiceId: string,
  options?: ShareStandaloneInvoiceWhatsAppOptions,
): Promise<WhatsAppInvoiceShareResult> {
  const inv = await fetchApi<PrintableStandaloneInvoice & { id: string }>(`/invoices/${invoiceId}`);
  if (!inv?.id) throw new Error('Invoice not found for PDF');
  return shareStandaloneInvoiceWhatsApp(inv, options);
}
