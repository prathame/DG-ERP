import { Router } from 'express';
import { blockVendors, AuthRequest, vendorScopeId } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, parsePagination, applyDateFilter, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/warranties', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const today = new Date().toISOString().slice(0, 10);
    await pool.query(
      "UPDATE warranties SET status = 'Expired' WHERE tenant_id = $1 AND expiry_date < $2 AND status != 'Expired'",
      [tenantId, today]
    );

    const { search, status, vendorId } = req.query;
    const scoped = vendorScopeId(req);
    const forcedVendor = scoped || (typeof vendorId === 'string' ? vendorId : '');
    if (req.user?.role === 'Vendor' && !scoped) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }
    let sql = 'SELECT w.*, p.name as product_name FROM warranties w LEFT JOIN products p ON w.product_id = p.id AND p.tenant_id = $1';
    const params: (string | number)[] = [tenantId];
    let paramIdx = 2;

    if (forcedVendor) {
      sql += ` WHERE w.tenant_id = $1 AND w.barcode IN (SELECT barcode FROM product_sales WHERE vendor_id = $${paramIdx} AND tenant_id = $1)`;
      params.push(forcedVendor);
      paramIdx++;
    } else {
      sql += ' WHERE w.tenant_id = $1';
    }

    if (typeof search === 'string' && search) {
      sql += ` AND (w.barcode ILIKE $${paramIdx} OR w.customer_name ILIKE $${paramIdx + 1} OR p.name ILIKE $${paramIdx + 2} OR p.barcode = $${paramIdx + 3})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, search);
      paramIdx += 4;
    }
    if (typeof status === 'string' && status && status !== 'All Status') {
      sql += ` AND w.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    sql += applyDateFilter(req.query as Record<string, unknown>, 'w.activation_date', params);

    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const countSql = sql.replace('SELECT w.*, p.name as product_name FROM', 'SELECT COUNT(*) as c FROM');
    const totalResult = (await pool.query(countSql, params)).rows[0];
    const total = parseInt(totalResult.c, 10);

    paramIdx = params.length + 1;
    sql += ` ORDER BY w.activation_date DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);
    const warranties = rows.map((r: Record<string, unknown>) => ({
      id: r.id, productId: r.product_id, productName: r.product_name ?? null, barcode: r.barcode,
      replacedBarcode: r.replaced_barcode ?? null, customerName: r.customer_name, customerPhone: r.customer_phone,
      activationDate: r.activation_date, expiryDate: r.expiry_date, status: r.status,
    }));
    res.json({ data: warranties, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/warranties', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { barcode, customerName, customerPhone } = req.body;
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

    const id = uid('W');
    const activationDate = new Date().toISOString().slice(0, 10);
    // H9 fix: look up product via product_inventory.barcode (unit-level),
    // not products.barcode (product-level, often null or the first barcode only)
    const invRow = (await pool.query(
      'SELECT pi.product_id FROM product_inventory pi WHERE pi.barcode = $1 AND pi.tenant_id = $2 LIMIT 1',
      [barcode, tenantId]
    )).rows[0] as { product_id: string } | undefined;
    const product = invRow
      ? (await pool.query('SELECT id, warranty_months FROM products WHERE id = $1 AND tenant_id = $2', [invRow.product_id, tenantId])).rows[0] as { id: string; warranty_months: number } | undefined
      : undefined;
    const warrantyMonths = product?.warranty_months ?? 24;
    const now = new Date();
    const expiryDate = new Date(now.getFullYear(), now.getMonth() + warrantyMonths, Math.min(now.getDate(), 28));
    const expiryStr = expiryDate.toISOString().slice(0, 10);
    if (!product) return res.status(404).json({ error: `No product found for barcode ${barcode}` });

    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active')`,
      [id, tenantId, product.id, barcode, customerName, customerPhone, activationDate, expiryStr]
    );

    const row = (await pool.query(
      'SELECT * FROM warranties WHERE id = $1 AND tenant_id = $2', [id, tenantId]
    )).rows[0];
    res.status(201).json({
      id: row.id,
      productId: row.product_id,
      barcode: row.barcode,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      activationDate: row.activation_date,
      expiryDate: row.expiry_date,
      status: row.status,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/warranties/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { customerName, customerPhone, status, replacedBarcode } = req.body;
    const effectiveStatus = status === 'Expired' ? undefined : status;

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    updates.push(`customer_name = COALESCE($${paramIdx}, customer_name)`);
    params.push(customerName);
    paramIdx++;

    updates.push(`customer_phone = COALESCE($${paramIdx}, customer_phone)`);
    params.push(customerPhone);
    paramIdx++;

    updates.push(`status = COALESCE($${paramIdx}, status)`);
    params.push(effectiveStatus);
    paramIdx++;

    if (replacedBarcode !== undefined) {
      updates.push(`replaced_barcode = $${paramIdx}`);
      params.push(replacedBarcode || null);
      paramIdx++;
    }

    params.push(id);
    const idIdx = paramIdx;
    paramIdx++;
    params.push(tenantId);
    const tenantIdx = paramIdx;

    const result = await pool.query(
      `UPDATE warranties SET ${updates.join(', ')} WHERE id = $${idIdx} AND tenant_id = $${tenantIdx}`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Warranty not found' });

    const row = (await pool.query(
      'SELECT * FROM warranties WHERE id = $1 AND tenant_id = $2', [id, tenantId]
    )).rows[0] as Record<string, unknown>;

    // When replacedBarcode is set, create a product_replacements record
    if (replacedBarcode && typeof replacedBarcode === 'string' && replacedBarcode.trim()) {
      try {
        const w = row as { barcode: string; product_id: string; customer_name: string; customer_phone: string; activation_date?: string };
        const newBc = replacedBarcode.trim();
        const oldBc = w.barcode;
        const prod = (await pool.query(
          'SELECT name FROM products WHERE id = $1 AND tenant_id = $2', [w.product_id, tenantId]
        )).rows[0] as { name: string } | undefined;

        const repId = uid('REP');
        const replacedDate = new Date().toISOString().slice(0, 10);

        const wClient = await pool.connect();
        try {
          await wClient.query('BEGIN');
          const [firstBc, secondBc] = [oldBc, newBc].sort();
          await wClient.query(
            `SELECT 1 FROM product_distribution WHERE barcode = ANY($1::text[]) AND tenant_id = $2 FOR UPDATE`,
            [[firstBc, secondBc], tenantId]
          );
          await wClient.query(
            `SELECT 1 FROM product_sales WHERE barcode = ANY($1::text[]) AND tenant_id = $2 FOR UPDATE`,
            [[firstBc, secondBc], tenantId]
          );
          await wClient.query(
            `SELECT 1 FROM product_inventory WHERE barcode = ANY($1::text[]) AND tenant_id = $2 FOR UPDATE`,
            [[firstBc, secondBc], tenantId]
          );

          const existingRep = (await wClient.query(
            'SELECT 1 FROM product_replacements WHERE old_barcode = $1 AND tenant_id = $2 LIMIT 1',
            [oldBc, tenantId]
          )).rows[0];
          if (existingRep) {
            await wClient.query('ROLLBACK');
          } else {
            const sale = (await wClient.query(
              'SELECT vendor_id FROM product_sales WHERE barcode = $1 AND tenant_id = $2', [oldBc, tenantId]
            )).rows[0] as { vendor_id: string } | undefined;
            const distOld = (await wClient.query(
              'SELECT vendor_id, status FROM product_distribution WHERE barcode = $1 AND tenant_id = $2', [oldBc, tenantId]
            )).rows[0] as { vendor_id: string; status: string } | undefined;
            const repVendorId = sale?.vendor_id ?? distOld?.vendor_id ?? 'OWNER';

            const distNew = (await wClient.query(
              'SELECT vendor_id, status FROM product_distribution WHERE barcode = $1 AND tenant_id = $2', [newBc, tenantId]
            )).rows[0] as { vendor_id: string; status: string } | undefined;
            const invNew = repVendorId === 'OWNER'
              ? (await wClient.query(
                  'SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2', [newBc, tenantId]
                )).rows[0] as { status: string } | undefined
              : null;
            const newValid = (distNew?.vendor_id === repVendorId && distNew.status === 'Distributed')
              || (repVendorId === 'OWNER' && invNew?.status === 'InStock');
            if (!newValid || distOld?.status === 'Damaged' || distOld?.status === 'Replaced') {
              await wClient.query('ROLLBACK');
            } else {
              await wClient.query(
                `INSERT INTO product_replacements (id, tenant_id, old_barcode, new_barcode, warranty_id, product_id, product_name, customer_name, customer_phone, replaced_date, reason, vendor_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [repId, tenantId, oldBc, newBc, id, w.product_id, prod?.name ?? null, w.customer_name, w.customer_phone, replacedDate, 'Warranty claim', repVendorId]
              );
              await wClient.query("UPDATE product_distribution SET status = 'Damaged' WHERE barcode = $1 AND tenant_id = $2", [oldBc, tenantId]);
              await wClient.query("UPDATE product_distribution SET status = 'Replaced' WHERE barcode = $1 AND tenant_id = $2", [newBc, tenantId]);
              if (repVendorId === 'OWNER') {
                await wClient.query("UPDATE product_inventory SET status = 'Sold' WHERE barcode = $1 AND tenant_id = $2", [newBc, tenantId]);
              }
              await wClient.query('COMMIT');
            }
          }
        } catch (txErr) { await wClient.query('ROLLBACK'); console.error('Warranty replacement failed', txErr); } finally { wClient.release(); }
      } catch (repErr) { console.error('Warranty replacement setup failed', repErr); }
    }

    res.json({
      id: row.id,
      productId: row.product_id,
      barcode: row.barcode,
      replacedBarcode: row.replaced_barcode ?? null,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      activationDate: row.activation_date,
      expiryDate: row.expiry_date,
      status: row.status,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/warranties/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM warranties WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Warranty not found' });
    res.status(204).send();
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
