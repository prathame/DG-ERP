import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, mapProduct, logAudit } from '../utils/helpers';
import { barcodeExists, expandBarcodeRange, generateBarcodesFromPrefix } from '../utils/barcode';
import { requireAdmin, blockVendors, AuthRequest } from '../middleware/auth';
import { checkPlanLimit } from '../utils/planLimits';
import { withTenantClient } from '../pg-db';

const router = Router();

// ============ CATEGORIES ============
router.get('/api/categories', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (await pool.query('SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name', [tenantId])).rows as Record<string, unknown>[];
    res.json(rows.map((r) => ({ id: r.id, name: r.name })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/categories', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Category name is required' });
    const id = uid('CAT');
    await pool.query('INSERT INTO categories (id, name, tenant_id) VALUES ($1, $2, $3)', [id, String(name).trim(), tenantId]);
    const row = (await pool.query('SELECT * FROM categories WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown>;
    res.status(201).json({ id: row.id, name: row.name });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/categories/:id', requireAdmin, async (req: AuthRequest, res) => {
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/categories/:id', requireAdmin, async (req: AuthRequest, res) => {
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PRODUCTS ============
router.get('/api/products', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { search } = req.query;
    let sql = `SELECT p.*,
      COALESCE(inv.total, 0) as total_inv, COALESCE(inv.in_stock, 0) as inv_stock,
      inv.barcode_first, inv.barcode_last, COALESCE(inv.unit_type, 'piece') as barcode_unit_type,
      COALESCE(sc.cnt, 0) + COALESCE(ds.cnt, 0) as sold_count, COALESCE(dc.cnt, 0) as with_vendors
      FROM products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) as total, COUNT(*) FILTER (WHERE status='InStock') as in_stock,
          MIN(barcode) as barcode_first, MAX(barcode) as barcode_last, MAX(unit_type) as unit_type
        FROM product_inventory WHERE tenant_id = $1 GROUP BY product_id
      ) inv ON inv.product_id = p.id
      LEFT JOIN (SELECT product_id, COUNT(*) as cnt FROM product_sales WHERE tenant_id = $1 GROUP BY product_id) sc ON sc.product_id = p.id
      LEFT JOIN (SELECT product_id, COUNT(*) as cnt FROM product_distribution WHERE status='Distributed' AND tenant_id = $1 GROUP BY product_id) dc ON dc.product_id = p.id
      LEFT JOIN (SELECT product_id, COUNT(*) as cnt FROM product_distribution WHERE status='Sold' AND tenant_id = $1 GROUP BY product_id) ds ON ds.product_id = p.id
      WHERE p.tenant_id = $1`;
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
      const fallbackStock = Number(r.stock) || 0;
      const effectiveStock = totalInv > 0 ? invCount : fallbackStock;
      const effectiveTotal = totalInv > 0 ? totalInv : fallbackStock;
      return mapProduct({
      ...r,
      stock: effectiveStock,
      totalInventory: effectiveTotal,
      remainingInventory: effectiveStock,
      soldCount: (r.sold_count as number) ?? 0,
      withVendors: (r.with_vendors as number) ?? 0,
      barcodeRange: (r.barcode_first && r.barcode_last) ? { first: r.barcode_first as string, last: r.barcode_last as string } : null,
      barcodeUnitType: (r.barcode_unit_type as string) || 'piece',
    }); }));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/products/verify/:barcode', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { barcode } = req.params;

    const tenant = (await pool.query('SELECT vendor_portal_enabled, barcode_system_enabled FROM tenants WHERE id = $1', [tenantId])).rows[0] as Record<string, unknown> | undefined;
    const features = {
      vendorPortal: tenant?.vendor_portal_enabled !== false,
      barcodeSystem: tenant?.barcode_system_enabled !== false,
    };

    const inv = (await pool.query(`
      SELECT pi.barcode, pi.status, pi.created_at as added_at,
             p.id as product_id, p.name as product_name, p.price, p.description, p.warranty_months, p.hsn_code, p.gst_rate, p.warranty_applicable
      FROM product_inventory pi
      JOIN products p ON pi.product_id = p.id AND p.tenant_id = $2
      WHERE pi.barcode = $1 AND pi.tenant_id = $2
    `, [barcode, tenantId])).rows[0] as Record<string, unknown> | undefined;

    if (!inv) return res.status(404).json({ error: 'Barcode not found', found: false });

    const dist = (await pool.query(`
      SELECT pd.vendor_id, pd.distribution_date, pd.status as dist_status, pd.discount_percent, pd.net_price, pd.gst_applied, pd.billed_price,
             v.name as vendor_name, v.phone as vendor_phone, v.contact_person
      FROM product_distribution pd
      LEFT JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $2
      WHERE pd.barcode = $1 AND pd.tenant_id = $2
    `, [barcode, tenantId])).rows[0] as Record<string, unknown> | undefined;

    const sale = (await pool.query(`
      SELECT ps.customer_name, ps.customer_phone, ps.customer_email, ps.purchase_date, ps.sale_price, ps.reward_points_earned,
             v.name as sold_by_vendor
      FROM product_sales ps
      LEFT JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $2
      WHERE ps.barcode = $1 AND ps.tenant_id = $2
    `, [barcode, tenantId])).rows[0] as Record<string, unknown> | undefined;

    const warranty = (await pool.query(
      'SELECT status, activation_date, expiry_date FROM warranties WHERE barcode = $1 AND tenant_id = $2 ORDER BY activation_date DESC LIMIT 1',
      [barcode, tenantId]
    )).rows[0] as Record<string, unknown> | undefined;

    const replacements = (await pool.query(
      'SELECT id, old_barcode, new_barcode, reason, replaced_date as created_at FROM product_replacements WHERE (old_barcode = $1 OR new_barcode = $1) AND tenant_id = $2 ORDER BY replaced_date DESC',
      [barcode, tenantId]
    )).rows as Record<string, unknown>[];

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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch create — all-or-nothing (CSV import)
router.post('/api/products/batch', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { items } = req.body as { items: Record<string, unknown>[] };
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items to import' });

    // Validate all rows first — fail fast before any DB writes
    const errors: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      if (!r.name || !String(r.name).trim()) errors.push(`Row ${i + 1}: name is required`);
      if (r.hsnCode && !/^\d{4}(\d{2})?(\d{2})?$/.test(String(r.hsnCode).replace(/\s/g, ''))) errors.push(`Row ${i + 1} (${r.name}): HSN must be 4, 6, or 8 digits`);
    }
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    await client.query('BEGIN');
    let created = 0;
    let stockAdded = 0;
    const details: { name: string; action: 'created' | 'stock_added'; quantity: number }[] = [];
    for (const r of items) {
      const name = String(r.name).trim();
      const ps = Number(r.packSize) || 1;
      const qty = Number(r.quantity) || 0;
      const prefix = r.barcodePrefix ? String(r.barcodePrefix).trim() : '';
      const existing = (await client.query('SELECT id, stock FROM products WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [tenantId, name])).rows[0] as { id: string; stock: number } | undefined;

      let productId: string;
      if (existing) {
        // Add to existing stock
        productId = existing.id;
        if (qty > 0) await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2 AND tenant_id = $3', [qty, productId, tenantId]);
        stockAdded++;
        details.push({ name, action: 'stock_added', quantity: qty });
      } else {
        // Create new product
        productId = uid('P');
        await client.query(
          `INSERT INTO products (id, name, barcode, description, reward_points_value, manufacturing_date, batch_number, status, warranty_months, price, stock, tenant_id, pack_size, pack_name, hsn_code, gst_rate, price_includes_gst)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [productId, name, null, r.description || null, Number(r.rewardPointsValue) || 0, null, null, 'Active',
           Number(r.warrantyMonths) || 12, Number(r.price) || 0, qty, tenantId,
           ps > 1 ? ps : 1, r.packName || (ps > 1 ? 'Box' : 'Piece'),
           r.hsnCode || null, r.gstRate != null ? Number(r.gstRate) : 18, !!r.priceIncludesGst]
        );
        created++;
        details.push({ name, action: 'created', quantity: qty });
      }
      // Generate barcodes if prefix provided
      if (prefix && qty > 0) {
        const barcodes = await generateBarcodesFromPrefix(pool, tenantId, prefix, Math.min(qty, 10000));
        const unitType = (ps > 1) ? 'box' : 'piece';
        const batchId = uid('B');
        const vals: string[] = [];
        const params: unknown[] = [];
        let pIdx = 1;
        for (let j = 0; j < barcodes.length; j++) {
          vals.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6})`);
          params.push(uid('I'), productId, barcodes[j], batchId, 'InStock', tenantId, unitType);
          pIdx += 7;
        }
        if (vals.length) await client.query(`INSERT INTO product_inventory (id, product_id, barcode, batch_id, status, tenant_id, unit_type) VALUES ${vals.join(',')}`, params);
      }
    }
    await client.query('COMMIT');
    await logAudit(pool, tenantId, 'Batch Import', 'product', `batch-${Date.now()}`, `${created} created, ${stockAdded} stock added via CSV`);
    res.status(201).json({ success: created + stockAdded, created, stockAdded, details, errors: [] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (e as Error).message);
    res.status(500).json({ error: (e as Error).message || 'Import failed — no products were added' });
  } finally { client.release(); }
});

router.post('/api/products', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    // P1: enforce plan product limit
    const limitErr = await checkPlanLimit(tenantId, 'products');
    if (limitErr) return res.status(403).json(limitErr);

    const { name, barcode, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, price, stock, rangeStart, rangeEnd, quantity, barcodeMode, barcodePrefix, packSize, packName, hsnCode, gstRate, barcodePerBox, priceIncludesGst } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Product name is required' });
    if (hsnCode && !/^\d{4}(\d{2})?(\d{2})?$/.test(String(hsnCode).replace(/\s/g, ''))) return res.status(400).json({ error: 'HSN code must be 4, 6, or 8 digits' });
    const duplicate = (await pool.query('SELECT id FROM products WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [tenantId, name.trim()])).rows[0];
    if (duplicate) return res.status(400).json({ error: `Product "${name}" already exists` });
    const id = uid('P');
    let invStock = 0;
    const mode = barcodeMode ?? 'prefix';
    const client = await pool.connect();
    try {
    await client.query('BEGIN');

    const insertProductRow = async () => {
      await client.query(
        `INSERT INTO products (id, name, barcode, description, reward_points_value, manufacturing_date, batch_number, status, warranty_months, price, stock, tenant_id, pack_size, pack_name, hsn_code, gst_rate, price_includes_gst) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [id, name, null, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, 0, tenantId, packSize ?? 1, packName || 'Piece', hsnCode || null, gstRate ?? 18, !!priceIncludesGst]
      );
    };
    const insertBarcodes = async (barcodes: string[]) => {
      const batchId = uid('B');
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
        // Chunk at 5000 rows (7 params each = 35000 params per batch, safely under PG's 65535 limit)
        const CHUNK = 5000;
        let offset = 0;
        while (offset < barcodes.length) {
          const chunk = barcodes.slice(offset, offset + CHUNK);
          const values: string[] = [];
          const params: unknown[] = [];
          let paramIdx = 1;
          for (let i = 0; i < chunk.length; i++) {
            values.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6})`);
            params.push(`I${id}-${offset + i + 1}`, id, chunk[i], batchId, 'InStock', tenantId, unitType);
            paramIdx += 7;
          }
          await client.query(`INSERT INTO product_inventory (id,product_id,barcode,batch_id,status,tenant_id,unit_type) VALUES ${values.join(',')}`, params);
          offset += CHUNK;
        }
        invStock = barcodes.length;
      }
    };

    if (mode === 'prefix') {
      const prefix = typeof barcodePrefix === 'string' ? barcodePrefix.trim() : '';
      const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
      // H5: must ROLLBACK before early return — connection is mid-transaction
      if (!prefix) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Barcode prefix is required (e.g. SP, PUMP, etc.)' });
      }
      const barcodes = await generateBarcodesFromPrefix(pool, tenantId, prefix, qty);
      await insertProductRow();
      await insertBarcodes(barcodes);
    } else if (mode === 'auto') {
      const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), 10000);
      const batchId = uid('B');
      const base = `AUTO-${batchId}`;
      const barcodes = Array.from({ length: qty }, (_, i) => `${base}-${String(i + 1).padStart(4, '0')}`);
      await insertProductRow();
      await insertBarcodes(barcodes);
    } else if (mode === 'range' && typeof rangeStart === 'string' && typeof rangeEnd === 'string' && rangeStart.trim() && rangeEnd.trim()) {
      const barcodes = expandBarcodeRange(rangeStart.trim(), rangeEnd.trim());
      if (barcodes.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid barcode range' });
      }
      await insertProductRow();
      await insertBarcodes(barcodes);
    } else {
      await client.query(
        `INSERT INTO products (id, name, barcode, description, reward_points_value, manufacturing_date, batch_number, status, warranty_months, price, stock, tenant_id, pack_size, pack_name, hsn_code, gst_rate, price_includes_gst) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [id, name, barcode || null, description || null, rewardPointsValue ?? 0, manufacturingDate || null, batchNumber || null, status ?? 'Active', warrantyMonths ?? 12, price ?? 0, stock ?? 0, tenantId, packSize ?? 1, packName || 'Piece', hsnCode || null, gstRate ?? 18, !!priceIncludesGst]
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

router.post('/api/products/:id/add-stock', blockVendors, async (req: AuthRequest, res) => {
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
      const batchId = uid('B');
      const base = `AUTO-${batchId}`;
      barcodes = Array.from({ length: qty }, (_, i) => `${base}-${String(i + 1).padStart(4, '0')}`);
    } else if (mode === 'range' && typeof rangeStart === 'string' && typeof rangeEnd === 'string' && rangeStart.trim() && rangeEnd.trim()) {
      barcodes = expandBarcodeRange(rangeStart.trim(), rangeEnd.trim());
      if (barcodes.length === 0) return res.status(400).json({ error: 'Invalid range' });
    } else {
      return res.status(400).json({ error: 'Provide barcodePrefix + quantity, or barcodeMode=auto with quantity' });
    }

    const batchId = uid('B');
    const base = uid(`I${id}-`);
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/products/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { name, barcode, description, rewardPointsValue, manufacturingDate, batchNumber, status, warrantyMonths, price, packSize, packName, hsnCode, gstRate, priceIncludesGst } = req.body;
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
        gst_rate = COALESCE($15, gst_rate),
        price_includes_gst = COALESCE($16, price_includes_gst)
      WHERE id = $10 AND tenant_id = $11
    `, [name, newBarcode, description ?? row.description, rewardPointsValue ?? row.reward_points_value, manufacturingDate ?? row.manufacturing_date, batchNumber ?? row.batch_number, status ?? row.status, warrantyMonths ?? row.warranty_months, price ?? row.price, id, tenantId, (packSize !== undefined && Number(packSize) > 0) ? Number(packSize) : null, packName ?? null, hsnCode ?? null, gstRate ?? null, priceIncludesGst !== undefined ? !!priceIncludesGst : null]);
    const updated = (await pool.query(
      'SELECT p.*, (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = $1 AND pi.tenant_id = $2) as inv_stock FROM products p WHERE p.id = $3 AND p.tenant_id = $2',
      ['InStock', tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.json(mapProduct({ ...updated, stock: (updated.inv_stock as number) ?? updated.stock ?? 0 }));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all products for tenant — uses withTenantClient so RLS is active
router.delete('/api/products/all', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rowCount = await withTenantClient(tenantId, async (client) => {
      const tables = ['product_purchases', 'product_sales', 'product_distribution', 'product_inventory', 'price_lists', 'warranties', 'product_replacements'];
      for (const t of tables) await client.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]);
      const { rowCount: rc } = await client.query('DELETE FROM products WHERE tenant_id = $1', [tenantId]);
      return rc;
    });

    await logAudit(pool, tenantId, 'Delete All Products', 'product', 'all', `${rowCount} products deleted`);
    res.json({ deleted: rowCount });
  } catch (e) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (e as Error).message);
    res.status(500).json({ error: 'Failed to delete inventory' });
  }
});

router.delete('/api/products/:id', requireAdmin, async (req: AuthRequest, res) => {
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
      await client.query('DELETE FROM product_purchases WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
      await client.query('DELETE FROM price_lists WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
