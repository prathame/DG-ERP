import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/payroll/staff', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { search } = req.query;
    let sql = `SELECT staff_name, SUM(amount) as total_paid, COUNT(*) as payment_count,
      MAX(payment_date) as last_payment, MIN(payment_date) as first_payment
      FROM staff_payments WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) { sql += ` AND staff_name ILIKE $2`; params.push(`%${search}%`); }
    sql += ' GROUP BY staff_name ORDER BY staff_name';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r: Record<string, unknown>) => ({
      name: r.staff_name, totalPaid: Number(r.total_paid), paymentCount: Number(r.payment_count),
      lastPayment: r.last_payment, firstPayment: r.first_payment,
    })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/payroll', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { month, year, staffName } = req.query;
    let sql = 'SELECT * FROM staff_payments WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (month && year) { sql += ` AND month = $${idx++} AND year = $${idx++}`; params.push(month, Number(year)); }
    if (typeof staffName === 'string' && staffName) { sql += ` AND staff_name ILIKE $${idx++}`; params.push(`%${staffName}%`); }
    sql += ' ORDER BY payment_date DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r: Record<string, unknown>) => ({
      id: r.id, staffName: r.staff_name, amount: Number(r.amount), paymentDate: r.payment_date,
      paymentMethod: r.payment_method, referenceNumber: r.reference_number, notes: r.notes,
      month: r.month, year: r.year,
    })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/payroll/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { year } = req.query;
    const y = parseInt(String(year), 10) || new Date().getFullYear();
    const byStaff = (await pool.query(
      'SELECT staff_name, SUM(amount) as total, COUNT(*) as payments FROM staff_payments WHERE tenant_id = $1 AND year = $2 GROUP BY staff_name ORDER BY total DESC',
      [tenantId, y]
    )).rows as { staff_name: string; total: number; payments: number }[];
    const byMonth = (await pool.query(
      'SELECT month, SUM(amount) as total, COUNT(*) as payments FROM staff_payments WHERE tenant_id = $1 AND year = $2 GROUP BY month ORDER BY month',
      [tenantId, y]
    )).rows as { month: string; total: number; payments: number }[];
    const grandTotal = Number((await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM staff_payments WHERE tenant_id = $1 AND year = $2', [tenantId, y])).rows[0].t);
    res.json({ year: y, grandTotal, byStaff: byStaff.map(r => ({ name: r.staff_name, total: Number(r.total), payments: Number(r.payments) })), byMonth: byMonth.map(r => ({ month: r.month, total: Number(r.total), payments: Number(r.payments) })) });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/payroll', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { staffName, amount, paymentDate, paymentMethod, referenceNumber, notes, month, year } = req.body;
    if (!staffName?.trim()) return res.status(400).json({ error: 'Staff name is required' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    const id = uid('SP');
    const date = paymentDate || new Date().toISOString().slice(0, 10);
    const d = new Date(date);
    const m = month || String(d.getMonth() + 1).padStart(2, '0');
    const y = year || d.getFullYear();
    await pool.query(
      'INSERT INTO staff_payments (id, tenant_id, staff_name, amount, payment_date, payment_method, reference_number, notes, month, year) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, tenantId, staffName.trim(), Number(amount), date, paymentMethod || 'Cash', referenceNumber || null, notes || null, m, y]
    );
    await logAudit(pool, tenantId, 'Staff Payment', 'payroll', id, `₹${Number(amount).toLocaleString()} paid to ${staffName.trim()}`);
    res.status(201).json({ id, staffName: staffName.trim(), amount: Number(amount), paymentDate: date, paymentMethod: paymentMethod || 'Cash', referenceNumber, notes, month: m, year: y });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/payroll/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM staff_payments WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Payment not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
