/**
 * Light programmatic invoice PDF via jsPDF text/table API only.
 * Never uses html2pdf/html2canvas (Android WebView OOM/crash).
 * Kept for a future Cap "Share PDF" action — WhatsApp tap path must NOT call this until proven safe.
 * Print path stays full Tax Invoice HTML + system Print.
 */

import type { jsPDF } from 'jspdf';

import type { StandaloneInvoicePrint, StandaloneInvoicePrintCompany } from './billTemplates';
import { invoiceHasGst } from './billSettingsFlags';

function money(n: number): string {
  return `Rs ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function line(doc: jsPDF, text: string, x: number, y: number, maxW: number): number {
  const parts = doc.splitTextToSize(String(text || ''), maxW) as string[];
  doc.text(parts, x, y);
  return y + parts.length * 4.2;
}

/**
 * Programmatic A4 invoice PDF (no HTML canvas). Safe for Cap WebView.
 * Lazy-imports jspdf so Cap invoice list doesn't pay the chunk cost until share.
 */
export async function buildStandaloneInvoicePdfBlob(
  inv: StandaloneInvoicePrint,
  company: StandaloneInvoicePrintCompany,
  options?: { hasGst?: boolean },
): Promise<Blob> {
  if (!Array.isArray(inv.items) || inv.items.length === 0) {
    throw new Error('Invoice has no line items to share');
  }

  const { jsPDF } = await import('jspdf');
  const hasGst = options?.hasGst ?? invoiceHasGst(inv);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  const contentW = pageW - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  y = line(doc, company.companyName || 'Dhandho', margin, y, contentW);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (company.address) y = line(doc, company.address, margin, y, contentW);
  if (company.phone) y = line(doc, `Phone: ${company.phone}`, margin, y, contentW);
  if (hasGst && company.gstNumber) y = line(doc, `GSTIN: ${company.gstNumber}`, margin, y, contentW);

  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  y = line(doc, hasGst ? 'Tax Invoice' : 'Invoice', margin, y, contentW);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y = line(doc, `Invoice No: ${inv.invoiceNumber}`, margin, y, contentW);
  if (inv.invoiceDate) y = line(doc, `Date: ${inv.invoiceDate}`, margin, y, contentW);
  y = line(doc, `Bill To: ${inv.customerName || 'Client'}`, margin, y, contentW);
  if (inv.customerPhone) y = line(doc, `Phone: ${inv.customerPhone}`, margin, y, contentW);
  if (hasGst && inv.customerGstin) y = line(doc, `GSTIN: ${inv.customerGstin}`, margin, y, contentW);

  y += 4;
  // Columns: # | Item | Qty | Rate | Amount  (+ GST% when GST)
  const colItem = margin + 8;
  const colQty = margin + (hasGst ? 95 : 110);
  const colRate = margin + (hasGst ? 115 : 135);
  const colGst = margin + 135;
  const colAmt = margin + (hasGst ? 155 : 160);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('#', margin, y);
  doc.text('Item', colItem, y);
  doc.text('Qty', colQty, y, { align: 'right' });
  doc.text('Rate', colRate, y, { align: 'right' });
  if (hasGst) doc.text('GST%', colGst, y, { align: 'right' });
  doc.text('Amount', colAmt + 20, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');

  const ensureSpace = (need: number) => {
    if (y + need > 280) {
      doc.addPage();
      y = margin;
    }
  };

  inv.items.forEach((it, i) => {
    ensureSpace(12);
    const desc = String(it.description || 'Item').slice(0, 48);
    const rowTop = y;
    doc.text(String(i + 1), margin, y);
    const afterDesc = line(doc, desc, colItem, y, colQty - colItem - 4);
    doc.text(String(it.qty ?? 0), colQty, rowTop, { align: 'right' });
    doc.text(money(it.rate), colRate, rowTop, { align: 'right' });
    if (hasGst) doc.text(`${Number(it.gstPercent || 0).toFixed(0)}%`, colGst, rowTop, { align: 'right' });
    doc.text(money(it.total), colAmt + 20, rowTop, { align: 'right' });
    y = Math.max(afterDesc, rowTop + 5);
  });

  y += 2;
  doc.line(margin, y, pageW - margin, y);
  y += 6;
  doc.setFontSize(9);
  ensureSpace(36);
  doc.text(`Subtotal: ${money(inv.subtotal)}`, pageW - margin, y, { align: 'right' });
  y += 5;
  if (hasGst && (inv.taxTotal || 0) > 0) {
    const useIgst = inv.isInterstate === true || (typeof inv.taxIgst === 'number' && inv.taxIgst > 0);
    if (useIgst) {
      doc.text(`IGST: ${money(inv.taxIgst ?? inv.taxTotal)}`, pageW - margin, y, { align: 'right' });
      y += 5;
    } else {
      const cgst = typeof inv.taxCgst === 'number' ? inv.taxCgst : Math.round((inv.taxTotal || 0) / 2);
      const sgst = typeof inv.taxSgst === 'number' ? inv.taxSgst : Math.round(((inv.taxTotal || 0) - cgst) * 100) / 100;
      doc.text(`CGST: ${money(cgst)}`, pageW - margin, y, { align: 'right' });
      y += 5;
      doc.text(`SGST: ${money(sgst)}`, pageW - margin, y, { align: 'right' });
      y += 5;
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`Grand Total: ${money(inv.grandTotal)}`, pageW - margin, y, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Generated by Dhandho', margin, Math.min(y, 285));
  doc.setTextColor(0);

  return doc.output('blob');
}
