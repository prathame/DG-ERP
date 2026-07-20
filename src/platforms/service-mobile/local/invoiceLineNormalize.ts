/**
 * Offline invoices created by older quote/order convert paths stored quote-shaped
 * lines (`productName`/`quantity`/`lineNet`) instead of invoice shape
 * (`description`/`qty`/`taxable`). Normalize for UI + one-time row repair.
 */

export type NormalizedInvoiceLine = {
  description: string;
  productId?: string;
  qty: number;
  rate: number;
  discountPercent: number;
  gstPercent: number;
  taxable: number;
  tax: number;
  total: number;
  hsnSac?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** True when a line looks like quote/order shape and lacks invoice display fields. */
export function isQuoteShapedInvoiceLine(raw: unknown): boolean {
  const it = asRecord(raw);
  if (!it) return false;
  const hasInvoiceShape =
    (typeof it.description === 'string' && it.description.trim() !== '') ||
    (it.qty != null && Number.isFinite(Number(it.qty)));
  const hasQuoteShape =
    (typeof it.productName === 'string' && it.productName.trim() !== '') ||
    (it.quantity != null && (it.lineNet != null || it.unitPrice != null || it.price != null));
  return hasQuoteShape && !hasInvoiceShape;
}

export function needsInvoiceLineRemap(items: unknown[]): boolean {
  return items.some(isQuoteShapedInvoiceLine);
}

/** Map one line to the shape InvoicesView / print read (`description`/`qty`/…). */
export function normalizeInvoiceLine(raw: unknown): NormalizedInvoiceLine {
  const it = asRecord(raw) || {};
  const description = String(it.description ?? it.productName ?? '').trim();
  const qty = Math.max(1, Number(it.qty ?? it.quantity) || 1);
  const rate = Number(it.rate ?? it.unitPrice ?? it.price) || 0;
  const discountPercent = Math.max(0, Math.min(100, Number(it.discountPercent) || 0));
  let taxable = Number(it.taxable ?? it.lineNet);
  if (!Number.isFinite(taxable)) {
    taxable = Math.round(((qty * rate * (100 - discountPercent)) / 100) * 100) / 100;
  }
  let tax = Number(it.tax ?? it.lineGst);
  if (!Number.isFinite(tax)) tax = 0;
  let total = Number(it.total ?? it.lineTotal);
  if (!Number.isFinite(total)) total = Math.round((taxable + tax) * 100) / 100;
  let gstPercent = Number(it.gstPercent);
  if (!Number.isFinite(gstPercent) || gstPercent < 0) {
    gstPercent = taxable > 0 && tax > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0;
  }
  const productId = typeof it.productId === 'string' && it.productId.trim() ? it.productId.trim() : undefined;
  const hsnSac = typeof it.hsnSac === 'string' && it.hsnSac.trim() ? it.hsnSac.trim() : undefined;
  return {
    description,
    ...(productId ? { productId } : {}),
    qty,
    rate,
    discountPercent,
    gstPercent,
    taxable: Math.round(taxable * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
    ...(hsnSac ? { hsnSac } : {}),
  };
}

export function normalizeInvoiceLineItems(value: unknown): NormalizedInvoiceLine[] {
  const arr = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return arr.map(normalizeInvoiceLine);
}
