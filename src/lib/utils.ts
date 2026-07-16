import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { session } from './session';

/** Fetch an image URL and return a base64 data URL — ensures it's embedded inline in PDFs */
export async function fetchImageAsDataUrl(url: string, timeoutMs = 4000): Promise<string> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return url;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return url; }
}

const BIZ_LABELS: Record<string, string> = {
  manufacturer: 'Manufacturer', dealer: 'Dealer / Wholesaler',
  retail: 'Retail Shop', service: 'Service / Consulting',
};

/** Display label for a business type — custom shows "Custom (CompanyName)" */
export function bizTypeLabel(type: string | null | undefined, companyName?: string): string {
  if (!type) return 'Manufacturer';
  if (type === 'custom') return companyName ? `Custom (${companyName})` : 'Custom';
  return BIZ_LABELS[type] || (type.charAt(0).toUpperCase() + type.slice(1));
}

/** Returns the super-admin-renamed label for a tab, falling back to the provided default. */
export function useTabLabel(tabId: string, defaultLabel: string): string {
  try {
    const user = session.getUser() as Record<string, unknown> | null;
    const tabConfig = user?.tabConfig as Record<string, { label?: string }> | undefined;
    return tabConfig?.[tabId]?.label || defaultLabel;
  } catch { return defaultLabel; }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Prefer SignedQRCode / stored irnQr; fall back to decoding base64 mock qrCode. */
export function resolveIrnQrPayload(r: { qrCode?: string | null; signedQrCode?: string | null; irnQr?: string | null }): string {
  const candidate = r.signedQrCode || r.irnQr || r.qrCode || '';
  if (!candidate) return '';
  if (candidate.includes('|') || candidate.startsWith('eyJ')) return candidate;
  try {
    const decoded = atob(candidate);
    if (decoded.includes('|') || /^[\x20-\x7E\n\r]+$/.test(decoded)) return decoded;
  } catch { /* not base64 */ }
  return candidate;
}

/** Shown when window.open is blocked (Electron / browser pop-up blocker). */
export const PRINT_POPUP_BLOCKED = 'Pop-up blocked — allow pop-ups to print';

/**
 * Open a print/preview window immediately.
 * Must be called synchronously from a click handler — never after await.
 * Avoids feature strings (width/height) which often make Electron return null.
 */
export function openPrintWindow(placeholder = 'Preparing…'): Window | null {
  let win: Window | null = null;
  try { win = window.open('', '_blank'); } catch { /* ignore */ }
  if (!win) {
    try { win = window.open('about:blank'); } catch { /* ignore */ }
  }
  if (win) {
    try {
      const safe = String(placeholder).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      win.document.open();
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#999;margin:0"><p>${safe}</p></body></html>`);
      win.document.close();
    } catch { /* ignore */ }
  }
  return win;
}

function applyPrintTitle(html: string, filename?: string): string {
  if (!filename) return html;
  const safeTitle = String(filename).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return html.includes('<title>')
    ? html.replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
    : html.replace(/<head([^>]*)>/i, `<head$1><title>${safeTitle}</title>`);
}

function triggerPrintWhenReady(win: Window) {
  try {
    win.focus();
    let printed = false;
    const printNow = () => {
      if (printed) return;
      printed = true;
      try { win.print(); } catch { /* ignore */ }
    };
    const imgs = Array.from(win.document.images || []);
    if (imgs.length === 0) {
      setTimeout(printNow, 200);
      return;
    }
    let done = 0;
    const check = () => { if (++done >= imgs.length) setTimeout(printNow, 150); };
    imgs.forEach((img) => {
      if (img.complete) check();
      else { img.onload = check; img.onerror = check; }
    });
    setTimeout(printNow, 4000); // fallback if image events never fire
  } catch { /* ignore */ }
}

/** Write HTML into an already-opened print window and trigger print */
export function printBillInWindow(win: Window, html: string, filename?: string, opts?: { autoPrint?: boolean }) {
  const titled = applyPrintTitle(html, filename);
  win.document.open();
  win.document.write(titled);
  win.document.close();
  if (opts?.autoPrint === false) {
    try { win.focus(); } catch { /* ignore */ }
    return;
  }
  triggerPrintWhenReady(win);
}

/** Hidden-iframe print — works when Electron/browser blocks window.open */
function printViaIframe(html: string, autoPrint = true) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => { try { iframe.remove(); } catch { /* ignore */ } };
  if (!autoPrint) {
    // Keep briefly so user can use browser print from a visible path if needed
    setTimeout(cleanup, 60_000);
    return;
  }
  const w = iframe.contentWindow;
  if (!w) { cleanup(); return; }
  const run = () => {
    try { w.focus(); w.print(); } catch { /* ignore */ }
    setTimeout(cleanup, 1500);
  };
  // Wait a tick for layout / images
  setTimeout(run, 400);
}

/**
 * Write HTML into a print window, or iframe-fallback if pop-up was blocked.
 * Always returns true if content was handed off for print/preview.
 */
export function writePrintHtml(
  win: Window | null,
  html: string,
  options?: { filename?: string; autoPrint?: boolean },
): boolean {
  const titled = applyPrintTitle(html, options?.filename);
  if (win) {
    printBillInWindow(win, titled, undefined, { autoPrint: options?.autoPrint ?? true });
    return true;
  }
  printViaIframe(titled, options?.autoPrint ?? true);
  return true;
}

/**
 * Open bill HTML for Save as PDF (no auto print dialog).
 * Pass `win` from openPrintWindow() when called after await — otherwise open may be blocked.
 */
export function saveBillAsPdf(html: string, filename?: string, win?: Window | null): boolean {
  const w = win ?? openPrintWindow('Preparing PDF…');
  if (!w) {
    // Last resort: open print dialog via iframe (user can "Save as PDF")
    printViaIframe(applyPrintTitle(html, filename), true);
    return true;
  }
  printBillInWindow(w, html, filename, { autoPrint: false });
  return true;
}

export function shareViaWhatsApp(phone: string, message: string) {
  let p = phone.replace(/[\s\-().+]/g, '');
  if (p.length === 10 && /^\d+$/.test(p)) p = '91' + p;
  if (p.startsWith('0')) p = '91' + p.slice(1);
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(message)}`, '_blank');
}

/** Open Gmail compose in browser (works on desktop + mobile) */
export function shareViaEmail(email: string, subject: string, body: string) {
  const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(gmailUrl, '_blank');
}

/** Format sales invoice as plain text for WhatsApp / Email */
export function formatSalesInvoiceText(bill: {
  id: string; barcode: string; productName: string; category?: string | null;
  salePrice: number; warrantyMonths: number; purchaseDate: string;
  customerName: string; customerPhone: string; customerEmail?: string | null;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  warranty?: { expiryDate: string } | null;
  company: { name: string; phone?: string | null; address?: string | null };
  rewardPointsEarned: number;
}): string {
  const lines = [
    `📄 *SALES INVOICE*`,
    `━━━━━━━━━━━━━━━━━━`,
    `Invoice: ${bill.id}`,
    `Date: ${bill.purchaseDate}`,
    `Company: ${bill.company.name}`,
    bill.company.address ? `Address: ${bill.company.address}` : '',
    bill.company.phone ? `Phone: ${bill.company.phone}` : '',
    ``,
    `*PRODUCT*`,
    `• ${bill.productName}`,
    `• Barcode: ${bill.barcode}`,
    bill.category ? `• Category: ${bill.category}` : '',
    `• Price: ₹${Number(bill.salePrice).toLocaleString()}`,
    ``,
    `*CUSTOMER*`,
    `• ${bill.customerName}`,
    `• Phone: ${bill.customerPhone}`,
    bill.customerEmail ? `• Email: ${bill.customerEmail}` : '',
    ``,
    `*SOLD BY*`,
    `• ${bill.vendor.name}`,
    bill.vendor.contactPerson ? `• Contact: ${bill.vendor.contactPerson}` : '',
    bill.vendor.phone ? `• Phone: ${bill.vendor.phone}` : '',
    ``,
    `*WARRANTY*: ${bill.warrantyMonths} months`,
    bill.warranty ? `• Valid till: ${bill.warranty.expiryDate}` : '',
    bill.rewardPointsEarned > 0 ? `\n🎁 Reward Points Earned: ${bill.rewardPointsEarned}` : '',
    ``,
    `Thank you for your purchase!`,
    `— ${bill.company.name} ERP`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Format distribution challan as plain text for WhatsApp / Email */
export function formatDistributionChallanText(bill: {
  challanId: string; distributionDate: string;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  company: { name: string; phone?: string | null; address?: string | null };
  items: { sno: number; barcode: string; productName: string }[];
  groupedItems?: { sno: number; productName: string; barcodeRange: string; quantity: number; netPrice: number; lineTotal: number }[];
  totalQuantity: number; totalValue: number;
  ewbNumber?: string | null;
  irn?: string | null;
  irnAckNo?: string | null;
  payment?: { totalDistributedValue: number; totalPaid: number; balance: number };
}): string {
  const itemLines = bill.groupedItems
    ? bill.groupedItems.map((g) => `${g.sno}. ${g.productName}\n   ${g.barcodeRange} × ${g.quantity} = ₹${g.lineTotal.toLocaleString()}`)
    : bill.items.map((item) => `${item.sno}. ${item.barcode} — ${item.productName}`);
  const lines = [
    `📦 *DISTRIBUTION CHALLAN*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Challan: ${bill.challanId}`,
    `Date: ${bill.distributionDate}`,
    bill.ewbNumber ? `E-Way Bill: ${bill.ewbNumber}` : '',
    bill.irn ? `IRN: ${bill.irn}` : '',
    bill.irnAckNo ? `Ack No: ${bill.irnAckNo}` : '',
    `From: ${bill.company.name}`,
    bill.company.address ? `Address: ${bill.company.address}` : '',
    bill.company.phone ? `Phone: ${bill.company.phone}` : '',
    ``,
    `*TO VENDOR*`,
    `• ${bill.vendor.name}`,
    bill.vendor.contactPerson ? `• ${bill.vendor.contactPerson}` : '',
    bill.vendor.phone ? `• Phone: ${bill.vendor.phone}` : '',
    ``,
    `*ITEMS (${bill.totalQuantity} units)*`,
    ...itemLines,
    ``,
    `Total Value: ₹${bill.totalValue.toLocaleString()}`,
    bill.payment ? `\n💰 *PAYMENT STATUS*\nTotal Owed: ₹${bill.payment.totalDistributedValue.toLocaleString()}\nPaid: ₹${bill.payment.totalPaid.toLocaleString()}\nBalance: ₹${bill.payment.balance.toLocaleString()}` : '',
    ``,
    `— ${bill.company.name} ERP`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Escape CSV value (wrap in quotes if contains comma, newline, or quote) */
function escapeCsv(val: unknown): string {
  const s = String(val ?? '');
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Export array of objects to CSV and trigger download */
export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = [headers.map(escapeCsv).join(','), ...data.map((r) => headers.map((h) => escapeCsv(r[h])).join(','))];
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
