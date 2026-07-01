import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

// List price rules (optionally filter by product or vendor)
router.get('/api/price-lists', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { productId, vendorId } = req.query;
    let sql = `SELECT pl.*, p.name as product_name, v.name as vendor_name
      FROM price_lists pl
      LEFT JOIN products p ON pl.product_id = p.id AND p.tenant_id = $1
      LEFT JOIN vendors v ON pl.vendor_id = v.id AND v.tenant_id = $1
      WHERE pl.tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (productId) { sql += ` AND pl.product_id = $${idx++}`; params.push(productId); }
    if (vendorId) { sql += ` AND pl.vendor_id = $${idx++}`; params.push(vendorId); }
    sql += ' ORDER BY p.name, pl.min_qty';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, productId: r.product_id, productName: r.product_name,
      vendorId: r.vendor_id, vendorName: r.vendor_name,
      minQty: Number(r.min_qty) || 1, maxQty: r.max_qty ? Number(r.max_qty) : null,
      price: Number(r.price) || 0, isActive: r.is_active !== false,
    })));
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

// Get best price for a product + vendor + quantity
router.get('/api/price-lists/resolve', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { productId, vendorId, quantity } = req.query;
    if (!productId) return res.status(400).json({ error: 'productId required' });
    const qty = Number(quantity) || 1;

    // Priority: vendor-specific slab > vendor-specific flat > general slab > general flat > product.price
    const rules = (await pool.query(`
      SELECT price, vendor_id, min_qty, max_qty FROM price_lists
      WHERE tenant_id = $1 AND product_id = $2 AND is_active = true
        AND (vendor_id = $3 OR vendor_id IS NULL)
        AND min_qty <= $4 AND (max_qty IS NULL OR max_qty >= $4)
      ORDER BY
        CASE WHEN vendor_id = $3 THEN 0 ELSE 1 END,
        min_qty DESC
      LIMIT 1
    `, [tenantId, productId, vendorId || null, qty])).rows[0] as { price: number } | undefined;

    if (rules) {
      res.json({ price: Number(rules.price), source: 'price_list' });
    } else {
      const product = (await pool.query('SELECT price FROM products WHERE id = $1 AND tenant_id = $2', [productId, tenantId])).rows[0] as { price: number } | undefined;
      res.json({ price: Number(product?.price) || 0, source: 'default' });
    }
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

// Create price rule
router.post('/api/price-lists', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, productId, vendorId, minQty, maxQty, price } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product is required' });
    if (!price || Number(price) <= 0) return res.status(400).json({ error: 'Price must be greater than 0' });

    const id = `PL${Date.now()}`;
    await pool.query(
      'INSERT INTO price_lists (id, tenant_id, name, product_id, vendor_id, min_qty, max_qty, price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, tenantId, name || 'Custom Price', productId, vendorId || null, Number(minQty) || 1, maxQty ? Number(maxQty) : null, Number(price)]
    );
    res.status(201).json({ id, name: name || 'Custom Price', productId, vendorId, minQty: Number(minQty) || 1, maxQty: maxQty ? Number(maxQty) : null, price: Number(price) });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

// Update price rule
router.put('/api/price-lists/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, minQty, maxQty, price, isActive } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (minQty !== undefined) { updates.push(`min_qty = $${idx++}`); params.push(Number(minQty) || 1); }
    if (maxQty !== undefined) { updates.push(`max_qty = $${idx++}`); params.push(maxQty ? Number(maxQty) : null); }
    if (price !== undefined) { updates.push(`price = $${idx++}`); params.push(Number(price)); }
    if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); params.push(!!isActive); }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates' });
    params.push(req.params.id, tenantId);
    await pool.query(`UPDATE price_lists SET ${updates.join(',')} WHERE id = $${idx++} AND tenant_id = $${idx}`, params);
    res.json({ ok: true });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

// Delete price rule
router.delete('/api/price-lists/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    await pool.query('DELETE FROM price_lists WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.status(204).send();
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
