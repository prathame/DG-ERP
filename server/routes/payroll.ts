import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

// ============ STAFF DIRECTORY ============
router.get('/api/staff', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { search } = req.query;
    let sql = `SELECT s.*,
      COALESCE((SELECT SUM(amount) FROM staff_payments WHERE staff_name = s.name AND tenant_id = $1 AND payment_type IN ('salary','bonus')), 0) as total_paid,
      COALESCE((SELECT SUM(amount) FROM staff_payments WHERE staff_name = s.name AND tenant_id = $1 AND payment_type = 'advance'), 0) as total_advance,
      COALESCE((SELECT SUM(amount) FROM staff_payments WHERE staff_name = s.name AND tenant_id = $1 AND payment_type = 'advance_repay'), 0) as total_repaid,
      COALESCE((SELECT COUNT(*) FROM staff_payments WHERE staff_name = s.name AND tenant_id = $1), 0) as payment_count,
      (SELECT MAX(payment_date) FROM staff_payments WHERE staff_name = s.name AND tenant_id = $1) as last_payment
      FROM staff_members s WHERE s.tenant_id = $1`;
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) { sql += ` AND (s.name ILIKE $2 OR s.phone ILIKE $2 OR s.role ILIKE $2)`; params.push(`%${search}%`); }
    sql += ' ORDER BY s.name';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, phone: r.phone, role: r.role, address: r.address,
      salary: Number(r.salary) || 0, joiningDate: r.joining_date, status: r.status,
      totalPaid: Number(r.total_paid), totalAdvance: Number(r.total_advance), totalRepaid: Number(r.total_repaid),
      advanceBalance: Math.max(0, Number(r.total_advance) - Number(r.total_repaid)),
      paymentCount: Number(r.payment_count), lastPayment: r.last_payment,
    })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/staff', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, phone, role, address, salary, joiningDate } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Staff name is required' });
    const dup = (await pool.query('SELECT id FROM staff_members WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [tenantId, name.trim()])).rows[0];
    if (dup) return res.status(400).json({ error: `"${name}" already exists` });
    const id = uid('STF');
    await pool.query(
      'INSERT INTO staff_members (id, tenant_id, name, phone, role, address, salary, joining_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, tenantId, name.trim(), phone || null, role || null, address || null, salary ? Number(salary) : null, joiningDate || null]
    );
    await logAudit(pool, tenantId, 'Staff Added', 'staff', id, `${name.trim()}${role ? ` (${role})` : ''}`);
    res.status(201).json({ id, name: name.trim(), phone, role, address, salary: Number(salary) || 0, joiningDate, status: 'active', totalPaid: 0, paymentCount: 0, lastPayment: null });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/staff/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, phone, role, address, salary, status } = req.body;
    const result = await pool.query(
      'UPDATE staff_members SET name=COALESCE($1,name), phone=$2, role=$3, address=$4, salary=$5, status=COALESCE($6,status) WHERE id=$7 AND tenant_id=$8',
      [name, phone || null, role || null, address || null, salary ? Number(salary) : null, status, req.params.id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Staff not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/staff/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const staff = (await pool.query('SELECT name FROM staff_members WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])).rows[0] as { name: string } | undefined;
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    await pool.query('DELETE FROM staff_payments WHERE staff_name = $1 AND tenant_id = $2', [staff.name, tenantId]);
    await pool.query('DELETE FROM staff_members WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    await logAudit(pool, tenantId, 'Staff Deleted', 'staff', req.params.id, `${staff.name} removed with all payment records`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

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
      paymentType: (r.payment_type as string) || 'salary',
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
    const { staffName, amount, paymentDate, paymentType, paymentMethod, referenceNumber, notes, month, year } = req.body;
    if (!staffName?.trim()) return res.status(400).json({ error: 'Staff name is required' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    const validTypes = ['salary', 'advance', 'advance_repay', 'bonus', 'deduction'];
    const pType = validTypes.includes(paymentType) ? paymentType : 'salary';
    const id = uid('SP');
    const date = paymentDate || new Date().toISOString().slice(0, 10);
    const d = new Date(date);
    const m = month || String(d.getMonth() + 1).padStart(2, '0');
    const y = year || d.getFullYear();
    await pool.query(
      'INSERT INTO staff_payments (id, tenant_id, staff_name, amount, payment_date, payment_type, payment_method, reference_number, notes, month, year) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [id, tenantId, staffName.trim(), Number(amount), date, pType, paymentMethod || 'Cash', referenceNumber || null, notes || null, m, y]
    );
    const typeLabel = { salary: 'Salary', advance: 'Advance Given', advance_repay: 'Advance Repaid', bonus: 'Bonus', deduction: 'Deduction' }[pType] || pType;
    await logAudit(pool, tenantId, 'Staff Payment', 'payroll', id, `${typeLabel}: ₹${Number(amount).toLocaleString()} — ${staffName.trim()}`);
    res.status(201).json({ id, staffName: staffName.trim(), amount: Number(amount), paymentDate: date, paymentType: pType, paymentMethod: paymentMethod || 'Cash', referenceNumber, notes, month: m, year: y });
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
