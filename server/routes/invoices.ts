import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest, vendorScopeId } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { resolvePrice, unitPricesAfterDiscount } from '../utils/price-resolve';
import { isInterstateSupply, splitGstTax } from '../utils/gst-place';

const router = Router();

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
    const total = Number(
      (await pool.query('SELECT COUNT(*)::int AS c FROM standalone_invoices WHERE tenant_id = $1', [tenantId])).rows[0]
        ?.c ?? 0,
    );
    const { rows } = await pool.query(
      'SELECT * FROM standalone_invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [tenantId, limit, offset],
    );
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        customerName: r.customer_name,
        customerGstin: r.customer_gstin,
        customerAddress: r.customer_address,
        customerPhone: r.customer_phone,
        partyType: (r.party_type as string) || null,
        partyId: (r.party_id as string) || null,
        items: r.items,
        subtotal: Number(r.subtotal),
        taxTotal: Number(r.tax_total),
        taxCgst: Number(r.tax_cgst) || 0,
        taxSgst: Number(r.tax_sgst) || 0,
        taxIgst: Number(r.tax_igst) || 0,
        isInterstate: !!r.is_interstate,
        grandTotal: Number(r.grand_total),
        notes: r.notes,
        terms: r.terms,
        status: r.status,
        invoiceDate: r.invoice_date,
        dueDate: r.due_date,
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Get next invoice number
router.get('/api/invoices/next-number', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (vendorScopeId(req) || req.user?.role === 'Vendor') {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { rows } = await pool.query('SELECT COUNT(*) as c FROM standalone_invoices WHERE tenant_id = $1', [tenantId]);
    const count = Number(rows[0]?.c ?? 0) + 1;
    const now = new Date();
    const fy =
      now.getMonth() >= 3
        ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`
        : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
    res.json({ number: `INV/${fy}/${String(count).padStart(4, '0')}` });
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

    // paid/cancelled only via status update or invoice-finance — never on create
    let createStatus = 'draft';
    if (status === 'sent' || status === 'unpaid') createStatus = 'sent';
    else if (status === 'draft' || status == null || status === undefined) createStatus = 'draft';
    else if (status) {
      return res
        .status(400)
        .json({ error: 'New invoices can only be draft or sent. Mark paid after recording payment.' });
    }

    type LineIn = {
      description?: string;
      hsnSac?: string;
      qty?: number;
      rate?: number;
      gstPercent?: number;
      discountPercent?: number;
      productId?: string;
    };
    const priceVendorId = resolvedPartyType === 'vendor' ? resolvedPartyId : null;
    const lineItems: {
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
    }[] = [];
    for (const raw of items as LineIn[]) {
      const qty = Number(raw.qty) || 1;
      let rate = Number(raw.rate) || 0;
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
          priceIncludesGst = !!product.price_includes_gst;
          if (!raw.rate || rate <= 0) {
            const resolved = await resolvePrice(tenantId, productId, priceVendorId, qty);
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
    const grandTotal = subtotal + taxTotal;

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

    const id = uid('INV');
    await pool.query(
      `INSERT INTO standalone_invoices (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone, party_type, party_id, items, subtotal, tax_total, grand_total, notes, terms, status, invoice_date, due_date, tax_cgst, tax_sgst, tax_igst, is_interstate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        id,
        tenantId,
        invoiceNumber || `INV-${Date.now()}`,
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
        invoiceDate || new Date().toISOString().slice(0, 10),
        dueDate || null,
        taxCgst,
        taxSgst,
        taxIgst,
        interstate,
      ],
    );
    await logAudit(
      pool,
      tenantId,
      'Invoice Created',
      'invoice',
      id,
      `${invoiceNumber} — ${customerName} — ₹${grandTotal}`,
    );
    res.status(201).json({ id, invoiceNumber, grandTotal });
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
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

// Delete invoice — blocked if any payments exist (avoids orphan money rows)
router.delete('/api/invoices/:id', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    await client.query('BEGIN');
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
        error: 'Cannot delete invoice with payments. Delete payments first, or keep the invoice for audit.',
      });
    }

    await client.query('DELETE FROM standalone_invoices WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    await client.query('COMMIT');
    await logAudit(
      pool,
      tenantId,
      'Invoice Deleted',
      'invoice',
      req.params.id as string,
      `${inv.invoice_number} (${inv.status})`,
      req.user?.userId,
      req.user?.name,
    );
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

export default router;
