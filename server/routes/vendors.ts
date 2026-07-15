import { Router } from 'express';
import { checkPlanLimit } from '../utils/planLimits';
import { blockVendors, requireAdmin, AuthRequest, assertVendorLinked, vendorScopeId } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, hashPassword, logAudit, isValidPhone, isValidEmail, isValidGstin } from '../utils/helpers';

const router = Router();

router.get('/api/vendors', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const unlinked = assertVendorLinked(req);
    if (unlinked) return res.status(403).json({ error: unlinked });

    const jwtVendorId = vendorScopeId(req);

    const { search } = req.query;
    let sql = jwtVendorId
      ? 'SELECT * FROM vendors WHERE tenant_id = $1 AND id = $2'
      : 'SELECT * FROM vendors WHERE tenant_id = $1';
    const params: unknown[] = jwtVendorId ? [tenantId, jwtVendorId] : [tenantId];
    if (!jwtVendorId && typeof search === 'string' && search) {
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/vendors/bulk', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { vendors } = req.body as { vendors?: { name: string; contactPerson?: string; phone?: string; email?: string; address?: string }[] };
    if (!Array.isArray(vendors) || vendors.length === 0) return res.status(400).json({ error: 'Provide an array of vendors' });

    // Validate all rows first — fail fast
    for (let i = 0; i < vendors.length; i++) {
      const v = vendors[i];
      if (!v.name || !v.name.trim()) return res.status(400).json({ error: `Row ${i + 2}: Name is required — no vendors were imported` });
    }

    const vendorPortal = (await client.query('SELECT vendor_portal_enabled FROM tenants WHERE id = $1', [tenantId])).rows[0];
    const portalEnabled = vendorPortal?.vendor_portal_enabled === true;
    const slug = (await client.query('SELECT slug FROM tenants WHERE id = $1', [tenantId])).rows[0]?.slug as string | undefined;
    const crypto = await import('crypto');

    await client.query('BEGIN');
    let success = 0;
    const credentials: { name: string; email: string; password: string; url: string }[] = [];

    for (let i = 0; i < vendors.length; i++) {
      const v = vendors[i];
      const dup = (await client.query('SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [tenantId, v.name.trim()])).rows[0];
      if (dup) { await client.query('ROLLBACK'); return res.status(400).json({ error: `"${v.name}" already exists — no vendors were imported` }); }
      if (v.email) {
        const emailDup = (await client.query("SELECT id FROM vendors WHERE tenant_id = $1 AND email IS NOT NULL AND email != '' AND LOWER(email) = LOWER($2)", [tenantId, v.email])).rows[0];
        if (emailDup) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Email "${v.email}" already exists — no vendors were imported` }); }
      }
      const id = uid('V');
      await client.query(
        'INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address, gst_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, tenantId, v.name.trim(), v.contactPerson || null, v.phone?.trim() || null, v.email || null, v.address || null, (v as Record<string, unknown>).gstNumber || null]
      );
      if (portalEnabled && v.email && v.email.includes('@')) {
        const existing = (await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2', [v.email, tenantId])).rows[0];
        if (!existing) {
          const pw = crypto.randomBytes(12).toString('base64url');
          const userId = uid('U');
          const perms = JSON.stringify({ dashboard: 'view', sales: 'hidden', distribution: 'view', inventory: 'hidden', purchases: 'hidden', quotations: 'hidden', orders: 'hidden', finance: 'view', accounts: 'hidden', warranty: 'hidden', replacements: 'hidden', rewards: 'hidden', settings: 'hidden' });
          await client.query(
            `INSERT INTO users (id, tenant_id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'Vendor',$8,$9,$10)`,
            [userId, tenantId, v.email, hashPassword(pw), v.contactPerson || v.name, v.phone || null, v.address || null, v.name, perms, id]
          );
          credentials.push({ name: v.name, email: v.email, password: pw, url: slug ? `/${slug}` : '' });
        }
      }
      success++;
    }
    await client.query('COMMIT');
    await logAudit(pool, tenantId, 'Vendors Bulk Import', 'vendor', undefined, `${success} vendors imported`);
    res.json({ success, errors: [], credentials });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (e as Error).message);
    res.status(500).json({ error: 'Import failed — no vendors were added' });
  } finally { client.release(); }
});

router.post('/api/vendors', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vendorLimitErr = await checkPlanLimit(tenantId, 'vendors');
    if (vendorLimitErr) return res.status(403).json(vendorLimitErr);

    const { name, contactPerson, phone, email, address } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Vendor name is required' });
    if (phone && !isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone — must be 10-digit Indian mobile (6-9 start)' });
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    const gstNum = (req.body as Record<string, unknown>).gstNumber as string | undefined;
    if (gstNum && !isValidGstin(gstNum)) return res.status(400).json({ error: 'Invalid GSTIN — must be 15 characters (e.g. 24AABCT1332L1ZS)' });

    const duplicate = (await pool.query(
      'SELECT id, name FROM vendors WHERE tenant_id = $1 AND (LOWER(name) = LOWER($2) OR (email IS NOT NULL AND email != \'\' AND LOWER(email) = LOWER($3)))',
      [tenantId, name.trim(), email || '']
    )).rows[0] as { id: string; name: string } | undefined;
    if (duplicate) return res.status(400).json({ error: `Vendor "${duplicate.name}" already exists` });

    const id = uid('V');
    await pool.query(
      'INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address, gst_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, tenantId, name.trim(), contactPerson, phone?.trim() || null, email, address, req.body.gstNumber || null]
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
        const userId = uid('U');
        const perms = JSON.stringify({ dashboard: 'view', sales: 'hidden', distribution: 'view', inventory: 'hidden', purchases: 'hidden', quotations: 'hidden', orders: 'hidden', finance: 'view', accounts: 'hidden', warranty: 'hidden', replacements: 'hidden', rewards: 'hidden', settings: 'hidden' });
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/vendors/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, contactPerson, phone, email, address, gstNumber } = req.body;
    if (phone && !isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone — must be 10-digit Indian mobile (6-9 start)' });
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all vendors for tenant
router.delete('/api/vendors/all', requireAdmin, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    await client.query('BEGIN');
    const tables = ['price_lists', 'vendor_reminder_settings', 'vendor_payments', 'product_distribution', 'quotations', 'orders'];
    for (const t of tables) await client.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]);
    await client.query("DELETE FROM users WHERE tenant_id = $1 AND role = 'Vendor'", [tenantId]);
    const { rowCount } = await client.query("DELETE FROM vendors WHERE tenant_id = $1 AND id != 'OWNER'", [tenantId]);
    await client.query('COMMIT');
    await logAudit(pool, tenantId, 'Delete All Vendors', 'vendor', 'all', `${rowCount} vendors deleted`);
    res.json({ deleted: rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (e as Error).message);
    res.status(500).json({ error: 'Failed to delete vendors' });
  } finally { client.release(); }
});

router.delete('/api/vendors/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const hasDistributions = (await pool.query("SELECT 1 FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2 LIMIT 1", [id, tenantId])).rows[0];
    if (hasDistributions) return res.status(400).json({ error: 'Cannot delete vendor with existing distributions. Remove distributions first.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM price_lists WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM vendor_reminder_settings WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM rewards WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM users WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('UPDATE customers SET vendor_id = NULL WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('UPDATE quotations SET vendor_id = NULL WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('UPDATE orders SET vendor_id = NULL WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      const result = await client.query('DELETE FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      if (result.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Vendor not found' }); }
      await client.query('COMMIT');
      res.status(204).send();
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
