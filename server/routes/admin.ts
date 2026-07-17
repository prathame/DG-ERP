import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { checkPlanLimit } from '../utils/planLimits';

const router = Router();

const ADMIN_ROLES = ['Admin', 'Super Admin'];

function isAdmin(role: string | undefined) {
  return role && ADMIN_ROLES.includes(role);
}

type AccessLevel = 'hidden' | 'view' | 'print' | 'full';
const ALL_MODULES = [
  'dashboard',
  'sales',
  'distribution',
  'inventory',
  'purchases',
  'quotations',
  'orders',
  'finance',
  'accounts',
  'warranty',
  'replacements',
  'rewards',
  'settings',
];

const ROLE_PRESETS: Record<string, Record<string, AccessLevel>> = {
  Admin: Object.fromEntries(ALL_MODULES.map(m => [m, 'full'])),
  Manager: Object.fromEntries(ALL_MODULES.map(m => [m, m === 'settings' ? 'view' : 'full'])),
  Staff: Object.fromEntries(ALL_MODULES.map(m => [m, 'view'])),
  Warehouse: {
    dashboard: 'view',
    sales: 'hidden',
    distribution: 'print',
    inventory: 'view',
    purchases: 'hidden',
    quotations: 'hidden',
    orders: 'hidden',
    finance: 'hidden',
    accounts: 'hidden',
    warranty: 'hidden',
    replacements: 'hidden',
    rewards: 'hidden',
    settings: 'hidden',
  },
  Vendor: {
    dashboard: 'view',
    sales: 'hidden',
    distribution: 'view',
    inventory: 'hidden',
    purchases: 'hidden',
    quotations: 'hidden',
    orders: 'hidden',
    finance: 'view',
    accounts: 'hidden',
    warranty: 'hidden',
    replacements: 'hidden',
    rewards: 'hidden',
    settings: 'hidden',
  },
};

function normalizePermissions(perms: unknown, role?: string): Record<string, AccessLevel> {
  if (perms && typeof perms === 'object' && !Array.isArray(perms)) return perms as Record<string, AccessLevel>;
  if (Array.isArray(perms))
    return Object.fromEntries(ALL_MODULES.map(m => [m, (perms as string[]).includes(m) ? 'full' : 'hidden']));
  return ROLE_PRESETS[role || 'Staff'] || ROLE_PRESETS.Staff;
}

router.get('/api/admin/users', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const jwtUser = (req as unknown as Record<string, unknown>).user as { userId?: string; role?: string } | undefined;
    if (!jwtUser?.userId) return res.status(401).json({ error: 'Authentication required' });

    const admin = (
      await pool.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [jwtUser.userId, tenantId])
    ).rows[0] as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });

    // Minimal fields for user management UI — no phone/address in list
    const rows = (
      await pool.query(
        'SELECT id, email, name, role, company_name, permissions, vendor_id FROM users WHERE tenant_id = $1 ORDER BY name',
        [tenantId],
      )
    ).rows as Record<string, unknown>[];
    res.json(
      rows.map(r => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        companyName: r.company_name,
        permissions: normalizePermissions(r.permissions ?? null, r.role as string),
        vendorId: r.vendor_id ?? null,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/admin/users', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const userLimitErr = await checkPlanLimit(tenantId, 'users');
    if (userLimitErr) return res.status(403).json(userLimitErr);

    const jwtUser = (req as unknown as Record<string, unknown>).user as { userId?: string; role?: string } | undefined;
    if (!jwtUser?.userId) return res.status(401).json({ error: 'Authentication required' });
    const { email, password, name, phone, address, role, companyName, permissions, vendorId } = req.body;

    const admin = (
      await pool.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [jwtUser.userId, tenantId])
    ).rows[0] as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required' });
    if (typeof password === 'string' && password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (role && role.toLowerCase().includes('super'))
      return res.status(400).json({ error: 'Cannot create Super Admin from tenant settings' });
    if (role === 'Vendor' && !vendorId) return res.status(400).json({ error: 'Vendor role requires vendorId' });
    if (vendorId) {
      const vendorExists = (
        await pool.query('SELECT 1 FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])
      ).rows[0];
      if (!vendorExists) return res.status(400).json({ error: 'Linked vendor not found' });
    }

    const existing = (
      await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2', [email, tenantId])
    ).rows[0];
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const id = uid('U');
    const finalPerms = permissions
      ? normalizePermissions(permissions, role)
      : ROLE_PRESETS[role || 'Staff'] || ROLE_PRESETS.Staff;
    const permsJson = JSON.stringify(finalPerms);
    const passwordHash = bcrypt.hashSync(password, 12);

    await pool.query(
      `
      INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
      [
        id,
        email,
        passwordHash,
        name ?? '',
        phone ?? null,
        address ?? null,
        role ?? 'Staff',
        companyName ?? null,
        permsJson,
        role === 'Vendor' ? vendorId : null,
        tenantId,
      ],
    );

    const row = (
      await pool.query(
        'SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users WHERE id = $1 AND tenant_id = $2',
        [id, tenantId],
      )
    ).rows[0] as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      address: row.address,
      role: row.role,
      companyName: row.company_name,
      permissions: normalizePermissions(row.permissions ?? null, row.role as string),
      vendorId: row.vendor_id ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/admin/role-presets', async (_req, res) => {
  res.json({ presets: ROLE_PRESETS, modules: ALL_MODULES });
});

router.put('/api/admin/users/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const jwtUser = (req as unknown as Record<string, unknown>).user as { userId?: string; role?: string } | undefined;
    if (!jwtUser?.userId) return res.status(401).json({ error: 'Authentication required' });
    const { role, permissions, vendorId } = req.body;

    const admin = (
      await pool.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [jwtUser.userId, tenantId])
    ).rows[0] as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });
    if (id === jwtUser.userId) return res.status(400).json({ error: 'Cannot edit your own permissions' });
    if (role && role.toLowerCase().includes('super'))
      return res.status(400).json({ error: 'Cannot assign Super Admin role' });

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const existing = (
      await pool.query('SELECT role, vendor_id FROM users WHERE id = $1 AND tenant_id = $2', [id, tenantId])
    ).rows[0] as { role: string; vendor_id: string | null } | undefined;
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const nextRole = role !== undefined ? role : existing.role;
    const nextVendorId = vendorId !== undefined ? vendorId || null : existing.vendor_id;
    if (nextRole === 'Vendor' && !nextVendorId) {
      return res.status(400).json({ error: 'Vendor role requires a linked vendorId' });
    }
    if (nextVendorId) {
      const vendorExists = (
        await pool.query('SELECT 1 FROM vendors WHERE id = $1 AND tenant_id = $2', [nextVendorId, tenantId])
      ).rows[0];
      if (!vendorExists) return res.status(400).json({ error: 'Linked vendor not found' });
    }

    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      const normalized = normalizePermissions(permissions, role);
      params.push(JSON.stringify(normalized));
    }
    if (vendorId !== undefined) {
      updates.push(`vendor_id = $${paramIndex++}`);
      params.push(vendorId || null);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    params.push(id);
    params.push(tenantId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
      params,
    );

    const row = (
      await pool.query(
        'SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id FROM users WHERE id = $1 AND tenant_id = $2',
        [id, tenantId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      address: row.address,
      role: row.role,
      companyName: row.company_name,
      permissions: normalizePermissions(row.permissions ?? null, row.role as string),
      vendorId: row.vendor_id ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Admin anonymizes a user (keeps FK integrity on sales/audit). */
router.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const jwtUser = (req as unknown as Record<string, unknown>).user as
      { userId?: string; role?: string; name?: string } | undefined;
    if (!jwtUser?.userId) return res.status(401).json({ error: 'Authentication required' });
    if (id === jwtUser.userId)
      return res.status(400).json({ error: 'Use account settings to delete your own account' });

    const admin = (
      await pool.query('SELECT role FROM users WHERE id = $1 AND tenant_id = $2', [jwtUser.userId, tenantId])
    ).rows[0] as { role: string } | undefined;
    if (!admin || !isAdmin(admin.role)) return res.status(403).json({ error: 'Admin access required' });

    const target = (await pool.query('SELECT id, role FROM users WHERE id = $1 AND tenant_id = $2', [id, tenantId]))
      .rows[0] as { id: string; role: string } | undefined;
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'Admin' || target.role === 'Super Admin') {
      const admins = (
        await pool.query(
          `SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND role IN ('Admin', 'Super Admin') AND id <> $2`,
          [tenantId, id],
        )
      ).rows[0] as { c: number };
      if (admins.c < 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }

    const anonEmail = `deleted-${id.toLowerCase()}@invalid.local`;
    await pool.query(
      `UPDATE users SET
         email = $1,
         name = 'Deleted User',
         phone = NULL,
         address = NULL,
         gst_number = NULL,
         password_hash = $2,
         password_changed_at = NOW(),
         vendor_id = NULL
       WHERE id = $3 AND tenant_id = $4`,
      [anonEmail, bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12), id, tenantId],
    );
    await logAudit(pool, tenantId, 'DELETE', 'user', id, 'Admin anonymized user', jwtUser.userId, jwtUser.name);
    res.json({ ok: true, message: 'User deleted' });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
