import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

// Client-wise summary: total invoiced, paid, outstanding
router.get('/api/invoice-finance/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (await pool.query(`
      SELECT si.customer_name, si.customer_phone,
        COUNT(si.id) as invoice_count,
        SUM(si.grand_total) as total_invoiced,
        COALESCE(SUM(ip.paid), 0) as total_paid
      FROM standalone_invoices si
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as paid
        FROM invoice_payments WHERE tenant_id = $1
        GROUP BY invoice_id
      ) ip ON si.id = ip.invoice_id
      WHERE si.tenant_id = $1 AND si.status != 'cancelled'
      GROUP BY si.customer_name, si.customer_phone
      ORDER BY (SUM(si.grand_total) - COALESCE(SUM(ip.paid), 0)) DESC
    `, [tenantId])).rows;

    res.json(rows.map((r: Record<string, unknown>) => ({
      clientName: r.customer_name as string,
      clientPhone: (r.customer_phone as string) || null,
      invoiceCount: Number(r.invoice_count) || 0,
      totalInvoiced: Number(r.total_invoiced) || 0,
      totalPaid: Number(r.total_paid) || 0,
      balance: (Number(r.total_invoiced) || 0) - (Number(r.total_paid) || 0),
    })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Invoices for a specific client + payment history per invoice
router.get('/api/invoice-finance/client/:clientName', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const clientName = decodeURIComponent(req.params.clientName);

    const invoices = (await pool.query(`
      SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
        si.grand_total, si.subtotal, si.tax_total, si.status, si.notes,
        COALESCE(SUM(ip.amount), 0) as paid
      FROM standalone_invoices si
      LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $1
      WHERE si.tenant_id = $1 AND si.customer_name = $2 AND si.status != 'cancelled'
      GROUP BY si.id ORDER BY si.invoice_date DESC
    `, [tenantId, clientName])).rows;

    const payments = (await pool.query(`
      SELECT ip.*, si.invoice_number
      FROM invoice_payments ip
      JOIN standalone_invoices si ON ip.invoice_id = si.id AND si.tenant_id = $1
      WHERE ip.tenant_id = $1 AND si.customer_name = $2
      ORDER BY ip.payment_date DESC, ip.created_at DESC
    `, [tenantId, clientName])).rows;

    const totalInvoiced = invoices.reduce((s, r) => s + (Number(r.grand_total) || 0), 0);
    const totalPaid = invoices.reduce((s, r) => s + (Number(r.paid) || 0), 0);

    res.json({
      clientName,
      totalInvoiced,
      totalPaid,
      balance: totalInvoiced - totalPaid,
      invoices: invoices.map((r: Record<string, unknown>) => ({
        id: r.id, invoiceNumber: r.invoice_number, invoiceDate: r.invoice_date,
        dueDate: r.due_date, grandTotal: Number(r.grand_total) || 0,
        subtotal: Number(r.subtotal) || 0, taxTotal: Number(r.tax_total) || 0,
        paid: Number(r.paid) || 0,
        balance: (Number(r.grand_total) || 0) - (Number(r.paid) || 0),
        status: r.status, notes: r.notes,
      })),
      payments: payments.map((r: Record<string, unknown>) => ({
        id: r.id, invoiceId: r.invoice_id, invoiceNumber: r.invoice_number,
        amount: Number(r.amount) || 0, paymentDate: r.payment_date,
        paymentMethod: r.payment_method, referenceNumber: r.reference_number, notes: r.notes,
      })),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Record a payment against one or more invoices
router.post('/api/invoice-finance/payments', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber, notes, clientName } = req.body;
    if (!invoiceId || !amount || Number(amount) <= 0) return res.status(400).json({ error: 'Invoice ID and positive amount required' });

    // Verify invoice belongs to tenant
    const inv = (await pool.query(
      'SELECT id, grand_total, customer_name FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 AND status != $3',
      [invoiceId, tenantId, 'cancelled']
    )).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const alreadyPaid = Number((await pool.query(
      'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
      [invoiceId, tenantId]
    )).rows[0].t);
    const payAmt = Number(amount);
    const remaining = Number(inv.grand_total) - alreadyPaid;
    if (payAmt > remaining + 0.001) {
      return res.status(400).json({ error: `Payment exceeds remaining balance (₹${Math.max(0, remaining).toFixed(2)})` });
    }

    const id = uid('IP');
    const pDate = paymentDate || new Date().toISOString().slice(0, 10);

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO invoice_payments (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, tenantId, invoiceId, payAmt, pDate, paymentMethod || 'Cash', referenceNumber || null, notes || null]
    );

    // Auto-mark invoice as paid if fully paid
    const totalPaid = alreadyPaid + payAmt;
    if (totalPaid >= Number(inv.grand_total)) {
      await client.query("UPDATE standalone_invoices SET status = 'paid' WHERE id = $1 AND tenant_id = $2", [invoiceId, tenantId]);
    }

    await client.query('COMMIT');
    await logAudit(pool, tenantId, 'Invoice Payment', 'invoice_payment', id, `₹${payAmt.toLocaleString()} for ${inv.customer_name}`);
    res.status(201).json({ id, invoiceId, amount: payAmt, paymentDate: pDate, paymentMethod: paymentMethod || 'Cash' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  } finally { client.release(); }
});

// Delete a payment
router.delete('/api/invoice-finance/payments/:id', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const payment = (await pool.query(
      'SELECT invoice_id, amount FROM invoice_payments WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    )).rows[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    await client.query('BEGIN');
    await client.query('DELETE FROM invoice_payments WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);

    // Revert invoice to unpaid if needed
    const remaining = Number((await client.query(
      'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
      [payment.invoice_id, tenantId]
    )).rows[0].t);
    const inv = (await client.query(
      'SELECT grand_total FROM standalone_invoices WHERE id = $1 AND tenant_id = $2',
      [payment.invoice_id, tenantId]
    )).rows[0];
    if (inv && remaining < Number(inv.grand_total)) {
      await client.query("UPDATE standalone_invoices SET status = 'unpaid' WHERE id = $1 AND tenant_id = $2 AND status = 'paid'", [payment.invoice_id, tenantId]);
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  } finally { client.release(); }
});

export default router;
