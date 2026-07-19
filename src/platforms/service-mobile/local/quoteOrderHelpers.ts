/** Shared quote/order line building + row mappers for Offline Mobile local API. */
import { localQuery } from './db';

export type LineItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  discountPercent: number;
  withGst: boolean;
  lineNet: number;
  lineGst: number;
  lineTotal: number;
  convertedQty?: number;
};

export type LineInput = {
  /** Empty/omitted = custom free-text line (productName/description required). */
  productId?: string;
  description?: string;
  productName?: string;
  quantity?: number;
  customPrice?: unknown;
  discountPercent?: number;
  withGst?: boolean;
};

function parseItems(value: unknown): LineItem[] {
  if (Array.isArray(value)) return value as LineItem[];
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as LineItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function buildLineItems(
  tenantId: string,
  items: LineInput[],
  rate: number,
): Promise<{ resolvedItems: LineItem[]; subtotal: number; gstAmount: number; total: number } | { error: string }> {
  if (!items?.length) return { error: 'Add at least one item' };
  let subtotal = 0;
  let gstAmount = 0;
  const resolvedItems: LineItem[] = [];
  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
    const withGst = item.withGst !== false;
    const productId = item.productId?.trim() || '';

    let unit: number;
    let productName: string;
    let resolvedProductId: string;

    if (!productId) {
      const customName = String(item.description || item.productName || '').trim();
      if (!customName) return { error: 'Custom line needs a description' };
      if (item.customPrice == null || item.customPrice === '') {
        return { error: `Rate required for custom line: ${customName}` };
      }
      unit = Number(item.customPrice);
      if (!(unit > 0)) return { error: `Rate required for custom line: ${customName}` };
      productName = customName;
      resolvedProductId = '';
    } else {
      const { rows } = await localQuery(`SELECT id, name, price FROM products WHERE id=$1 AND tenant_id=$2`, [
        productId,
        tenantId,
      ]);
      const product = rows[0] as { id: string; name: string; price: number } | undefined;
      if (!product) return { error: `Product not found: ${productId}` };
      unit = item.customPrice != null && item.customPrice !== '' ? Number(item.customPrice) : Number(product.price);
      productName = product.name;
      resolvedProductId = product.id;
    }

    const gross = unit * qty;
    const lineNet = Math.round(gross * (1 - discountPercent / 100) * 100) / 100;
    const lineGst = withGst ? Math.round(((lineNet * rate) / 100) * 100) / 100 : 0;
    const lineTotal = Math.round((lineNet + lineGst) * 100) / 100;
    subtotal += lineNet;
    gstAmount += lineGst;
    resolvedItems.push({
      productId: resolvedProductId,
      productName,
      quantity: qty,
      price: unit,
      discountPercent,
      withGst,
      lineNet,
      lineGst,
      lineTotal,
      convertedQty: 0,
    });
  }
  subtotal = Math.round(subtotal * 100) / 100;
  gstAmount = Math.round(gstAmount * 100) / 100;
  return { resolvedItems, subtotal, gstAmount, total: Math.round((subtotal + gstAmount) * 100) / 100 };
}

export function mapQuoteRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    quotationNumber: r.quotation_number ?? r.quote_number,
    vendorId: r.vendor_id ?? null,
    vendorName: r.vendor_name ?? null,
    customerName: r.customer_name ?? r.client_name ?? null,
    customerPhone: r.customer_phone ?? null,
    customerEmail: r.customer_email ?? null,
    quotationDate: r.quotation_date ?? (r.created_at ? String(r.created_at).slice(0, 10) : null),
    validUntil: r.valid_until ?? null,
    status: r.status || 'Draft',
    items: parseItems(r.items),
    subtotal: Number(r.subtotal) || 0,
    gstRate: Number(r.gst_rate) || 18,
    gstAmount: Number(r.gst_amount) || 0,
    total: Number(r.total) || 0,
    notes: r.notes ?? null,
    convertedBatchId: r.converted_batch_id ?? null,
    convertedInvoiceId: r.converted_invoice_id ?? null,
  };
}

export function mapOrderRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    orderNumber: r.order_number,
    vendorId: r.vendor_id ?? null,
    vendorName: r.vendor_name ?? null,
    customerName: r.customer_name ?? r.client_name ?? null,
    customerPhone: r.customer_phone ?? null,
    customerGstNumber: r.customer_gst_number ?? null,
    orderDate: r.order_date ?? (r.created_at ? String(r.created_at).slice(0, 10) : null),
    requiredDate: r.required_date ?? null,
    status: r.status || 'Pending',
    items: parseItems(r.items),
    subtotal: Number(r.subtotal) || 0,
    gstRate: Number(r.gst_rate) || 18,
    gstAmount: Number(r.gst_amount) || 0,
    total: Number(r.total) || 0,
    notes: r.notes ?? null,
    fulfilledBatchId: r.fulfilled_batch_id ?? null,
  };
}

export async function nextDocNumber(table: 'quotations' | 'orders', tenantId: string, prefix: string): Promise<string> {
  const col = table === 'quotations' ? 'quotation_number' : 'order_number';
  const { rows } = await localQuery(`SELECT COUNT(*)::int AS c FROM ${table} WHERE tenant_id=$1 AND ${col} LIKE $2`, [
    tenantId,
    `${prefix}-%`,
  ]);
  const n = Number((rows[0] as { c: number }).c) + 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}
