import { Router } from 'express';
import { checkPlanLimit } from '../utils/planLimits';
import { blockVendors, requireAdmin, AuthRequest, assertVendorLinked, vendorScopeId } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, hashPassword, logAudit, isValidPhone, isValidEmail, isValidGstin } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';

const router = Router();

type ShipToRow = Record<string, unknown>;

function mapShipTo(r: ShipToRow) {
  return {
    id: r.id as string,
    vendorId: r.vendor_id as string,
    label: (r.label as string) || null,
    name: r.name as string,
    gstin: (r.gstin as string) || null,
    address: (r.address as string) || null,
    isDefault: !!r.is_default,
  };
}

async function assertVendorExists(tenantId: string, vendorId: string): Promise<boolean> {
  const row = (await pool.query('SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId]))
    .rows[0];
  return !!row;
}

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
      sql =
        'SELECT * FROM vendors WHERE tenant_id = $1 AND (name ILIKE $2 OR contact_person ILIKE $3 OR phone ILIKE $4 OR email ILIKE $5)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const { parsePagination } = await import('../utils/pagination');
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int AS c');
    const total = Number((await pool.query(countSql, params)).rows[0]?.c ?? 0);
    const limIdx = params.length + 1;
    sql += ` ORDER BY name LIMIT $${limIdx} OFFSET $${limIdx + 1}`;
    params.push(limit, offset);
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
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.json(list);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/vendors/bulk', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { vendors } = req.body as {
      vendors?: { name: string; contactPerson?: string; phone?: string; email?: string; address?: string }[];
    };
    if (!Array.isArray(vendors) || vendors.length === 0)
      return res.status(400).json({ error: 'Provide an array of vendors' });
    const { assertBulkSize } = await import('../utils/pagination');
    const bulkErr = assertBulkSize(vendors, 500);
    if (bulkErr) return res.status(400).json({ error: bulkErr });

    // Validate all rows first — fail fast
    for (let i = 0; i < vendors.length; i++) {
      const v = vendors[i];
      if (!v.name || !v.name.trim())
        return res.status(400).json({ error: `Row ${i + 2}: Name is required — no vendors were imported` });
    }

    const vendorPortal = (await client.query('SELECT vendor_portal_enabled FROM tenants WHERE id = $1', [tenantId]))
      .rows[0];
    const portalEnabled = vendorPortal?.vendor_portal_enabled === true;
    const slug = (await client.query('SELECT slug FROM tenants WHERE id = $1', [tenantId])).rows[0]?.slug as
      string | undefined;
    const crypto = await import('crypto');

    await client.query('BEGIN');
    let success = 0;
    const credentials: { name: string; email: string; password: string; url: string }[] = [];

    for (let i = 0; i < vendors.length; i++) {
      const v = vendors[i];
      const email = typeof v.email === 'string' && v.email.trim() ? v.email.trim() : null;
      const dup = (
        await client.query('SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [
          tenantId,
          v.name.trim(),
        ])
      ).rows[0];
      if (dup) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `"${v.name}" already exists — no vendors were imported` });
      }
      if (email) {
        const emailDup = (
          await client.query(
            "SELECT id FROM vendors WHERE tenant_id = $1 AND email IS NOT NULL AND email != '' AND LOWER(email) = LOWER($2)",
            [tenantId, email],
          )
        ).rows[0];
        if (emailDup) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Email "${email}" already exists — no vendors were imported` });
        }
      }
      const id = uid('V');
      await client.query(
        'INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address, gst_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          id,
          tenantId,
          v.name.trim(),
          v.contactPerson || null,
          v.phone?.trim() || null,
          email,
          v.address || null,
          (v as Record<string, unknown>).gstNumber || null,
        ],
      );
      if (portalEnabled && email && email.includes('@')) {
        const existing = (
          await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2', [
            email,
            tenantId,
          ])
        ).rows[0];
        if (!existing) {
          const pw = crypto.randomBytes(12).toString('base64url');
          const userId = uid('U');
          const perms = JSON.stringify({
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
          });
          await client.query(
            `INSERT INTO users (id, tenant_id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'Vendor',$8,$9,$10)`,
            [
              userId,
              tenantId,
              email,
              hashPassword(pw),
              v.contactPerson || v.name,
              v.phone || null,
              v.address || null,
              v.name,
              perms,
              id,
            ],
          );
          credentials.push({ name: v.name, email, password: pw, url: slug ? `/${slug}` : '' });
        }
      }
      success++;
    }
    await client.query('COMMIT');
    await logAudit(pool, tenantId, 'Vendors Bulk Import', 'vendor', undefined, `${success} vendors imported`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success, errors: [], credentials });
  } catch (e) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, e, 'Vendor import failed', {
      publicMessage: 'Import failed — no vendors were added',
    });
  } finally {
    client.release();
  }
});

router.post('/api/vendors', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vendorLimitErr = await checkPlanLimit(tenantId, 'vendors');
    if (vendorLimitErr) return res.status(403).json(vendorLimitErr);

    const { name, contactPerson, phone, address } = req.body;
    const email = typeof req.body.email === 'string' && req.body.email.trim() ? req.body.email.trim() : null;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Vendor name is required' });
    if (phone && !isValidPhone(phone))
      return res.status(400).json({ error: 'Invalid phone — must be 10-digit Indian mobile (6-9 start)' });
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    const gstNum = (req.body as Record<string, unknown>).gstNumber as string | undefined;
    if (gstNum && !isValidGstin(gstNum))
      return res.status(400).json({ error: 'Invalid GSTIN — must be 15 characters (e.g. 24AABCT1332L1ZS)' });

    const duplicate = (
      await pool.query(
        "SELECT id, name FROM vendors WHERE tenant_id = $1 AND (LOWER(name) = LOWER($2) OR (email IS NOT NULL AND email != '' AND LOWER(email) = LOWER($3)))",
        [tenantId, name.trim(), email || ''],
      )
    ).rows[0] as { id: string; name: string } | undefined;
    if (duplicate) return res.status(400).json({ error: `Vendor "${duplicate.name}" already exists` });

    const id = uid('V');
    await pool.query(
      'INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address, gst_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, tenantId, name.trim(), contactPerson, phone?.trim() || null, email, address, req.body.gstNumber || null],
    );
    const row = (await pool.query('SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    let credentials: { email: string; password: string } | null = null;
    const vendorPortal = (await pool.query('SELECT vendor_portal_enabled FROM tenants WHERE id = $1', [tenantId]))
      .rows[0];
    const portalEnabled = vendorPortal?.vendor_portal_enabled === true;
    if (portalEnabled && email && typeof email === 'string' && email.includes('@')) {
      const existing = (await pool.query('SELECT id FROM users WHERE email = $1 AND tenant_id = $2', [email, tenantId]))
        .rows[0];
      if (!existing) {
        const crypto = await import('crypto');
        const defaultPassword = crypto.randomBytes(12).toString('base64url');
        const userId = uid('U');
        const perms = JSON.stringify({
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
        });
        await pool.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Vendor', $8, $9, $10)`,
          [
            userId,
            tenantId,
            email,
            hashPassword(defaultPassword),
            contactPerson || name || '',
            phone || null,
            address || null,
            name || null,
            perms,
            id,
          ],
        );
        credentials = { email, password: defaultPassword };
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({
      id: row.id,
      name: row.name,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      totalSales: 0,
      totalRewardPoints: 0,
      gstNumber: row.gst_number ?? null,
      credentials,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/vendors/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, contactPerson, phone, address, gstNumber } = req.body;
    // undefined = leave unchanged; '' = clear; non-empty = set
    const emailArg =
      req.body.email === undefined
        ? null
        : typeof req.body.email === 'string' && req.body.email.trim()
          ? req.body.email.trim()
          : '';
    if (phone && !isValidPhone(phone))
      return res.status(400).json({ error: 'Invalid phone — must be 10-digit Indian mobile (6-9 start)' });
    if (emailArg && !isValidEmail(emailArg)) return res.status(400).json({ error: 'Invalid email format' });
    if (name) {
      const dup = (
        await pool.query('SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id != $3', [
          tenantId,
          name.trim(),
          id,
        ])
      ).rows[0];
      if (dup) return res.status(400).json({ error: `Vendor "${name}" already exists` });
    }
    if (emailArg) {
      const emailDup = (
        await pool.query(
          "SELECT id FROM vendors WHERE tenant_id = $1 AND id != $2 AND email IS NOT NULL AND email != '' AND LOWER(email) = LOWER($3)",
          [tenantId, id, emailArg],
        )
      ).rows[0];
      if (emailDup) return res.status(400).json({ error: `Email "${emailArg}" already exists` });
    }
    const result = await pool.query(
      `UPDATE vendors SET name=COALESCE($1,name), contact_person=COALESCE($2,contact_person), phone=COALESCE($3,phone),
       email=CASE WHEN $4::text IS NULL THEN email WHEN $4 = '' THEN NULL ELSE $4 END,
       address=COALESCE($5,address), gst_number=COALESCE($8,gst_number) WHERE id=$6 AND tenant_id=$7`,
      [name, contactPerson, phone?.trim() || null, emailArg, address, id, tenantId, gstNumber ?? null],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    // Keep linked invoices' WhatsApp/print phone in sync when Masters phone changes.
    if (req.body.phone !== undefined) {
      await pool.query(
        `UPDATE standalone_invoices SET customer_phone = $1
         WHERE tenant_id = $2 AND party_type = 'vendor' AND party_id = $3`,
        [typeof phone === 'string' ? phone.trim() || null : null, tenantId, id],
      );
    }
    const row = (await pool.query('SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({
      id: row.id,
      name: row.name,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      totalSales: row.total_sales ?? 0,
      totalRewardPoints: row.total_reward_points ?? 0,
      gstNumber: row.gst_number ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Ship-to addresses (alternate delivery GSTIN/address for e-way) ───────────

router.get('/api/vendors/:id/ship-to', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const unlinked = assertVendorLinked(req);
    if (unlinked) return res.status(403).json({ error: unlinked });
    const vendorId = req.params.id;
    const jwtVendorId = vendorScopeId(req);
    if (jwtVendorId && jwtVendorId !== vendorId) return res.status(403).json({ error: 'Access denied to this vendor' });
    if (!(await assertVendorExists(tenantId, vendorId))) return res.status(404).json({ error: 'Vendor not found' });
    const { rows } = await pool.query(
      `SELECT * FROM vendor_ship_to WHERE tenant_id = $1 AND vendor_id = $2
       ORDER BY is_default DESC, name ASC`,
      [tenantId, vendorId],
    );
    res.json(rows.map(mapShipTo));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/vendors/:id/ship-to', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const vendorId = req.params.id;
    if (!(await assertVendorExists(tenantId, vendorId))) return res.status(404).json({ error: 'Vendor not found' });
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const gstin =
      typeof req.body.gstin === 'string' && req.body.gstin.trim() ? req.body.gstin.trim().toUpperCase() : null;
    if (gstin && !isValidGstin(gstin))
      return res.status(400).json({ error: 'Invalid GSTIN — must be 15 characters (e.g. 24AABCT1332L1ZS)' });
    const label = typeof req.body.label === 'string' ? req.body.label.trim() || null : null;
    const address = typeof req.body.address === 'string' ? req.body.address.trim() || null : null;
    const isDefault = !!req.body.isDefault;
    const id = uid('ST');
    if (isDefault) {
      await pool.query('UPDATE vendor_ship_to SET is_default = false WHERE tenant_id = $1 AND vendor_id = $2', [
        tenantId,
        vendorId,
      ]);
    }
    await pool.query(
      `INSERT INTO vendor_ship_to (id, tenant_id, vendor_id, label, name, gstin, address, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, tenantId, vendorId, label, name, gstin, address, isDefault],
    );
    const row = (await pool.query('SELECT * FROM vendor_ship_to WHERE id = $1 AND tenant_id = $2', [id, tenantId]))
      .rows[0];
    res.status(201).json(mapShipTo(row));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/vendors/:id/ship-to/:shipToId', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id: vendorId, shipToId } = req.params;
    const existing = (
      await pool.query('SELECT * FROM vendor_ship_to WHERE id = $1 AND vendor_id = $2 AND tenant_id = $3', [
        shipToId,
        vendorId,
        tenantId,
      ])
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'Ship-to address not found' });

    const name =
      req.body.name !== undefined
        ? typeof req.body.name === 'string'
          ? req.body.name.trim()
          : ''
        : (existing.name as string);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    let gstin = existing.gstin as string | null;
    if (req.body.gstin !== undefined) {
      gstin = typeof req.body.gstin === 'string' && req.body.gstin.trim() ? req.body.gstin.trim().toUpperCase() : null;
      if (gstin && !isValidGstin(gstin))
        return res.status(400).json({ error: 'Invalid GSTIN — must be 15 characters (e.g. 24AABCT1332L1ZS)' });
    }
    const label =
      req.body.label !== undefined
        ? typeof req.body.label === 'string'
          ? req.body.label.trim() || null
          : null
        : (existing.label as string | null);
    const address =
      req.body.address !== undefined
        ? typeof req.body.address === 'string'
          ? req.body.address.trim() || null
          : null
        : (existing.address as string | null);
    const isDefault = req.body.isDefault !== undefined ? !!req.body.isDefault : !!existing.is_default;

    if (isDefault) {
      await pool.query(
        'UPDATE vendor_ship_to SET is_default = false WHERE tenant_id = $1 AND vendor_id = $2 AND id != $3',
        [tenantId, vendorId, shipToId],
      );
    }
    await pool.query(
      `UPDATE vendor_ship_to SET label=$1, name=$2, gstin=$3, address=$4, is_default=$5
       WHERE id=$6 AND vendor_id=$7 AND tenant_id=$8`,
      [label, name, gstin, address, isDefault, shipToId, vendorId, tenantId],
    );
    const row = (
      await pool.query('SELECT * FROM vendor_ship_to WHERE id = $1 AND tenant_id = $2', [shipToId, tenantId])
    ).rows[0];
    res.json(mapShipTo(row));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/vendors/:id/ship-to/:shipToId', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id: vendorId, shipToId } = req.params;
    const result = await pool.query('DELETE FROM vendor_ship_to WHERE id = $1 AND vendor_id = $2 AND tenant_id = $3', [
      shipToId,
      vendorId,
      tenantId,
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Ship-to address not found' });
    res.status(204).send();
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Delete all vendors for tenant
router.delete('/api/vendors/all', requireAdmin, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    await client.query('BEGIN');
    const tables = [
      'vendor_ship_to',
      'price_lists',
      'vendor_reminder_settings',
      'vendor_payments',
      'product_distribution',
      'quotations',
      'orders',
    ];
    for (const t of tables) await client.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]);
    await client.query("DELETE FROM users WHERE tenant_id = $1 AND role = 'Vendor'", [tenantId]);
    const { rowCount } = await client.query("DELETE FROM vendors WHERE tenant_id = $1 AND id != 'OWNER'", [tenantId]);
    await client.query('COMMIT');
    await logAudit(pool, tenantId, 'Delete All Vendors', 'vendor', 'all', `${rowCount} vendors deleted`);
    res.json({ deleted: rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, e, 'Vendor bulk delete failed', { publicMessage: 'Failed to delete vendors' });
  } finally {
    client.release();
  }
});

router.delete('/api/vendors/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const hasDistributions = (
      await pool.query('SELECT 1 FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2 LIMIT 1', [
        id,
        tenantId,
      ])
    ).rows[0];
    if (hasDistributions)
      return res
        .status(400)
        .json({ error: 'Cannot delete vendor with existing distributions. Remove distributions first.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM vendor_ship_to WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM price_lists WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM vendor_reminder_settings WHERE vendor_id = $1 AND tenant_id = $2', [
        id,
        tenantId,
      ]);
      await client.query('DELETE FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM rewards WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM users WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('UPDATE customers SET vendor_id = NULL WHERE vendor_id = $1 AND tenant_id = $2', [
        id,
        tenantId,
      ]);
      await client.query('UPDATE quotations SET vendor_id = NULL WHERE vendor_id = $1 AND tenant_id = $2', [
        id,
        tenantId,
      ]);
      await client.query('UPDATE orders SET vendor_id = NULL WHERE vendor_id = $1 AND tenant_id = $2', [id, tenantId]);
      const result = await client.query('DELETE FROM vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Vendor not found' });
      }
      await client.query('COMMIT');
      res.status(204).send();
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
