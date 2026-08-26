import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest, vendorScopeId } from '../middleware/auth';
import { pool, setTenantContext } from '../pg-db';
import { uid, logAudit, phoneValidationError } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { resolvePrice, unitPricesAfterDiscount } from '../utils/price-resolve';
import { isInterstateSupply, splitGstTax } from '../utils/gst-place';
import { isEinvoiceApiMode } from '../../shared/gstEinvoiceMode';
import { postStandaloneInvoiceToBooks, replaceStandaloneInvoiceBooks } from '../services/opsToBooks';
import { invoiceEditBlockedReason } from '../../shared/invoiceEdit';
import { withBooks } from '../utils/booksStrict';
import { checkPlanLimit } from '../utils/planLimits';
import { logger } from '../utils/logger';
import { addCalendarDaysIso } from '../utils/partyCreditTerms';
import { DEFAULT_BILL_UNIT, normalizeLineUnit, parseBillQty } from '../../shared/billUnits';

const router = Router();

function invoiceFy(now = new Date()): string {
  return now.getMonth() >= 3
    ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`
    : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
}

/** Next INV/FY/#### under a tenant advisory lock (safe under concurrency). */
async function allocateNextInvoiceNumber(client: { query: typeof pool.query }, tenantId: string): Promise<string> {
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

function isoDateOnly(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/** Customer sales (distribution batches) shaped like standalone invoices for the Invoices list. */
function mapSaleBatchAsInvoice(
  r: Record<string, unknown>,
  paid: number,
): ReturnType<typeof mapStandaloneInvoice> & {
  source: 'sale';
  batchId: string;
  outstanding: number;
} {
  const batchId = String(r.batch_id || '');
  const billValue = Number(r.bill_value) || 0;
  const gstUnits = Number(r.gst_units) || 0;
  const nonGstUnits = Number(r.non_gst_units) || 0;
  const challanBase = `CH-${batchId.replace(/^D/, '').slice(0, 10)}`;
  const invoiceNumber = gstUnits > 0 ? `${challanBase}-GST` : nonGstUnits > 0 ? `${challanBase}-BOS` : challanBase;
  const outstanding = Math.max(0, Math.round((billValue - paid) * 100) / 100);
  return {
    id: `sale:${batchId}`,
    source: 'sale',
    batchId,
    invoiceNumber,
    customerName: String(r.vendor_name || ''),
    customerGstin: (r.vendor_gstin as string) || null,
    customerAddress: (r.vendor_address as string) || null,
    customerPhone: (r.vendor_phone as string) || null,
    partyType: 'vendor',
    partyId: (r.vendor_id as string) || null,
    items: [],
    subtotal: billValue,
    taxTotal: 0,
    taxCgst: 0,
    taxSgst: 0,
    taxIgst: 0,
    isInterstate: false,
    gstEnabled: gstUnits > 0,
    grandTotal: billValue,
    notes: null,
    terms: null,
    status: outstanding <= 0.001 ? 'paid' : 'sent',
    invoiceDate: isoDateOnly(r.distribution_date),
    dueDate: null,
    createdAt: r.distribution_date,
    paidAmount: paid,
    outstanding,
    irn: (r.irn as string) || null,
    irnAckNo: null,
    irnAckDt: null,
    irnQr: (r.irn_qr as string) || null,
    ewbNumber: (r.ewb_number as string) || null,
  };
}

function mapStandaloneInvoice(r: Record<string, unknown>) {
  let items = r.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    customerName: r.customer_name,
    customerGstin: r.customer_gstin,
    customerAddress: r.customer_address,
    customerPhone: r.customer_phone,
    partyType: (r.party_type as string) || null,
    partyId: (r.party_id as string) || null,
    items,
    subtotal: Number(r.subtotal),
    taxTotal: Number(r.tax_total),
    taxCgst: Number(r.tax_cgst) || 0,
    taxSgst: Number(r.tax_sgst) || 0,
    taxIgst: Number(r.tax_igst) || 0,
    isInterstate: !!r.is_interstate,
    // Frozen at create — null legacy rows fall back to tax_total > 0
    gstEnabled: r.gst_enabled == null ? Number(r.tax_total) > 0 : !!r.gst_enabled,
    grandTotal: Number(r.grand_total),
    notes: r.notes,
    terms: r.terms,
    status: r.status,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    createdAt: r.created_at,
    // Only present when the query joins invoice_payments (list/get below) — else 0.
    paidAmount: Number(r.paid_amount) || 0,
    irn: (r.irn as string) || null,
    irnAckNo: (r.irn_ack_no as string) || null,
    irnAckDt: (r.irn_ack_dt as string) || null,
    irnQr: (r.irn_qr as string) || null,
    ewbNumber: (r.ewb_number as string) || null,
  };
}

type InvoiceLineIn = {
  description?: string;
  hsnSac?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  gstPercent?: number;
  discountPercent?: number;
  productId?: string;
};

async function buildInvoiceLineItems(
  tenantId: string,
  items: InvoiceLineIn[],
  gstEnabled: boolean,
  priceVendorId: string | null,
): Promise<
  | {
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
    }
  | { error: string }
> {
  if (!Array.isArray(items) || !items.length) return { error: 'Add at least one line item' };
  const lineItems: Array<{
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
  }> = [];
  for (const raw of items) {
    const qty = parseBillQty(raw.qty, 1);
    const unit = normalizeLineUnit(raw.unit, DEFAULT_BILL_UNIT);
    let rate = Number(raw.rate) || 0;
    if (!Number.isFinite(rate) || rate < 0) {
      return { error: 'Line rate cannot be negative' };
    }
    const productId = raw.productId || undefined;
    let priceIncludesGst = false;
    if (productId) {
      const product = (
        await pool.query('SELECT price, price_includes_gst FROM products WHERE id = $1 AND tenant_id = $2', [
          productId,
          tenantId,
        ])
      ).rows[0] as { price: number; price_includes_gst: boolean } | undefined;
      if (product) {
        priceIncludesGst = !!product.price_includes_gst && gstEnabled;
        if (!raw.rate || rate <= 0) {
          const resolved = await resolvePrice(tenantId, productId, priceVendorId, qty);
          rate = resolved.price;
        }
      }
    }
    const disc = Math.min(100, Math.max(0, Number(raw.discountPercent) || 0));
    const gstPercent = gstEnabled ? Number(raw.gstPercent) || 0 : 0;
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
      description: raw.description || '',
      hsnSac: raw.hsnSac,
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

// List invoices
router.get('/api/invoices', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    // Vendors have no standalone-invoice access (sales module is hidden; block IDOR if called)
    if (vendorScopeId(req) || req.user?.role === 'Vendor') {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { parsePagination } = await import('../utils/pagination');
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    const customer = typeof req.query.customer === 'string' ? req.query.customer.trim() : '';
    const includeSales =
      req.query.includeSales === '1' || req.query.includeSales === 'true' || req.query.includeSales === 'yes';

    const invoiceParams: unknown[] = [tenantId];
    let invoiceWhere = '';
    if (from) {
      invoiceWhere += ` AND si.invoice_date >= $${invoiceParams.length + 1}`;
      invoiceParams.push(from);
    }
    if (to) {
      invoiceWhere += ` AND si.invoice_date <= $${invoiceParams.length + 1}`;
      invoiceParams.push(to);
    }
    if (customer) {
      invoiceWhere += ` AND si.customer_name ILIKE $${invoiceParams.length + 1}`;
      invoiceParams.push(`%${customer}%`);
    }
    // Soft-deleted invoices stay as status=cancelled for audit; never list them here.
    const invoiceSql = `SELECT si.*, COALESCE(SUM(ip.amount), 0) AS paid_amount
       FROM standalone_invoices si
       LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $1
       WHERE si.tenant_id = $1 AND si.status != 'cancelled'${invoiceWhere}
       GROUP BY si.id
       ORDER BY si.created_at DESC`;

    if (!includeSales) {
      const invoiceCount = Number(
        (
          await pool.query(
            `SELECT COUNT(*)::int AS c FROM standalone_invoices si
             WHERE si.tenant_id = $1 AND si.status != 'cancelled'${invoiceWhere}`,
            invoiceParams,
          )
        ).rows[0]?.c ?? 0,
      );
      const { rows } = await pool.query(
        `${invoiceSql} LIMIT $${invoiceParams.length + 1} OFFSET $${invoiceParams.length + 2}`,
        [...invoiceParams, limit, offset],
      );
      res.setHeader('X-Total-Count', String(invoiceCount));
      res.setHeader('X-Page', String(page));
      res.setHeader('X-Limit', String(limit));
      return res.json(rows.map((r: Record<string, unknown>) => mapStandaloneInvoice(r)));
    }

    const { rows: invoiceRows } = await pool.query(invoiceSql, invoiceParams);

    const saleParams: unknown[] = [tenantId];
    let saleWhere = '';
    if (from) {
      saleWhere += ` AND pd.distribution_date::date >= $${saleParams.length + 1}`;
      saleParams.push(from);
    }
    if (to) {
      saleWhere += ` AND pd.distribution_date::date <= $${saleParams.length + 1}`;
      saleParams.push(to);
    }
    if (customer) {
      saleWhere += ` AND v.name ILIKE $${saleParams.length + 1}`;
      saleParams.push(`%${customer}%`);
    }
    const saleRows = (
      await pool.query(
        `SELECT
           COALESCE(pd.batch_id, pd.id) as batch_id,
           pd.vendor_id,
           v.name as vendor_name,
           v.phone as vendor_phone,
           v.address as vendor_address,
           v.gst_number as vendor_gstin,
           MIN(pd.distribution_date)::date as distribution_date,
           SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) as bill_value,
           SUM(CASE WHEN COALESCE(pd.gst_applied, false) THEN 1 ELSE 0 END) as gst_units,
           SUM(CASE WHEN COALESCE(pd.gst_applied, false) THEN 0 ELSE 1 END) as non_gst_units,
           MAX(pd.ewb_number) as ewb_number,
           MAX(pd.irn) as irn,
           MAX(pd.irn_qr) as irn_qr
         FROM product_distribution pd
         JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
         JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
         WHERE pd.tenant_id = $1${saleWhere}
         GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id, v.name, v.phone, v.address, v.gst_number`,
        saleParams,
      )
    ).rows as Record<string, unknown>[];
    const batchIds = saleRows.map(r => String(r.batch_id));
    const paymentMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const payRows = (
        await pool.query(
          `SELECT batch_id, SUM(amount) as total_paid FROM vendor_payments WHERE batch_id = ANY($1) AND tenant_id = $2 GROUP BY batch_id`,
          [batchIds, tenantId],
        )
      ).rows as { batch_id: string; total_paid: string }[];
      for (const pr of payRows) paymentMap[pr.batch_id] = Number(pr.total_paid);
    }

    const merged = [
      ...invoiceRows.map((r: Record<string, unknown>) => mapStandaloneInvoice(r)),
      ...saleRows.map(r => mapSaleBatchAsInvoice(r, paymentMap[String(r.batch_id)] ?? 0)),
    ].sort((a, b) => {
      const da = isoDateOnly(a.invoiceDate);
      const db = isoDateOnly(b.invoiceDate);
      if (da !== db) return db.localeCompare(da);
      return String(b.id).localeCompare(String(a.id));
    });
    const total = merged.length;
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.json(merged.slice(offset, offset + limit));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Get next invoice number (preview — create still allocates under lock)
router.get('/api/invoices/next-number', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (vendorScopeId(req) || req.user?.role === 'Vendor') {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await setTenantContext(client, tenantId);
      const number = await allocateNextInvoiceNumber(client, tenantId);
      await client.query('ROLLBACK'); // preview only — do not consume the number
      res.json({ number });
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
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Single invoice (print/PDF from vendor hub / finance) — after /next-number
router.get('/api/invoices/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query(
      `SELECT si.*, COALESCE(SUM(ip.amount), 0) AS paid_amount
       FROM standalone_invoices si
       LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $2
       WHERE si.id = $1 AND si.tenant_id = $2
       GROUP BY si.id`,
      [req.params.id, tenantId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json(mapStandaloneInvoice(rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Create invoice
router.post('/api/invoices', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const {
      invoiceNumber,
      customerName,
      customerGstin,
      customerAddress,
      customerPhone,
      partyType,
      partyId,
      items,
      notes,
      terms,
      invoiceDate,
      dueDate,
      status,
    } = req.body;
    if (!customerName) return res.status(400).json({ error: 'Customer name is required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
    const createPhoneErr = phoneValidationError(typeof customerPhone === 'string' ? customerPhone : null);
    if (createPhoneErr) return res.status(400).json({ error: createPhoneErr });

    let resolvedPartyType: string | null = null;
    let resolvedPartyId: string | null = null;
    if (partyType != null || partyId != null) {
      if (partyType !== 'vendor' && partyType !== 'customer') {
        return res.status(400).json({ error: 'partyType must be vendor or customer' });
      }
      if (!partyId || typeof partyId !== 'string') {
        return res.status(400).json({ error: 'partyId is required when partyType is set' });
      }
      if (partyType === 'vendor') {
        const v = (await pool.query('SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2', [partyId, tenantId]))
          .rows[0];
        if (!v) return res.status(400).json({ error: 'Vendor not found' });
      } else {
        const c = (await pool.query('SELECT id FROM customers WHERE id = $1 AND tenant_id = $2', [partyId, tenantId]))
          .rows[0];
        if (!c) return res.status(400).json({ error: 'Customer not found' });
      }
      resolvedPartyType = partyType;
      resolvedPartyId = partyId;
    }

    // Typed party name with no partyId → find or create vendor (Clients list for service tenants)
    if (resolvedPartyId == null) {
      const partyName = String(customerName).trim();
      const existing = (
        await pool.query(`SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
          tenantId,
          partyName,
        ])
      ).rows[0] as { id: string } | undefined;
      if (existing) {
        resolvedPartyType = 'vendor';
        resolvedPartyId = existing.id;
      } else {
        const vendorLimitErr = await checkPlanLimit(tenantId, 'vendors');
        if (vendorLimitErr) return res.status(403).json(vendorLimitErr);
        const newId = uid('V');
        await pool.query(
          `INSERT INTO vendors (id, tenant_id, name, phone, address, gst_number)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newId,
            tenantId,
            partyName,
            typeof customerPhone === 'string' && customerPhone.trim() ? customerPhone.trim() : null,
            typeof customerAddress === 'string' && customerAddress.trim() ? customerAddress.trim() : null,
            typeof customerGstin === 'string' && customerGstin.trim() ? customerGstin.trim() : null,
          ],
        );
        resolvedPartyType = 'vendor';
        resolvedPartyId = newId;
      }
    }

    // paid/cancelled only via status update or invoice-finance — never on create
    let createStatus = 'draft';
    if (status === 'sent' || status === 'unpaid') createStatus = 'sent';
    else if (status === 'draft' || status == null || status === undefined) createStatus = 'draft';
    else if (status) {
      return res
        .status(400)
        .json({ error: 'New invoices can only be draft or sent. Mark paid after recording payment.' });
    }

    // Freeze GST mode on this invoice (settings may change later; print must not flip)
    let gstEnabled = typeof req.body.gstEnabled === 'boolean' ? !!req.body.gstEnabled : null;
    if (gstEnabled == null) {
      const bsRow = (await pool.query('SELECT show_hsn_sac FROM bill_settings WHERE tenant_id = $1', [tenantId]))
        .rows[0] as { show_hsn_sac?: boolean } | undefined;
      gstEnabled = bsRow ? bsRow.show_hsn_sac !== false : true;
    }
    const priceVendorId = resolvedPartyType === 'vendor' ? resolvedPartyId : null;
    const built = await buildInvoiceLineItems(tenantId, items as InvoiceLineIn[], gstEnabled, priceVendorId);
    if ('error' in built) return res.status(400).json({ error: built.error });
    const { lineItems, subtotal, taxTotal, grandTotal } = built;

    let sellerGstin: string | null = null;
    const bs = (await pool.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId]))
      .rows[0] as { gst_api_gstin?: string } | undefined;
    if (bs?.gst_api_gstin) sellerGstin = bs.gst_api_gstin;
    else {
      const t = (await pool.query('SELECT gst_number FROM tenants WHERE id = $1', [tenantId])).rows[0] as
        { gst_number?: string } | undefined;
      sellerGstin = t?.gst_number || null;
    }
    const interstate = isInterstateSupply(sellerGstin, customerGstin || null);
    const { taxCgst, taxSgst, taxIgst } = splitGstTax(taxTotal, interstate);

    const invDate =
      typeof invoiceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(invoiceDate)
        ? invoiceDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    let resolvedDueDate: string | null =
      typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.slice(0, 10) : null;
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
        typeof invoiceNumber === 'string' && invoiceNumber.trim()
          ? invoiceNumber.trim()
          : await allocateNextInvoiceNumber(client, tenantId);
      try {
        await client.query(
          `INSERT INTO standalone_invoices (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone, party_type, party_id, items, subtotal, tax_total, grand_total, notes, terms, status, invoice_date, due_date, tax_cgst, tax_sgst, tax_igst, is_interstate, gst_enabled)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            id,
            tenantId,
            finalNumber,
            customerName,
            customerGstin || null,
            customerAddress || null,
            customerPhone || null,
            resolvedPartyType,
            resolvedPartyId,
            JSON.stringify(lineItems),
            subtotal,
            taxTotal,
            grandTotal,
            notes || null,
            terms || null,
            createStatus,
            invDate,
            resolvedDueDate,
            taxCgst,
            taxSgst,
            taxIgst,
            interstate,
            gstEnabled,
          ],
        );
      } catch (insErr) {
        const code = (insErr as { code?: string }).code;
        if (code === '23505') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Invoice number already exists. Refresh and try again.' });
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
            notes: notes || null,
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
      `${invoiceNumber} — ${customerName} — ₹${grandTotal}`,
    );
    const { rows: created } = await pool.query('SELECT * FROM standalone_invoices WHERE id = $1 AND tenant_id = $2', [
      id,
      tenantId,
    ]);
    res.status(201).json(mapStandaloneInvoice(created[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Edit draft or unpaid sent invoice (blocked after payments, IRN, or E-Way). */
router.put('/api/invoices/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const invoiceId = req.params.id as string;
    const current = (
      await pool.query(
        `SELECT si.*, COALESCE(SUM(ip.amount), 0) AS paid_amount
         FROM standalone_invoices si
         LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $2
         WHERE si.id = $1 AND si.tenant_id = $2
         GROUP BY si.id`,
        [invoiceId, tenantId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (!current) return res.status(404).json({ error: 'Invoice not found' });
    const blocked = invoiceEditBlockedReason({
      status: String(current.status || ''),
      paidAmount: Number(current.paid_amount) || 0,
      irn: (current.irn as string) || null,
      ewbNumber: (current.ewb_number as string) || null,
    });
    if (blocked) return res.status(400).json({ error: blocked });

    const {
      customerName,
      customerGstin,
      customerAddress,
      customerPhone,
      partyType,
      partyId,
      items,
      notes,
      terms,
      invoiceDate,
      dueDate,
    } = req.body;
    if (!customerName) return res.status(400).json({ error: 'Customer name is required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
    const editPhoneErr = phoneValidationError(typeof customerPhone === 'string' ? customerPhone : null);
    if (editPhoneErr) return res.status(400).json({ error: editPhoneErr });

    let resolvedPartyType: string | null = null;
    let resolvedPartyId: string | null = null;
    if (partyType != null || partyId != null) {
      if (partyType !== 'vendor' && partyType !== 'customer') {
        return res.status(400).json({ error: 'partyType must be vendor or customer' });
      }
      if (!partyId || typeof partyId !== 'string') {
        return res.status(400).json({ error: 'partyId is required when partyType is set' });
      }
      if (partyType === 'vendor') {
        const v = (await pool.query('SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2', [partyId, tenantId]))
          .rows[0];
        if (!v) return res.status(400).json({ error: 'Vendor not found' });
      } else {
        const c = (await pool.query('SELECT id FROM customers WHERE id = $1 AND tenant_id = $2', [partyId, tenantId]))
          .rows[0];
        if (!c) return res.status(400).json({ error: 'Customer not found' });
      }
      resolvedPartyType = partyType;
      resolvedPartyId = partyId;
    }

    if (resolvedPartyId == null) {
      const partyName = String(customerName).trim();
      const existing = (
        await pool.query(`SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
          tenantId,
          partyName,
        ])
      ).rows[0] as { id: string } | undefined;
      if (existing) {
        resolvedPartyType = 'vendor';
        resolvedPartyId = existing.id;
      } else {
        const vendorLimitErr = await checkPlanLimit(tenantId, 'vendors');
        if (vendorLimitErr) return res.status(403).json(vendorLimitErr);
        const newId = uid('V');
        await pool.query(
          `INSERT INTO vendors (id, tenant_id, name, phone, address, gst_number)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newId,
            tenantId,
            partyName,
            typeof customerPhone === 'string' && customerPhone.trim() ? customerPhone.trim() : null,
            typeof customerAddress === 'string' && customerAddress.trim() ? customerAddress.trim() : null,
            typeof customerGstin === 'string' && customerGstin.trim() ? customerGstin.trim() : null,
          ],
        );
        resolvedPartyType = 'vendor';
        resolvedPartyId = newId;
      }
    }

    let gstEnabled = typeof req.body.gstEnabled === 'boolean' ? !!req.body.gstEnabled : null;
    if (gstEnabled == null) {
      gstEnabled = current.gst_enabled == null ? Number(current.tax_total) > 0 : !!current.gst_enabled;
    }
    const priceVendorId = resolvedPartyType === 'vendor' ? resolvedPartyId : null;
    const built = await buildInvoiceLineItems(tenantId, items as InvoiceLineIn[], gstEnabled, priceVendorId);
    if ('error' in built) return res.status(400).json({ error: built.error });
    const { lineItems, subtotal, taxTotal, grandTotal } = built;

    let sellerGstin: string | null = null;
    const bs = (await pool.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId]))
      .rows[0] as { gst_api_gstin?: string } | undefined;
    if (bs?.gst_api_gstin) sellerGstin = bs.gst_api_gstin;
    else {
      const t = (await pool.query('SELECT gst_number FROM tenants WHERE id = $1', [tenantId])).rows[0] as
        { gst_number?: string } | undefined;
      sellerGstin = t?.gst_number || null;
    }
    const interstate = isInterstateSupply(sellerGstin, customerGstin || null);
    const { taxCgst, taxSgst, taxIgst } = splitGstTax(taxTotal, interstate);

    const invDate =
      typeof invoiceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(invoiceDate)
        ? invoiceDate.slice(0, 10)
        : typeof current.invoice_date === 'string'
          ? String(current.invoice_date).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
    let resolvedDueDate: string | null =
      typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.slice(0, 10) : null;
    if (dueDate === undefined) {
      resolvedDueDate =
        current.due_date == null
          ? null
          : typeof current.due_date === 'string'
            ? String(current.due_date).slice(0, 10)
            : null;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setTenantContext(client, tenantId);
      const upd = await client.query(
        `UPDATE standalone_invoices SET
           customer_name=$1, customer_gstin=$2, customer_address=$3, customer_phone=$4,
           party_type=$5, party_id=$6, items=$7, subtotal=$8, tax_total=$9, grand_total=$10,
           notes=$11, terms=$12, invoice_date=$13, due_date=$14,
           tax_cgst=$15, tax_sgst=$16, tax_igst=$17, is_interstate=$18, gst_enabled=$19,
           updated_at=NOW()
         WHERE id=$20 AND tenant_id=$21 AND status IN ('draft','sent')
         RETURNING *`,
        [
          customerName,
          customerGstin || null,
          customerAddress || null,
          customerPhone || null,
          resolvedPartyType,
          resolvedPartyId,
          JSON.stringify(lineItems),
          subtotal,
          taxTotal,
          grandTotal,
          notes !== undefined ? notes || null : current.notes,
          terms !== undefined ? terms || null : current.terms,
          invDate,
          resolvedDueDate,
          taxCgst,
          taxSgst,
          taxIgst,
          interstate,
          gstEnabled,
          invoiceId,
          tenantId,
        ],
      );
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Only draft or unpaid invoices can be edited' });
      }
      const row = upd.rows[0] as Record<string, unknown>;
      await withBooks(
        () =>
          replaceStandaloneInvoiceBooks(client, tenantId, {
            id: invoiceId,
            invoiceNumber: String(row.invoice_number || ''),
            customerName,
            partyId: resolvedPartyId,
            grandTotal,
            subtotal,
            taxCgst,
            taxSgst,
            taxIgst,
            invoiceDate: invDate,
            notes: notes !== undefined ? notes || null : (current.notes as string | null),
          }),
        'invoice-edit',
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
      'Invoice Updated',
      'invoice',
      invoiceId,
      `${current.invoice_number} — ${customerName} — ₹${grandTotal}`,
    );
    const { rows: updated } = await pool.query(
      `SELECT si.*, COALESCE(SUM(ip.amount), 0) AS paid_amount
       FROM standalone_invoices si
       LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $2
       WHERE si.id = $1 AND si.tenant_id = $2
       GROUP BY si.id`,
      [invoiceId, tenantId],
    );
    res.json(mapStandaloneInvoice(updated[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Update status — "paid" only if payments cover grand_total (use invoice-finance to record pay)
router.put('/api/invoices/:id/status', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.body;
    if (!['draft', 'sent', 'paid', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await client.query('BEGIN');

    await setTenantContext(client, tenantId);
    const inv = (
      await client.query(
        'SELECT id, grand_total, status FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [req.params.id, tenantId],
      )
    ).rows[0] as { id: string; grand_total: number; status: string } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (status === 'paid') {
      const paid = Number(
        (
          await client.query(
            'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
            [req.params.id, tenantId],
          )
        ).rows[0].t,
      );
      if (paid + 0.001 < Number(inv.grand_total)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Cannot mark paid without full payment. Record payment under Invoice Finance.',
          paid,
          due: Number(inv.grand_total),
        });
      }
    }

    if (status === 'cancelled') {
      const payCount = Number(
        (
          await client.query(
            'SELECT COUNT(*)::int as c FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
            [req.params.id, tenantId],
          )
        ).rows[0].c,
      );
      if (payCount > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot cancel invoice with payments. Delete payments first.' });
      }
    }

    await client.query(
      'UPDATE standalone_invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [status, req.params.id, tenantId],
    );
    await client.query('COMMIT');
    await logAudit(
      pool,
      tenantId,
      'Invoice Status Changed',
      'invoice',
      req.params.id as string,
      `${inv.status} → ${status}`,
      req.user?.userId,
      req.user?.name,
    );

    // Auto E-Invoice: generate IRN when status moves to 'sent' and tenant has einvoice auto mode
    if (status === 'sent' && inv.status !== 'sent') {
      pool
        .query('SELECT einvoice_enabled, einvoice_mode FROM tenants WHERE id = $1', [tenantId])
        .then(async tr => {
          const t = tr.rows[0] as { einvoice_enabled?: boolean; einvoice_mode?: string } | undefined;
          if (!t?.einvoice_enabled || !isEinvoiceApiMode(t.einvoice_mode)) return;
          // Fire auto IRN generation (reuse existing route logic)
          const { generateStandaloneInvoiceIrn } = await import('../services/standaloneInvoiceGst').catch(() => ({
            generateStandaloneInvoiceIrn: null as unknown as null,
          }));
          if (!generateStandaloneInvoiceIrn) return;
          await generateStandaloneInvoiceIrn(pool, tenantId, req.params.id as string).catch(err => {
            logger.warn('Auto E-Invoice generation failed', {
              tenantId,
              invoiceId: req.params.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        })
        .catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

// Soft-cancel invoice (keeps row for audit) — blocked if any payments exist
router.delete('/api/invoices/:id', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    await client.query('BEGIN');

    await setTenantContext(client, tenantId);
    const inv = (
      await client.query(
        'SELECT id, status, invoice_number FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [req.params.id, tenantId],
      )
    ).rows[0] as { id: string; status: string; invoice_number: string } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (inv.status === 'cancelled') {
      await client.query('COMMIT');
      return res.json({ ok: true, cancelled: true });
    }

    const payCount = Number(
      (
        await client.query('SELECT COUNT(*)::int as c FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2', [
          req.params.id,
          tenantId,
        ])
      ).rows[0].c,
    );
    if (payCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot cancel invoice with payments. Delete payments first, or keep the invoice for audit.',
      });
    }

    await client.query(
      `UPDATE standalone_invoices SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    await client.query('COMMIT');
    await logAudit(
      pool,
      tenantId,
      'Invoice Cancelled',
      'invoice',
      req.params.id as string,
      `${inv.invoice_number} (${inv.status} → cancelled)`,
      req.user?.userId,
      req.user?.name,
    );
    res.json({ ok: true, cancelled: true });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

export default router;
