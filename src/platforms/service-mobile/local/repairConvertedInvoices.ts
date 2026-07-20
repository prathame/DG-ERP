/**
 * Idempotent Offline repair for invoices created by older quote/order convert:
 * - Remap quote-shaped line JSON → invoice shape (description/qty/taxable)
 * - Backfill party_type/party_id/client_id from linked quote/order or name match
 *
 * No hardcoded invoice numbers, client names, or entity IDs.
 */
import { localQuery } from './db';
import { needsInvoiceLineRemap, normalizeInvoiceLineItems } from './invoiceLineNormalize';

function parseItemsJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function linesFromQuoteItems(quoteItems: unknown, gstRate: number): ReturnType<typeof normalizeInvoiceLineItems> {
  const raw = parseItemsJson(quoteItems);
  // Quote rows use productName/quantity/lineNet — same remap path as legacy invoice JSON.
  return normalizeInvoiceLineItems(
    raw.map(it => {
      const row = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
      const withGst = row.withGst !== false;
      const lineNet = Number(row.lineNet) || 0;
      const lineGst = withGst ? Number(row.lineGst) || 0 : 0;
      return {
        productName: row.productName,
        productId: row.productId,
        quantity: row.quantity,
        unitPrice: row.price ?? row.unitPrice,
        discountPercent: row.discountPercent,
        lineNet,
        lineGst,
        lineTotal: Number(row.lineTotal) || lineNet + lineGst,
        gstPercent: withGst ? gstRate : 0,
      };
    }),
  );
}

async function remapQuoteShapedLines(): Promise<number> {
  const { rows } = await localQuery<{
    id: string;
    items: unknown;
    quote_items: unknown | null;
    quote_gst: number | null;
    order_items: unknown | null;
    order_gst: number | null;
  }>(
    `SELECT si.id, si.items,
            q.items AS quote_items, q.gst_rate AS quote_gst,
            o.items AS order_items, o.gst_rate AS order_gst
     FROM standalone_invoices si
     LEFT JOIN quotations q ON q.converted_invoice_id = si.id
     LEFT JOIN orders o ON o.fulfilled_batch_id = si.id`,
  );
  let updated = 0;
  for (const row of rows) {
    const raw = parseItemsJson(row.items);
    const needsRemap = !raw.length || needsInvoiceLineRemap(raw);
    if (!needsRemap) continue;

    let normalized = raw.length ? normalizeInvoiceLineItems(raw) : [];
    if (!normalized.length || normalized.every(l => !l.description)) {
      if (row.quote_items != null) {
        normalized = linesFromQuoteItems(row.quote_items, Number(row.quote_gst) || 18);
      } else if (row.order_items != null) {
        normalized = linesFromQuoteItems(row.order_items, Number(row.order_gst) || 18);
      }
    }
    if (!normalized.length) continue;

    await localQuery(`UPDATE standalone_invoices SET items=$1 WHERE id=$2`, [JSON.stringify(normalized), row.id]);
    updated += 1;
  }
  return updated;
}

/** Party from quotation.converted_invoice_id → vendor_id */
async function backfillPartyFromQuotations(): Promise<number> {
  const { rows } = await localQuery<{ id: string }>(
    `UPDATE standalone_invoices AS si
     SET party_type = 'vendor',
         party_id = q.vendor_id,
         client_id = COALESCE(si.client_id, q.vendor_id),
         customer_phone = COALESCE(si.customer_phone, q.customer_phone),
         customer_name = COALESCE(NULLIF(si.customer_name,''), q.customer_name, q.vendor_name, si.client_name),
         client_name = COALESCE(NULLIF(si.client_name,''), q.customer_name, q.vendor_name, si.customer_name)
     FROM quotations q
     WHERE q.converted_invoice_id = si.id
       AND q.vendor_id IS NOT NULL
       AND TRIM(q.vendor_id) != ''
       AND (si.party_id IS NULL OR TRIM(si.party_id) = '')
     RETURNING si.id`,
  );
  return rows.length;
}

/** Party from order fulfill link (fulfilled_batch_id stores invoice id). */
async function backfillPartyFromOrders(): Promise<number> {
  const { rows } = await localQuery<{ id: string }>(
    `UPDATE standalone_invoices AS si
     SET party_type = 'vendor',
         party_id = o.vendor_id,
         client_id = COALESCE(si.client_id, o.vendor_id),
         customer_phone = COALESCE(si.customer_phone, o.customer_phone),
         customer_name = COALESCE(NULLIF(si.customer_name,''), o.customer_name, o.vendor_name, si.client_name),
         client_name = COALESCE(NULLIF(si.client_name,''), o.customer_name, o.vendor_name, si.customer_name)
     FROM orders o
     WHERE o.fulfilled_batch_id = si.id
       AND o.vendor_id IS NOT NULL
       AND TRIM(o.vendor_id) != ''
       AND (si.party_id IS NULL OR TRIM(si.party_id) = '')
     RETURNING si.id`,
  );
  return rows.length;
}

/** Fallback: exact Masters client name match when party still missing. */
async function backfillPartyByClientName(): Promise<number> {
  const { rows } = await localQuery<{ id: string }>(
    `UPDATE standalone_invoices AS si
     SET party_type = 'vendor',
         party_id = v.id,
         client_id = COALESCE(si.client_id, v.id),
         customer_phone = COALESCE(si.customer_phone, v.phone),
         customer_gstin = COALESCE(si.customer_gstin, v.gstin)
     FROM vendors v
     WHERE v.tenant_id = si.tenant_id
       AND (si.party_id IS NULL OR TRIM(si.party_id) = '')
       AND LOWER(TRIM(COALESCE(si.customer_name, si.client_name, ''))) = LOWER(TRIM(v.name))
       AND TRIM(COALESCE(si.customer_name, si.client_name, '')) != ''
     RETURNING si.id`,
  );
  return rows.length;
}

/** Also stamp buyer GSTIN from vendor when party is set but gstin empty. */
async function backfillGstinFromParty(): Promise<number> {
  const { rows } = await localQuery<{ id: string }>(
    `UPDATE standalone_invoices AS si
     SET customer_gstin = v.gstin,
         customer_phone = COALESCE(si.customer_phone, v.phone)
     FROM vendors v
     WHERE si.party_type = 'vendor'
       AND si.party_id = v.id
       AND v.tenant_id = si.tenant_id
       AND (si.customer_gstin IS NULL OR TRIM(si.customer_gstin) = '')
       AND v.gstin IS NOT NULL
       AND TRIM(v.gstin) != ''
     RETURNING si.id`,
  );
  return rows.length;
}

export type ConvertInvoiceRepairResult = {
  linesRemapped: number;
  partyFromQuotes: number;
  partyFromOrders: number;
  partyByName: number;
  gstinFilled: number;
};

export async function repairLegacyConvertedInvoices(): Promise<ConvertInvoiceRepairResult> {
  const linesRemapped = await remapQuoteShapedLines();
  const partyFromQuotes = await backfillPartyFromQuotations();
  const partyFromOrders = await backfillPartyFromOrders();
  const partyByName = await backfillPartyByClientName();
  const gstinFilled = await backfillGstinFromParty();
  const result = { linesRemapped, partyFromQuotes, partyFromOrders, partyByName, gstinFilled };
  const touched = linesRemapped + partyFromQuotes + partyFromOrders + partyByName + gstinFilled;
  if (touched > 0) {
    console.info('[service-mobile] repaired legacy converted invoices', result);
  }
  return result;
}
