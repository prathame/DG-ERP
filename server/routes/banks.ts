import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/api/banks', (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM banks ORDER BY name';
    const params: string[] = [];
    if (typeof search === 'string' && search) {
      sql = 'SELECT * FROM banks WHERE name LIKE ? OR account_number LIKE ? OR bank_name LIKE ? OR ifsc_code LIKE ? ORDER BY name';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const stmt = params.length ? db.prepare(sql) : db.prepare(sql);
    const rows = params.length ? stmt.all(...params) : stmt.all();
    const list = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      name: r.name,
      accountNumber: r.account_number,
      bankName: r.bank_name,
      branch: r.branch,
      ifscCode: r.ifsc_code,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/banks', (req, res) => {
  try {
    const { name, accountNumber, bankName, branch, ifscCode } = req.body;
    const id = `B${Date.now()}`;
    const stmt = db.prepare('INSERT INTO banks (id, name, account_number, bank_name, branch, ifsc_code) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(id, name ?? '', accountNumber, bankName, branch, ifscCode);
    const row = db.prepare('SELECT * FROM banks WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ id: row.id, name: row.name, accountNumber: row.account_number, bankName: row.bank_name, branch: row.branch, ifscCode: row.ifsc_code });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/banks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, accountNumber, bankName, branch, ifscCode } = req.body;
    const stmt = db.prepare('UPDATE banks SET name=COALESCE(?,name), account_number=COALESCE(?,account_number), bank_name=COALESCE(?,bank_name), branch=COALESCE(?,branch), ifsc_code=COALESCE(?,ifsc_code) WHERE id=?');
    const result = stmt.run(name, accountNumber, bankName, branch, ifscCode, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Bank not found' });
    const row = db.prepare('SELECT * FROM banks WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ id: row.id, name: row.name, accountNumber: row.account_number, bankName: row.bank_name, branch: row.branch, ifscCode: row.ifsc_code });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/banks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM banks WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Bank not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
