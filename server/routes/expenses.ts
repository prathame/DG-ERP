import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { parsePagination } from '../utils/pagination';

const router = Router();

router.get('/api/expenses', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { category, from, to } = req.query;
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    let where = 'WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (typeof category === 'string' && category) {
      where += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (typeof from === 'string' && from) {
      where += ` AND expense_date >= $${idx++}`;
      params.push(from);
    }
    if (typeof to === 'string' && to) {
      where += ` AND expense_date <= $${idx++}`;
      params.push(to);
    }
    const total = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM expenses ${where}`, params)).rows[0].c);
    const { rows } = await pool.query(
      `SELECT * FROM expenses ${where} ORDER BY expense_date DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    );
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        category: r.category,
        description: r.description,
        amount: Number(r.amount),
        expenseDate: r.expense_date,
        paymentMethod: r.payment_method,
        referenceNumber: r.reference_number,
        notes: r.notes,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/expenses/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const year = parseInt(String(req.query.year), 10) || new Date().getFullYear();
    const byCategory = (
      await pool.query(
        'SELECT category, SUM(amount) as total, COUNT(*) as count FROM expenses WHERE tenant_id = $1 AND EXTRACT(YEAR FROM expense_date) = $2 GROUP BY category ORDER BY total DESC',
        [tenantId, year],
      )
    ).rows as { category: string; total: number; count: number }[];
    const byMonth = (
      await pool.query(
        "SELECT to_char(expense_date, 'YYYY-MM') as month, SUM(amount) as total FROM expenses WHERE tenant_id = $1 AND EXTRACT(YEAR FROM expense_date) = $2 GROUP BY to_char(expense_date, 'YYYY-MM') ORDER BY month",
        [tenantId, year],
      )
    ).rows as { month: string; total: number }[];
    const grand = byCategory.reduce((s, r) => s + Number(r.total), 0);
    res.json({
      year,
      grandTotal: grand,
      byCategory: byCategory.map(r => ({ category: r.category, total: Number(r.total), count: Number(r.count) })),
      byMonth: byMonth.map(r => ({ month: r.month, total: Number(r.total) })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/expenses', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { category, description, amount, expenseDate, paymentMethod, referenceNumber, notes } = req.body;
    if (!category?.trim()) return res.status(400).json({ error: 'Category is required' });
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    if (parsedAmount > 100_000_000) return res.status(400).json({ error: 'Amount exceeds maximum limit' });
    const id = uid('EXP');
    const date = expenseDate || new Date().toISOString().slice(0, 10);
    await pool.query(
      'INSERT INTO expenses (id, tenant_id, category, description, amount, expense_date, payment_method, reference_number, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        tenantId,
        category.trim(),
        description || null,
        parsedAmount,
        date,
        paymentMethod || 'Cash',
        referenceNumber || null,
        notes || null,
      ],
    );
    await logAudit(pool, tenantId, 'Expense Recorded', 'expense', id, `${category}: ₹${parsedAmount.toLocaleString()}`);
    res.status(201).json({
      id,
      category: category.trim(),
      description,
      amount: parsedAmount,
      expenseDate: date,
      paymentMethod: paymentMethod || 'Cash',
      referenceNumber,
      notes,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/expenses/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
