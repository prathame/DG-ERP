import { Router } from 'express';
import { pool } from '../pg-db';
import { hashPassword, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/vendors', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search } = req.query;
    let sql = 'SELECT * FROM vendors WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) {
      sql = 'SELECT * FROM vendors WHERE tenant_id = $1 AND (name ILIKE $2 OR contact_person ILIKE $3 OR phone ILIKE $4 OR email ILIKE $5)';
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
      gstNumber: r.gst_number ?? null,
    }));
    res.json(list);
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/vendors', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, contactPerson, phone, email, address } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Vendor name is required' });
    if (phone && !/^\+?\d[\d\s-]{6,14}$/.test(phone.trim())) return res.status(400).json({ error: 'Invalid phone number' });

    const duplicate = (await pool.query(
      'SELECT id, name FROM vendors WHERE tenant_id = $1 AND (LOWER(name) = LOWER($2) OR (email IS NOT NULL AND email != \'\' AND LOWER(email) = LOWER($3)))',
      [tenantId, name.trim(), email || '']
    )).rows[0] as { id: string; name: string } | undefined;
    if (duplicate) return res.status(400).json({ error: `Vendor "${duplicate.name}" already exists` });

    const id = `V${Date.now()}`;
    await pool.query(
      'INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, tenantId, name.trim(), contactPerson, phone?.trim() || null, email, address]
    );
    const row = (await pool.query('SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    let credentials: { email: string; password: string } | null = null;
    const vendorPortal = (await pool.query('SELECT vendor_portal_enabled FROM tenants WHERE id = $1', [tenantId])).rows[0];
    const portalEnabled = vendorPortal?.vendor_portal_enabled === true;
    if (portalEnabled && email && typeof email === 'string' && email.includes('@')) {
      const existing = (await pool.query('SELECT id FROM users WHERE email = $1 AND tenant_id = $2', [email, tenantId])).rows[0];
      if (!existing) {
        const crypto = await import('crypto');
        const defaultPassword = crypto.randomBytes(12).toString('base64url');
        const userId = `U${Date.now()}`;
        const perms = JSON.stringify(['dashboard', 'sales', 'distribution', 'warranty', 'replacements', 'rewards', 'settings']);
        await pool.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Vendor', $8, $9, $10)`,
          [userId, tenantId, email, hashPassword(defaultPassword), contactPerson || name || '', phone || null, address || null, name || null, perms, id]
        );
        credentials = { email, password: defaultPassword };
      }
    }
    res.status(201).json({
      id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, totalSales: 0, totalRewardPoints: 0, gstNumber: row.gst_number ?? null,
      credentials,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/vendors/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, contactPerson, phone, email, address, gstNumber } = req.body;
    if (phone && !/^\+?\d[\d\s-]{6,14}$/.test(phone.trim())) return res.status(400).json({ error: 'Invalid phone number' });
    if (name) {
      const dup = (await pool.query('SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id != $3', [tenantId, name.trim(), id])).rows[0];
      if (dup) return res.status(400).json({ error: `Vendor "${name}" already exists` });
    }
    const result = await pool.query(
      'UPDATE vendors SET name=COALESCE($1,name), contact_person=COALESCE($2,contact_person), phone=COALESCE($3,phone), email=COALESCE($4,email), address=COALESCE($5,address), gst_number=COALESCE($8,gst_number) WHERE id=$6 AND tenant_id=$7',
      [name, contactPerson, phone?.trim() || null, email, address, id, tenantId, gstNumber ?? null]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    const row = (await pool.query('SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({ id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, totalSales: row.total_sales ?? 0, totalRewardPoints: row.total_reward_points ?? 0, gstNumber: row.gst_number ?? null });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/vendors/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const hasDistributions = (await pool.query("SELECT 1 FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2 LIMIT 1", [id, tenantId])).rows[0];
    if (hasDistributions) return res.status(400).json({ error: 'Cannot delete vendor with existing distributions. Remove distributions first.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM rewards WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM users WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('UPDATE customers SET vendor_id = NULL WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      const result = await client.query('DELETE FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      if (result.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Vendor not found' }); }
      await client.query('COMMIT');
      res.status(204).send();
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
