import { pool, setTenantContext } from '../pg-db';
import { uid, logAudit, phoneValidationError } from '../utils/helpers';
import { resolvePrice, unitPricesAfterDiscount } from '../utils/price-resolve';
import { isInterstateSupply, splitGstTax } from '../utils/gst-place';
import { postStandaloneInvoiceToBooks } from './opsToBooks';
import { withBooks } from '../utils/booksStrict';
import { checkPlanLimit } from '../utils/planLimits';
import { addCalendarDaysIso } from '../utils/partyCreditTerms';
import { DEFAULT_BILL_UNIT, normalizeLineUnit, parseBillQty } from '../../shared/billUnits';
import { calendarDateIST } from '../../shared/dateOnly';
import { assertBooksDatesUnlocked } from './bookPeriodLock';

type Queryable = { query: typeof pool.query };

export function invoiceFy(now = new Date()): string {
  return now.getMonth() >= 3
    ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`
    : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
}

/** Next INV/FY/#### under a tenant advisory lock (safe under concurrency). */
export async function allocateNextInvoiceNumber(client: Queryable, tenantId: string): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':standalone_invoice_seq'))`, [tenantId]);
  const fy = invoiceFy();
  const prefix = `INV/${fy}/`;
  const { rows } = await client.query(
    `SELECT invoice_number FROM standalone_invoices
     WHERE tenant_id = $1 AND invoice_number LIKE $2
     ORDER BY invoice_number DESC
     LIMIT 1`,
    [tenantId, `${prefix}%`],
  );
  const last = String(rows[0]?.invoice_number || '');
  const m = last.match(/\/(\d+)$/);
  const next = (m ? Number(m[1]) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function isoDateOnly(value: unknown): string {
  return calendarDateIST(value);
}

export function mapStandaloneInvoice(r: Record<string, unknown>) {
  let items = r.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  return {
    id: r.id as string,
    invoiceNumber: r.invoice_number as string,
    customerName: r.customer_name as string,
    customerGstin: (r.customer_gstin as string) || null,
    customerAddress: (r.customer_address as string) || null,
    customerPhone: (r.customer_phone as string) || null,
    partyType: (r.party_type as string) || null,
    partyId: (r.party_id as string) || null,
    items,
    subtotal: Number(r.subtotal),
    taxTotal: Number(r.tax_total),
    taxCgst: Number(r.tax_cgst) || 0,
    taxSgst: Number(r.tax_sgst) || 0,
    taxIgst: Number(r.tax_igst) || 0,
    isInterstate: !!r.is_interstate,
    gstEnabled: r.gst_enabled == null ? Number(r.tax_total) > 0 : !!r.gst_enabled,
    grandTotal: Number(r.grand_total),
    notes: r.notes,
    terms: r.terms,
    status: r.status as string,
    invoiceDate: isoDateOnly(r.invoice_date),
    dueDate: r.due_date ? isoDateOnly(r.due_date) : null,
    createdAt: r.created_at,
    paidAmount: Number(r.paid_amount) || 0,
    irn: (r.irn as string) || null,
    irnAckNo: (r.irn_ack_no as string) || null,
    irnAckDt: (r.irn_ack_dt as string) || null,
    irnQr: (r.irn_qr as string) || null,
    ewbNumber: (r.ewb_number as string) || null,
  };
}

export type StandaloneInvoiceDto = ReturnType<typeof mapStandaloneInvoice>;

export type InvoiceLineIn = {
  description?: string;
  hsnSac?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  gstPercent?: number;
  discountPercent?: number;
  productId?: string;
};

export type BuiltInvoiceLines = {
  lineItems: Array<{
    description: string;
    hsnSac?: string;
    qty: number;
    unit: string;
    rate: number;
    gstPercent: number;
    discountPercent: number;
    productId?: string;
    taxable: number;
    tax: number;
    total: number;
  }>;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
};

export async function buildInvoiceLineItems(
  tenantId: string,
  items: InvoiceLineIn[],
  gstEnabled: boolean,
  priceVendorId: string | null,
  opts?: { authoritative?: boolean },
): Promise<BuiltInvoiceLines | { error: string }> {
  if (!Array.isArray(items) || !items.length) return { error: 'Add at least one line item' };
  const authoritative = !!opts?.authoritative;
  const lineItems: BuiltInvoiceLines['lineItems'] = [];
  for (const raw of items) {
    const qty = parseBillQty(raw.qty, 1);
    const unit = normalizeLineUnit(raw.unit, DEFAULT_BILL_UNIT);
    let rate = Number(raw.rate) || 0;
    if (!Number.isFinite(rate) || rate < 0) {
      return { error: 'Line rate cannot be negative' };
    }
    const productId = raw.productId || undefined;
    if (authoritative && !productId) return { error: 'Product is required' };
    let priceIncludesGst = false;
    let description = raw.description || '';
    let hsnSac = raw.hsnSac;
    let gstPercent = gstEnabled ? Number(raw.gstPercent) || 0 : 0;
    if (productId) {
      const product = (
        await pool.query(
          `SELECT name, price, price_includes_gst, hsn_code, COALESCE(gst_rate, 0) AS gst_rate
           FROM products WHERE id = $1 AND tenant_id = $2`,
          [productId, tenantId],
        )
      ).rows[0] as
        | {
            name: string;
            price: number;
            price_includes_gst: boolean;
            hsn_code: string | null;
            gst_rate: number;
          }
        | undefined;
      if (!product) {
        if (authoritative) return { error: 'Product not found' };
      } else {
        priceIncludesGst = !!product.price_includes_gst && gstEnabled;
        if (authoritative || !raw.rate || rate <= 0) {
          const resolved = await resolvePrice(tenantId, productId, priceVendorId, qty);
          rate = resolved.price;
        }
        if (authoritative) {
          description = product.name;
          hsnSac = product.hsn_code || undefined;
          gstPercent = gstEnabled ? Number(product.gst_rate) || 0 : 0;
        }
      }
    }
    const disc = authoritative ? 0 : Math.min(100, Math.max(0, Number(raw.discountPercent) || 0));
    let taxable: number;
    let tax: number;
    let total: number;
    if (gstPercent > 0 && priceIncludesGst) {
      const { netPricePerUnit, billedPricePerUnit } = unitPricesAfterDiscount({
        basePrice: rate,
        discountPercent: disc,
        withGst: true,
        priceIncludesGst: true,
        gstRate: gstPercent,
      });
      taxable = Math.round(netPricePerUnit * qty * 100) / 100;
      total = Math.round(billedPricePerUnit * qty * 100) / 100;
      tax = Math.round((total - taxable) * 100) / 100;
    } else {
      taxable = Math.round(((qty * rate * (100 - disc)) / 100) * 100) / 100;
      tax = Math.round(((taxable * gstPercent) / 100) * 100) / 100;
      total = taxable + tax;
    }
    lineItems.push({
      description,
      hsnSac,
      qty,
      unit,
      rate,
      gstPercent,
      discountPercent: disc,
      productId,
      taxable,
      tax,
      total,
    });
  }
  const subtotal = lineItems.reduce((s, it) => s + it.taxable, 0);
  const taxTotal = lineItems.reduce((s, it) => s + it.tax, 0);
  return { lineItems, subtotal, taxTotal, grandTotal: subtotal + taxTotal };
}

export type CreateStandaloneInvoiceInput = {
  invoiceNumber?: string;
  customerName: string;
  customerGstin?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  partyType?: string | null;
  partyId?: string | null;
  items: InvoiceLineIn[];
  notes?: string | null;
  terms?: string | null;
  invoiceDate?: string;
  dueDate?: string | null;
  status?: string;
  gstEnabled?: boolean | null;
  idempotencyKey?: string | null;
  /** AI confirm: never auto-create a vendor/customer. */
  requireExistingParty?: boolean;
  /** AI confirm: ignore caller rate/GST/description/HSN; load from product master. */
  authoritativeLines?: boolean;
  auditUserId?: string;
  auditUserName?: string;
};

export type CreateStandaloneInvoiceResult =
  { ok: true; invoice: StandaloneInvoiceDto; created: boolean } | { ok: false; status: number; error: string };

async function loadInvoiceById(tenantId: string, id: string): Promise<StandaloneInvoiceDto | null> {
  const { rows } = await pool.query(
    `SELECT si.*, COALESCE(SUM(ip.amount), 0) AS paid_amount
     FROM standalone_invoices si
     LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $2
     WHERE si.id = $1 AND si.tenant_id = $2
     GROUP BY si.id`,
    [id, tenantId],
  );
  if (!rows[0]) return null;
  return mapStandaloneInvoice(rows[0] as Record<string, unknown>);
}

async function loadInvoiceByIdempotency(
  tenantId: string,
  idempotencyKey: string,
): Promise<StandaloneInvoiceDto | null> {
  const { rows } = await pool.query(
    `SELECT si.*, COALESCE(SUM(ip.amount), 0) AS paid_amount
     FROM standalone_invoices si
     LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $1
     WHERE si.tenant_id = $1 AND si.idempotency_key = $2
     GROUP BY si.id`,
    [tenantId, idempotencyKey],
  );
  if (!rows[0]) return null;
  return mapStandaloneInvoice(rows[0] as Record<string, unknown>);
}

/** Same domain path as POST /api/invoices. Callers must already authorize the user. */
export async function createStandaloneInvoice(
  tenantId: string,
  input: CreateStandaloneInvoiceInput,
): Promise<CreateStandaloneInvoiceResult> {
  const customerName = String(input.customerName || '').trim();
  if (!customerName) return { ok: false, status: 400, error: 'Customer name is required' };
  if (!Array.isArray(input.items) || !input.items.length) {
    return { ok: false, status: 400, error: 'Add at least one line item' };
  }
  const createPhoneErr = phoneValidationError(typeof input.customerPhone === 'string' ? input.customerPhone : null);
  if (createPhoneErr) return { ok: false, status: 400, error: createPhoneErr };

  const idempotencyKey =
    typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim().slice(0, 128)
      : null;
  if (idempotencyKey) {
    const existing = await loadInvoiceByIdempotency(tenantId, idempotencyKey);
    if (existing) return { ok: true, invoice: existing, created: false };
  }

  let resolvedPartyType: string | null = null;
  let resolvedPartyId: string | null = null;
  if (input.partyType != null || input.partyId != null) {
    if (input.partyType !== 'vendor' && input.partyType !== 'customer') {
      return { ok: false, status: 400, error: 'partyType must be vendor or customer' };
    }
    if (!input.partyId || typeof input.partyId !== 'string') {
      return { ok: false, status: 400, error: 'partyId is required when partyType is set' };
    }
    if (input.partyType === 'vendor') {
      const v = (await pool.query('SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2', [input.partyId, tenantId]))
        .rows[0];
      if (!v) return { ok: false, status: 400, error: 'Vendor not found' };
    } else {
      const c = (
        await pool.query('SELECT id FROM customers WHERE id = $1 AND tenant_id = $2', [input.partyId, tenantId])
      ).rows[0];
      if (!c) return { ok: false, status: 400, error: 'Customer not found' };
    }
    resolvedPartyType = input.partyType;
    resolvedPartyId = input.partyId;
  }

  if (resolvedPartyId == null) {
    if (input.requireExistingParty) {
      return { ok: false, status: 400, error: 'Customer must already exist. Do not invent a new party.' };
    }
    const existing = (
      await pool.query(`SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
        tenantId,
        customerName,
      ])
    ).rows[0] as { id: string } | undefined;
    if (existing) {
      resolvedPartyType = 'vendor';
      resolvedPartyId = existing.id;
    } else {
      const vendorLimitErr = await checkPlanLimit(tenantId, 'vendors');
      if (vendorLimitErr) return { ok: false, status: 403, error: String(vendorLimitErr.error || 'Plan limit') };
      const newId = uid('V');
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name, phone, address, gst_number)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newId,
          tenantId,
          customerName,
          typeof input.customerPhone === 'string' && input.customerPhone.trim() ? input.customerPhone.trim() : null,
          typeof input.customerAddress === 'string' && input.customerAddress.trim()
            ? input.customerAddress.trim()
            : null,
          typeof input.customerGstin === 'string' && input.customerGstin.trim() ? input.customerGstin.trim() : null,
        ],
      );
      resolvedPartyType = 'vendor';
      resolvedPartyId = newId;
    }
  }

  let createStatus = 'draft';
  if (input.status === 'sent' || input.status === 'unpaid') createStatus = 'sent';
  else if (input.status === 'draft' || input.status == null || input.status === undefined) createStatus = 'draft';
  else if (input.status) {
    return {
      ok: false,
      status: 400,
      error: 'New invoices can only be draft or sent. Mark paid after recording payment.',
    };
  }

  let gstEnabled = typeof input.gstEnabled === 'boolean' ? !!input.gstEnabled : null;
  if (gstEnabled == null) {
    const bsRow = (await pool.query('SELECT show_hsn_sac FROM bill_settings WHERE tenant_id = $1', [tenantId]))
      .rows[0] as { show_hsn_sac?: boolean } | undefined;
    gstEnabled = bsRow ? bsRow.show_hsn_sac !== false : true;
  }
  const priceVendorId = resolvedPartyType === 'vendor' ? resolvedPartyId : null;
  const built = await buildInvoiceLineItems(tenantId, input.items, gstEnabled, priceVendorId, {
    authoritative: !!input.authoritativeLines,
  });
  if ('error' in built) return { ok: false, status: 400, error: built.error };
  const { lineItems, subtotal, taxTotal, grandTotal } = built;

  let sellerGstin: string | null = null;
  const bs = (await pool.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId])).rows[0] as
    { gst_api_gstin?: string } | undefined;
  if (bs?.gst_api_gstin) sellerGstin = bs.gst_api_gstin;
  else {
    const t = (await pool.query('SELECT gst_number FROM tenants WHERE id = $1', [tenantId])).rows[0] as
      { gst_number?: string } | undefined;
    sellerGstin = t?.gst_number || null;
  }
  const interstate = isInterstateSupply(sellerGstin, input.customerGstin || null);
  const { taxCgst, taxSgst, taxIgst } = splitGstTax(taxTotal, interstate);

  const invDate =
    typeof input.invoiceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input.invoiceDate)
      ? input.invoiceDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  await assertBooksDatesUnlocked(pool, tenantId, [invDate]);
  let resolvedDueDate: string | null =
    typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input.dueDate) ? input.dueDate.slice(0, 10) : null;
  if (!resolvedDueDate && resolvedPartyType && resolvedPartyId) {
    const table = resolvedPartyType === 'vendor' ? 'vendors' : 'customers';
    const partyRow = (
      await pool.query(`SELECT credit_period_days FROM ${table} WHERE id = $1 AND tenant_id = $2`, [
        resolvedPartyId,
        tenantId,
      ])
    ).rows[0] as { credit_period_days?: number | null } | undefined;
    const days = Number(partyRow?.credit_period_days);
    if (Number.isFinite(days) && days > 0) {
      resolvedDueDate = addCalendarDaysIso(invDate, days);
    }
  }

  const id = uid('INV');
  const client = await pool.connect();
  let finalNumber: string;
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);
    finalNumber =
      typeof input.invoiceNumber === 'string' && input.invoiceNumber.trim()
        ? input.invoiceNumber.trim()
        : await allocateNextInvoiceNumber(client, tenantId);
    try {
      await client.query(
        `INSERT INTO standalone_invoices (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone, party_type, party_id, items, subtotal, tax_total, grand_total, notes, terms, status, invoice_date, due_date, tax_cgst, tax_sgst, tax_igst, is_interstate, gst_enabled, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [
          id,
          tenantId,
          finalNumber,
          customerName,
          input.customerGstin || null,
          input.customerAddress || null,
          input.customerPhone || null,
          resolvedPartyType,
          resolvedPartyId,
          JSON.stringify(lineItems),
          subtotal,
          taxTotal,
          grandTotal,
          input.notes || null,
          input.terms || null,
          createStatus,
          invDate,
          resolvedDueDate,
          taxCgst,
          taxSgst,
          taxIgst,
          interstate,
          gstEnabled,
          idempotencyKey,
        ],
      );
    } catch (insErr) {
      const code = (insErr as { code?: string }).code;
      if (code === '23505') {
        await client.query('ROLLBACK');
        if (idempotencyKey) {
          const replay = await loadInvoiceByIdempotency(tenantId, idempotencyKey);
          if (replay) return { ok: true, invoice: replay, created: false };
        }
        return { ok: false, status: 409, error: 'Invoice number already exists. Refresh and try again.' };
      }
      throw insErr;
    }
    await withBooks(
      () =>
        postStandaloneInvoiceToBooks(client, tenantId, {
          id,
          invoiceNumber: finalNumber,
          customerName,
          partyId: resolvedPartyId,
          grandTotal,
          subtotal,
          taxCgst,
          taxSgst,
          taxIgst,
          invoiceDate: invDate,
          notes: input.notes || null,
        }),
      'invoice-create',
    );
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
  await logAudit(
    pool,
    tenantId,
    'Invoice Created',
    'invoice',
    id,
    `${finalNumber} — ${customerName} — ₹${grandTotal}`,
    input.auditUserId,
    input.auditUserName,
  );
  const created = await loadInvoiceById(tenantId, id);
  if (!created) return { ok: false, status: 500, error: 'Invoice created but could not be loaded' };
  return { ok: true, invoice: created, created: true };
}
