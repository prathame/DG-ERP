/**
 * Cap bill PDF — single shared jsPDF builder (text/draw/addImage only).
 * No html2pdf/html2canvas on Cap (WebView OOM/freeze).
 *
 * Product model (confirmed):
 * 1. Bill Customization Save → persist/normalize billSettings (logo, signature, bank,
 *    colors, terms, footer, tagline, signatory…). That record IS the ready template.
 * 2. Cap WhatsApp (and any Cap bill PDF) → load that template + fill invoice-only fields
 *    (number, date, client, lines, totals/payments), then share.
 * 3. Print still uses generateStandaloneInvoiceHtml + system Print (full HTML fidelity).
 *
 * Follow-up (not in this PR): optionally bake PDF on Cap Invoice Save under
 * Dhandho/invoices and reuse when fresh; rebuild after invoice edit.
 */

import type { jsPDF } from 'jspdf';

import {
  amountInWords,
  safeImgSrc,
  type StandaloneInvoicePrint,
  type StandaloneInvoicePrintCompany,
} from './billTemplates';
import { invoiceHasGst } from './billSettingsFlags';

const BORDER = 34; // ~#222
const MUTED = 100;
const FILL = 245;
const ACCENT_DEFAULT = '#F27D26';

function money(n: number): string {
  return `Rs ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function parseHexColor(hex: string | undefined): [number, number, number] {
  const raw = String(hex || '').trim();
  if (!/^#[0-9a-fA-F]{3,8}$/.test(raw)) return [242, 125, 38];
  let h = raw.slice(1);
  if (h.length === 3)
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  h = h.slice(0, 6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function wrapLines(doc: jsPDF, text: string, maxW: number): string[] {
  return doc.splitTextToSize(String(text || ''), maxW) as string[];
}

/** jsPDF image format from a data:image/… URL; empty if unsupported. */
function dataUrlImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' | '' {
  const m = /^data:image\/(png|jpeg|jpg|webp);/i.exec(dataUrl);
  if (!m) return '';
  const t = m[1].toLowerCase();
  if (t === 'png') return 'PNG';
  if (t === 'jpeg' || t === 'jpg') return 'JPEG';
  if (t === 'webp') return 'WEBP';
  return '';
}

/** Draw saved billSettings image; returns false on missing/unsupported/addImage failure. */
function tryAddImage(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number): boolean {
  const src = safeImgSrc(dataUrl);
  if (!src) return false;
  const fmt = dataUrlImageFormat(src);
  if (!fmt) return false;
  try {
    doc.addImage(src, fmt, x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

export type StandaloneInvoicePdfOptions = {
  hasGst?: boolean;
  /**
   * Saved Bill Customization (the WhatsApp/print template): logoBase64, signatureBase64,
   * primaryColor, bank*, termsAndConditions, footerText, tagline, invoicePrefix,
   * signatoryName, signatoryDesignation. Invoice payload supplies only per-bill data.
   */
  billSettings?: Record<string, unknown>;
};

/**
 * Programmatic A4 invoice PDF from billSettings template + invoice data.
 * Lazy-imports jspdf so Cap invoice list doesn't pay the chunk cost until share.
 */
export async function buildStandaloneInvoicePdfBlob(
  inv: StandaloneInvoicePrint,
  company: StandaloneInvoicePrintCompany,
  options?: StandaloneInvoicePdfOptions,
): Promise<Blob> {
  if (!Array.isArray(inv.items) || inv.items.length === 0) {
    throw new Error('Invoice has no line items to share');
  }

  const { jsPDF } = await import('jspdf');
  const hasGst = options?.hasGst ?? invoiceHasGst(inv);
  const bs = options?.billSettings || {};
  const companyName = company.companyName || 'Dhandho';
  const footerText = String(bs.footerText || 'Powered by Dhandho Management');
  const tagline = String(bs.tagline || '').trim();
  const termsText = String(bs.termsAndConditions || inv.terms || '').trim();
  const accent = parseHexColor(
    typeof bs.primaryColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(bs.primaryColor)
      ? bs.primaryColor
      : ACCENT_DEFAULT,
  );
  const invPrefix = String(bs.invoicePrefix || '');
  const logoSrc = safeImgSrc(bs.logoBase64);
  const sigSrc = safeImgSrc(bs.signatureBase64);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const right = pageW - margin;
  const contentW = right - margin;
  let y = margin;

  const setBorder = () => doc.setDrawColor(BORDER);
  const setFill = () => doc.setFillColor(FILL, FILL, FILL);

  const ensureSpace = (need: number) => {
    if (y + need > pageH - 12) {
      doc.addPage();
      y = margin;
    }
  };

  // —— Title box ——
  const titleH = 9;
  setBorder();
  doc.setLineWidth(0.35);
  doc.rect(margin, y, contentW, titleH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(hasGst ? 'TAX INVOICE' : 'INVOICE', pageW / 2, y + 6.2, { align: 'center' });
  y += titleH;

  // —— Company | meta ——
  const leftW = contentW * 0.62;
  const metaX = margin + leftW;
  const companyLines: string[] = [];
  if (company.address) companyLines.push(...wrapLines(doc, company.address, leftW - 22));
  if (company.phone) companyLines.push(`Phone: ${company.phone}`);
  if (company.email) companyLines.push(`Email: ${company.email}`);
  if (hasGst && company.gstNumber) companyLines.push(`GSTIN: ${company.gstNumber}`);
  if (tagline) companyLines.push(tagline);
  const metaRows: [string, string][] = [
    ['Invoice No', `${invPrefix}${inv.invoiceNumber}`],
    ['Date', fmtDate(inv.invoiceDate)],
  ];
  if (inv.dueDate) metaRows.push(['Due', fmtDate(inv.dueDate)]);
  if (String(inv.status || '').toLowerCase() === 'paid') metaRows.push(['Status', 'PAID']);
  const hdrH = Math.max(22, 12 + companyLines.length * 3.6, 6 + metaRows.length * 5.5);

  setBorder();
  doc.rect(margin, y, contentW, hdrH);
  doc.line(metaX, y, metaX, y + hdrH);

  // Logo from billSettings (or letter fallback)
  const logoSize = 12;
  const logoX = margin + 3;
  const logoY = y + 4;
  setBorder();
  doc.rect(logoX, logoY, logoSize, logoSize);
  if (!tryAddImage(doc, logoSrc, logoX + 0.5, logoY + 0.5, logoSize - 1, logoSize - 1)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text((companyName || 'C').charAt(0).toUpperCase(), logoX + logoSize / 2, logoY + 8.2, {
      align: 'center',
    });
  }

  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(companyName, margin + 18, y + 8);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  let cy = y + 12;
  for (const ln of companyLines) {
    doc.text(ln, margin + 18, cy);
    cy += 3.6;
  }
  doc.setTextColor(0);

  let my = y + 5;
  for (const [label, value] of metaRows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(label, metaX + 3, my);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(value, right - 3, my, { align: 'right' });
    my += 5.5;
    if (my < y + hdrH - 1) {
      doc.setDrawColor(200);
      doc.line(metaX, my - 2.2, right, my - 2.2);
      setBorder();
    }
  }
  y += hdrH;

  // —— Bill To ——
  const billHeadH = 6.5;
  setFill();
  setBorder();
  doc.rect(margin, y, contentW, billHeadH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BILL TO', margin + 3, y + 4.5);
  y += billHeadH;

  const billBody: string[] = [inv.customerName || 'Client'];
  if (inv.customerPhone) billBody.push(`Ph: ${inv.customerPhone}`);
  if (inv.customerAddress) billBody.push(...wrapLines(doc, inv.customerAddress, contentW - 8));
  if (inv.customerGstin) billBody.push(`GSTIN: ${inv.customerGstin}`);
  const billH = Math.max(14, 6 + billBody.length * 3.8);
  setBorder();
  doc.rect(margin, y, contentW, billH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  let by = y + 5;
  doc.text(billBody[0], margin + 3, by);
  by += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  for (let i = 1; i < billBody.length; i++) {
    doc.text(billBody[i], margin + 3, by);
    by += 3.8;
  }
  doc.setTextColor(0);
  y += billH;

  // —— Items table ——
  const showHsn = hasGst;
  const showDisc = inv.items.some(it => (it.discountPercent || 0) > 0);
  const colHash = margin + 2;
  const colItem = margin + 10;
  const colAmtR = right - 2;
  let cursor = colAmtR - 28;
  const colGstTaxR = hasGst ? cursor : colAmtR;
  if (hasGst) cursor -= 18;
  const colGstPctR = hasGst ? cursor : colAmtR;
  if (hasGst) cursor -= 14;
  const colDiscR = showDisc ? cursor : colAmtR;
  if (showDisc) cursor -= 14;
  const colRateR = cursor;
  cursor -= 26;
  const colQtyR = cursor;
  const colHsnL = showHsn ? Math.min(margin + contentW * 0.48, colQtyR - 22) : colItem;
  const colItemMaxW = (showHsn ? colHsnL - 2 : colQtyR - 6) - colItem;

  const rowPad = 3.8;
  const drawTableHeader = () => {
    const h = 7;
    setFill();
    setBorder();
    doc.rect(margin, y, contentW, h, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('#', colHash, y + 4.8);
    doc.text('ITEM NAME', colItem, y + 4.8);
    if (showHsn) doc.text('HSN', colHsnL, y + 4.8);
    doc.text('QTY', colQtyR, y + 4.8, { align: 'right' });
    doc.text('PRICE/UNIT', colRateR, y + 4.8, { align: 'right' });
    if (showDisc) doc.text('DISC%', colDiscR, y + 4.8, { align: 'right' });
    if (hasGst) {
      doc.text('GST%', colGstPctR, y + 4.8, { align: 'right' });
      doc.text('TAX', colGstTaxR, y + 4.8, { align: 'right' });
    }
    doc.text('AMOUNT', colAmtR, y + 4.8, { align: 'right' });
    y += h;
  };

  drawTableHeader();

  const qtyTotal = inv.items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const taxTotalAmt = inv.items.reduce((s, it) => s + Number(it.tax || 0), 0);
  const amountTotal = inv.items.reduce((s, it) => s + Number(it.total || 0), 0);

  inv.items.forEach((it, i) => {
    const descParts = wrapLines(doc, String(it.description || 'Item').slice(0, 80), Math.max(28, colItemMaxW));
    const rowH = Math.max(7, 3 + descParts.length * rowPad);
    ensureSpace(rowH + 20);
    if (y < margin + 2) drawTableHeader();
    setBorder();
    doc.rect(margin, y, contentW, rowH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(String(i + 1), colHash, y + 4.5);
    let dy = y + 4.5;
    for (const p of descParts) {
      doc.text(p, colItem, dy);
      dy += rowPad;
    }
    if (showHsn) doc.text(String(it.hsnSac || '—').slice(0, 10), colHsnL, y + 4.5);
    doc.text(String(it.qty ?? 0), colQtyR, y + 4.5, { align: 'right' });
    doc.text(money(it.rate), colRateR, y + 4.5, { align: 'right' });
    if (showDisc) {
      const d = it.discountPercent || 0;
      doc.text(d > 0 ? `${d}%` : '—', colDiscR, y + 4.5, { align: 'right' });
    }
    if (hasGst) {
      doc.text(`${Number(it.gstPercent || 0).toFixed(0)}%`, colGstPctR, y + 4.5, { align: 'right' });
      doc.text(money(it.tax), colGstTaxR, y + 4.5, { align: 'right' });
    }
    doc.text(money(it.total), colAmtR, y + 4.5, { align: 'right' });
    y += rowH;
  });

  const minBodyBottom = margin + 145;
  if (y < minBodyBottom) {
    const fillH = minBodyBottom - y;
    setBorder();
    doc.rect(margin, y, contentW, fillH);
    y += fillH;
  }

  ensureSpace(8);
  const totH = 7;
  setFill();
  setBorder();
  doc.rect(margin, y, contentW, totH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Total', colItem, y + 4.8);
  doc.text(String(qtyTotal), colQtyR, y + 4.8, { align: 'right' });
  if (hasGst) doc.text(money(taxTotalAmt), colGstTaxR, y + 4.8, { align: 'right' });
  doc.text(money(amountTotal), colAmtR, y + 4.8, { align: 'right' });
  y += totH;

  // —— Summary ——
  const received = Number(inv.paidAmount || 0);
  const balance =
    typeof inv.outstanding === 'number'
      ? inv.outstanding
      : Math.max(0, Number(inv.grandTotal || 0) - Number(inv.paidAmount || 0));
  const advance = Number(inv.advanceApplied || 0);
  const midX = margin + contentW / 2;
  const words = `(${amountInWords(inv.grandTotal)})`.toUpperCase();
  const wordsLines = wrapLines(doc, words, contentW / 2 - 8);
  const leftSummaryRows = 2 + (advance > 0.001 ? 1 : 0);
  const sumH = Math.max(18, 5 + leftSummaryRows * 5, 8 + wordsLines.length * 3.5 + 10);

  ensureSpace(sumH + 50);
  setBorder();
  doc.rect(margin, y, contentW, sumH);
  doc.line(midX, y, midX, y + sumH);

  const drawKV = (xLabel: number, xVal: number, rowY: number, label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.text(label, xLabel, rowY);
    doc.text(val, xVal, rowY, { align: 'right' });
  };

  let sy = y + 5.5;
  drawKV(margin + 3, midX - 3, sy, 'Sub Total', money(inv.subtotal));
  sy += 5;
  if (advance > 0.001) {
    drawKV(margin + 3, midX - 3, sy, 'Advance', `-${money(advance)}`);
    sy += 5;
  }
  drawKV(margin + 3, midX - 3, sy, 'Received', money(received));

  sy = y + 5.5;
  drawKV(midX + 3, right - 3, sy, 'Total', money(inv.grandTotal), true);
  sy += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(MUTED);
  for (const wl of wordsLines) {
    doc.text(wl, midX + 3, sy);
    sy += 3.2;
  }
  doc.setTextColor(0);
  sy += 1.5;
  drawKV(midX + 3, right - 3, sy, 'Balance', money(balance), true);
  y += sumH;

  if (hasGst && (inv.taxTotal || 0) > 0) {
    ensureSpace(14);
    const gstH = 10;
    setBorder();
    doc.rect(margin, y, contentW, gstH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const useIgst = inv.isInterstate === true || (typeof inv.taxIgst === 'number' && inv.taxIgst > 0);
    let gstLine: string;
    if (useIgst) {
      gstLine = `IGST: ${money(inv.taxIgst ?? inv.taxTotal)}`;
    } else {
      const cgst = typeof inv.taxCgst === 'number' ? inv.taxCgst : Math.round((inv.taxTotal || 0) / 2);
      const sgst = typeof inv.taxSgst === 'number' ? inv.taxSgst : Math.round(((inv.taxTotal || 0) - cgst) * 100) / 100;
      gstLine = `CGST: ${money(cgst)}   SGST: ${money(sgst)}   Tax Total: ${money(inv.taxTotal)}`;
    }
    doc.text(gstLine, margin + 3, y + 6.2);
    y += gstH;
  }

  // —— Bank | Signatory (from billSettings template) ——
  const hasBank = !!(bs.bankAccountName || bs.bankAccountNumber || bs.bankName || bs.bankUpiId);
  const bankLines: string[] = [];
  if (hasBank) {
    bankLines.push('Bank Details');
    if (bs.bankAccountName) bankLines.push(`Name: ${String(bs.bankAccountName)}`);
    if (bs.bankName) {
      bankLines.push(`Bank: ${String(bs.bankName)}${bs.bankBranch ? `, ${String(bs.bankBranch)}` : ''}`);
    }
    if (bs.bankAccountNumber) bankLines.push(`A/c No.: ${String(bs.bankAccountNumber)}`);
    if (bs.bankIfsc) bankLines.push(`IFSC: ${String(bs.bankIfsc)}`);
    if (bs.bankUpiId) bankLines.push(`UPI: ${String(bs.bankUpiId)}`);
  }
  const footMid = margin + contentW * 0.55;
  const bankBlockH = hasBank ? 6 + bankLines.length * 3.6 : 8;
  const sigBlockH = 32;
  const footH = Math.max(bankBlockH, sigBlockH);

  ensureSpace(footH + (termsText ? 24 : 10));
  setBorder();
  doc.rect(margin, y, contentW, footH);
  doc.line(footMid, y, footMid, y + footH);

  if (hasBank) {
    let by2 = y + 5;
    bankLines.forEach((ln, idx) => {
      doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');
      doc.setFontSize(idx === 0 ? 8.5 : 7.5);
      doc.text(ln, margin + 3, by2);
      by2 += 3.6;
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text('—', margin + 3, y + 6);
    doc.setTextColor(0);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(MUTED);
  const cert = wrapLines(doc, 'Certified that the particulars given above are true and correct.', contentW * 0.42);
  let sigY = y + 4.5;
  for (const ln of cert) {
    doc.text(ln, right - 3, sigY, { align: 'right' });
    sigY += 3;
  }
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`For ${companyName}`, right - 3, sigY + 1, { align: 'right' });
  sigY += 3;

  const sigBoxW = 38;
  const sigBoxH = 12;
  const sigBoxX = right - sigBoxW - 2;
  const sigBoxY = Math.min(sigY + 1, y + footH - 16);
  if (!tryAddImage(doc, sigSrc, sigBoxX, sigBoxY, sigBoxW, sigBoxH)) {
    doc.setDrawColor(180);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(sigBoxX, sigBoxY, sigBoxW, sigBoxH);
    doc.setLineDashPattern([], 0);
    setBorder();
  }

  let nameY = sigBoxY + sigBoxH + 3.5;
  if (bs.signatoryName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(String(bs.signatoryName), right - 3, nameY, { align: 'right' });
    nameY += 3.2;
  }
  if (bs.signatoryDesignation) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text(String(bs.signatoryDesignation), right - 3, nameY, { align: 'right' });
    doc.setTextColor(0);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.line(sigBoxX, y + footH - 5, right - 3, y + footH - 5);
  doc.text('Authorized Signatory', right - 3, y + footH - 1.5, { align: 'right' });
  y += footH;

  if (termsText) {
    const termLines = wrapLines(doc, termsText, contentW - 8).slice(0, 8);
    const termsH = 8 + termLines.length * 3.4;
    ensureSpace(termsH + 8);
    setBorder();
    doc.rect(margin, y, contentW, termsH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Terms and Conditions', margin + 3, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    let ty = y + 8.5;
    for (const ln of termLines) {
      doc.text(ln, margin + 3, ty);
      ty += 3.4;
    }
    doc.setTextColor(0);
    y += termsH + 5;
  } else {
    y += 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(footerText, pageW / 2, Math.min(y, pageH - 8), { align: 'center' });
  doc.setTextColor(0);

  return doc.output('blob');
}
