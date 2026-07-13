import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, logAudit, isValidPhone } from '../utils/helpers';

const router = Router();

router.get('/api/customers', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search, vendorId } = req.query;
    let sql = 'SELECT * FROM customers WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (typeof vendorId === 'string' && vendorId) {
      sql += ` AND vendor_id = $${idx}`;
      params.push(vendorId);
      idx++;
    }
    if (typeof search === 'string' && search) {
      sql += ` AND (name ILIKE $${idx} OR phone ILIKE $${idx + 1} OR email ILIKE $${idx + 2})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      idx += 3;
    }
    sql += ' ORDER BY name';
    const { rows } = await pool.query(sql, params);
    const list = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      vendorId: r.vendor_id ?? null,
    }));
    res.json(list);
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/customers', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, phone, email, address, vendorId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (phone && !isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone — must be 10-digit Indian mobile (6-9 start)' });
    const dup = (await pool.query('SELECT id FROM customers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND (phone IS NULL OR phone = $3 OR $3 IS NULL)', [tenantId, name.trim(), phone || null])).rows[0];
    if (dup) return res.status(400).json({ error: `Customer "${name}" already exists` });
    const id = uid('C');
    await pool.query(
      'INSERT INTO customers (id, tenant_id, name, phone, email, address, vendor_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, tenantId, name.trim(), phone, email, address, vendorId || null]
    );
    const row = (await pool.query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.status(201).json({ id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, vendorId: row.vendor_id ?? null });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/customers/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, phone, email, address, vendorId } = req.body;
    const result = await pool.query(
      'UPDATE customers SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email), address=COALESCE($4,address), vendor_id=$5 WHERE id=$6 AND tenant_id=$7',
      [name, phone, email, address, vendorId === '' || vendorId === undefined ? null : vendorId, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    const row = (await pool.query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({ id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, vendorId: row.vendor_id ?? null });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/customers/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const hasSales = (await pool.query("SELECT 1 FROM product_sales WHERE customer_id = $1 AND tenant_id = $2 LIMIT 1", [id, tenantId])).rows[0];
    if (hasSales) return res.status(400).json({ error: 'Cannot delete customer with existing sales records.' });
    await pool.query('UPDATE warranties SET customer_id = NULL WHERE customer_id = $1 AND tenant_id = $2', [id, tenantId]);
    const result = await pool.query('DELETE FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    res.status(204).send();
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/customers/:id/purchases', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const customer = (await pool.query('SELECT id, phone FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as { id: string; phone: string | null } | undefined;
    if (!customer) return res.json([]);
    const { rows } = await pool.query(`
      SELECT ps.barcode, ps.purchase_date, p.name as product_name, p.id as product_id, v.name as vendor_name, v.id as vendor_id
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      LEFT JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $1
      WHERE ps.tenant_id = $1 AND (ps.customer_id = $2 OR (ps.customer_id IS NULL AND ps.customer_phone = $3))
      ORDER BY ps.purchase_date DESC
    `, [tenantId, id, customer.phone ?? '']);
    res.json(rows.map((r: Record<string, unknown>) => ({
      productName: r.product_name,
      productId: r.product_id,
      vendorName: r.vendor_name,
      vendorId: r.vendor_id,
      barcode: r.barcode,
      purchaseDate: r.purchase_date,
    })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/customers/:id/vendor', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { vendorId } = req.body;
    const result = await pool.query('UPDATE customers SET vendor_id = $1 WHERE id = $2 AND tenant_id = $3', [vendorId || null, id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    const row = (await pool.query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({ id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, vendorId: row.vendor_id ?? null });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
