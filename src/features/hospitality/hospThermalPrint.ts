import { api } from '../../api';
import { isGstBillingEnabled } from '../../lib/billSettingsFlags';
import { session } from '../../lib/session';
import type { HospOrderDetail } from './hospApi';

export function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sessionCompanyName(): string {
  try {
    return String((session.getUser() || {}).companyName || '');
  } catch {
    return '';
  }
}

export type BillHeaderMeta = {
  address?: string;
  phone?: string;
  /** Seller GSTIN from company profile — printed on guest bill when present. */
  gstin?: string;
  /** FSSAI license from bill settings — printed when present. */
  fssaiLicense?: string;
  /** When set (>0) and GST billing is on, print CGST/SGST. */
  gstRate?: number;
  /**
   * true (default): menu prices include GST — break out taxable + CGST/SGST; grand = subtotal.
   * false: menu prices exclude GST — add CGST/SGST on subtotal.
   */
  pricesIncludeGst?: boolean;
};

export type HospBillTaxTotals = {
  taxable: number;
  taxTotal: number;
  cgst: number;
  sgst: number;
  grand: number;
  halfPct: number;
  pricesIncludeGst: boolean;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Hospitality guest-bill GST math.
 * Inclusive: never adds GST on top of menu totals — extracts taxable + CGST/SGST from grand.
 * Exclusive: adds CGST/SGST on the subtotal (menu prices are pre-tax).
 */
export function computeHospBillTaxTotals(
  subtotal: number,
  gstRate: number,
  pricesIncludeGst = true,
): HospBillTaxTotals {
  const amount = Number(subtotal) || 0;
  const rate = Number.isFinite(gstRate) && gstRate > 0 ? gstRate : 0;
  const halfPct = rate > 0 ? rate / 2 : 0;
  const inclusive = pricesIncludeGst !== false;

  if (rate <= 0) {
    return {
      taxable: amount,
      taxTotal: 0,
      cgst: 0,
      sgst: 0,
      grand: amount,
      halfPct: 0,
      pricesIncludeGst: inclusive,
    };
  }

  if (inclusive) {
    const taxable = roundMoney(amount / (1 + rate / 100));
    const taxTotal = roundMoney(amount - taxable);
    const cgst = roundMoney(taxTotal / 2);
    const sgst = roundMoney(taxTotal - cgst);
    return {
      taxable,
      taxTotal,
      cgst,
      sgst,
      grand: amount,
      halfPct,
      pricesIncludeGst: true,
    };
  }

  const taxTotal = roundMoney((amount * rate) / 100);
  const cgst = roundMoney(taxTotal / 2);
  const sgst = roundMoney(taxTotal - cgst);
  return {
    taxable: amount,
    taxTotal,
    cgst,
    sgst,
    grand: roundMoney(amount + taxTotal),
    halfPct,
    pricesIncludeGst: false,
  };
}

/** Best-effort profile / bill-settings — never invents address, phone, or tax. */
export async function loadBillHeaderMeta(): Promise<BillHeaderMeta> {
  const meta: BillHeaderMeta = {};
  try {
    const user = session.getUser() as { id?: string } | null;
    const userId = user?.id ? String(user.id) : '';
    const [profile, billSettings] = await Promise.all([
      userId ? api.settings.getProfile(userId).catch(() => null) : Promise.resolve(null),
      api.settings.getBillSettings().catch(() => null),
    ]);
    const address = String(profile?.address || '').trim();
    const phone = String(profile?.phone || '').trim();
    const gstin = String(profile?.gstNumber || '').trim();
    if (address) meta.address = address;
    if (phone) meta.phone = phone;
    if (gstin) meta.gstin = gstin;
    const fssai = String(billSettings?.fssaiLicense || '').trim();
    if (fssai) meta.fssaiLicense = fssai;
    meta.pricesIncludeGst = billSettings?.hospPricesIncludeGst !== false;
    const rate = Number(profile?.defaultGstRate);
    if (isGstBillingEnabled(billSettings) && Number.isFinite(rate) && rate > 0) {
      meta.gstRate = rate;
    }
  } catch {
    /* print without optional header / tax */
  }
  return meta;
}

function fmtAmt(n: number): string {
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/** Shared 80mm thermal shell — overrides injected A4 @page via trailing style. */
function thermalDoc(title: string, bodyInner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:"Courier New",Courier,monospace;
  color:#000;background:#fff;
  max-width:300px;margin:0 auto;padding:10px 8px 16px;
  font-size:12px;line-height:1.35;
}
.center{text-align:center}
.name{font-size:15px;font-weight:700;letter-spacing:.02em;margin-bottom:2px}
.sub{font-size:11px;margin-top:1px}
.sep{margin:6px 0;letter-spacing:1px;text-align:center;white-space:nowrap;overflow:hidden}
.meta{font-size:11px;margin:4px 0}
.meta strong{font-weight:700}
table{width:100%;border-collapse:collapse;margin:2px 0 6px}
th{font-size:11px;font-weight:700;text-align:left;padding:2px 0;border-bottom:1px dashed #000}
td{padding:3px 0;vertical-align:top;font-size:12px}
th.qty,td.qty{text-align:center;width:2.2em}
th.num,td.num{text-align:right;width:3.6em;padding-left:4px}
td.item{padding-right:4px;word-break:break-word}
.mod{font-size:10px}
.line{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin:2px 0}
.grand{display:flex;justify-content:space-between;gap:8px;font-size:14px;font-weight:700;margin:6px 0}
.kot-item{font-size:14px;font-weight:700;margin:4px 0 2px}
.kot-status{font-size:11px;font-weight:700;text-transform:uppercase;margin-top:6px}
.footer{text-align:center;margin-top:12px;font-size:11px}
</style></head><body>
${bodyInner}
<style id="dg-thermal-page">
@media print{
  @page{margin:3mm;size:80mm auto}
  html,body{width:80mm!important;max-width:80mm!important;margin:0!important;padding:4px!important}
}
</style>
</body></html>`;
}

/** Indian restaurant guest bill — narrow thermal, Item / Qty / Rate / Amt. */
export function generateTableBillHtml(
  detail: HospOrderDetail,
  tableLabel: string,
  companyName: string,
  header: BillHeaderMeta = {},
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const token = detail.order.token?.trim() || detail.label?.trim() || '';
  // Lines → order discount → GST (inclusive or exclusive). Prefer explicit fields.
  const linesSubtotal =
    detail.subtotal != null ? Number(detail.subtotal) || 0 : Number(detail.total) || 0;
  const discountValue = Number(detail.discount_value) || 0;
  const afterDiscount =
    detail.subtotal != null
      ? Math.max(0, Math.round((linesSubtotal - discountValue) * 100) / 100)
      : Number(detail.total) || 0;
  const gstRate = header.gstRate && header.gstRate > 0 ? header.gstRate : 0;
  const pricesIncludeGst = header.pricesIncludeGst !== false;
  const totals = computeHospBillTaxTotals(afterDiscount, gstRate, pricesIncludeGst);

  const itemBlocks = detail.items
    .map(item => {
      const rate = Number(item.unit_price) || 0;
      const amt = Number(item.lineTotal) || 0;
      const modLines = item.modifiers
        .map(m => {
          const delta = Number(m.price_delta) || 0;
          const deltaTxt = delta ? ` (+${fmtAmt(delta)})` : '';
          return `<div class="mod">  ${escHtml(m.name)}${deltaTxt}</div>`;
        })
        .join('');
      const notes = item.notes?.trim() ? `<div class="mod">  ${escHtml(item.notes.trim())}</div>` : '';
      return `<tr>
        <td class="item">${escHtml(item.name)}${modLines}${notes}</td>
        <td class="qty">${item.qty}</td>
        <td class="num">${fmtAmt(rate)}</td>
        <td class="num">${fmtAmt(amt)}</td>
      </tr>`;
    })
    .join('');

  const addrLine = header.address ? `<div class="sub">${escHtml(header.address)}</div>` : '';
  const phoneLine = header.phone ? `<div class="sub">Ph: ${escHtml(header.phone)}</div>` : '';
  const gstinLine = header.gstin ? `<div class="sub">GSTIN: ${escHtml(header.gstin)}</div>` : '';
  const fssaiLine = header.fssaiLicense ? `<div class="sub">FSSAI: ${escHtml(header.fssaiLicense)}</div>` : '';
  const tokenLine = token ? `<div>Token / Bill: <strong>${escHtml(token)}</strong></div>` : '';

  const discPct = Number(detail.order.discount_percent) || 0;
  const discFlat = Number(detail.order.discount_amount) || 0;
  const discParts: string[] = [];
  if (discPct > 0) discParts.push(`${fmtAmt(discPct)}%`);
  if (discFlat > 0) discParts.push(`Rs. ${fmtAmt(discFlat)}`);
  const discountLine =
    discountValue > 0
      ? `<div class="line"><span>Discount${discParts.length ? ` (${discParts.join(' + ')})` : ''}</span><span>- Rs. ${fmtAmt(discountValue)}</span></div>`
      : '';

  let taxBlock: string;
  if (gstRate > 0) {
    const subLabel = totals.pricesIncludeGst ? 'Taxable Value' : 'Amount';
    const modeNote = totals.pricesIncludeGst
      ? `<div class="sub" style="text-align:center;margin:2px 0 4px">Prices include GST</div>`
      : '';
    taxBlock = `<div class="line"><span>Sub Total</span><span>Rs. ${fmtAmt(linesSubtotal)}</span></div>
${discountLine}${modeNote}<div class="line"><span>${subLabel}</span><span>Rs. ${fmtAmt(totals.taxable)}</span></div>
<div class="line"><span>CGST @ ${fmtAmt(totals.halfPct)}%</span><span>Rs. ${fmtAmt(totals.cgst)}</span></div>
<div class="line"><span>SGST @ ${fmtAmt(totals.halfPct)}%</span><span>Rs. ${fmtAmt(totals.sgst)}</span></div>`;
  } else {
    taxBlock = `<div class="line"><span>Sub Total</span><span>Rs. ${fmtAmt(linesSubtotal)}</span></div>
${discountLine}`;
  }

  const body = `
<div class="center">
  <div class="name">${escHtml(companyName || 'Restaurant')}</div>
  ${addrLine}${phoneLine}${gstinLine}${fssaiLine}
</div>
<div class="sep">********************************</div>
<div class="meta">
  <div>Table: <strong>${escHtml(tableLabel)}</strong></div>
  <div>Date: ${escHtml(dateStr)} &nbsp; Time: ${escHtml(timeStr)}</div>
  ${tokenLine}
</div>
<div class="sep">--------------------------------</div>
<table>
  <thead>
    <tr>
      <th>Item</th>
      <th class="qty">Qty</th>
      <th class="num">Rate</th>
      <th class="num">Amt</th>
    </tr>
  </thead>
  <tbody>${itemBlocks}</tbody>
</table>
<div class="sep">--------------------------------</div>
${taxBlock}
<div class="sep">================================</div>
<div class="grand"><span>GRAND TOTAL</span><span>Rs. ${fmtAmt(totals.grand)}</span></div>
<div class="sep">================================</div>
<div class="footer">Thank you! Visit again</div>`;

  return thermalDoc(`Bill — ${tableLabel}`, body);
}

export type KotTicket = {
  id: string;
  name: string;
  qty: number;
  notes: string;
  kitchen_status: string;
  table_name: string;
  label?: string;
  order_type?: string;
  waiter_name: string | null;
  fired_at: string | null;
  modifiers: Array<{ name: string }>;
};

/** Kitchen KOT — same thermal class, no prices. */
export function generateKotHtml(ticket: KotTicket, companyName: string): string {
  const place = (ticket.label || ticket.table_name || '—').trim();
  const isParcel = ticket.order_type === 'parcel';
  const placeLine = isParcel ? `Parcel: ${place}` : `Table: ${place}`;
  const when = ticket.fired_at
    ? new Date(ticket.fired_at).toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  const mods =
    ticket.modifiers?.length > 0
      ? ticket.modifiers.map(m => `<div class="mod">  - ${escHtml(m.name)}</div>`).join('')
      : '';
  const notes = ticket.notes?.trim() ? `<div class="mod">Note: ${escHtml(ticket.notes.trim())}</div>` : '';
  const waiter = ticket.waiter_name?.trim() ? `<div>Waiter: ${escHtml(ticket.waiter_name.trim())}</div>` : '';
  const company = companyName.trim()
    ? `<div class="center"><div class="name">${escHtml(companyName.trim())}</div></div>
<div class="sep">********************************</div>`
    : `<div class="center"><div class="name">KOT</div></div>
<div class="sep">********************************</div>`;

  const body = `
${company}
<div class="center" style="font-size:13px;font-weight:700;margin-bottom:4px">*** KOT ***</div>
<div class="meta">
  <div><strong>${escHtml(placeLine)}</strong></div>
  <div>Time: ${escHtml(when)}</div>
  ${waiter}
</div>
<div class="sep">--------------------------------</div>
<div class="kot-item">${ticket.qty} x ${escHtml(ticket.name)}</div>
${mods}${notes}
<div class="sep">--------------------------------</div>
<div class="kot-status">Status: ${escHtml(ticket.kitchen_status || '')}</div>
<div class="footer">— kitchen —</div>`;

  return thermalDoc(`KOT — ${place}`, body);
}
