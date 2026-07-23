/**
 * Electron desktop-only WhatsApp invoice/quote PDF share.
 *
 * Cap / phone paths must NOT call this — they use shareCapInvoicePdfWithFallback
 * (Filesystem + Share). Browser web keeps html2pdf via shareHtmlPdfViaWhatsApp.
 *
 * Why separate: Cloud Electron was treated as "web" (native:false) and hung in
 * html2pdf/html2canvas with no success/fail breadcrumb after "html2pdf start".
 *
 * Desktop flow (closest Cap-like UX WhatsApp Desktop allows):
 *   light jsPDF → IPC saves PDF to Downloads → copy file to clipboard →
 *   reveal in Finder/Explorer → open WhatsApp Desktop / wa.me with caption.
 * WhatsApp URL schemes cannot attach files; paste (⌘V / Ctrl+V) or drag from
 * the revealed folder is required. Cap Share sheet remains phone-only.
 */

import { api } from '../api';
import { invoiceHasGst } from './billSettingsFlags';
import { clientLogger, ensureCorrelationId, pushClientBreadcrumb } from './logger';
import { isElectronAppShell } from './mobileAppShell';
import { session } from './session';
import { buildStandaloneInvoicePdfBlob } from './standaloneInvoicePdf';
import type { BillDocType } from './billTemplates';
import { shareInvoiceSummaryViaWhatsApp, shareViaWhatsApp, truncateShareError } from './utils';
import {
  CAP_WHATSAPP_PDF_TIMEOUT_MS,
  standaloneInvoicePdfBasename,
  type PrintableStandaloneInvoice,
  type ShareStandaloneInvoiceWhatsAppOptions,
  type WhatsAppInvoiceShareResult,
} from './printStandaloneInvoice';

/** Same budget as Cap light-PDF; scoped name so Electron timeout is obvious in breadcrumbs. */
export const ELECTRON_WHATSAPP_PDF_TIMEOUT_MS = CAP_WHATSAPP_PDF_TIMEOUT_MS;

type ElectronSharePdfResult = {
  ok: boolean;
  filePath?: string;
  clipboardOk?: boolean;
  revealed?: boolean;
  whatsappOpened?: boolean;
  error?: string;
};

type ElectronBridge = {
  openExternal?: (u: string) => Promise<unknown> | unknown;
  sharePdfWhatsApp?: (payload: {
    base64: string;
    filename: string;
    phone?: string;
    message?: string;
  }) => Promise<ElectronSharePdfResult>;
};

function waLog(level: 'info' | 'warn' | 'error', message: string, ctx: Record<string, unknown>): void {
  const full = { correlationId: ensureCorrelationId(), ...ctx };
  clientLogger[level](message, full);
  pushClientBreadcrumb(message, full);
}

async function yieldToUi(): Promise<void> {
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

function safePdfFilename(filename: string): string {
  const base = (filename || 'Document').replace(/[^\w.\- ()#]+/g, '_').slice(0, 80);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Trigger a browser/Electron file download for a PDF blob (legacy fallback). */
function downloadPdfBlob(blob: Blob, safeName: string): void {
  const doc = window.document;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = safeName;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Open wa.me via Electron shell when available; else window.open
 * (Cloud Electron's setWindowOpenHandler already routes https → openExternal).
 */
function openWhatsAppExternal(phone: string | undefined, message: string): void {
  let url: string;
  const raw = (phone || '').trim();
  if (raw) {
    let p = raw.replace(/[\s\-().+]/g, '');
    if (p.length === 10 && /^\d+$/.test(p)) p = '91' + p;
    if (p.startsWith('0')) p = '91' + p.slice(1);
    url = `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
  } else {
    url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  const ea = (window as unknown as { electronAPI?: ElectronBridge }).electronAPI;
  if (typeof ea?.openExternal === 'function') {
    void Promise.resolve(ea.openExternal(url)).catch(() => {
      if (raw) shareViaWhatsApp(raw, message);
      else window.open(url, '_blank');
    });
    return;
  }
  if (raw) shareViaWhatsApp(raw, message);
  else window.open(url, '_blank');
}

async function shareViaElectronIpc(
  blob: Blob,
  safeName: string,
  phone: string | undefined,
  message: string,
  baseCtx: Record<string, unknown>,
): Promise<WhatsAppInvoiceShareResult | null> {
  const ea = (window as unknown as { electronAPI?: ElectronBridge }).electronAPI;
  if (typeof ea?.sharePdfWhatsApp !== 'function') return null;

  waLog('info', 'WhatsApp Electron IPC share start', {
    ...baseCtx,
    path: 'pdf',
    filename: safeName,
    bytes: blob.size,
  });

  const base64 = await blobToBase64(blob);
  const result = await ea.sharePdfWhatsApp({
    base64,
    filename: safeName,
    phone,
    message,
  });

  if (!result?.ok) {
    waLog('warn', 'WhatsApp Electron IPC share fail', {
      ...baseCtx,
      path: 'pdf',
      filename: safeName,
      errorMessage: truncateShareError(result?.error || 'IPC share failed'),
    });
    return null;
  }

  waLog('info', 'WhatsApp Electron share ok', {
    ...baseCtx,
    path: 'pdf',
    filename: safeName,
    clipboardOk: Boolean(result.clipboardOk),
    revealed: Boolean(result.revealed),
    whatsappOpened: Boolean(result.whatsappOpened),
    shareMode: result.clipboardOk ? 'ipc+clipboard+wa' : 'ipc+downloads+wa',
  });

  // Cap returns 'shared' from Share sheet; clipboard paste is the desktop analogue.
  if (result.clipboardOk) return { how: 'shared' };
  return { how: 'downloaded' };
}

/**
 * Electron desktop WhatsApp invoice PDF share (jsPDF → IPC attach helpers).
 * Returns null when not Electron so Cap/web callers never take this path.
 */
export async function shareElectronInvoiceWhatsApp(
  inv: PrintableStandaloneInvoice,
  message: string,
  options?: ShareStandaloneInvoiceWhatsAppOptions,
): Promise<WhatsAppInvoiceShareResult | null> {
  if (!isElectronAppShell()) return null;

  const correlationId = ensureCorrelationId();
  const docType: BillDocType = options?.docType || 'invoice';
  const baseCtx = {
    correlationId,
    invoiceNumber: inv.invoiceNumber,
    docType,
    native: false,
    electron: true,
    engine: 'jspdf-light',
  };

  waLog('info', 'WhatsApp invoice share start', { ...baseCtx, path: 'pdf' });
  options?.onPreparing?.();
  waLog('info', 'WhatsApp share yield UI', baseCtx);
  await yieldToUi();

  const filename = standaloneInvoicePdfBasename(inv.customerName);
  const safeName = safePdfFilename(filename);
  const user = (session.getUser() || {}) as {
    companyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
  };
  const billSettings =
    options?.billSettings ||
    ((await api.settings.getBillSettings().catch(() => ({}))) as Record<string, unknown>) ||
    {};
  const pdfOpts = { hasGst: invoiceHasGst(inv), billSettings, docType };

  try {
    waLog('info', 'WhatsApp Electron PDF build start', {
      ...baseCtx,
      path: 'pdf',
      filename: safeName,
      timeoutMs: ELECTRON_WHATSAPP_PDF_TIMEOUT_MS,
    });

    const blob = await withTimeout(
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
      ELECTRON_WHATSAPP_PDF_TIMEOUT_MS,
      'PDF_TIMEOUT',
    );

    waLog('info', 'WhatsApp Electron PDF build ok', {
      ...baseCtx,
      path: 'pdf',
      filename: safeName,
      bytes: blob.size,
    });

    const ipcResult = await shareViaElectronIpc(blob, safeName, inv.customerPhone, message, baseCtx);
    if (ipcResult) return ipcResult;

    // Legacy fallback when preload/IPC is older (download + wa.me).
    let downloaded = false;
    try {
      downloadPdfBlob(blob, safeName);
      downloaded = true;
    } catch (err) {
      waLog('warn', 'WhatsApp Electron PDF download fail', {
        ...baseCtx,
        path: 'pdf',
        filename: safeName,
        errorMessage: truncateShareError(err),
      });
    }
    openWhatsAppExternal(inv.customerPhone, message);

    waLog('info', 'WhatsApp Electron share ok', {
      ...baseCtx,
      path: 'pdf',
      filename: safeName,
      downloaded,
      shareMode: inv.customerPhone ? 'download+wa.me' : 'download+wa.me-open',
    });

    return { how: inv.customerPhone ? 'text' : 'downloaded' };
  } catch (err) {
    const timedOut = err instanceof Error && err.message === 'PDF_TIMEOUT';
    const errorHint = truncateShareError(err);
    waLog(
      timedOut ? 'warn' : 'error',
      timedOut ? 'WhatsApp Electron PDF build timeout' : 'WhatsApp Electron PDF build fail',
      {
        ...baseCtx,
        path: 'fallback',
        errorName: err instanceof Error ? err.name : 'Error',
        errorMessage: errorHint,
        timedOut,
      },
    );
    waLog('info', 'WhatsApp Electron text fallback start', { ...baseCtx, path: 'fallback' });
    const textHow = await shareInvoiceSummaryViaWhatsApp({
      phone: inv.customerPhone,
      message,
      logCtx: { ...baseCtx, path: 'fallback' },
    });
    return textHow === 'cancelled' ? { how: 'cancelled', errorHint } : { how: 'pdf_fallback', errorHint };
  }
}
