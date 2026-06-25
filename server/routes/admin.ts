import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../pg-db';
import { logAudit } from '../utils/helpers';

const router = Router();

const ADMIN_ROLES = ['Admin', 'Super Admin'];

function isAdmin(role: string | undefined) {
  return role && ADMIN_ROLES.includes(role);
}

router.get('/api/admin/users', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { adminUserId } = req.query;
    if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });

    const admin = (await pool.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [adminUserId, tenantId])).rows[0] as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });

    const rows = (await pool.query('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users WHERE tenant_id = $1 ORDER BY name', [tenantId])).rows as Record<string, unknown>[];
    res.json(rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      phone: r.phone,
      address: r.address,
      role: r.role,
      companyName: r.company_name,
      permissions: r.permissions ? JSON.parse(r.permissions as string) : null,
      vendorId: r.vendor_id ?? null,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/admin/users', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { adminUserId, email, password, name, phone, address, role, companyName, permissions, vendorId } = req.body;
    if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });

    const admin = (await pool.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [adminUserId, tenantId])).rows[0] as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required' });
    if (role === 'Vendor' && !vendorId) return res.status(400).json({ error: 'Vendor role requires vendorId' });

    const existing = (await pool.query('SELECT id FROM users WHERE email = $1 AND tenant_id = $2', [email, tenantId])).rows[0];
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const id = `U${Date.now()}`;
    const permsJson = permissions && Array.isArray(permissions) ? JSON.stringify(permissions) : null;
    const passwordHash = bcrypt.hashSync(password, 10);

    await pool.query(`
      INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, email, passwordHash, name ?? '', phone ?? null, address ?? null, role ?? 'Staff', companyName ?? null, permsJson, role === 'Vendor' ? vendorId : null, tenantId]);

    const row = (await pool.query('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      address: row.address,
      role: row.role,
      companyName: row.company_name,
      permissions: row.permissions ? JSON.parse(row.permissions as string) : null,
      vendorId: row.vendor_id ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/admin/users/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { adminUserId, role, permissions, vendorId } = req.body;
    if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });

    const admin = (await pool.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [adminUserId, tenantId])).rows[0] as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      params.push(Array.isArray(permissions) ? JSON.stringify(permissions) : null);
    }
    if (vendorId !== undefined) {
      updates.push(`vendor_id = $${paramIndex++}`);
      params.push(vendorId || null);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    params.push(id);
    params.push(tenantId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`, params);

    const row = (await pool.query('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      address: row.address,
      role: row.role,
      companyName: row.company_name,
      permissions: row.permissions ? JSON.parse(row.permissions as string) : null,
      vendorId: row.vendor_id ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
