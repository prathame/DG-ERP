import { Router } from 'express';
import { db } from '../db';
import { parsePagination, applyDateFilter } from '../utils/helpers';

const router = Router();

router.get('/api/transactions', (req, res) => {
  try {
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    where += applyDateFilter(req.query as Record<string, unknown>, 'date', params);
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const total = (db.prepare(`SELECT COUNT(*) as c FROM transactions ${where}`).get(...params) as { c: number }).c;
    const countParams = [...params];
    params.push(limit, offset);
    const rows = db.prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC LIMIT ? OFFSET ?`).all(...params);
    const transactions = rows.map((r: Record<string, unknown>) => ({
      id: r.id, date: r.date, type: r.type, amount: r.amount, description: r.description, status: r.status,
    }));
    const allForTotals = db.prepare(`SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions ${where} GROUP BY type`).all(...countParams) as { type: string; total: number }[];
    const income = allForTotals.find((t) => t.type === 'Sales')?.total ?? 0;
    const expense = allForTotals.filter((t) => t.type !== 'Sales').reduce((s, t) => s + t.total, 0);
    res.json({ data: transactions, total, page, totalPages: Math.ceil(total / limit), income, expense });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/transactions', (req, res) => {
  try {
    const { date, type, amount, description, status } = req.body;
    const id = `T${Date.now()}`;
    const stmt = db.prepare(`
      INSERT INTO transactions (id, date, type, amount, description, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, date ?? new Date().toISOString().slice(0, 10), type, amount, description, status ?? 'Completed');
    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      date: row.date,
      type: row.type,
      amount: row.amount,
      description: row.description,
      status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/transactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { date, type, amount, description, status } = req.body;
    const stmt = db.prepare(`
      UPDATE transactions SET
        date = COALESCE(?, date),
        type = COALESCE(?, type),
        amount = COALESCE(?, amount),
        description = COALESCE(?, description),
        status = COALESCE(?, status)
      WHERE id = ?
    `);
    const result = stmt.run(date, type, amount, description, status, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({
      id: row.id,
      date: row.date,
      type: row.type,
      amount: row.amount,
      description: row.description,
      status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/transactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
