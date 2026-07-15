import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

// Validate old barcode: returns vendor info (sold or distributed by which vendor)
router.get('/api/replacements/validate-old/:barcode', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { barcode } = req.params;
    const restrictToVendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : null;

    const sale = (await pool.query(
      `SELECT ps.vendor_id, ps.product_id, ps.customer_name, ps.customer_phone, ps.customer_email, v.name as vendor_name
       FROM product_sales ps
       JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $1
       WHERE ps.barcode = $2 AND ps.tenant_id = $1`,
      [tenantId, barcode]
    )).rows[0] as { vendor_id: string; product_id: string; vendor_name: string; customer_name: string; customer_phone: string; customer_email: string | null } | undefined;

    if (sale) {
      if (restrictToVendorId && sale.vendor_id !== restrictToVendorId) return res.json({ valid: false, error: 'Old barcode was sold by another vendor' });
      const prod = (await pool.query(
        'SELECT name FROM products WHERE id = $1 AND tenant_id = $2', [sale.product_id, tenantId]
      )).rows[0] as { name: string } | undefined;
      return res.json({
        valid: true,
        vendorId: sale.vendor_id,
        vendorName: sale.vendor_name,
        productId: sale.product_id,
        productName: prod?.name ?? null,
        customerName: sale.customer_name ?? '',
        customerPhone: sale.customer_phone ?? '',
        customerEmail: sale.customer_email ?? '',
      });
    }

    const dist = (await pool.query(
      `SELECT pd.vendor_id, pd.product_id, v.name as vendor_name
       FROM product_distribution pd
       JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
       WHERE pd.barcode = $2 AND pd.tenant_id = $1`,
      [tenantId, barcode]
    )).rows[0] as { vendor_id: string; product_id: string; vendor_name: string } | undefined;

    if (dist) {
      if (restrictToVendorId && dist.vendor_id !== restrictToVendorId) return res.json({ valid: false, error: 'Old barcode is assigned to another vendor' });
      const prod = (await pool.query(
        'SELECT name FROM products WHERE id = $1 AND tenant_id = $2', [dist.product_id, tenantId]
      )).rows[0] as { name: string } | undefined;
      return res.json({ valid: true, vendorId: dist.vendor_id, vendorName: dist.vendor_name, productId: dist.product_id, productName: prod?.name ?? null, customerName: '', customerPhone: '', customerEmail: '' });
    }

    return res.json({ valid: false, error: 'Old barcode not found (not sold or distributed)' });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate new barcode: must be allocated to vendor (Distributed) for replacement
router.get('/api/replacements/validate-new/:barcode', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { barcode } = req.params;
    const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : null;
    if (!vendorId) return res.json({ valid: false, error: 'Vendor context required. Verify old barcode first.' });

    const dist = (await pool.query(
      `SELECT pd.vendor_id, pd.product_id, v.name as vendor_name, p.name as product_name
       FROM product_distribution pd
       JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
       JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
       WHERE pd.barcode = $2 AND pd.status = 'Distributed' AND pd.tenant_id = $1`,
      [tenantId, barcode]
    )).rows[0] as { vendor_id: string; product_id: string; vendor_name: string; product_name: string } | undefined;

    if (dist) {
      if (dist.vendor_id !== vendorId) return res.json({ valid: false, error: `New barcode is allocated to ${dist.vendor_name}, not your vendor` });
      return res.json({ valid: true, vendorId: dist.vendor_id, vendorName: dist.vendor_name, productId: dist.product_id, productName: dist.product_name });
    }

    const assigned = (await pool.query(
      'SELECT vendor_id FROM product_distribution WHERE barcode = $1 AND tenant_id = $2',
      [barcode, tenantId]
    )).rows[0] as { vendor_id: string } | undefined;
    if (assigned) return res.json({ valid: false, error: 'New barcode already sold or returned' });

    if (vendorId === 'OWNER') {
      const inv = (await pool.query(
        `SELECT pi.product_id, p.name FROM product_inventory pi
         JOIN products p ON pi.product_id = p.id AND p.tenant_id = $1
         WHERE pi.barcode = $2 AND pi.status = $3 AND pi.tenant_id = $1`,
        [tenantId, barcode, 'InStock']
      )).rows[0] as { product_id: string; name: string } | undefined;
      if (inv) return res.json({ valid: true, vendorId: 'OWNER', vendorName: 'Owner', productId: inv.product_id, productName: inv.name });
    }

    return res.json({ valid: false, error: 'New barcode not allocated to your vendor. It must be distributed to you and available (status: Distributed).' });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/replacements', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vendorId = req.query.vendorId as string | undefined;
    let sql = `
      SELECT r.id, r.old_barcode, r.new_barcode, r.warranty_id, r.product_id, r.product_name,
             r.customer_name, r.customer_phone, r.replaced_date, r.reason, r.created_at, r.vendor_id,
             v.name as vendor_name
      FROM product_replacements r
      LEFT JOIN vendors v ON r.vendor_id = v.id AND v.tenant_id = $1
      WHERE r.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (vendorId) {
      sql += ` AND (r.vendor_id = $${paramIdx} OR (r.vendor_id IS NULL AND (
        EXISTS (SELECT 1 FROM product_sales ps WHERE ps.barcode = r.old_barcode AND ps.vendor_id = $${paramIdx + 1} AND ps.tenant_id = $1)
        OR EXISTS (SELECT 1 FROM product_distribution pd WHERE pd.barcode = r.old_barcode AND pd.vendor_id = $${paramIdx + 2} AND pd.tenant_id = $1)
      )))`;
      params.push(vendorId, vendorId, vendorId);
      paramIdx += 3;
    }

    sql += ' ORDER BY r.replaced_date DESC, r.created_at DESC';
    const { rows } = await pool.query(sql, params);
    const replacements = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      oldBarcode: r.old_barcode,
      newBarcode: r.new_barcode,
      warrantyId: r.warranty_id ?? null,
      productId: r.product_id ?? null,
      productName: r.product_name ?? null,
      vendorId: r.vendor_id ?? null,
      vendorName: r.vendor_name ?? null,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      replacedDate: r.replaced_date,
      reason: r.reason ?? null,
      createdAt: r.created_at,
    }));
    res.json(replacements);
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/replacements', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { oldBarcode, newBarcode, warrantyId, customerName, customerPhone, replacedDate, reason } = req.body;
    const restrictToVendorId = typeof req.body.vendorId === 'string' ? req.body.vendorId : null;
    if (!oldBarcode || !newBarcode || !customerName || !customerPhone) {
      return res.status(400).json({ error: 'oldBarcode, newBarcode, customerName, customerPhone are required' });
    }

    const id = uid('REP');
    const date = replacedDate || new Date().toISOString().slice(0, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock barcodes in stable order to avoid deadlocks under concurrent replace
      const [firstBc, secondBc] = [oldBarcode, newBarcode].sort();
      await client.query(
        `SELECT 1 FROM product_distribution WHERE barcode = ANY($1::text[]) AND tenant_id = $2 FOR UPDATE`,
        [[firstBc, secondBc], tenantId]
      );
      await client.query(
        `SELECT 1 FROM product_sales WHERE barcode = ANY($1::text[]) AND tenant_id = $2 FOR UPDATE`,
        [[firstBc, secondBc], tenantId]
      );
      await client.query(
        `SELECT 1 FROM product_inventory WHERE barcode = ANY($1::text[]) AND tenant_id = $2 FOR UPDATE`,
        [[firstBc, secondBc], tenantId]
      );

      const existingRep = (await client.query(
        'SELECT 1 FROM product_replacements WHERE old_barcode = $1 AND tenant_id = $2 LIMIT 1',
        [oldBarcode, tenantId]
      )).rows[0];
      if (existingRep) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Old barcode has already been replaced' });
      }

      const sale = (await client.query(
        'SELECT product_id, vendor_id FROM product_sales WHERE barcode = $1 AND tenant_id = $2',
        [oldBarcode, tenantId]
      )).rows[0] as { product_id: string; vendor_id: string } | undefined;

      const distOld = (await client.query(
        'SELECT product_id, vendor_id, status FROM product_distribution WHERE barcode = $1 AND tenant_id = $2',
        [oldBarcode, tenantId]
      )).rows[0] as { product_id: string; vendor_id: string; status: string } | undefined;

      const vendorId = sale?.vendor_id ?? distOld?.vendor_id ?? null;
      if (!vendorId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Old barcode not found (not sold or distributed)' });
      }
      if (restrictToVendorId && vendorId !== restrictToVendorId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Old barcode belongs to another vendor' });
      }
      if (distOld?.status === 'Damaged' || distOld?.status === 'Replaced') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Old barcode has already been replaced' });
      }

      const distNew = (await client.query(
        'SELECT vendor_id, status FROM product_distribution WHERE barcode = $1 AND tenant_id = $2',
        [newBarcode, tenantId]
      )).rows[0] as { vendor_id: string; status: string } | undefined;

      const invNew = vendorId === 'OWNER'
        ? (await client.query(
            'SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
            [newBarcode, tenantId]
          )).rows[0] as { status: string } | undefined
        : null;

      const newValid = (distNew?.vendor_id === vendorId && distNew.status === 'Distributed')
        || (vendorId === 'OWNER' && invNew?.status === 'InStock');
      if (!newValid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'New barcode is not allocated to the same vendor. Verify new barcode before saving.' });
      }

      const productId = sale?.product_id ?? distOld?.product_id ?? null;
      const prod = productId
        ? (await client.query('SELECT name FROM products WHERE id = $1 AND tenant_id = $2', [productId, tenantId])).rows[0] as { name: string } | undefined
        : null;

      await client.query(
        `INSERT INTO product_replacements (id, tenant_id, old_barcode, new_barcode, warranty_id, product_id, product_name, customer_name, customer_phone, replaced_date, reason, vendor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, tenantId, oldBarcode, newBarcode, warrantyId || null, productId, prod?.name ?? null, customerName, customerPhone, date, reason || null, vendorId]
      );
      await client.query("UPDATE product_distribution SET status = 'Damaged' WHERE barcode = $1 AND tenant_id = $2", [oldBarcode, tenantId]);
      await client.query("UPDATE product_distribution SET status = 'Replaced' WHERE barcode = $1 AND tenant_id = $2", [newBarcode, tenantId]);
      if (vendorId === 'OWNER') {
        await client.query("UPDATE product_inventory SET status = 'Sold' WHERE barcode = $1 AND tenant_id = $2", [newBarcode, tenantId]);
      }
      await client.query('COMMIT');
    } catch (txErr) { await client.query('ROLLBACK'); throw txErr; } finally { client.release(); }

    const row = (await pool.query(
      `SELECT r.*, v.name as vendor_name FROM product_replacements r
       LEFT JOIN vendors v ON r.vendor_id = v.id AND v.tenant_id = $1
       WHERE r.id = $2 AND r.tenant_id = $1`,
      [tenantId, id]
    )).rows[0] as Record<string, unknown>;

    res.status(201).json({
      id: row.id,
      oldBarcode: row.old_barcode,
      newBarcode: row.new_barcode,
      warrantyId: row.warranty_id ?? null,
      productId: row.product_id ?? null,
      productName: row.product_name ?? null,
      vendorId: row.vendor_id ?? null,
      vendorName: row.vendor_name ?? null,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      replacedDate: row.replaced_date,
      reason: row.reason ?? null,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
