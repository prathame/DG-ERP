import { fetchApi } from '../api';
import { api } from '../api';
import { generateStandaloneInvoiceHtml, type StandaloneInvoicePrint } from './billTemplates';
import { invoiceHasGst } from './billSettingsFlags';
import { clientLogger, pushClientBreadcrumb } from './logger';
import { isServicePhoneUx } from '../platforms/service-cloud/mode';
import { session } from './session';
import { isNativeCapacitor } from './dhandhoFiles';
import {
  closePrintOverlay,
  fetchImageAsDataUrl,
  openPrintWindow,
  printBillInWindow,
  PRINT_POPUP_BLOCKED,
  shareHtmlPdfViaWhatsApp,
  shareInvoiceSummaryViaWhatsApp,
} from './utils';

export type WhatsAppInvoiceShareHow = 'shared' | 'saved' | 'text' | 'downloaded' | 'cancelled' | 'summary';

/** User-facing toast after WhatsApp invoice share (skip for `cancelled`). */
export function whatsAppInvoiceShareToast(how: Exclude<WhatsAppInvoiceShareHow, 'cancelled'>): string {
  switch (how) {
    case 'summary':
      return 'Shared summary. For PDF: Print → Save as PDF, then share from Files.';
    case 'shared':
      return 'Invoice PDF shared';
    case 'saved':
      return 'PDF saved to Dhandho/invoices on this phone';
    case 'text':
      return 'WhatsApp opened — PDF also saved/downloaded to attach';
    case 'downloaded':
      return 'WhatsApp opened — PDF downloaded to attach';
  }
}

export type PrintableStandaloneInvoice = StandaloneInvoicePrint & {
  id?: string;
  gstEnabled?: boolean;
  taxTotal: number;
  customerPhone?: string;
  grandTotal?: number;
};

async function buildStandaloneInvoiceHtml(
  inv: PrintableStandaloneInvoice,
  options?: { billSettings?: Record<string, unknown>; businessType?: string },
): Promise<{ html: string; filename: string; hasGst: boolean }> {
  if (!Array.isArray(inv.items) || inv.items.length === 0) {
    throw new Error('Invoice has no line items to print');
  }
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
  const upiQrDataUrl = bs.bankUpiId
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
    { qrDataUrl: upiQrDataUrl || undefined, hideNotes: phoneUx, hasGst },
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

function invoiceWhatsAppMessage(inv: PrintableStandaloneInvoice): string {
  const total = typeof inv.grandTotal === 'number' ? `₹${inv.grandTotal.toLocaleString('en-IN')}` : '';
  return [`Invoice ${inv.invoiceNumber}`, inv.customerName, total && `Total: ${total}`].filter(Boolean).join('\n');
}

/**
 * Share invoice via WhatsApp.
 * Cap: text summary only (Share / wa.me) — no html2pdf, no jsPDF on the tap path (WebView freeze).
 * Web: HTML → html2pdf file share / wa.me + download.
 * Print path stays full Tax Invoice HTML + system Print.
 */
export async function shareStandaloneInvoiceWhatsApp(
  inv: PrintableStandaloneInvoice,
  options?: { billSettings?: Record<string, unknown>; businessType?: string },
): Promise<WhatsAppInvoiceShareHow> {
  const message = invoiceWhatsAppMessage(inv);
  const ctx = {
    invoiceNumber: inv.invoiceNumber,
    native: isNativeCapacitor(),
  };
  // Log + breadcrumb before any share work so bug reports aren't empty if WebView soft-hangs.
  clientLogger.info('WhatsApp invoice share start', ctx);
  pushClientBreadcrumb('WhatsApp invoice share start', ctx);

  if (isNativeCapacitor()) {
    // Let React paint "Preparing…" / disabled button before Share sheet opens.
    await new Promise<void>(r => setTimeout(r, 0));
    return shareInvoiceSummaryViaWhatsApp({ phone: inv.customerPhone, message });
  }

  const { html, filename } = await buildStandaloneInvoiceHtml(inv, options);
  return shareHtmlPdfViaWhatsApp({
    html,
    filename,
    phone: inv.customerPhone,
    message,
  });
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
  options?: { businessType?: string },
): Promise<WhatsAppInvoiceShareHow> {
  const inv = await fetchApi<PrintableStandaloneInvoice & { id: string }>(`/invoices/${invoiceId}`);
  if (!inv?.id) throw new Error('Invoice not found for PDF');
  return shareStandaloneInvoiceWhatsApp(inv, options);
}
