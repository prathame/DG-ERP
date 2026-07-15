import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

// List invoices
router.get('/api/invoices', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
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
router.get('/api/invoices/next-number', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
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
       JSON.stringify(lineItems), subtotal, taxTotal, grandTotal, notes || null, terms || null, status || 'draft',
       invoiceDate || new Date().toISOString().slice(0, 10), dueDate || null]
    );
    await logAudit(pool, tenantId, 'Invoice Created', 'invoice', id, `${invoiceNumber} — ${customerName} — ₹${grandTotal}`);
    res.status(201).json({ id, invoiceNumber, grandTotal });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// Update status
router.put('/api/invoices/:id/status', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.body;
    if (!['draft', 'sent', 'paid', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await pool.query(
      'UPDATE standalone_invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id',
      [status, req.params.id, tenantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ ok: true });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// Delete invoice
router.delete('/api/invoices/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 RETURNING id', [req.params.id, tenantId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ ok: true });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
