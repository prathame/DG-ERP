/**
 * Cap / Electron WhatsApp PDF for Distribution Tax Invoice / Bill of Supply.
 * Reuses standalone jsPDF builder (no html2canvas on Cap). Text fallback otherwise.
 */

import type { DistributionBillData } from '../api';
import { api } from '../api';
import { buildDistributionBillSlice, type StandaloneInvoicePrint } from './billTemplates';
import { buildStandaloneInvoicePdfBlob } from './standaloneInvoicePdf';
import { isNativeCapacitor } from './dhandhoFiles';
import { isElectronAppShell } from './mobileAppShell';
import { clientLogger, ensureCorrelationId, pushClientBreadcrumb } from './logger';
import { session } from './session';
import { CAP_WHATSAPP_PDF_TIMEOUT_MS, type WhatsAppInvoiceShareResult } from './printStandaloneInvoice';
import { deliveryPrintAvailability, type DistPrintKind } from './printDistributionDocs';
import {
  formatDistributionChallanText,
  shareInvoiceSummaryViaWhatsApp,
  sharePdfNativeWhatsApp,
  shareViaWhatsApp,
  truncateShareError,
} from './utils';

export type ShareDistributionWhatsAppOptions = {
  fullyPaid?: boolean;
  billSettings?: Record<string, unknown>;
  onPreparing?: () => void;
};

function waLog(level: 'info' | 'warn' | 'error', message: string, ctx: Record<string, unknown>): void {
  const full = { correlationId: ensureCorrelationId(), ...ctx };
  clientLogger[level](message, full);
  pushClientBreadcrumb(message, full);
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

async function yieldToUi(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function safeDistPdfBasename(label: string, vendorName: string, docNo: string): string {
  const v = String(vendorName || 'Vendor')
    .replace(/[^\w\u0900-\u097F]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const id = String(docNo || 'doc')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 48);
  return `${label}-${v}-${id}.pdf`;
}

/** Map one delivery half (GST or BoS) into the shared Cap bill PDF shape. */
export function distributionHalfToStandalonePrint(
  bill: DistributionBillData,
  which: 'gst' | 'bos',
): {
  inv: StandaloneInvoicePrint & { customerPhone?: string; taxTotal: number };
  company: {
    companyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
  };
  hasGst: boolean;
  filename: string;
  docNo: string;
  textBill: DistributionBillData;
} | null {
  const items = bill.items.filter(i => (which === 'gst' ? i.gstApplied === true : i.gstApplied !== true));
  if (!items.length) return null;

  const amount = items.reduce((s, i) => s + (Number(i.billedPrice) || Number(i.price) || 0), 0);
  const gstDocNo = bill.deliverySet?.gstDocNo || `${bill.challanId}-GST`;
  const bosDocNo = bill.deliverySet?.nonGstDocNo || `${bill.challanId}-BOS`;
  const docNo = which === 'gst' ? gstDocNo : bosDocNo;
  const slice = {
    ...buildDistributionBillSlice(bill, items, amount),
    challanId: docNo,
    ...(which === 'bos' ? { irn: null, irnQr: null, irnAckNo: null, irnAckDt: null } : {}),
    ...(which === 'gst' ? { irn: bill.irn, irnQr: bill.irnQr, irnAckNo: bill.irnAckNo, irnAckDt: bill.irnAckDt } : {}),
  };

  const gstRate = Number(bill.gstRate) || 0;
  const showGst = which === 'gst';
  const printItems = slice.groupedItems.map(g => {
    const sample = items.find(i => i.productName === g.productName);
    const unitNet = Number(g.netPrice) || 0;
    const unitBilled = Number(sample?.billedPrice) || unitNet;
    const taxable = Math.round(unitNet * g.quantity * 100) / 100;
    const total = Math.round(unitBilled * g.quantity * 100) / 100;
    const tax = showGst ? Math.max(0, Math.round((total - taxable) * 100) / 100) : 0;
    return {
      description: g.productName,
      qty: g.quantity,
      rate: Number(g.originalPrice) || unitNet,
      gstPercent: showGst ? gstRate : 0,
      discountPercent: g.discountPercent || 0,
      taxable,
      tax,
      total: showGst ? total : taxable,
    };
  });

  const subtotal = printItems.reduce((s, i) => s + i.taxable, 0);
  const taxTotal = printItems.reduce((s, i) => s + i.tax, 0);
  const grandTotal = printItems.reduce((s, i) => s + i.total, 0);
  const paid = bill.payment?.totalPaid;
  const balance = bill.payment?.balance;

  const inv: StandaloneInvoicePrint & { customerPhone?: string; taxTotal: number } = {
    invoiceNumber: docNo,
    customerName: bill.vendor.name,
    customerGstin: bill.vendor.gstNumber || undefined,
    customerAddress: bill.vendor.address || undefined,
    customerPhone: bill.vendor.phone || undefined,
    items: printItems,
    subtotal,
    taxTotal,
    gstEnabled: showGst,
    grandTotal,
    status: optionsPaidStatus(bill, grandTotal),
    invoiceDate: bill.distributionDate,
    paidAmount: typeof paid === 'number' ? paid : undefined,
    outstanding: typeof balance === 'number' ? balance : undefined,
    notes: bill.ewbNumber ? `E-Way Bill: ${bill.ewbNumber}` : undefined,
  };

  const label = which === 'gst' ? 'Tax-Invoice' : 'Bill-of-Supply';
  return {
    inv,
    company: {
      companyName: bill.company.name,
      address: bill.company.address || undefined,
      phone: bill.company.phone || undefined,
      gstNumber: bill.company.gstNumber || undefined,
    },
    hasGst: showGst,
    filename: safeDistPdfBasename(label, bill.vendor.name, docNo),
    docNo,
    textBill: slice,
  };
}

function optionsPaidStatus(bill: DistributionBillData, halfTotal: number): string {
  const bal = bill.payment?.balance;
  if (typeof bal === 'number' && bal <= 0 && (bill.payment?.totalDistributedValue || 0) > 0) return 'paid';
  if (halfTotal <= 0) return 'paid';
  return 'sent';
}

function textForKind(bill: DistributionBillData, kind: DistPrintKind): string {
  const avail = deliveryPrintAvailability(bill);
  if (kind === 'gst' || (kind === 'both' && avail.hasGst && !avail.hasBos)) {
    const m = distributionHalfToStandalonePrint(bill, 'gst');
    return m ? formatDistributionChallanText(m.textBill) : formatDistributionChallanText(bill);
  }
  if (kind === 'bos' || (kind === 'both' && avail.hasBos && !avail.hasGst)) {
    const m = distributionHalfToStandalonePrint(bill, 'bos');
    const t = m ? formatDistributionChallanText(m.textBill) : formatDistributionChallanText(bill);
    return t.replace('DISTRIBUTION CHALLAN', 'BILL OF SUPPLY');
  }
  const gst = distributionHalfToStandalonePrint(bill, 'gst');
  const bos = distributionHalfToStandalonePrint(bill, 'bos');
  const parts: string[] = [];
  if (gst) parts.push(formatDistributionChallanText(gst.textBill));
  if (bos) {
    parts.push('———');
    parts.push(formatDistributionChallanText(bos.textBill).replace('DISTRIBUTION CHALLAN', 'BILL OF SUPPLY (non-GST)'));
  }
  if (bill.totalBilled != null) {
    parts.push(`Batch outstanding (combined): ₹${Number(bill.totalBilled).toLocaleString()}`);
  }
  return parts.filter(Boolean).join('\n\n') || formatDistributionChallanText(bill);
}

/**
 * Share Distribution Tax Invoice / Bill of Supply via WhatsApp.
 * Cap: jsPDF → Cache FileProvider Share (same as standalone invoice).
 * Electron: Downloads + clipboard paste path.
 * Browser / failure: wa.me text summary.
 */
export async function shareDistributionDocsWhatsApp(
  bill: DistributionBillData,
  kind: DistPrintKind,
  options?: ShareDistributionWhatsAppOptions,
): Promise<WhatsAppInvoiceShareResult> {
  const phone = bill.vendor.phone;
  if (!phone) {
    throw new Error('No vendor phone number on record');
  }

  const avail = deliveryPrintAvailability(bill);
  const halves: Array<'gst' | 'bos'> = kind === 'both' ? ['gst', 'bos'] : kind === 'gst' ? ['gst'] : ['bos'];
  const toShare = halves.filter(h => (h === 'gst' ? avail.hasGst : avail.hasBos));
  if (!toShare.length) {
    throw new Error(
      kind === 'gst'
        ? 'No Tax Invoice lines on this delivery'
        : kind === 'bos'
          ? 'No Bill of Supply lines on this delivery'
          : 'No invoice lines to share',
    );
  }

  const correlationId = ensureCorrelationId();
  const baseCtx = {
    correlationId,
    challanId: bill.challanId,
    kind,
    native: isNativeCapacitor(),
    electron: isElectronAppShell(),
  };

  const textMessage = textForKind(bill, kind === 'both' && toShare.length === 1 ? toShare[0] : kind);

  // Browser (non-Cap, non-Electron): text only — html2pdf path not used for distribution.
  if (!isNativeCapacitor() && !isElectronAppShell()) {
    waLog('info', 'WhatsApp distribution share text (web)', { ...baseCtx, path: 'text' });
    shareViaWhatsApp(phone, textMessage);
    return { how: 'summary' };
  }

  waLog('info', 'WhatsApp distribution share start', { ...baseCtx, path: 'pdf' });
  options?.onPreparing?.();
  await yieldToUi();

  const billSettings =
    options?.billSettings ||
    ((await api.settings.getBillSettings().catch(() => ({}))) as Record<string, unknown>) ||
    {};

  const sessionUser = (session.getUser() || {}) as {
    companyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
  };

  let lastHow: WhatsAppInvoiceShareResult['how'] = 'shared';
  let lastHint: string | undefined;

  for (const which of toShare) {
    const mapped = distributionHalfToStandalonePrint(bill, which);
    if (!mapped) continue;

    const company = {
      companyName: mapped.company.companyName || sessionUser.companyName,
      address: mapped.company.address || sessionUser.address,
      phone: mapped.company.phone || sessionUser.phone,
      email: sessionUser.email,
      gstNumber: mapped.company.gstNumber || sessionUser.gstNumber,
    };

    const halfCtx = { ...baseCtx, which, docNo: mapped.docNo, filename: mapped.filename };

    try {
      if (isNativeCapacitor()) {
        waLog('info', 'WhatsApp distribution PDF build start', {
          ...halfCtx,
          timeoutMs: CAP_WHATSAPP_PDF_TIMEOUT_MS,
        });
        const blob = await withTimeout(
          buildStandaloneInvoicePdfBlob(mapped.inv, company, {
            hasGst: mapped.hasGst,
            billSettings,
            docType: 'invoice',
          }),
          CAP_WHATSAPP_PDF_TIMEOUT_MS,
          'PDF_TIMEOUT',
        );
        waLog('info', 'WhatsApp distribution PDF build ok', { ...halfCtx, bytes: blob.size });
        const how = await sharePdfNativeWhatsApp(blob, mapped.filename, { ...halfCtx, path: 'pdf' });
        if (how === 'failed') {
          lastHint = 'Share file failed';
          lastHow = 'pdf_fallback';
          waLog('warn', 'WhatsApp distribution PDF share failed — text fallback', halfCtx);
          await shareInvoiceSummaryViaWhatsApp({
            phone,
            message: formatDistributionChallanText(mapped.textBill),
            logCtx: { ...halfCtx, path: 'fallback' },
          });
        } else if (how === 'cancelled') {
          return { how: 'cancelled' };
        } else {
          lastHow = how;
        }
        continue;
      }

      // Electron desktop
      const { shareElectronInvoiceWhatsApp } = await import('./electronWhatsAppInvoiceShare');
      const msg = formatDistributionChallanText(mapped.textBill);
      const electronResult = await shareElectronInvoiceWhatsApp(
        { ...mapped.inv, taxTotal: mapped.inv.taxTotal, customerPhone: phone },
        msg,
        { billSettings, docType: 'invoice', onPreparing: undefined },
      );
      if (!electronResult) {
        shareViaWhatsApp(phone, msg);
        lastHow = 'summary';
      } else if (electronResult.how === 'cancelled') {
        return { how: 'cancelled' };
      } else {
        lastHow = electronResult.how;
        lastHint = electronResult.errorHint;
      }
    } catch (err) {
      const timedOut = err instanceof Error && err.message === 'PDF_TIMEOUT';
      lastHint = truncateShareError(err);
      lastHow = 'pdf_fallback';
      waLog(
        timedOut ? 'warn' : 'error',
        timedOut ? 'WhatsApp distribution PDF timeout' : 'WhatsApp distribution PDF fail',
        {
          ...halfCtx,
          errorMessage: lastHint,
          timedOut,
        },
      );
      await shareInvoiceSummaryViaWhatsApp({
        phone,
        message: formatDistributionChallanText(mapped.textBill),
        logCtx: { ...halfCtx, path: 'fallback' },
      });
    }
  }

  return lastHow === 'pdf_fallback' ? { how: 'pdf_fallback', errorHint: lastHint } : { how: lastHow };
}
