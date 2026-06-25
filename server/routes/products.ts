import { Router } from 'express';
import { pool } from '../pg-db';
import { mapProduct } from '../utils/helpers';
import { barcodeExists, expandBarcodeRange, generateBarcodesFromPrefix } from '../utils/barcode';

const router = Router();

// ============ CATEGORIES ============
router.get('/api/categories', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (await pool.query('SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name', [tenantId])).rows as Record<string, unknown>[];
    res.json(rows.map((r) => ({ id: r.id, name: r.name })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/categories', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name } = req.body;
    const id = `CAT${Date.now()}`;
    await pool.query('INSERT INTO categories (id, name, tenant_id) VALUES ($1, $2, $3)', [id, name ?? '', tenantId]);
    const row = (await pool.query('SELECT * FROM categories WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown>;
    res.status(201).json({ id: row.id, name: row.name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/categories/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name } = req.body;
    const result = await pool.query('UPDATE categories SET name = COALESCE($1, name) WHERE id = $2 AND tenant_id = $3', [name, id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    const row = (await pool.query('SELECT * FROM categories WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown>;
    res.json({ id: row.id, name: row.name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/categories/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const exists = (await pool.query('SELECT 1 FROM categories WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    if (!exists) return res.status(404).json({ error: 'Category not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE products SET category_id = NULL WHERE category_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('UPDATE reward_rules SET category_id = NULL WHERE category_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM categories WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ PRODUCTS ============
router.get('/api/products', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search } = req.query;
    let sql = `SELECT p.*, c.name as category_name,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as total_inv,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as inv_stock,
      (SELECT COUNT(*) FROM product_sales ps WHERE ps.product_id = p.id AND ps.tenant_id = $1) as sold_count,
      (SELECT COUNT(*) FROM product_distribution pd WHERE pd.product_id = p.id AND pd.status = 'Distributed' AND pd.tenant_id = $1) as with_vendors,
      (SELECT MIN(barcode) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as barcode_first,
      (SELECT MAX(barcode) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as barcode_last
      FROM products p LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1 WHERE p.tenant_id = $1`;
    const params: string[] = [tenantId];
    if (typeof search === 'string' && search) {
      const nextIdx = params.length + 1;
      sql += ` AND (p.name LIKE $${nextIdx} OR p.barcode LIKE $${nextIdx + 1} OR EXISTS (SELECT 1 FROM product_inventory pi2 WHERE pi2.product_id = p.id AND pi2.tenant_id = $1 AND pi2.barcode LIKE $${nextIdx + 2}))`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY p.name';
    const rows = (await pool.query(sql, params)).rows;
    res.json((rows as Record<string, unknown>[]).map((r) => mapProduct({
      ...r,
      stock: (r.inv_stock as number) ?? r.stock ?? 0,
      totalInventory: (r.total_inv as number) ?? 0,
      remainingInventory: (r.inv_stock as number) ?? 0,
      soldCount: (r.sold_count as number) ?? 0,
      withVendors: (r.with_vendors as number) ?? 0,
      barcodeRange: (r.barcode_first && r.barcode_last) ? { first: r.barcode_first as string, last: r.barcode_last as string } : null,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/products/:id/barcode-details', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const product = (await pool.query('SELECT id, name FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as { id: string; name: string } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const rows = (await pool.query(`
      SELECT COALESCE(batch_id, created_at::date::text) as batch_key, MIN(created_at::date)::text as add_date, MIN(barcode) as barcode_first, MAX(barcode) as barcode_last, COUNT(*) as count
      FROM product_inventory
      WHERE product_id = $1 AND tenant_id = $2
      GROUP BY COALESCE(batch_id, created_at::date::text)
      ORDER BY add_date DESC
    `, [id, tenantId])).rows as { add_date: string; barcode_first: string; barcode_last: string; count: number }[];
    res.json(rows.map((r) => ({
      date: r.add_date,
      barcodeFirst: r.barcode_first,
      barcodeLast: r.barcode_last,
      count: r.count,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/products/by-barcode/:barcode', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { barcode } = req.params;
    let row = (await pool.query(`
      SELECT p.*, c.name as category_name,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as inv_stock
      FROM products p LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
      JOIN product_inventory pi ON pi.product_id = p.id AND pi.barcode = $2 AND pi.status = 'InStock' AND pi.tenant_id = $1
      WHERE p.tenant_id = $1
    `, [tenantId, barcode])).rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      row = (await pool.query(`
        SELECT p.*, c.name as category_name,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as inv_stock
        FROM products p LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1 WHERE p.barcode = $2 AND p.tenant_id = $1
      `, [tenantId, barcode])).rows[0] as Record<string, unknown> | undefined;
    }
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(mapProduct({ ...row, stock: (row.inv_stock as number) ?? row.stock ?? 0 }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/products', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, barcode, categoryId, category, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, price, stock, rangeStart, rangeEnd, quantity, barcodeMode, barcodePrefix } = req.body;
    const id = `P${Date.now()}`;
    const catId = categoryId || null;
    const cols = 'id, name, barcode, category_id, description, reward_points_value, manufacturing_date, batch_number, status, warranty_months, price, stock, tenant_id';
    let invStock = 0;
    const mode = barcodeMode ?? 'prefix';

    const insertProductRow = async () => {
      await pool.query(
        `INSERT INTO products (${cols}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, name, null, catId, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, 0, tenantId]
      );
    };
    const insertBarcodes = async (barcodes: string[]) => {
      const batchId = `B${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      for (let i = 0; i < barcodes.length; i++) {
        const bc = barcodes[i];
        if (await barcodeExists(pool, tenantId, bc)) {
          throw new Error(`BARCODE_EXISTS:${bc}`);
        }
        await pool.query(
          'INSERT INTO product_inventory (id, product_id, barcode, batch_id, status, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [`I${id}-${i + 1}`, id, bc, batchId, 'InStock', tenantId]
        );
        invStock++;
      }
    };

    if (mode === 'prefix') {
      const prefix = typeof barcodePrefix === 'string' ? barcodePrefix.trim() : '';
      const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
      if (!prefix) return res.status(400).json({ error: 'Barcode prefix is required (e.g. SP, PUMP, etc.)' });
      const barcodes = await generateBarcodesFromPrefix(pool, tenantId, prefix, qty);
      await insertProductRow();
      await insertBarcodes(barcodes);
    } else if (mode === 'auto') {
      const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
      const batchId = `B${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const base = `AUTO-${batchId}`;
      const barcodes = Array.from({ length: qty }, (_, i) => `${base}-${String(i + 1).padStart(4, '0')}`);
      await insertProductRow();
      await insertBarcodes(barcodes);
    } else if (mode === 'range' && typeof rangeStart === 'string' && typeof rangeEnd === 'string' && rangeStart.trim() && rangeEnd.trim()) {
      const barcodes = expandBarcodeRange(rangeStart.trim(), rangeEnd.trim());
      if (barcodes.length === 0) return res.status(400).json({ error: 'Invalid barcode range' });
      await insertProductRow();
      await insertBarcodes(barcodes);
    } else {
      await pool.query(
        `INSERT INTO products (${cols}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, name, barcode || null, catId, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, stock ?? 0, tenantId]
      );
      invStock = stock ?? 0;
    }
    const row = (await pool.query(
      'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1 WHERE p.id = $2 AND p.tenant_id = $1',
      [tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.status(201).json(mapProduct({ ...row, stock: invStock }));
  } catch (err) {
    const errStr = String(err);
    if (errStr.includes('BARCODE_EXISTS:')) {
      const bc = errStr.split('BARCODE_EXISTS:')[1];
      return res.status(400).json({ error: `Barcode ${bc} already exists` });
    }
    res.status(500).json({ error: errStr });
  }
});

router.post('/api/products/:id/add-stock', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { rangeStart, rangeEnd, quantity, barcodeMode, barcodePrefix } = req.body;
    const product = (await pool.query('SELECT id FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as { id: string } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const mode = barcodeMode === 'auto' ? 'auto' : barcodeMode === 'range' ? 'range' : 'prefix';
    const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
    let barcodes: string[] = [];

    if (mode === 'prefix' || (mode !== 'auto' && mode !== 'range')) {
      const prefix = typeof barcodePrefix === 'string' ? barcodePrefix.trim() : '';
      if (!prefix) {
        const existing = (await pool.query('SELECT barcode FROM product_inventory WHERE product_id = $1 AND tenant_id = $2 ORDER BY barcode DESC LIMIT 1', [id, tenantId])).rows[0] as { barcode: string } | undefined;
        if (existing) {
          const m = existing.barcode.match(/^(.+?)(\d+)$/);
          if (m) {
            barcodes = await generateBarcodesFromPrefix(pool, tenantId, m[1], qty);
          } else {
            return res.status(400).json({ error: 'Cannot detect barcode prefix from existing barcodes. Provide barcodePrefix.' });
          }
        } else {
          return res.status(400).json({ error: 'No existing barcodes found. Provide barcodePrefix (e.g. SP).' });
        }
      } else {
        barcodes = await generateBarcodesFromPrefix(pool, tenantId, prefix, qty);
      }
    } else if (mode === 'auto') {
      const batchId = `B${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const base = `AUTO-${batchId}`;
      barcodes = Array.from({ length: qty }, (_, i) => `${base}-${String(i + 1).padStart(4, '0')}`);
    } else if (mode === 'range' && typeof rangeStart === 'string' && typeof rangeEnd === 'string' && rangeStart.trim() && rangeEnd.trim()) {
      barcodes = expandBarcodeRange(rangeStart.trim(), rangeEnd.trim());
      if (barcodes.length === 0) return res.status(400).json({ error: 'Invalid range' });
    } else {
      return res.status(400).json({ error: 'Provide barcodePrefix + quantity, or barcodeMode=auto with quantity' });
    }

    const batchId = `B${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = `I${id}-${Date.now()}`;
    for (let i = 0; i < barcodes.length; i++) {
      const bc = barcodes[i];
      if (await barcodeExists(pool, tenantId, bc)) return res.status(400).json({ error: `Barcode ${bc} already exists` });
      await pool.query(
        'INSERT INTO product_inventory (id, product_id, barcode, batch_id, status, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [`${base}-${i + 1}`, id, bc, batchId, 'InStock', tenantId]
      );
    }
    const count = (await pool.query('SELECT COUNT(*) as c FROM product_inventory WHERE product_id = $1 AND status = $2 AND tenant_id = $3', [id, 'InStock', tenantId])).rows[0] as { c: number };
    const row = (await pool.query(
      'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1 WHERE p.id = $2 AND p.tenant_id = $1',
      [tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.status(201).json(mapProduct({ ...row, stock: count.c }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/products/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, barcode, categoryId, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, price } = req.body;
    const row = (await pool.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'Product not found' });
    const newBarcode = barcode === undefined ? row.barcode : (barcode || null);
    await pool.query(`
      UPDATE products SET
        name = COALESCE($1, name),
        barcode = $2,
        category_id = COALESCE($3, category_id),
        description = COALESCE($4, description),
        reward_points_value = COALESCE($5, reward_points_value),
        manufacturing_date = $6,
        batch_number = $7,
        status = COALESCE($8, status),
        warranty_months = COALESCE($9, warranty_months),
        price = COALESCE($10, price)
      WHERE id = $11 AND tenant_id = $12
    `, [name, newBarcode, categoryId ?? row.category_id, description ?? row.description, rewardPointsValue ?? row.reward_points_value, manufacturingDate ?? row.manufacturing_date, batchNumber ?? row.batch_number, status ?? row.status, warrantyMonths ?? row.warranty_months, price ?? row.price, id, tenantId]);
    const updated = (await pool.query(
      'SELECT p.*, c.name as category_name, (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = $1 AND pi.tenant_id = $2) as inv_stock FROM products p LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $2 WHERE p.id = $3 AND p.tenant_id = $2',
      ['InStock', tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.json(mapProduct({ ...updated, stock: (updated.inv_stock as number) ?? updated.stock ?? 0 }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/products/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const exists = (await pool.query('SELECT 1 FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    if (!exists) return res.status(404).json({ error: 'Product not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Delete in order of foreign key dependencies (child tables first)
      const saleIds = (await client.query('SELECT id FROM product_sales WHERE product_id = $1 AND tenant_id = $2', [id, tenantId])).rows as { id: string }[];
      for (const s of saleIds) {
        await client.query('DELETE FROM rewards WHERE sale_id = $1 AND tenant_id = $2', [s.id, tenantId]);
      }
      const warrantyIds = (await client.query('SELECT id FROM warranties WHERE product_id = $1 AND tenant_id = $2', [id, tenantId])).rows as { id: string }[];
      for (const w of warrantyIds) {
        await client.query('DELETE FROM product_replacements WHERE warranty_id = $1 AND tenant_id = $2', [w.id, tenantId]);
      }
      await client.query('DELETE FROM product_replacements WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM product_inventory WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM product_sales WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM product_distribution WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM warranties WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
