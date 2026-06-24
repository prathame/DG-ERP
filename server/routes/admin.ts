import { Router } from 'express';
import { db } from '../db';
import { hashPassword } from '../utils/helpers';

const router = Router();

const ADMIN_ROLES = ['Admin', 'Super Admin'];

function isAdmin(role: string | undefined) {
  return role && ADMIN_ROLES.includes(role);
}

router.get('/api/admin/users', (req, res) => {
  try {
    const { adminUserId } = req.query;
    if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });
    const rows = db.prepare('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users ORDER BY name').all() as Record<string, unknown>[];
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

router.post('/api/admin/users', (req, res) => {
  try {
    const { adminUserId, email, password, name, phone, address, role, companyName, permissions, vendorId } = req.body;
    if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required' });
    if (role === 'Vendor' && !vendorId) return res.status(400).json({ error: 'Vendor role requires vendorId' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const id = `U${Date.now()}`;
    const permsJson = permissions && Array.isArray(permissions) ? JSON.stringify(permissions) : null;
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, hashPassword(password), name ?? '', phone ?? null, address ?? null, role ?? 'Staff', companyName ?? null, permsJson, role === 'Vendor' ? vendorId : null);
    const row = db.prepare('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users WHERE id = ?').get(id) as Record<string, unknown>;
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

router.put('/api/admin/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { adminUserId, role, permissions, vendorId } = req.body;
    if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });
    const updates: string[] = [];
    const params: unknown[] = [];
    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(Array.isArray(permissions) ? JSON.stringify(permissions) : null);
    }
    if (vendorId !== undefined) {
      updates.push('vendor_id = ?');
      params.push(vendorId || null);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    params.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
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
