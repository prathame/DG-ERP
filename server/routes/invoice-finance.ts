import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';

const router = Router();

/** partyKey: vendor:ID | customer:ID | name:DisplayName (legacy unlinked invoices) */
export function parsePartyKey(raw: string): {
  partyType: 'vendor' | 'customer' | null;
  partyId: string | null;
  clientName: string | null;
  partyKey: string;
} {
  const key = decodeURIComponent(raw || '').trim();
  if (key.startsWith('vendor:') || key.startsWith('customer:')) {
    const i = key.indexOf(':');
    const partyType = key.slice(0, i) as 'vendor' | 'customer';
    const partyId = key.slice(i + 1).trim();
    if (!partyId) {
      return { partyType: null, partyId: null, clientName: '', partyKey: 'name:' };
    }
    return { partyType, partyId, clientName: null, partyKey: `${partyType}:${partyId}` };
  }
  const name = key.startsWith('name:') ? key.slice(5) : key;
  return { partyType: null, partyId: null, clientName: name, partyKey: `name:${name}` };
}

// Client-wise summary: prefer stable party_id grouping; fall back to customer_name
router.get('/api/invoice-finance/summary', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (
      await pool.query(
        `
      SELECT
        CASE
          WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL
            THEN si.party_type || ':' || si.party_id
          ELSE 'name:' || si.customer_name
        END AS party_key,
        MAX(si.party_type) AS party_type,
        MAX(si.party_id) AS party_id,
        MAX(si.customer_name) AS customer_name,
        MAX(si.customer_phone) AS customer_phone,
        COUNT(si.id) AS invoice_count,
        SUM(si.grand_total) AS total_invoiced,
        COALESCE(SUM(ip.paid), 0) AS total_paid
      FROM standalone_invoices si
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as paid
        FROM invoice_payments WHERE tenant_id = $1
        GROUP BY invoice_id
      ) ip ON si.id = ip.invoice_id
      WHERE si.tenant_id = $1 AND si.status != 'cancelled'
      GROUP BY 1
      ORDER BY (SUM(si.grand_total) - COALESCE(SUM(ip.paid), 0)) DESC
    `,
        [tenantId],
      )
    ).rows;

    res.json(
      rows.map((r: Record<string, unknown>) => ({
        partyKey: r.party_key as string,
        partyType: (r.party_type as string) || null,
        partyId: (r.party_id as string) || null,
        clientName: r.customer_name as string,
        clientPhone: (r.customer_phone as string) || null,
        invoiceCount: Number(r.invoice_count) || 0,
        totalInvoiced: Number(r.total_invoiced) || 0,
        totalPaid: Number(r.total_paid) || 0,
        balance: (Number(r.total_invoiced) || 0) - (Number(r.total_paid) || 0),
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Invoices for a party key (vendor:ID / customer:ID / name:… or plain name for legacy)
router.get('/api/invoice-finance/client/:clientName', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { partyType, partyId, clientName, partyKey } = parsePartyKey(req.params.clientName);

    let invoices;
    let payments;
    if (partyType && partyId) {
      invoices = (
        await pool.query(
          `
        SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
          si.grand_total, si.subtotal, si.tax_total, si.status, si.notes,
          si.customer_name, si.customer_phone, si.customer_gstin, si.customer_address,
          si.party_type, si.party_id,
          COALESCE(SUM(ip.amount), 0) as paid
        FROM standalone_invoices si
        LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $1
        WHERE si.tenant_id = $1 AND si.party_type = $2 AND si.party_id = $3 AND si.status != 'cancelled'
        GROUP BY si.id ORDER BY si.invoice_date DESC
      `,
          [tenantId, partyType, partyId],
        )
      ).rows;
      payments = (
        await pool.query(
          `
        SELECT ip.*, si.invoice_number
        FROM invoice_payments ip
        JOIN standalone_invoices si ON ip.invoice_id = si.id AND si.tenant_id = $1
        WHERE ip.tenant_id = $1 AND si.party_type = $2 AND si.party_id = $3
        ORDER BY ip.payment_date DESC, ip.created_at DESC
      `,
          [tenantId, partyType, partyId],
        )
      ).rows;
    } else {
      invoices = (
        await pool.query(
          `
        SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
          si.grand_total, si.subtotal, si.tax_total, si.status, si.notes,
          si.customer_name, si.customer_phone, si.customer_gstin, si.customer_address,
          si.party_type, si.party_id,
          COALESCE(SUM(ip.amount), 0) as paid
        FROM standalone_invoices si
        LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $1
        WHERE si.tenant_id = $1 AND si.customer_name = $2
          AND (si.party_type IS NULL OR si.party_id IS NULL)
          AND si.status != 'cancelled'
        GROUP BY si.id ORDER BY si.invoice_date DESC
      `,
          [tenantId, clientName],
        )
      ).rows;
      payments = (
        await pool.query(
          `
        SELECT ip.*, si.invoice_number
        FROM invoice_payments ip
        JOIN standalone_invoices si ON ip.invoice_id = si.id AND si.tenant_id = $1
        WHERE ip.tenant_id = $1 AND si.customer_name = $2
          AND (si.party_type IS NULL OR si.party_id IS NULL)
        ORDER BY ip.payment_date DESC, ip.created_at DESC
      `,
          [tenantId, clientName],
        )
      ).rows;
    }

    const displayName = (invoices[0]?.customer_name as string) || clientName || partyId || 'Client';
    const totalInvoiced = invoices.reduce((s, r) => s + (Number(r.grand_total) || 0), 0);
    const totalPaid = invoices.reduce((s, r) => s + (Number(r.paid) || 0), 0);

    res.json({
      partyKey,
      partyType,
      partyId,
      clientName: displayName,
      clientPhone: (invoices[0]?.customer_phone as string) || null,
      customerGstin: (invoices[0]?.customer_gstin as string) || null,
      customerAddress: (invoices[0]?.customer_address as string) || null,
      totalInvoiced,
      totalPaid,
      balance: totalInvoiced - totalPaid,
      invoices: invoices.map((r: Record<string, unknown>) => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        invoiceDate: r.invoice_date,
        dueDate: r.due_date,
        grandTotal: Number(r.grand_total) || 0,
        subtotal: Number(r.subtotal) || 0,
        taxTotal: Number(r.tax_total) || 0,
        paid: Number(r.paid) || 0,
        balance: (Number(r.grand_total) || 0) - (Number(r.paid) || 0),
        status: r.status,
        notes: r.notes,
      })),
      payments: payments.map((r: Record<string, unknown>) => ({
        id: r.id,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        amount: Number(r.amount) || 0,
        paymentDate: r.payment_date,
        paymentMethod: r.payment_method,
        referenceNumber: r.reference_number,
        notes: r.notes,
      })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Record a payment against one or more invoices
router.post('/api/invoice-finance/payments', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { invoiceId, amount, paymentDate, paymentMethod, referenceNumber, notes, clientName } = req.body;
    if (!invoiceId || !amount || Number(amount) <= 0)
      return res.status(400).json({ error: 'Invoice ID and positive amount required' });

    const payAmt = Number(amount);
    const pDate = paymentDate || new Date().toISOString().slice(0, 10);
    const id = uid('IP');

    await client.query('BEGIN');
    const inv = (
      await client.query(
        'SELECT id, grand_total, customer_name FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 AND status != $3 FOR UPDATE',
        [invoiceId, tenantId, 'cancelled'],
      )
    ).rows[0] as { id: string; grand_total: number; customer_name: string } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const alreadyPaid = Number(
      (
        await client.query(
          'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
          [invoiceId, tenantId],
        )
      ).rows[0].t,
    );
    const remaining = Number(inv.grand_total) - alreadyPaid;
    if (payAmt > remaining + 0.001) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: `Payment exceeds remaining balance (₹${Math.max(0, remaining).toFixed(2)})` });
    }

    await client.query(
      'INSERT INTO invoice_payments (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, tenantId, invoiceId, payAmt, pDate, paymentMethod || 'Cash', referenceNumber || null, notes || null],
    );

    // Auto-mark invoice as paid if fully paid
    const totalPaid = alreadyPaid + payAmt;
    if (totalPaid >= Number(inv.grand_total)) {
      await client.query("UPDATE standalone_invoices SET status = 'paid' WHERE id = $1 AND tenant_id = $2", [
        invoiceId,
        tenantId,
      ]);
    }

    await client.query('COMMIT');
    await logAudit(
      pool,
      tenantId,
      'Invoice Payment',
      'invoice_payment',
      id,
      `₹${payAmt.toLocaleString()} for ${inv.customer_name}`,
    );
    res.status(201).json({ id, invoiceId, amount: payAmt, paymentDate: pDate, paymentMethod: paymentMethod || 'Cash' });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

// Delete a payment (locks invoice so concurrent pay/delete can't race)
router.delete('/api/invoice-finance/payments/:id', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    await client.query('BEGIN');
    const payment = (
      await client.query(
        'SELECT id, invoice_id, amount FROM invoice_payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [req.params.id, tenantId],
      )
    ).rows[0] as { id: string; invoice_id: string; amount: number } | undefined;
    if (!payment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found' });
    }

    const inv = (
      await client.query(
        'SELECT id, grand_total, status FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [payment.invoice_id, tenantId],
      )
    ).rows[0] as { id: string; grand_total: number; status: string } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found for payment' });
    }

    await client.query('DELETE FROM invoice_payments WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);

    const remaining = Number(
      (
        await client.query(
          'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
          [payment.invoice_id, tenantId],
        )
      ).rows[0].t,
    );
    if (remaining + 0.001 < Number(inv.grand_total) && inv.status === 'paid') {
      await client.query(
        "UPDATE standalone_invoices SET status = 'sent', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [payment.invoice_id, tenantId],
      );
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

export default router;
