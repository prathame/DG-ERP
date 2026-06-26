import { Router } from 'express';
import { pool } from '../pg-db';
import { logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/banks', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search } = req.query;
    let sql = 'SELECT * FROM banks WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) {
      sql = 'SELECT * FROM banks WHERE tenant_id = $1 AND (name LIKE $2 OR account_number LIKE $3 OR bank_name LIKE $4 OR ifsc_code LIKE $5)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name';
    const { rows } = await pool.query(sql, params);
    const list = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      accountNumber: r.account_number,
      bankName: r.bank_name,
      branch: r.branch,
      ifscCode: r.ifsc_code,
    }));
    res.json(list);
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/banks', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, accountNumber, bankName, branch, ifscCode } = req.body;
    const id = `B${Date.now()}`;
    await pool.query(
      'INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, tenantId, name ?? '', accountNumber, bankName, branch, ifscCode]
    );
    const row = (await pool.query('SELECT * FROM banks WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.status(201).json({ id: row.id, name: row.name, accountNumber: row.account_number, bankName: row.bank_name, branch: row.branch, ifscCode: row.ifsc_code });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/banks/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, accountNumber, bankName, branch, ifscCode } = req.body;
    const result = await pool.query(
      'UPDATE banks SET name=COALESCE($1,name), account_number=COALESCE($2,account_number), bank_name=COALESCE($3,bank_name), branch=COALESCE($4,branch), ifsc_code=COALESCE($5,ifsc_code) WHERE id=$6 AND tenant_id=$7',
      [name, accountNumber, bankName, branch, ifscCode, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Bank not found' });
    const row = (await pool.query('SELECT * FROM banks WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({ id: row.id, name: row.name, accountNumber: row.account_number, bankName: row.bank_name, branch: row.branch, ifscCode: row.ifsc_code });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/banks/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const result = await pool.query('DELETE FROM banks WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Bank not found' });
    res.status(204).send();
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
