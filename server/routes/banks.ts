import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';

const router = Router();

router.get('/api/banks', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search } = req.query;
    let sql = 'SELECT * FROM banks WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) {
      sql =
        'SELECT * FROM banks WHERE tenant_id = $1 AND (name ILIKE $2 OR account_number ILIKE $3 OR bank_name ILIKE $4 OR ifsc_code ILIKE $5)';
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
    return handleApiError(req, res, err);
  }
});

// Batch create — all-or-nothing (CSV import)
router.post('/api/banks/batch', requireAdmin, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { items } = req.body as { items: Record<string, unknown>[] };
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items to import' });

    await client.query('BEGIN');
    let count = 0;
    for (const r of items) {
      const name = String(r.name || '').trim();
      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: Name is required — no banks were imported` });
      }
      const acNo = String(r.accountNumber || '').trim();
      if (acNo) {
        const dup = (
          await client.query('SELECT id FROM banks WHERE tenant_id = $1 AND account_number = $2', [tenantId, acNo])
        ).rows[0];
        if (dup) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Account "${acNo}" already exists — no banks were imported` });
        }
      }
      const id = uid('B');
      await client.query(
        'INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, tenantId, name, acNo || null, r.bankName || null, r.branch || null, r.ifscCode || null],
      );
      count++;
    }
    await client.query('COMMIT');
    await logAudit(
      pool,
      tenantId,
      'Banks Batch Import',
      'bank',
      `batch-${Date.now()}`,
      `${count} banks imported via CSV`,
    );
    res.status(201).json({ success: count, errors: [] });
  } catch (e) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, e, 'Bank import failed', { publicMessage: 'Import failed — no banks were added' });
  } finally {
    client.release();
  }
});

router.post('/api/banks', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, accountNumber, bankName, branch, ifscCode } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Account name is required' });
    if (accountNumber) {
      const dup = (
        await pool.query('SELECT id FROM banks WHERE tenant_id = $1 AND account_number = $2', [tenantId, accountNumber])
      ).rows[0];
      if (dup) return res.status(400).json({ error: `Account number "${accountNumber}" already exists` });
    }
    const id = uid('B');
    await pool.query(
      'INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, tenantId, name.trim(), accountNumber, bankName, branch, ifscCode],
    );
    const row = (await pool.query('SELECT * FROM banks WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res
      .status(201)
      .json({
        id: row.id,
        name: row.name,
        accountNumber: row.account_number,
        bankName: row.bank_name,
        branch: row.branch,
        ifscCode: row.ifsc_code,
      });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/banks/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, accountNumber, bankName, branch, ifscCode } = req.body;
    const result = await pool.query(
      'UPDATE banks SET name=COALESCE($1,name), account_number=COALESCE($2,account_number), bank_name=COALESCE($3,bank_name), branch=COALESCE($4,branch), ifsc_code=COALESCE($5,ifsc_code) WHERE id=$6 AND tenant_id=$7',
      [name, accountNumber, bankName, branch, ifscCode, id, tenantId],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Bank not found' });
    const row = (await pool.query('SELECT * FROM banks WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({
      id: row.id,
      name: row.name,
      accountNumber: row.account_number,
      bankName: row.bank_name,
      branch: row.branch,
      ifscCode: row.ifsc_code,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/banks/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const result = await pool.query('DELETE FROM banks WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Bank not found' });
    res.status(204).send();
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
