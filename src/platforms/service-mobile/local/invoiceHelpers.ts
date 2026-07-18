/** Offline invoice line totals — mirrors cloud server/routes/invoices.ts create logic. */
import { localQuery } from './db';

export type InvoiceLineIn = {
  description?: string;
  hsnSac?: string;
  qty?: number;
  rate?: number;
  gstPercent?: number;
  discountPercent?: number;
  productId?: string;
};

export type InvoiceLineOut = {
  description: string;
  hsnSac?: string;
  qty: number;
  rate: number;
  gstPercent: number;
  discountPercent: number;
  productId?: string;
  taxable: number;
  tax: number;
  total: number;
};

function gstinStateCode(gstin: string | null | undefined): string | null {
  if (!gstin || typeof gstin !== 'string') return null;
  const g = gstin.trim().toUpperCase();
  if (g.length < 2) return null;
  return g.slice(0, 2);
}

export function isInterstateSupply(
  sellerGstin: string | null | undefined,
  buyerGstin: string | null | undefined,
): boolean {
  const from = gstinStateCode(sellerGstin);
  const to = gstinStateCode(buyerGstin);
  if (!from || !to) return false;
  return from !== to;
}

export function splitGstTax(
  taxTotal: number,
  interstate: boolean,
): { taxCgst: number; taxSgst: number; taxIgst: number } {
  const t = Math.round((taxTotal || 0) * 100) / 100;
  if (interstate) return { taxCgst: 0, taxSgst: 0, taxIgst: t };
  const half = Math.round((t / 2) * 100) / 100;
  return { taxCgst: half, taxSgst: Math.round((t - half) * 100) / 100, taxIgst: 0 };
}

/** Resolve unit price: vendor slab → generic slab → product.price */
export async function resolveLocalPrice(
  tenantId: string,
  productId: string,
  vendorId: string | null | undefined,
  quantity: number,
): Promise<{ price: number; source: 'price_list' | 'default' }> {
  const qty = quantity > 0 ? quantity : 1;
  const { rows: ruleRows } = await localQuery(
    `SELECT price FROM price_lists
     WHERE tenant_id = $1 AND product_id = $2 AND is_active = true
       AND (vendor_id = $3 OR vendor_id IS NULL)
       AND min_qty <= $4 AND (max_qty IS NULL OR max_qty >= $4)
       AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
       AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
     ORDER BY
       CASE WHEN vendor_id = $3 THEN 0 ELSE 1 END,
       min_qty DESC
     LIMIT 1`,
    [tenantId, productId, vendorId || null, qty],
  );
  const rule = ruleRows[0] as { price: number } | undefined;
  if (rule) return { price: Number(rule.price), source: 'price_list' };

  const { rows: prodRows } = await localQuery(`SELECT price FROM products WHERE id = $1 AND tenant_id = $2`, [
    productId,
    tenantId,
  ]);
  const product = prodRows[0] as { price: number } | undefined;
  return { price: Number(product?.price) || 0, source: 'default' };
}

export async function buildStandaloneInvoiceLines(
  tenantId: string,
  items: InvoiceLineIn[],
  priceVendorId: string | null,
): Promise<
  { lineItems: InvoiceLineOut[]; subtotal: number; taxTotal: number; grandTotal: number } | { error: string }
> {
  if (!Array.isArray(items) || !items.length) return { error: 'Add at least one line item' };

  const lineItems: InvoiceLineOut[] = [];
  for (const raw of items) {
    const qty = Number(raw.qty) || 1;
    let rate = Number(raw.rate) || 0;
    const productId = raw.productId || undefined;
    let priceIncludesGst = false;

    if (productId) {
      const { rows } = await localQuery(
        `SELECT price, COALESCE(price_includes_gst, false) AS price_includes_gst
         FROM products WHERE id = $1 AND tenant_id = $2`,
        [productId, tenantId],
      );
      const product = rows[0] as { price: number; price_includes_gst: boolean } | undefined;
      if (product) {
        priceIncludesGst = !!product.price_includes_gst;
        if (!raw.rate || rate <= 0) {
          const resolved = await resolveLocalPrice(tenantId, productId, priceVendorId, qty);
          rate = resolved.price;
        }
      }
    }

    const disc = Math.min(100, Math.max(0, Number(raw.discountPercent) || 0));
    const gstPercent = Number(raw.gstPercent) || 0;
    let taxable: number;
    let tax: number;
    let total: number;

    if (gstPercent > 0 && priceIncludesGst) {
      const priceAfterDisc = Math.round(((rate * (100 - disc)) / 100) * 100) / 100;
      const netPerUnit = Math.round((priceAfterDisc / (1 + gstPercent / 100)) * 100) / 100;
      taxable = Math.round(netPerUnit * qty * 100) / 100;
      total = Math.round(priceAfterDisc * qty * 100) / 100;
      tax = Math.round((total - taxable) * 100) / 100;
    } else {
      taxable = Math.round(((qty * rate * (100 - disc)) / 100) * 100) / 100;
      tax = Math.round(((taxable * gstPercent) / 100) * 100) / 100;
      total = taxable + tax;
    }

    lineItems.push({
      description: raw.description || '',
      hsnSac: raw.hsnSac,
      qty,
      rate,
      gstPercent,
      discountPercent: disc,
      productId,
      taxable,
      tax,
      total,
    });
  }

  const subtotal = Math.round(lineItems.reduce((s, it) => s + it.taxable, 0) * 100) / 100;
  const taxTotal = Math.round(lineItems.reduce((s, it) => s + it.tax, 0) * 100) / 100;
  const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
  return { lineItems, subtotal, taxTotal, grandTotal };
}

export async function resolveSellerGstin(tenantId: string): Promise<string | null> {
  const { rows: bsRows } = await localQuery(`SELECT settings FROM bill_settings WHERE tenant_id = $1`, [tenantId]);
  const settings = (bsRows[0] as { settings?: unknown } | undefined)?.settings;
  const parsed =
    typeof settings === 'string'
      ? (() => {
          try {
            return JSON.parse(settings) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : settings && typeof settings === 'object'
        ? (settings as Record<string, unknown>)
        : {};
  const fromBill = (parsed.gstin || parsed.gstNumber || parsed.gst_api_gstin) as string | undefined;
  if (fromBill) return String(fromBill);

  const { rows: uRows } = await localQuery(
    `SELECT gst_number FROM users WHERE tenant_id = $1 AND gst_number IS NOT NULL AND gst_number != '' LIMIT 1`,
    [tenantId],
  );
  return ((uRows[0] as { gst_number?: string } | undefined)?.gst_number as string) || null;
}
