import { Router } from 'express';
import { blockVendors, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { hasExplicitUnitPrice, resolvePrice, unitPricesAfterDiscount } from '../utils/price-resolve';
import { isInterstateSupply, splitGstTax } from '../utils/gst-place';

const router = Router();

type QuoteItem = {
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

type QuoteItemInput = {
  productId: string;
  quantity?: number;
  customPrice?: unknown;
  discountPercent?: number;
  withGst?: boolean;
};

async function todayYmd(): Promise<string> {
  const r = await pool.query('SELECT CURRENT_DATE::text AS d');
  return String(r.rows[0]?.d || new Date().toISOString().slice(0, 10));
}

function mapQuote(r: Record<string, unknown>) {
  return {
    id: r.id,
    quotationNumber: r.quotation_number,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerEmail: r.customer_email,
    quotationDate: r.quotation_date,
    validUntil: r.valid_until,
    status: r.status,
    items: r.items,
    subtotal: Number(r.subtotal) || 0,
    gstRate: Number(r.gst_rate) || 18,
    gstAmount: Number(r.gst_amount) || 0,
    total: Number(r.total) || 0,
    notes: r.notes,
    convertedBatchId: r.converted_batch_id,
    convertedInvoiceId: r.converted_invoice_id || null,
  };
}

/** Expire Draft/Sent quotes past valid_until using DB CURRENT_DATE. */
async function expireIfNeeded(
  client: { query: typeof pool.query },
  row: Record<string, unknown>,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const status = String(row.status || '');
  if (!['Draft', 'Sent'].includes(status) || !row.valid_until) return row;
  const updated = await client.query(
    `UPDATE quotations SET status = 'Expired'
     WHERE id = $1 AND tenant_id = $2 AND status IN ('Draft','Sent')
       AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE
     RETURNING *`,
    [row.id, tenantId],
  );
  if (updated.rows[0]) return updated.rows[0] as Record<string, unknown>;
  return row;
}

async function buildResolvedItems(
  tenantId: string,
  vendorId: string | null | undefined,
  items: QuoteItemInput[],
  rate: number,
): Promise<
  { resolvedItems: QuoteItem[]; subtotal: number; gstAmount: number; total: number } | { error: string; status: number }
> {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { error: 'Add at least one item', status: 400 };
  }
  let subtotal = 0;
  const resolvedItems: QuoteItem[] = [];
  for (const item of items) {
    const product = (
      await pool.query('SELECT id, name, price, price_includes_gst FROM products WHERE id = $1 AND tenant_id = $2', [
        item.productId,
        tenantId,
      ])
    ).rows[0] as { id: string; name: string; price: number; price_includes_gst: boolean } | undefined;
    if (!product) return { error: `Product not found: ${item.productId}`, status: 404 };
    const qty = Math.max(1, Number(item.quantity) || 1);
    const price = hasExplicitUnitPrice(item.customPrice)
      ? Number(item.customPrice)
      : (await resolvePrice(tenantId, item.productId, vendorId, qty)).price;
    const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
    const withGst = item.withGst !== false;
    const { netPricePerUnit, billedPricePerUnit } = unitPricesAfterDiscount({
      basePrice: price,
      discountPercent: disc,
      withGst,
      priceIncludesGst: !!product.price_includes_gst,
      gstRate: rate,
    });
    const lineNet = Math.round(netPricePerUnit * qty * 100) / 100;
    const lineTotal = Math.round(billedPricePerUnit * qty * 100) / 100;
    const lineGst = Math.round((lineTotal - lineNet) * 100) / 100;
    subtotal += lineNet;
    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: qty,
      price,
      discountPercent: disc,
      withGst,
      lineNet,
      lineGst,
      lineTotal,
      convertedQty: 0,
    });
  }
  const gstAmount = resolvedItems.reduce((s, i) => s + i.lineGst, 0);
  return { resolvedItems, subtotal, gstAmount, total: subtotal + gstAmount };
}

async function resolveVendorName(
  tenantId: string,
  vendorId: string | null | undefined,
  customerName: string | null | undefined,
): Promise<string | null> {
  let vendorName = customerName || null;
  if (vendorId) {
    const v = (await pool.query('SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId]))
      .rows[0] as { name: string } | undefined;
    if (v) vendorName = v.name;
  }
  return vendorName;
}

router.get('/api/quotations', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.query;
    // Auto-expire past-due Draft/Sent before listing
    await pool.query(
      `UPDATE quotations SET status = 'Expired'
       WHERE tenant_id = $1 AND status IN ('Draft','Sent')
         AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE`,
      [tenantId],
    );
    let sql = 'SELECT * FROM quotations WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof status === 'string' && status) {
      sql += ' AND status = $2';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    res.json(rows.map(mapQuote));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/quotations', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { vendorId, customerName, customerPhone, customerEmail, quotationDate, validUntil, items, gstRate, notes } =
      req.body;
    const rate = Number(gstRate) || 18;
    const built = await buildResolvedItems(tenantId, vendorId, items, rate);
    if ('error' in built) return res.status(built.status).json({ error: built.error });
    const { resolvedItems, subtotal, gstAmount, total } = built;

    const id = uid('Q');
    const maxNum = (
      await pool.query(
        "SELECT MAX(CAST(SUBSTRING(quotation_number FROM 4) AS INTEGER)) as m FROM quotations WHERE tenant_id = $1 AND quotation_number LIKE 'QT-%'",
        [tenantId],
      )
    ).rows[0]?.m;
    const qNum = `QT-${String((Number(maxNum) || 0) + 1).padStart(4, '0')}`;
    const vendorName = await resolveVendorName(tenantId, vendorId, customerName);
    const qDate = quotationDate || (await todayYmd());

    await pool.query(
      `INSERT INTO quotations (id, tenant_id, quotation_number, vendor_id, vendor_name, customer_name, customer_phone, customer_email, quotation_date, valid_until, status, items, subtotal, gst_rate, gst_amount, total, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        tenantId,
        qNum,
        vendorId || null,
        vendorName,
        customerName || vendorName,
        customerPhone || null,
        customerEmail || null,
        qDate,
        validUntil || null,
        'Draft',
        JSON.stringify(resolvedItems),
        subtotal,
        rate,
        gstAmount,
        total,
        notes || null,
      ],
    );

    await logAudit(
      pool,
      tenantId,
      'Quotation Created',
      'quotation',
      id,
      `${qNum} for ${vendorName || 'customer'}, ₹${total}`,
    );

    res.status(201).json({
      id,
      quotationNumber: qNum,
      vendorId,
      vendorName,
      customerName: customerName || vendorName,
      customerPhone,
      customerEmail,
      quotationDate: qDate,
      validUntil,
      status: 'Draft',
      items: resolvedItems,
      subtotal,
      gstRate: rate,
      gstAmount,
      total,
      notes,
      convertedBatchId: null,
      convertedInvoiceId: null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Edit Draft quotation header + lines. */
router.put('/api/quotations/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const current = (
      await pool.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])
    ).rows[0] as Record<string, unknown> | undefined;
    if (!current) return res.status(404).json({ error: 'Quotation not found' });
    const expired = await expireIfNeeded(pool, current, tenantId);
    if (expired.status !== 'Draft') {
      return res.status(400).json({ error: 'Only Draft quotations can be edited' });
    }

    const { vendorId, customerName, customerPhone, customerEmail, quotationDate, validUntil, items, gstRate, notes } =
      req.body;
    const rate = Number(gstRate) || Number(current.gst_rate) || 18;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one item' });
    }
    const built = await buildResolvedItems(tenantId, vendorId, items, rate);
    if ('error' in built) return res.status(built.status).json({ error: built.error });
    const { resolvedItems, subtotal, gstAmount, total } = built;
    const vendorName = await resolveVendorName(tenantId, vendorId, customerName);

    const upd = await pool.query(
      `UPDATE quotations SET
        vendor_id=$1, vendor_name=$2, customer_name=$3, customer_phone=$4, customer_email=$5,
        quotation_date=$6, valid_until=$7, items=$8, subtotal=$9, gst_rate=$10, gst_amount=$11, total=$12, notes=$13
       WHERE id=$14 AND tenant_id=$15 AND status='Draft'
       RETURNING *`,
      [
        vendorId || null,
        vendorName,
        customerName || vendorName,
        customerPhone || null,
        customerEmail || null,
        quotationDate || current.quotation_date,
        validUntil !== undefined ? validUntil || null : current.valid_until,
        JSON.stringify(resolvedItems),
        subtotal,
        rate,
        gstAmount,
        total,
        notes !== undefined ? notes || null : current.notes,
        req.params.id,
        tenantId,
      ],
    );
    if (upd.rowCount === 0) {
      return res.status(400).json({ error: 'Only Draft quotations can be edited' });
    }

    await logAudit(pool, tenantId, 'Quotation Updated', 'quotation', req.params.id as string, `Draft updated`);
    res.json(mapQuote(upd.rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/quotations/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    let row = (await pool.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]))
      .rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'Quotation not found' });
    row = await expireIfNeeded(pool, row, tenantId);
    res.json(mapQuote(row));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/quotations/:id/status', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.body;
    if (!['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'].includes(status)) {
      return res.status(400).json({
        error: status === 'Converted' ? 'Use POST /api/quotations/:id/convert to convert' : 'Invalid status',
      });
    }
    let current = (
      await pool.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])
    ).rows[0] as Record<string, unknown> | undefined;
    if (!current) return res.status(404).json({ error: 'Quotation not found' });
    current = await expireIfNeeded(pool, current, tenantId);
    const validTransitions: Record<string, string[]> = {
      Draft: ['Sent', 'Rejected', 'Expired'],
      Sent: ['Accepted', 'Rejected', 'Expired'],
      Accepted: [],
      Rejected: ['Draft'],
      Expired: ['Draft'],
      Converted: [],
    };
    if (!(validTransitions[String(current.status)] ?? []).includes(status)) {
      return res.status(400).json({ error: `Cannot change from ${current.status} to ${status}` });
    }
    const result = await pool.query('UPDATE quotations SET status = $1 WHERE id = $2 AND tenant_id = $3', [
      status,
      req.params.id,
      tenantId,
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Quotation not found' });
    res.json({ ok: true, status });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/quotations/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM quotations WHERE id = $1 AND tenant_id = $2 AND status IN ($3, $4)', [
      req.params.id,
      tenantId,
      'Draft',
      'Rejected',
    ]);
    if (result.rowCount === 0) return res.status(400).json({ error: 'Can only delete Draft or Rejected quotations' });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/quotations/:id/convert', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const convertReq = Array.isArray(req.body?.items)
      ? (req.body.items as { productId: string; quantity: number; lineIndex?: number }[])
      : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let quote = (
        await client.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [
          req.params.id,
          tenantId,
        ])
      ).rows[0] as Record<string, unknown> | undefined;
      if (!quote) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Quotation not found' });
      }
      quote = await expireIfNeeded(client, quote, tenantId);
      if (quote.status === 'Converted') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Already converted' });
      }
      if (quote.status === 'Expired') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Quotation has expired' });
      }
      if (quote.status !== 'Accepted') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Quotation must be accepted before converting' });
      }

      const tenantType = (await client.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0]
        ?.business_type as string | undefined;
      const isService = tenantType === 'service';

      if (!isService && !quote.vendor_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Quotation must have a vendor to convert to distribution' });
      }

      const items = (quote.items as QuoteItem[]).map(i => ({
        ...i,
        convertedQty: Number(i.convertedQty) || 0,
      }));

      // Build convert plan: which lines / how much qty (lineIndex preferred for duplicate products)
      type PlanLine = { idx: number; productId: string; convertQty: number; item: QuoteItem };
      const plan: PlanLine[] = [];
      const usedIdx = new Set<number>();
      if (convertReq && convertReq.length > 0) {
        for (const reqLine of convertReq) {
          let idx =
            typeof reqLine.lineIndex === 'number' &&
            reqLine.lineIndex >= 0 &&
            reqLine.lineIndex < items.length &&
            items[reqLine.lineIndex].productId === reqLine.productId
              ? reqLine.lineIndex
              : -1;
          if (idx < 0) {
            idx = items.findIndex(
              (i, j) => i.productId === reqLine.productId && !usedIdx.has(j) && i.quantity - (i.convertedQty || 0) > 0,
            );
          }
          if (idx < 0 || usedIdx.has(idx)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Product not on quotation: ${reqLine.productId}` });
          }
          const item = items[idx];
          const remaining = item.quantity - (item.convertedQty || 0);
          const convertQty = Math.max(0, Math.min(remaining, Number(reqLine.quantity) || 0));
          if (convertQty <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `No remaining quantity for ${item.productName}` });
          }
          usedIdx.add(idx);
          plan.push({ idx, productId: item.productId, convertQty, item });
        }
      } else {
        items.forEach((item, idx) => {
          const remaining = item.quantity - (item.convertedQty || 0);
          if (remaining > 0) plan.push({ idx, productId: item.productId, convertQty: remaining, item });
        });
      }
      if (plan.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Nothing left to convert' });
      }

      const gstRate = Number(quote.gst_rate) || 18;
      const date = (quote.quotation_date as string) || (await todayYmd());
      let resultPayload: Record<string, unknown> = {};

      if (isService) {
        // Convert remaining selection → standalone invoice (frozen prices)
        const invItems = [];
        let subtotal = 0;
        let taxTotal = 0;
        for (const p of plan) {
          const withGst = p.item.withGst !== false;
          const product = (
            await client.query(
              'SELECT id, name, price, price_includes_gst, hsn_code FROM products WHERE id = $1 AND tenant_id = $2',
              [p.productId, tenantId],
            )
          ).rows[0] as
            | { id: string; name: string; price: number; price_includes_gst: boolean; hsn_code: string | null }
            | undefined;
          if (!product) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Product not found: ${p.productId}` });
          }
          const { netPricePerUnit, billedPricePerUnit } = unitPricesAfterDiscount({
            basePrice: Number(p.item.price),
            discountPercent: Number(p.item.discountPercent) || 0,
            withGst,
            priceIncludesGst: !!product.price_includes_gst,
            gstRate,
          });
          const taxable = Math.round(netPricePerUnit * p.convertQty * 100) / 100;
          const lineTotal = Math.round(billedPricePerUnit * p.convertQty * 100) / 100;
          const tax = Math.round((lineTotal - taxable) * 100) / 100;
          subtotal += taxable;
          taxTotal += tax;
          invItems.push({
            description: p.item.productName || product.name,
            productId: p.productId,
            hsnSac: product.hsn_code || '',
            qty: p.convertQty,
            rate: Number(p.item.price),
            discountPercent: Number(p.item.discountPercent) || 0,
            gstPercent: withGst ? gstRate : 0,
            taxable,
            tax,
            total: lineTotal,
          });
        }
        const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;

        let sellerGstin: string | null = null;
        const bs = (await client.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId]))
          .rows[0] as { gst_api_gstin?: string } | undefined;
        if (bs?.gst_api_gstin) sellerGstin = bs.gst_api_gstin;
        else {
          const t = (await client.query('SELECT gst_number FROM tenants WHERE id = $1', [tenantId])).rows[0] as
            { gst_number?: string } | undefined;
          sellerGstin = t?.gst_number || null;
        }
        let buyerGstin: string | null = null;
        if (quote.vendor_id) {
          const v = (
            await client.query('SELECT gst_number FROM vendors WHERE id = $1 AND tenant_id = $2', [
              quote.vendor_id,
              tenantId,
            ])
          ).rows[0] as { gst_number?: string } | undefined;
          buyerGstin = v?.gst_number || null;
        }
        const interstate = isInterstateSupply(sellerGstin, buyerGstin);
        const { taxCgst, taxSgst, taxIgst } = splitGstTax(taxTotal, interstate);

        const now = new Date();
        const fy =
          now.getMonth() >= 3
            ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`
            : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
        const fyPrefix = `INV/${fy}/`;
        const maxNum = Number(
          (
            await client.query(
              `SELECT MAX(CAST(NULLIF(regexp_replace(invoice_number, '^.*/', ''), '') AS INTEGER)) as m
               FROM standalone_invoices WHERE tenant_id = $1 AND invoice_number LIKE $2`,
              [tenantId, `${fyPrefix}%`],
            )
          ).rows[0]?.m || 0,
        );
        const invoiceNumber = `${fyPrefix}${String(maxNum + 1).padStart(4, '0')}`;
        const invoiceId = uid('INV');

        await client.query(
          `INSERT INTO standalone_invoices (
            id, tenant_id, invoice_number, customer_name, customer_gstin, customer_phone,
            party_type, party_id, items, subtotal, tax_total, grand_total, notes, status, invoice_date,
            tax_cgst, tax_sgst, tax_igst, is_interstate
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'sent',$14,$15,$16,$17,$18)`,
          [
            invoiceId,
            tenantId,
            invoiceNumber,
            quote.customer_name || quote.vendor_name || 'Customer',
            buyerGstin,
            quote.customer_phone || null,
            quote.vendor_id ? 'vendor' : null,
            quote.vendor_id || null,
            JSON.stringify(invItems),
            subtotal,
            taxTotal,
            grandTotal,
            quote.notes || `From quotation ${quote.quotation_number}`,
            date,
            taxCgst,
            taxSgst,
            taxIgst,
            interstate,
          ],
        );

        for (const p of plan) {
          items[p.idx].convertedQty = (items[p.idx].convertedQty || 0) + p.convertQty;
        }
        const fullyDone = items.every(i => (i.convertedQty || 0) >= i.quantity);
        const newStatus = fullyDone ? 'Converted' : 'Accepted';
        await client.query(
          `UPDATE quotations SET status = $1, items = $2, converted_invoice_id = COALESCE(converted_invoice_id, $3)
           WHERE id = $4 AND tenant_id = $5`,
          [newStatus, JSON.stringify(items), invoiceId, req.params.id, tenantId],
        );
        await client.query('COMMIT');
        await logAudit(
          pool,
          tenantId,
          'Quotation Converted',
          'quotation',
          req.params.id as string,
          `Converted to invoice ${invoiceNumber}${fullyDone ? '' : ' (partial)'}`,
        );
        resultPayload = {
          ok: true,
          target: 'invoice',
          invoiceId,
          invoiceNumber,
          fullyConverted: fullyDone,
          grandTotal,
        };
      } else {
        // Goods → distribution (partial-aware)
        const vendorId = quote.vendor_id as string;
        const batchId = uid('D');
        let totalBilled = 0;
        let totalQty = 0;
        const unitRows: {
          productId: string;
          productName: string;
          qty: number;
          disc: number;
          netPricePerUnit: number;
          gstApplied: number;
          billedPricePerUnit: number;
        }[] = [];

        for (const p of plan) {
          const product = (
            await client.query(
              'SELECT id, name, price, price_includes_gst FROM products WHERE id = $1 AND tenant_id = $2',
              [p.productId, tenantId],
            )
          ).rows[0] as { id: string; name: string; price: number; price_includes_gst: boolean } | undefined;
          if (!product) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Product not found: ${p.productId}` });
          }
          const disc = Math.min(100, Math.max(0, Number(p.item.discountPercent) || 0));
          const gstApplied = p.item.withGst !== false ? 1 : 0;
          const { netPricePerUnit, billedPricePerUnit } = unitPricesAfterDiscount({
            basePrice: Number(p.item.price),
            discountPercent: disc,
            withGst: gstApplied === 1,
            priceIncludesGst: !!product.price_includes_gst,
            gstRate,
          });
          unitRows.push({
            productId: product.id,
            productName: product.name,
            qty: p.convertQty,
            disc,
            netPricePerUnit,
            gstApplied,
            billedPricePerUnit,
          });
          totalBilled += billedPricePerUnit * p.convertQty;
          totalQty += p.convertQty;
        }

        const resolvedUnits: {
          productId: string;
          barcode: string;
          invId: string;
          disc: number;
          netPrice: number;
          gstApplied: number;
          billedPrice: number;
        }[] = [];
        for (const u of unitRows) {
          const locked = (
            await client.query(
              `SELECT id, barcode FROM product_inventory WHERE product_id = $1 AND status = 'InStock' AND tenant_id = $2 ORDER BY id LIMIT $3 FOR UPDATE SKIP LOCKED`,
              [u.productId, tenantId, u.qty],
            )
          ).rows as { id: string; barcode: string }[];
          if (locked.length < u.qty) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: `Insufficient stock for ${u.productName}. Available: ${locked.length}, requested: ${u.qty}`,
            });
          }
          for (const inv of locked) {
            resolvedUnits.push({
              productId: u.productId,
              barcode: inv.barcode,
              invId: inv.id,
              disc: u.disc,
              netPrice: u.netPricePerUnit,
              gstApplied: u.gstApplied,
              billedPrice: u.billedPricePerUnit,
            });
          }
        }
        for (let i = 0; i < resolvedUnits.length; i++) {
          const u = resolvedUnits[i];
          const distId = `${batchId}-${i + 1}`;
          await client.query(
            'INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [
              distId,
              batchId,
              u.productId,
              u.barcode,
              vendorId,
              date,
              'Distributed',
              u.disc,
              u.netPrice,
              u.gstApplied,
              u.billedPrice,
              tenantId,
            ],
          );
          await client.query('UPDATE product_inventory SET status = $1 WHERE id = $2 AND tenant_id = $3', [
            'Distributed',
            u.invId,
            tenantId,
          ]);
        }

        for (const p of plan) {
          items[p.idx].convertedQty = (items[p.idx].convertedQty || 0) + p.convertQty;
        }
        const fullyDone = items.every(i => (i.convertedQty || 0) >= i.quantity);
        const newStatus = fullyDone ? 'Converted' : 'Accepted';
        await client.query(
          `UPDATE quotations SET status = $1, items = $2, converted_batch_id = COALESCE(converted_batch_id, $3)
           WHERE id = $4 AND tenant_id = $5 AND status = 'Accepted'`,
          [newStatus, JSON.stringify(items), batchId, req.params.id, tenantId],
        );
        await client.query('COMMIT');
        await logAudit(
          pool,
          tenantId,
          'Quotation Converted',
          'quotation',
          req.params.id as string,
          `Converted to distribution ${batchId}, ${totalQty} units${fullyDone ? '' : ' (partial)'}`,
        );
        resultPayload = {
          ok: true,
          target: 'distribution',
          batchId,
          total: totalQty,
          billValue: totalBilled,
          fullyConverted: fullyDone,
        };
      }

      res.json(resultPayload);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
