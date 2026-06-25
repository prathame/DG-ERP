import { Router } from 'express';
import { pool } from '../pg-db';
import { parsePagination, applyDateFilter, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/transactions', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    let where = 'WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    where += applyDateFilter(req.query as Record<string, unknown>, 'date', params);
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const total = (await pool.query(`SELECT COUNT(*) as c FROM transactions ${where}`, params)).rows[0].c;
    const countParams = [...params];
    const pIdx = params.length + 1;
    params.push(limit, offset);
    const rows = (await pool.query(`SELECT * FROM transactions ${where} ORDER BY date DESC LIMIT $${pIdx} OFFSET $${pIdx + 1}`, params)).rows;
    const transactions = rows.map((r: Record<string, unknown>) => ({
      id: r.id, date: r.date, type: r.type, amount: r.amount, description: r.description, status: r.status,
    }));
    const allForTotals = (await pool.query(`SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions ${where} GROUP BY type`, countParams)).rows as { type: string; total: number }[];
    const income = Number(allForTotals.find((t) => t.type === 'Sales')?.total ?? 0);
    const expense = allForTotals.filter((t) => t.type !== 'Sales').reduce((s, t) => s + Number(t.total), 0);
    res.json({ data: transactions, total: Number(total), page, totalPages: Math.ceil(Number(total) / limit), income, expense });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/transactions', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { date, type, amount, description, status } = req.body;
    const id = `T${Date.now()}`;
    await pool.query(
      'INSERT INTO transactions (id, tenant_id, date, type, amount, description, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, tenantId, date ?? new Date().toISOString().slice(0, 10), type, amount, description, status ?? 'Completed']
    );
    const row = (await pool.query('SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.status(201).json({
      id: row.id, date: row.date, type: row.type, amount: row.amount, description: row.description, status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/transactions/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { date, type, amount, description, status } = req.body;
    const result = await pool.query(
      `UPDATE transactions SET
        date = COALESCE($1, date),
        type = COALESCE($2, type),
        amount = COALESCE($3, amount),
        description = COALESCE($4, description),
        status = COALESCE($5, status)
      WHERE id = $6 AND tenant_id = $7`,
      [date, type, amount, description, status, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Transaction not found' });
    const row = (await pool.query('SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({
      id: row.id, date: row.date, type: row.type, amount: row.amount, description: row.description, status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/transactions/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const result = await pool.query('DELETE FROM transactions WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
