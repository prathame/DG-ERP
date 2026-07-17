import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { resolvePrice } from '../utils/price-resolve';
import { Router } from 'express';
import { pool } from '../pg-db';
import { blockVendors, AuthRequest } from '../middleware/auth';

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
    if (productId) {
      sql += ` AND pl.product_id = $${idx++}`;
      params.push(productId);
    }
    if (vendorId) {
      sql += ` AND pl.vendor_id = $${idx++}`;
      params.push(vendorId);
    }
    sql += ' ORDER BY p.name, pl.min_qty';
    const { rows } = await pool.query(sql, params);
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        productId: r.product_id,
        productName: r.product_name,
        vendorId: r.vendor_id,
        vendorName: r.vendor_name,
        minQty: Number(r.min_qty) || 1,
        maxQty: r.max_qty ? Number(r.max_qty) : null,
        price: Number(r.price) || 0,
        isActive: r.is_active !== false,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Get best price for a product + vendor + quantity
router.get('/api/price-lists/resolve', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { productId, vendorId, quantity } = req.query;
    if (!productId) return res.status(400).json({ error: 'productId required' });
    const resolved = await resolvePrice(
      tenantId,
      String(productId),
      vendorId ? String(vendorId) : null,
      Number(quantity) || 1,
    );
    res.json(resolved);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Bulk import price rules (CSV) — resolve product/vendor by name
router.post('/api/price-lists/bulk', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const rules = req.body?.rules;
    if (!Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ error: 'rules array required' });
    }
    if (rules.length > 500) return res.status(400).json({ error: 'Maximum 500 rules per import' });

    const products = (await pool.query('SELECT id, name FROM products WHERE tenant_id = $1', [tenantId])).rows as {
      id: string;
      name: string;
    }[];
    const vendors = (await pool.query('SELECT id, name FROM vendors WHERE tenant_id = $1', [tenantId])).rows as {
      id: string;
      name: string;
    }[];
    const productByName = new Map(products.map(p => [p.name.trim().toLowerCase(), p.id]));
    const vendorByName = new Map(vendors.map(v => [v.name.trim().toLowerCase(), v.id]));

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < rules.length; i++) {
      const row = rules[i] as Record<string, unknown>;
      const rowNum = i + 2; // header = row 1
      const productName = String(row.productName || row.product || '').trim();
      const vendorName = String(row.vendorName || row.vendor || '').trim();
      const price = Number(row.price);
      const minQty = Number(row.minQty ?? row.min_qty ?? 1) || 1;
      const maxRaw = row.maxQty ?? row.max_qty;
      const maxQty = maxRaw === '' || maxRaw == null || maxRaw === undefined ? null : Number(maxRaw);
      const name = String(row.name || row.ruleName || '').trim() || 'Imported Price';

      if (!productName) {
        errors.push(`Row ${rowNum}: productName is required`);
        continue;
      }
      const productId = productByName.get(productName.toLowerCase());
      if (!productId) {
        errors.push(`Row ${rowNum}: product "${productName}" not found — add it in Masters first`);
        continue;
      }
      if (!price || price <= 0 || Number.isNaN(price)) {
        errors.push(`Row ${rowNum}: price must be greater than 0`);
        continue;
      }
      let vendorId: string | null = null;
      if (vendorName) {
        vendorId = vendorByName.get(vendorName.toLowerCase()) || null;
        if (!vendorId) {
          errors.push(`Row ${rowNum}: vendor "${vendorName}" not found`);
          continue;
        }
      }
      if (maxQty != null && (Number.isNaN(maxQty) || maxQty < minQty)) {
        errors.push(`Row ${rowNum}: maxQty must be >= minQty`);
        continue;
      }

      try {
        const id = uid('PL');
        await pool.query(
          'INSERT INTO price_lists (id, tenant_id, name, product_id, vendor_id, min_qty, max_qty, price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id, tenantId, name, productId, vendorId, minQty, maxQty, price],
        );
        success++;
      } catch (err) {
        errors.push(`Row ${rowNum}: ${(err as Error).message}`);
      }
    }

    res.json({ success, errors });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Create price rule
router.post('/api/price-lists', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, productId, vendorId, minQty, maxQty, price } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product is required' });
    if (!price || Number(price) <= 0) return res.status(400).json({ error: 'Price must be greater than 0' });

    const id = uid('PL');
    await pool.query(
      'INSERT INTO price_lists (id, tenant_id, name, product_id, vendor_id, min_qty, max_qty, price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        tenantId,
        name || 'Custom Price',
        productId,
        vendorId || null,
        Number(minQty) || 1,
        maxQty ? Number(maxQty) : null,
        Number(price),
      ],
    );
    res.status(201).json({
      id,
      name: name || 'Custom Price',
      productId,
      vendorId,
      minQty: Number(minQty) || 1,
      maxQty: maxQty ? Number(maxQty) : null,
      price: Number(price),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Update price rule
router.put('/api/price-lists/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, minQty, maxQty, price, isActive } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      params.push(name);
    }
    if (minQty !== undefined) {
      updates.push(`min_qty = $${idx++}`);
      params.push(Number(minQty) || 1);
    }
    if (maxQty !== undefined) {
      updates.push(`max_qty = $${idx++}`);
      params.push(maxQty ? Number(maxQty) : null);
    }
    if (price !== undefined) {
      if (Number(price) <= 0) return res.status(400).json({ error: 'Price must be greater than 0' });
      updates.push(`price = $${idx++}`);
      params.push(Number(price));
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      params.push(!!isActive);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates' });
    params.push(req.params.id, tenantId);
    const result = await pool.query(
      `UPDATE price_lists SET ${updates.join(',')} WHERE id = $${idx++} AND tenant_id = $${idx}`,
      params,
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Price rule not found' });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Delete price rule
router.delete('/api/price-lists/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM price_lists WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Price rule not found' });
    res.status(204).send();
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
