import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest, vendorScopeId } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

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
    const { rows } = await pool.query(
      'SELECT * FROM standalone_invoices WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    res.json(rows.map((r: Record<string, unknown>) => ({
      id: r.id, invoiceNumber: r.invoice_number, customerName: r.customer_name,
      customerGstin: r.customer_gstin, customerAddress: r.customer_address, customerPhone: r.customer_phone,
      items: r.items, subtotal: Number(r.subtotal), taxTotal: Number(r.tax_total),
      grandTotal: Number(r.grand_total), notes: r.notes, terms: r.terms,
      status: r.status, invoiceDate: r.invoice_date, dueDate: r.due_date,
      createdAt: r.created_at,
    })));
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
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
    const fy = now.getMonth() >= 3 ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}` : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
    res.json({ number: `INV/${fy}/${String(count).padStart(4, '0')}` });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// Create invoice
router.post('/api/invoices', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { invoiceNumber, customerName, customerGstin, customerAddress, customerPhone, items, notes, terms, invoiceDate, dueDate, status } = req.body;
    if (!customerName) return res.status(400).json({ error: 'Customer name is required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
    // paid/cancelled only via status update or invoice-finance — never on create
    let createStatus = 'draft';
    if (status === 'sent' || status === 'unpaid') createStatus = 'sent';
    else if (status === 'draft' || status == null || status === undefined) createStatus = 'draft';
    else if (status) {
      return res.status(400).json({ error: 'New invoices can only be draft or sent. Mark paid after recording payment.' });
    }

    const lineItems = items.map((it: { description: string; hsnSac?: string; qty: number; rate: number; gstPercent: number }) => {
      const taxable = (it.qty || 1) * (it.rate || 0);
      const tax = Math.round(taxable * (it.gstPercent || 0) / 100 * 100) / 100;
      return { ...it, taxable, tax, total: taxable + tax };
    });
    const subtotal = lineItems.reduce((s: number, it: { taxable: number }) => s + it.taxable, 0);
    const taxTotal = lineItems.reduce((s: number, it: { tax: number }) => s + it.tax, 0);
    const grandTotal = subtotal + taxTotal;

    const id = uid('INV');
    await pool.query(
      `INSERT INTO standalone_invoices (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone, items, subtotal, tax_total, grand_total, notes, terms, status, invoice_date, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, tenantId, invoiceNumber || `INV-${Date.now()}`, customerName, customerGstin || null, customerAddress || null, customerPhone || null,
       JSON.stringify(lineItems), subtotal, taxTotal, grandTotal, notes || null, terms || null, createStatus,
       invoiceDate || new Date().toISOString().slice(0, 10), dueDate || null]
    );
    await logAudit(pool, tenantId, 'Invoice Created', 'invoice', id, `${invoiceNumber} — ${customerName} — ₹${grandTotal}`);
    res.status(201).json({ id, invoiceNumber, grandTotal });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
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
    const inv = (await client.query(
      'SELECT id, grand_total, status FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [req.params.id, tenantId]
    )).rows[0] as { id: string; grand_total: number; status: string } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (status === 'paid') {
      const paid = Number((await client.query(
        'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
        [req.params.id, tenantId]
      )).rows[0].t);
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
      const payCount = Number((await client.query(
        'SELECT COUNT(*)::int as c FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
        [req.params.id, tenantId]
      )).rows[0].c);
      if (payCount > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot cancel invoice with payments. Delete payments first.' });
      }
    }

    await client.query(
      'UPDATE standalone_invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [status, req.params.id, tenantId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
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
    const inv = (await client.query(
      'SELECT id, status FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [req.params.id, tenantId]
    )).rows[0] as { id: string; status: string } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const payCount = Number((await client.query(
      'SELECT COUNT(*)::int as c FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    )).rows[0].c);
    if (payCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot delete invoice with payments. Delete payments first, or keep the invoice for audit.',
      });
    }

    await client.query('DELETE FROM standalone_invoices WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
