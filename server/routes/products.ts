import { Router } from 'express';
import { pool } from '../pg-db';
import { mapProduct, logAudit } from '../utils/helpers';
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PRODUCTS ============
router.get('/api/products', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search } = req.query;
    let sql = `SELECT p.*,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as total_inv,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as inv_stock,
      (SELECT COUNT(*) FROM product_sales ps WHERE ps.product_id = p.id AND ps.tenant_id = $1) as sold_count,
      (SELECT COUNT(*) FROM product_distribution pd WHERE pd.product_id = p.id AND pd.status = 'Distributed' AND pd.tenant_id = $1) as with_vendors,
      (SELECT MIN(barcode) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as barcode_first,
      (SELECT MAX(barcode) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as barcode_last,
      (SELECT COALESCE(pi.unit_type, 'piece') FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1 LIMIT 1) as barcode_unit_type
      FROM products p WHERE p.tenant_id = $1`;
    const params: string[] = [tenantId];
    if (typeof search === 'string' && search) {
      const nextIdx = params.length + 1;
      sql += ` AND (p.name ILIKE $${nextIdx} OR p.barcode ILIKE $${nextIdx + 1} OR EXISTS (SELECT 1 FROM product_inventory pi2 WHERE pi2.product_id = p.id AND pi2.tenant_id = $1 AND pi2.barcode ILIKE $${nextIdx + 2}))`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY p.name';
    const rows = (await pool.query(sql, params)).rows;
    res.json((rows as Record<string, unknown>[]).map((r) => {
      const invCount = Number(r.inv_stock) || 0;
      const totalInv = Number(r.total_inv) || 0;
      return mapProduct({
      ...r,
      stock: invCount,
      totalInventory: totalInv,
      remainingInventory: invCount,
      soldCount: (r.sold_count as number) ?? 0,
      withVendors: (r.with_vendors as number) ?? 0,
      barcodeRange: (r.barcode_first && r.barcode_last) ? { first: r.barcode_first as string, last: r.barcode_last as string } : null,
      barcodeUnitType: (r.barcode_unit_type as string) || 'piece',
    }); }));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/products/:id/barcodes', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;
    const product = (await pool.query('SELECT id, name, price FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as { id: string; name: string; price: number } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const rows = (await pool.query('SELECT barcode, status FROM product_inventory WHERE product_id = $1 AND tenant_id = $2 ORDER BY barcode', [id, tenantId])).rows as { barcode: string; status: string }[];
    res.json({ product: { id: product.id, name: product.name, price: product.price }, barcodes: rows.map((r) => ({ barcode: r.barcode, status: r.status })) });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/products/verify/:barcode', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { barcode } = req.params;

    const [tenantRes, invRes, distRes, saleRes, warrantyRes, replacementsRes] = await Promise.all([
      pool.query('SELECT vendor_portal_enabled, barcode_system_enabled FROM tenants WHERE id = $1', [tenantId]),
      pool.query(`
        SELECT pi.barcode, pi.status, pi.created_at as added_at,
               p.id as product_id, p.name as product_name, p.price, p.description, p.warranty_months, p.hsn_code, p.gst_rate, p.warranty_applicable
        FROM product_inventory pi
        JOIN products p ON pi.product_id = p.id AND p.tenant_id = $2
        WHERE pi.barcode = $1 AND pi.tenant_id = $2
      `, [barcode, tenantId]),
      pool.query(`
        SELECT pd.vendor_id, pd.distribution_date, pd.status as dist_status, pd.discount_percent, pd.net_price, pd.gst_applied, pd.billed_price,
               v.name as vendor_name, v.phone as vendor_phone, v.contact_person
        FROM product_distribution pd
        LEFT JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $2
        WHERE pd.barcode = $1 AND pd.tenant_id = $2
      `, [barcode, tenantId]),
      pool.query(`
        SELECT ps.customer_name, ps.customer_phone, ps.customer_email, ps.purchase_date, ps.sale_price, ps.reward_points_earned,
               v.name as sold_by_vendor
        FROM product_sales ps
        LEFT JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $2
        WHERE ps.barcode = $1 AND ps.tenant_id = $2
      `, [barcode, tenantId]),
      pool.query(
        'SELECT status, activation_date, expiry_date FROM warranties WHERE barcode = $1 AND tenant_id = $2 ORDER BY activation_date DESC LIMIT 1',
        [barcode, tenantId]
      ),
      pool.query(
        'SELECT id, old_barcode, new_barcode, reason, replaced_date as created_at FROM product_replacements WHERE (old_barcode = $1 OR new_barcode = $1) AND tenant_id = $2 ORDER BY replaced_date DESC',
        [barcode, tenantId]
      )
    ]);

    const tenant = tenantRes.rows[0] as Record<string, unknown> | undefined;
    const features = {
      vendorPortal: tenant?.vendor_portal_enabled !== false,
      barcodeSystem: tenant?.barcode_system_enabled !== false,
    };

    const inv = invRes.rows[0] as Record<string, unknown> | undefined;
    if (!inv) return res.status(404).json({ error: 'Barcode not found', found: false });

    const dist = distRes.rows[0] as Record<string, unknown> | undefined;
    const sale = saleRes.rows[0] as Record<string, unknown> | undefined;
    const warranty = warrantyRes.rows[0] as Record<string, unknown> | undefined;
    const replacements = replacementsRes.rows as Record<string, unknown>[];

    const currentStatus = sale ? 'Sold' : dist ? (dist.dist_status as string) : (inv.status as string);

    const result: Record<string, unknown> = {
      found: true,
      barcode,
      currentStatus,
      features,
      product: {
        name: inv.product_name, price: inv.price, description: inv.description,
        hsnCode: inv.hsn_code, gstRate: inv.gst_rate,
        warrantyMonths: inv.warranty_months, warrantyApplicable: inv.warranty_applicable,
      },
      timeline: {
        addedToInventory: inv.added_at,
      },
    };

    if (dist) {
      result.distribution = {
        date: dist.distribution_date,
        status: dist.dist_status,
        discountPercent: dist.discount_percent,
        netPrice: dist.net_price,
        gstApplied: !!dist.gst_applied,
        billedPrice: dist.billed_price,
        vendorName: dist.vendor_name, vendorPhone: dist.vendor_phone, contactPerson: dist.contact_person,
      };
      (result.timeline as Record<string, unknown>).distributed = dist.distribution_date;
    }

    if (sale) {
      result.sale = {
        date: sale.purchase_date,
        salePrice: sale.sale_price,
        soldByVendor: sale.sold_by_vendor, customerName: sale.customer_name, customerPhone: sale.customer_phone, customerEmail: sale.customer_email,
        rewardPointsEarned: sale.reward_points_earned,
      };
      (result.timeline as Record<string, unknown>).sold = sale.purchase_date;
    }

    if (warranty) {
      result.warranty = { status: warranty.status, activationDate: warranty.activation_date, expiryDate: warranty.expiry_date };
    }

    if (replacements.length > 0) {
      result.replacements = replacements.map((r) => ({
        oldBarcode: r.old_barcode, newBarcode: r.new_barcode, reason: r.reason, date: r.created_at,
      }));
    }

    res.json(result);
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/products/by-barcode/:barcode', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { barcode } = req.params;
    let row = (await pool.query(`
      SELECT p.*,
      (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as inv_stock
      FROM products p
      JOIN product_inventory pi ON pi.product_id = p.id AND pi.barcode = $2 AND pi.status = 'InStock' AND pi.tenant_id = $1
      WHERE p.tenant_id = $1
    `, [tenantId, barcode])).rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      row = (await pool.query(`
        SELECT p.*,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as inv_stock
        FROM products p WHERE p.barcode = $2 AND p.tenant_id = $1
      `, [tenantId, barcode])).rows[0] as Record<string, unknown> | undefined;
    }
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(mapProduct({ ...row, stock: (row.inv_stock as number) ?? row.stock ?? 0 }));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/products', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name, barcode, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, price, stock, rangeStart, rangeEnd, quantity, barcodeMode, barcodePrefix, packSize, packName, hsnCode, gstRate, barcodePerBox } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Product name is required' });
    const duplicate = (await pool.query('SELECT id FROM products WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [tenantId, name.trim()])).rows[0];
    if (duplicate) return res.status(400).json({ error: `Product "${name}" already exists` });
    const id = `P${Date.now()}`;
    let invStock = 0;
    const mode = barcodeMode ?? 'prefix';
    const client = await pool.connect();
    try {
    await client.query('BEGIN');

    const insertProductRow = async () => {
      await client.query(
        `INSERT INTO products (id, name, barcode, description, reward_points_value, manufacturing_date, batch_number, status, warranty_months, price, stock, tenant_id, pack_size, pack_name, hsn_code, gst_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, name, null, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, 0, tenantId, packSize ?? 1, packName || 'Piece', hsnCode || null, gstRate ?? 18]
      );
    };
    const insertBarcodes = async (barcodes: string[]) => {
      const batchId = `B${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Batch check: verify no duplicates in one query
      const existing = (await client.query(
        'SELECT barcode FROM product_inventory WHERE barcode = ANY($1) AND tenant_id = $2',
        [barcodes, tenantId]
      )).rows;
      if (existing.length > 0) {
        throw new Error(`BARCODE_EXISTS:${(existing[0] as { barcode: string }).barcode}`);
      }
      // Batch insert all barcodes in one query
      const unitType = barcodePerBox && (Number(packSize) || 1) > 1 ? 'box' : 'piece';
      if (barcodes.length > 0) {
        const values: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;
        for (let i = 0; i < barcodes.length; i++) {
          values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`);
          params.push(`I${id}-${i + 1}`, id, barcodes[i], batchId, 'InStock', tenantId, unitType);
          paramIdx += 7;
        }
        await client.query(`INSERT INTO product_inventory (id, product_id, barcode, batch_id, status, tenant_id, unit_type) VALUES ${values.join(',')}`, params);
        invStock = barcodes.length;
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
      await client.query(
        `INSERT INTO products (id, name, barcode, description, reward_points_value, manufacturing_date, batch_number, status, warranty_months, price, stock, tenant_id, pack_size, pack_name, hsn_code, gst_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, name, barcode || null, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, stock ?? 0, tenantId, packSize ?? 1, packName || 'Piece', hsnCode || null, gstRate ?? 18]
      );
      invStock = stock ?? 0;
    }
    const createdPSize = Number(packSize) || 1;
    if (invStock > 0) await client.query('UPDATE products SET stock = $1 WHERE id = $2 AND tenant_id = $3', [invStock, id, tenantId]);
    await client.query('COMMIT');
    const row = (await pool.query(
      'SELECT p.* FROM products p WHERE p.id = $2 AND p.tenant_id = $1',
      [tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.status(201).json(mapProduct({ ...row, stock: invStock, remaining_inventory: invStock }));
    } catch (err) {
    await client.query('ROLLBACK');
    const errStr = String(err);
    if (errStr.includes('BARCODE_EXISTS:') || errStr.includes('uq_products_tenant_name')) {
      const bc = errStr.includes('BARCODE_EXISTS:') ? errStr.split('BARCODE_EXISTS:')[1] : null;
      return res.status(400).json({ error: bc ? `Barcode ${bc} already exists` : `Product "${name}" already exists` });
    }
    res.status(500).json({ error: errStr });
  } finally { client.release(); }
  } catch (outerErr) {
    console.error('[API Error]', req.path, outerErr); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/products/:id/add-stock', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { rangeStart, rangeEnd, quantity, barcodeMode, barcodePrefix, barcodePerBox, packSize: reqPackSize } = req.body;
    if (!quantity || Number(quantity) < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    const product = (await pool.query('SELECT id, pack_size FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as { id: string; pack_size: number } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const mode = barcodeMode === 'auto' ? 'auto' : barcodeMode === 'range' ? 'range' : 'prefix';
    const rawQty = Math.min(Math.max(1, Math.floor(Number(quantity))), 10000);
    const qty = rawQty;
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
    const existingBc = (await pool.query('SELECT barcode FROM product_inventory WHERE barcode = ANY($1) AND tenant_id = $2', [barcodes, tenantId])).rows;
    if (existingBc.length > 0) return res.status(400).json({ error: `Barcode ${(existingBc[0] as { barcode: string }).barcode} already exists` });
    const pSize = Number(reqPackSize || product.pack_size) || 1;
    const addUnitType = barcodePerBox && pSize > 1 ? 'box' : 'piece';
    if (barcodes.length > 0) {
      const values: string[] = [];
      const params: unknown[] = [];
      let pi = 1;
      for (let i = 0; i < barcodes.length; i++) {
        values.push(`($${pi}, $${pi+1}, $${pi+2}, $${pi+3}, $${pi+4}, $${pi+5}, $${pi+6})`);
        params.push(`${base}-${i + 1}`, id, barcodes[i], batchId, 'InStock', tenantId, addUnitType);
        pi += 7;
      }
      await pool.query(`INSERT INTO product_inventory (id, product_id, barcode, batch_id, status, tenant_id, unit_type) VALUES ${values.join(',')}`, params);
    }
    const count = (await pool.query('SELECT COUNT(*) as c FROM product_inventory WHERE product_id = $1 AND status = $2 AND tenant_id = $3', [id, 'InStock', tenantId])).rows[0] as { c: number };
    const stockCount = Number(count.c);
    await pool.query('UPDATE products SET stock = $1 WHERE id = $2 AND tenant_id = $3', [stockCount, id, tenantId]);
    const row = (await pool.query(
      'SELECT p.* FROM products p WHERE p.id = $2 AND p.tenant_id = $1',
      [tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.status(201).json(mapProduct({ ...row, stock: stockCount }));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/products/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, barcode, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, price, packSize, packName, hsnCode, gstRate } = req.body;
    const row = (await pool.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'Product not found' });
    if (name) {
      const dup = (await pool.query('SELECT id FROM products WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id != $3', [tenantId, name.trim(), id])).rows[0];
      if (dup) return res.status(400).json({ error: `Product "${name}" already exists` });
    }
    const newBarcode = barcode === undefined ? row.barcode : (barcode || null);
    await pool.query(`
      UPDATE products SET
        name = COALESCE($1, name),
        barcode = $2,
        description = COALESCE($3, description),
        reward_points_value = COALESCE($4, reward_points_value),
        manufacturing_date = $5,
        batch_number = $6,
        status = COALESCE($7, status),
        warranty_months = COALESCE($8, warranty_months),
        price = COALESCE($9, price),
        pack_size = COALESCE($12, pack_size),
        pack_name = COALESCE($13, pack_name),
        hsn_code = COALESCE($14, hsn_code),
        gst_rate = COALESCE($15, gst_rate)
      WHERE id = $10 AND tenant_id = $11
    `, [name, newBarcode, description ?? row.description, rewardPointsValue ?? row.reward_points_value, manufacturingDate ?? row.manufacturing_date, batchNumber ?? row.batch_number, status ?? row.status, warrantyMonths ?? row.warranty_months, price ?? row.price, id, tenantId, packSize ?? null, packName ?? null, hsnCode ?? null, gstRate ?? null]);
    const updated = (await pool.query(
      'SELECT p.*, (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = $1 AND pi.tenant_id = $2) as inv_stock FROM products p WHERE p.id = $3 AND p.tenant_id = $2',
      ['InStock', tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.json(mapProduct({ ...updated, stock: (updated.inv_stock as number) ?? updated.stock ?? 0 }));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
