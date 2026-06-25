import { Router } from 'express';
import { db } from '../db';
import { mapProduct } from '../utils/helpers';
import { barcodeExists, expandBarcodeRange, generateBarcodesFromPrefix } from '../utils/barcode';

const router = Router();

// ============ CATEGORIES ============
router.get('/api/categories', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM categories ORDER BY name').all() as Record<string, unknown>[];
    res.json(rows.map((r) => ({ id: r.id, name: r.name })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/categories', (req, res) => {
  try {
    const { name } = req.body;
    const id = `CAT${Date.now()}`;
    db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name ?? '');
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ id: row.id, name: row.name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const result = db.prepare('UPDATE categories SET name = COALESCE(?, name) WHERE id = ?').run(name, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ id: row.id, name: row.name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    const exists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Category not found' });
    const del = db.transaction(() => {
      db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(id);
      db.prepare('UPDATE reward_rules SET category_id = NULL WHERE category_id = ?').run(id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    });
    del();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ PRODUCTS ============
router.get('/api/products', (req, res) => {
  try {
    const { search } = req.query;
    let sql = `SELECT p.*, c.name as category_name,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id) as total_inv,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock') as inv_stock,
      (SELECT COUNT(*) FROM product_sales ps WHERE ps.product_id = p.id) as sold_count,
      (SELECT COUNT(*) FROM product_distribution pd WHERE pd.product_id = p.id AND pd.status = 'Distributed') as with_vendors,
      (SELECT MIN(barcode) FROM product_inventory pi WHERE pi.product_id = p.id) as barcode_first,
      (SELECT MAX(barcode) FROM product_inventory pi WHERE pi.product_id = p.id) as barcode_last
      FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1`;
    const params: string[] = [];
    if (typeof search === 'string' && search) {
      sql += ' AND (p.name LIKE ? OR p.barcode LIKE ? OR EXISTS (SELECT 1 FROM product_inventory pi2 WHERE pi2.product_id = p.id AND pi2.barcode LIKE ?))';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY p.name';
    const stmt = db.prepare(sql);
    const rows = params.length ? stmt.all(...params) : stmt.all();
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

router.get('/api/products/:id/barcode-details', (req, res) => {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(id) as { id: string; name: string } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const rows = db.prepare(`
      SELECT COALESCE(batch_id, date(created_at)) as batch_key, MIN(date(created_at)) as add_date, MIN(barcode) as barcode_first, MAX(barcode) as barcode_last, COUNT(*) as count
      FROM product_inventory
      WHERE product_id = ?
      GROUP BY COALESCE(batch_id, date(created_at))
      ORDER BY add_date DESC
    `).all(id) as { add_date: string; barcode_first: string; barcode_last: string; count: number }[];
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

router.get('/api/products/by-barcode/:barcode', (req, res) => {
  try {
    const { barcode } = req.params;
    let row = db.prepare(`
      SELECT p.*, c.name as category_name,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock') as inv_stock
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
      JOIN product_inventory pi ON pi.product_id = p.id AND pi.barcode = ? AND pi.status = 'InStock'
    `).get(barcode) as Record<string, unknown> | undefined;
    if (!row) {
      row = db.prepare(`
        SELECT p.*, c.name as category_name,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock') as inv_stock
        FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.barcode = ?
      `).get(barcode) as Record<string, unknown> | undefined;
    }
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(mapProduct({ ...row, stock: (row.inv_stock as number) ?? row.stock ?? 0 }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/products', (req, res) => {
  try {
    const { name, barcode, categoryId, category, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, warrantyApplicable, price, stock, rangeStart, rangeEnd, quantity, barcodeMode, barcodePrefix } = req.body;
    const id = `P${Date.now()}`;
    const catId = categoryId || null;
    const cols = 'id, name, barcode, category_id, description, reward_points_value, manufacturing_date, batch_number, status, warranty_months, price, stock, warranty_applicable';
    const insertProduct = db.prepare(`INSERT INTO products (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let invStock = 0;
    const mode = barcodeMode ?? 'prefix';

    const insertProductRow = () => {
      insertProduct.run(id, name, null, catId, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, 0, warrantyApplicable === false ? 0 : 1);
    };
    const insertBarcodes = (barcodes: string[]) => {
      const batchId = `B${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const invInsert = db.prepare('INSERT INTO product_inventory (id, product_id, barcode, batch_id, status) VALUES (?, ?, ?, ?, ?)');
      for (let i = 0; i < barcodes.length; i++) {
        const bc = barcodes[i];
        if (barcodeExists(bc)) return res.status(400).json({ error: `Barcode ${bc} already exists` });
        invInsert.run(`I${id}-${i + 1}`, id, bc, batchId, 'InStock');
        invStock++;
      }
      return null;
    };

    if (mode === 'prefix') {
      const prefix = typeof barcodePrefix === 'string' ? barcodePrefix.trim() : '';
      const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
      if (!prefix) return res.status(400).json({ error: 'Barcode prefix is required (e.g. SP, PUMP, etc.)' });
      const barcodes = generateBarcodesFromPrefix(prefix, qty);
      insertProductRow();
      const err = insertBarcodes(barcodes);
      if (err) return err;
    } else if (mode === 'auto') {
      const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
      const batchId = `B${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const base = `AUTO-${batchId}`;
      const barcodes = Array.from({ length: qty }, (_, i) => `${base}-${String(i + 1).padStart(4, '0')}`);
      insertProductRow();
      const err = insertBarcodes(barcodes);
      if (err) return err;
    } else if (mode === 'range' && typeof rangeStart === 'string' && typeof rangeEnd === 'string' && rangeStart.trim() && rangeEnd.trim()) {
      const barcodes = expandBarcodeRange(rangeStart.trim(), rangeEnd.trim());
      if (barcodes.length === 0) return res.status(400).json({ error: 'Invalid barcode range' });
      insertProductRow();
      const err = insertBarcodes(barcodes);
      if (err) return err;
    } else {
      insertProduct.run(id, name, barcode || null, catId, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, stock ?? 0, warrantyApplicable === false ? 0 : 1);
      invStock = stock ?? 0;
    }
    const row = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(mapProduct({ ...row, stock: invStock }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/products/:id/add-stock', (req, res) => {
  try {
    const { id } = req.params;
    const { rangeStart, rangeEnd, quantity, barcodeMode, barcodePrefix } = req.body;
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(id) as { id: string } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const mode = barcodeMode === 'auto' ? 'auto' : barcodeMode === 'range' ? 'range' : 'prefix';
    const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
    let barcodes: string[] = [];

    if (mode === 'prefix' || (mode !== 'auto' && mode !== 'range')) {
      const prefix = typeof barcodePrefix === 'string' ? barcodePrefix.trim() : '';
      if (!prefix) {
        const existing = db.prepare('SELECT barcode FROM product_inventory WHERE product_id = ? ORDER BY barcode DESC LIMIT 1').get(id) as { barcode: string } | undefined;
        if (existing) {
          const m = existing.barcode.match(/^(.+?)(\d+)$/);
          if (m) {
            barcodes = generateBarcodesFromPrefix(m[1], qty);
          } else {
            return res.status(400).json({ error: 'Cannot detect barcode prefix from existing barcodes. Provide barcodePrefix.' });
          }
        } else {
          return res.status(400).json({ error: 'No existing barcodes found. Provide barcodePrefix (e.g. SP).' });
        }
      } else {
        barcodes = generateBarcodesFromPrefix(prefix, qty);
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
    const invInsert = db.prepare('INSERT INTO product_inventory (id, product_id, barcode, batch_id, status) VALUES (?, ?, ?, ?, ?)');
    const base = `I${id}-${Date.now()}`;
    for (let i = 0; i < barcodes.length; i++) {
      const bc = barcodes[i];
      if (barcodeExists(bc)) return res.status(400).json({ error: `Barcode ${bc} already exists` });
      invInsert.run(`${base}-${i + 1}`, id, bc, batchId, 'InStock');
    }
    const count = db.prepare('SELECT COUNT(*) as c FROM product_inventory WHERE product_id = ? AND status = ?').get(id, 'InStock') as { c: number };
    const row = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(mapProduct({ ...row, stock: count.c }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, barcode, categoryId, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, price } = req.body;
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'Product not found' });
    const newBarcode = barcode === undefined ? row.barcode : (barcode || null);
    const stmt = db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        barcode = ?,
        category_id = COALESCE(?, category_id),
        description = COALESCE(?, description),
        reward_points_value = COALESCE(?, reward_points_value),
        manufacturing_date = ?,
        batch_number = ?,
        status = COALESCE(?, status),
        warranty_months = COALESCE(?, warranty_months),
        price = COALESCE(?, price)
      WHERE id = ?
    `);
    stmt.run(name, newBarcode, categoryId ?? row.category_id, description ?? row.description, rewardPointsValue ?? row.reward_points_value, manufacturingDate ?? row.manufacturing_date, batchNumber ?? row.batch_number, status ?? row.status, warrantyMonths ?? row.warranty_months, price ?? row.price, id);
    const updated = db.prepare('SELECT p.*, c.name as category_name, (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = ?) as inv_stock FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get('InStock', id) as Record<string, unknown>;
    res.json(mapProduct({ ...updated, stock: (updated.inv_stock as number) ?? updated.stock ?? 0 }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const exists = db.prepare('SELECT 1 FROM products WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Product not found' });
    const del = db.transaction(() => {
      db.prepare('PRAGMA foreign_keys = OFF').run();
      try {
        // Delete in order of foreign key dependencies (child tables first)
        const saleIds = db.prepare('SELECT id FROM product_sales WHERE product_id = ?').all(id) as { id: string }[];
        for (const s of saleIds) db.prepare('DELETE FROM rewards WHERE sale_id = ?').run(s.id);
        const warrantyIds = db.prepare('SELECT id FROM warranties WHERE product_id = ?').all(id) as { id: string }[];
        for (const w of warrantyIds) db.prepare('DELETE FROM product_replacements WHERE warranty_id = ?').run(w.id);
        db.prepare('DELETE FROM product_replacements WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM product_inventory WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM product_sales WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM product_distribution WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM warranties WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
      } finally {
        db.prepare('PRAGMA foreign_keys = ON').run();
      }
    });
    del();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
