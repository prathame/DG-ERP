import { Router } from 'express';
import { blockVendors, AuthRequest, vendorScopeId } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit, isValidPhone, isValidEmail } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { creditTermsFromRow, parseCreditLimit, parseCreditPeriodDays } from '../utils/partyCreditTerms';

const router = Router();

function mapCustomer(r: Record<string, unknown>) {
  const credit = creditTermsFromRow(r);
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    vendorId: r.vendor_id ?? null,
    creditLimit: credit.creditLimit,
    creditPeriodDays: credit.creditPeriodDays,
  };
}

router.get('/api/customers', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search, vendorId } = req.query;
    const scoped = vendorScopeId(req);
    let sql = 'SELECT * FROM customers WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    let idx = 2;
    const forcedVendor = scoped || (typeof vendorId === 'string' ? vendorId : '');
    if (forcedVendor) {
      sql += ` AND vendor_id = $${idx}`;
      params.push(forcedVendor);
      idx++;
    } else if (req.user?.role === 'Vendor') {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }
    if (typeof search === 'string' && search) {
      sql += ` AND (name ILIKE $${idx} OR phone ILIKE $${idx + 1} OR email ILIKE $${idx + 2})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      idx += 3;
    }
    const { parsePagination } = await import('../utils/pagination');
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int AS c');
    const total = Number((await pool.query(countSql, params)).rows[0]?.c ?? 0);
    sql += ` ORDER BY name LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);
    const { rows } = await pool.query(sql, params);
    const list = rows.map((r: Record<string, unknown>) => mapCustomer(r));
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.json(list);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/customers', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, phone, email, address, vendorId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (phone && !isValidPhone(phone))
      return res.status(400).json({ error: 'Invalid phone — must be 10-digit Indian mobile (6-9 start)' });
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    let creditLimit: number | null = null;
    let creditPeriodDays: number | null = null;
    try {
      creditLimit = parseCreditLimit(req.body.creditLimit);
      creditPeriodDays = parseCreditPeriodDays(req.body.creditPeriodDays);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid credit terms' });
    }
    const dup = (
      await pool.query(
        'SELECT id FROM customers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND (phone IS NULL OR phone = $3 OR $3 IS NULL)',
        [tenantId, name.trim(), phone || null],
      )
    ).rows[0];
    if (dup) return res.status(400).json({ error: `Customer "${name}" already exists` });
    const id = uid('C');
    await pool.query(
      'INSERT INTO customers (id, tenant_id, name, phone, email, address, vendor_id, credit_limit, credit_period_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, tenantId, name.trim(), phone, email, address, vendorId || null, creditLimit, creditPeriodDays],
    );
    const row = (await pool.query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.status(201).json(mapCustomer(row));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/customers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, phone, email, address, vendorId } = req.body;
    const params: unknown[] = [
      name,
      phone,
      email,
      address,
      vendorId === '' || vendorId === undefined ? null : vendorId,
    ];
    let sql = `UPDATE customers SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
      address=COALESCE($4,address), vendor_id=$5`;
    let idx = 6;
    if (req.body.creditLimit !== undefined) {
      try {
        params.push(parseCreditLimit(req.body.creditLimit));
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid credit limit' });
      }
      sql += `, credit_limit=$${idx++}`;
    }
    if (req.body.creditPeriodDays !== undefined) {
      try {
        params.push(parseCreditPeriodDays(req.body.creditPeriodDays));
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid credit period' });
      }
      sql += `, credit_period_days=$${idx++}`;
    }
    sql += ` WHERE id=$${idx++} AND tenant_id=$${idx}`;
    params.push(id, tenantId);
    const result = await pool.query(sql, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    // Keep linked invoices' WhatsApp/print phone in sync when Masters phone changes.
    if (req.body.phone !== undefined) {
      await pool.query(
        `UPDATE standalone_invoices SET customer_phone = $1
         WHERE tenant_id = $2 AND party_type = 'customer' AND party_id = $3`,
        [typeof phone === 'string' ? phone.trim() || null : null, tenantId, id],
      );
    }
    const row = (await pool.query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json(mapCustomer(row));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/customers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const hasSales = (
      await pool.query('SELECT 1 FROM product_sales WHERE customer_id = $1 AND tenant_id = $2 LIMIT 1', [id, tenantId])
    ).rows[0];
    if (hasSales) return res.status(400).json({ error: 'Cannot delete customer with existing sales records.' });
    // warranties.customer_id is optional (older schemas may not have the column)
    try {
      await pool.query('UPDATE warranties SET customer_id = NULL WHERE customer_id = $1 AND tenant_id = $2', [
        id,
        tenantId,
      ]);
    } catch {
      /* column may not exist */
    }
    const result = await pool.query('DELETE FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    res.status(204).send();
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/customers/:id/purchases', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const customer = (
      await pool.query('SELECT id, phone FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])
    ).rows[0] as { id: string; phone: string | null } | undefined;
    if (!customer) return res.json([]);
    const { rows } = await pool.query(
      `
      SELECT ps.barcode, ps.purchase_date, p.name as product_name, p.id as product_id, v.name as vendor_name, v.id as vendor_id
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      LEFT JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $1
      WHERE ps.tenant_id = $1 AND (ps.customer_id = $2 OR (ps.customer_id IS NULL AND ps.customer_phone = $3))
      ORDER BY ps.purchase_date DESC
    `,
      [tenantId, id, customer.phone ?? ''],
    );
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        productName: r.product_name,
        productId: r.product_id,
        vendorName: r.vendor_name,
        vendorId: r.vendor_id,
        barcode: r.barcode,
        purchaseDate: r.purchase_date,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/customers/:id/vendor', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { vendorId } = req.body;
    const result = await pool.query('UPDATE customers SET vendor_id = $1 WHERE id = $2 AND tenant_id = $3', [
      vendorId || null,
      id,
      tenantId,
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    const row = (await pool.query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      vendorId: row.vendor_id ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
