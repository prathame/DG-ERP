import { Router } from 'express';
import { pool } from '../pg-db';
import { hashPassword } from '../utils/helpers';

const router = Router();

router.get('/api/vendors', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search } = req.query;
    let sql = 'SELECT * FROM vendors WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) {
      sql = 'SELECT * FROM vendors WHERE tenant_id = $1 AND (name LIKE $2 OR contact_person LIKE $3 OR phone LIKE $4 OR email LIKE $5)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name';
    const { rows } = await pool.query(sql, params);
    const list = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      contactPerson: r.contact_person,
      phone: r.phone,
      email: r.email,
      address: r.address,
      totalSales: r.total_sales ?? 0,
      totalRewardPoints: r.total_reward_points ?? 0,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/vendors', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, contactPerson, phone, email, address } = req.body;
    const id = `V${Date.now()}`;
    await pool.query(
      'INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, tenantId, name ?? '', contactPerson, phone, email, address]
    );
    const row = (await pool.query('SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    let credentials: { email: string; password: string } | null = null;
    if (email && typeof email === 'string' && email.includes('@')) {
      const existing = (await pool.query('SELECT id FROM users WHERE email = $1 AND tenant_id = $2', [email, tenantId])).rows[0];
      if (!existing) {
        const defaultPassword = `${(name ?? 'vendor').replace(/\s+/g, '').toLowerCase()}@123`;
        const userId = `U${Date.now()}`;
        const perms = JSON.stringify(['dashboard', 'sales', 'distribution', 'warranty', 'replacements', 'rewards', 'masters', 'settings']);
        await pool.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Vendor', $8, $9, $10)`,
          [userId, tenantId, email, hashPassword(defaultPassword), contactPerson || name || '', phone || null, address || null, name || null, perms, id]
        );
        credentials = { email, password: defaultPassword };
      }
    }
    res.status(201).json({
      id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, totalSales: 0, totalRewardPoints: 0,
      credentials,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/vendors/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, contactPerson, phone, email, address } = req.body;
    const result = await pool.query(
      'UPDATE vendors SET name=COALESCE($1,name), contact_person=COALESCE($2,contact_person), phone=COALESCE($3,phone), email=COALESCE($4,email), address=COALESCE($5,address) WHERE id=$6 AND tenant_id=$7',
      [name, contactPerson, phone, email, address, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    const row = (await pool.query('SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({ id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, totalSales: row.total_sales ?? 0, totalRewardPoints: row.total_reward_points ?? 0 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/vendors/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const result = await pool.query('DELETE FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
