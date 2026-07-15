import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

// ============ SUPPLIERS CRUD ============

router.get('/api/suppliers', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { search } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) {
      sql += ' AND (name ILIKE $2 OR contact_person ILIKE $3 OR phone ILIKE $4 OR email ILIKE $5)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, contactPerson: r.contact_person, phone: r.phone, email: r.email, address: r.address, gstNumber: r.gst_number ?? null,
    })));
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/api/suppliers', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, contactPerson, phone, email, address, gstNumber } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Supplier name is required' });
    if (phone && !/^\+?\d[\d\s-]{6,14}$/.test(phone.trim())) return res.status(400).json({ error: 'Invalid phone number' });
    const dup = (await pool.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [tenantId, name.trim()])).rows[0];
    if (dup) return res.status(400).json({ error: `Supplier "${name}" already exists` });
    const id = uid('S');
    await pool.query(
      'INSERT INTO suppliers (id, tenant_id, name, contact_person, phone, email, address, gst_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, tenantId, name, contactPerson || null, phone?.trim() || null, email || null, address || null, gstNumber || null]
    );
    const row = (await pool.query('SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.status(201).json({ id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, gstNumber: row.gst_number ?? null });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/api/suppliers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;
    const { name, contactPerson, phone, email, address, gstNumber } = req.body;
    if (phone && !/^\+?\d[\d\s-]{6,14}$/.test(phone.trim())) return res.status(400).json({ error: 'Invalid phone number' });
    if (name !== undefined && (!name || !name.trim())) return res.status(400).json({ error: 'Supplier name cannot be empty' });
    if (name) { const dup = (await pool.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id != $3', [tenantId, name.trim(), id])).rows[0]; if (dup) return res.status(400).json({ error: `Supplier "${name}" already exists` }); }
    const result = await pool.query(
      'UPDATE suppliers SET name=COALESCE(NULLIF($1,\'\'),name), contact_person=COALESCE($2,contact_person), phone=COALESCE($3,phone), email=COALESCE($4,email), address=COALESCE($5,address), gst_number=COALESCE($8,gst_number) WHERE id=$6 AND tenant_id=$7',
      [name, contactPerson, phone?.trim() || null, email, address, id, tenantId, gstNumber ?? null]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Supplier not found' });
    const row = (await pool.query('SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({ id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, gstNumber: row.gst_number ?? null });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/suppliers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const hasPurchases = (await pool.query("SELECT 1 FROM product_purchases WHERE supplier_id = $1 AND tenant_id = $2 LIMIT 1", [req.params.id, tenantId])).rows[0];
    if (hasPurchases) return res.status(400).json({ error: 'Cannot delete supplier with existing purchases. Remove purchase records first.' });
    await pool.query('DELETE FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    const result = await pool.query('DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Supplier not found' });
    res.status(204).send();
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// ============ PURCHASE BATCHES ============

router.post('/api/purchases/batch', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { supplierId, purchaseDate, amountPaid, items, gstRate: reqGstRate, invoiceNumber } = req.body as {
      supplierId?: string; purchaseDate?: string; amountPaid?: number; gstRate?: number; invoiceNumber?: string;
      items?: { productId: string; quantity: number; costPrice?: number; discountPercent?: number; withGst?: boolean }[];
    };
    if (!supplierId) return res.status(400).json({ error: 'Supplier is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one product' });

    const supplier = (await pool.query('SELECT id, name FROM suppliers WHERE id = $1 AND tenant_id = $2', [supplierId, tenantId])).rows[0] as { id: string; name: string } | undefined;
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const gstRate = Number(reqGstRate) || 18;
    const date = purchaseDate || new Date().toISOString().slice(0, 10);
    const batchId = uid('PB');
    const paidAmount = amountPaid ? Math.max(0, Number(amountPaid)) : 0;

    let totalBilled = 0;
    let totalQty = 0;
    const productNames: string[] = [];
    const purchaseRows: { id: string; productId: string; qty: number; costPrice: number; gstApplied: boolean; billedPrice: number; disc: number }[] = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
      const product = (await pool.query(
        'SELECT id, name, price FROM products WHERE id = $1 AND tenant_id = $2',
        [item.productId, tenantId]
      )).rows[0] as { id: string; name: string; price: number } | undefined;
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });

      const basePrice = item.costPrice ? Number(item.costPrice) : Number(product.price);
      const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
      const costPricePerUnit = Math.round((basePrice * (100 - disc) / 100) * 100) / 100;
      const gstApplied = item.withGst !== false;
      const billedPricePerUnit = gstApplied ? Math.round(costPricePerUnit * (100 + gstRate) / 100) : costPricePerUnit;

      productNames.push(product.name);
      purchaseRows.push({ id: `${batchId}-${totalQty + 1}`, productId: product.id, qty, costPrice: costPricePerUnit, gstApplied, billedPrice: billedPricePerUnit, disc });
      totalBilled += billedPricePerUnit * qty;
      totalQty += qty;
    }

    if (paidAmount > totalBilled) return res.status(400).json({ error: `Amount paid (₹${paidAmount}) cannot exceed billed amount (₹${totalBilled})` });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Bulk INSERT all purchase rows in one query
      const purchaseVals: string[] = [];
      const purchasePs: unknown[] = [];
      let seq = 0;
      let pIdx = 1;
      for (const u of purchaseRows) {
        for (let i = 0; i < u.qty; i++) {
          seq++;
          purchaseVals.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10})`);
          purchasePs.push(`${batchId}-${seq}`, tenantId, batchId, u.productId, supplierId, date, u.costPrice, u.gstApplied, u.billedPrice, u.disc, invoiceNumber || null);
          pIdx += 11;
        }
      }
      if (purchaseVals.length > 0) {
        await client.query(
          `INSERT INTO product_purchases (id,tenant_id,batch_id,product_id,supplier_id,purchase_date,cost_price,gst_applied,billed_price,discount_percent,invoice_number) VALUES ${purchaseVals.join(',')}`,
          purchasePs
        );
      }
      if (paidAmount > 0) {
        const payId = uid('SP');
        await client.query(
          'INSERT INTO supplier_payments (id, tenant_id, supplier_id, amount, payment_date, payment_method, notes, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [payId, tenantId, supplierId, paidAmount, date, 'Cash', `Payment with purchase ${batchId}`, batchId]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    await logAudit(pool, tenantId, 'Purchase Created', 'purchase', batchId, `${totalQty} units from ${supplier.name}, Bill: ₹${totalBilled}`);

    res.status(201).json({
      batchId, supplierId, supplierName: supplier.name, purchaseDate: date,
      productNames: [...new Set(productNames)], total: totalQty,
      billValue: totalBilled, amountPaid: paidAmount, balanceRemaining: totalBilled - paidAmount,
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/purchases/batches', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { supplierId } = req.query;
    let sql = `
      SELECT pp.batch_id, pp.supplier_id, s.name as supplier_name, MIN(pp.purchase_date) as purchase_date,
        COUNT(*) as total, SUM(COALESCE(pp.billed_price, pp.cost_price)) as bill_value,
        STRING_AGG(DISTINCT p.name, ',') as product_names
      FROM product_purchases pp
      JOIN products p ON pp.product_id = p.id AND p.tenant_id = $1
      JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = $1
      WHERE pp.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (typeof supplierId === 'string' && supplierId) { idx++; sql += ` AND pp.supplier_id = $${idx}`; params.push(supplierId); }
    sql += ' GROUP BY pp.batch_id, pp.supplier_id, s.name ORDER BY MIN(pp.purchase_date) DESC';
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];

    const batchIds = rows.map(r => r.batch_id as string);
    const paymentMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const payRows = (await pool.query(
        'SELECT batch_id, SUM(amount) as total_paid FROM supplier_payments WHERE batch_id = ANY($1) AND tenant_id = $2 GROUP BY batch_id',
        [batchIds, tenantId]
      )).rows as { batch_id: string; total_paid: string }[];
      for (const pr of payRows) paymentMap[pr.batch_id] = Number(pr.total_paid);
    }

    res.json(rows.map((r) => {
      const paid = paymentMap[r.batch_id as string] ?? 0;
      const billVal = Number(r.bill_value);
      return {
        batchId: r.batch_id, supplierId: r.supplier_id, supplierName: r.supplier_name,
        purchaseDate: r.purchase_date, productNames: (r.product_names as string || '').split(',').filter(Boolean),
        total: Number(r.total), billValue: billVal, amountPaid: paid, balanceRemaining: billVal - paid,
      };
    }));
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/purchases/batch/:batchId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId } = req.params;

    const rows = (await pool.query(`
      SELECT pp.product_id, pp.cost_price, pp.gst_applied, pp.discount_percent, pp.billed_price,
             p.name as product_name, p.price
      FROM product_purchases pp
      JOIN products p ON pp.product_id = p.id AND p.tenant_id = $1
      WHERE pp.batch_id = $2 AND pp.tenant_id = $1
    `, [tenantId, batchId])).rows as Record<string, unknown>[];
    if (rows.length === 0) return res.status(404).json({ error: 'Purchase batch not found' });

    const batch = (await pool.query(`
      SELECT pp.batch_id, pp.supplier_id, s.name as supplier_name, MIN(pp.purchase_date) as purchase_date,
        COUNT(*) as total, SUM(COALESCE(pp.billed_price, pp.cost_price)) as bill_value,
        STRING_AGG(DISTINCT p.name, ',') as product_names
      FROM product_purchases pp
      JOIN products p ON pp.product_id = p.id AND p.tenant_id = $1
      JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = $1
      WHERE pp.batch_id = $2 AND pp.tenant_id = $1
      GROUP BY pp.batch_id, pp.supplier_id, s.name
    `, [tenantId, batchId])).rows[0] as Record<string, unknown>;

    const groups: Record<string, { productId: string; productName: string; quantity: number; costPrice: number; discountPercent: number; withGst: boolean }> = {};
    for (const r of rows) {
      const pid = r.product_id as string;
      if (!groups[pid]) groups[pid] = { productId: pid, productName: r.product_name as string, quantity: 0, costPrice: Number(r.cost_price), discountPercent: Number(r.discount_percent) || 0, withGst: !!r.gst_applied };
      groups[pid].quantity++;
    }

    const batchPaid = Number((await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as t FROM supplier_payments WHERE batch_id = $1 AND tenant_id = $2',
      [batchId, tenantId]
    )).rows[0]?.t ?? 0);
    const billValue = Number(batch.bill_value);

    res.json({
      batchId, supplierId: batch.supplier_id, supplierName: batch.supplier_name,
      purchaseDate: batch.purchase_date, productNames: String(batch.product_names || '').split(',').filter(Boolean),
      total: Number(batch.total), billValue, amountPaid: batchPaid, balanceRemaining: billValue - batchPaid,
      items: Object.values(groups),
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// ============ SUPPLIER FINANCE ============

router.get('/api/supplier-finance/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const suppliers = (await pool.query(`
      SELECT s.id, s.name, s.phone,
        COALESCE((SELECT SUM(COALESCE(pp.billed_price, pp.cost_price)) FROM product_purchases pp WHERE pp.supplier_id = s.id AND pp.tenant_id = $1), 0) as total_purchased_value,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id AND tenant_id = $1), 0) as total_paid,
        (SELECT COUNT(*) FROM product_purchases WHERE supplier_id = s.id AND tenant_id = $1) as units_purchased
      FROM suppliers s WHERE s.tenant_id = $1 ORDER BY s.name
    `, [tenantId])).rows as Record<string, unknown>[];
    res.json(suppliers.map((s) => {
      const purchased = Number(s.total_purchased_value) || 0;
      const paid = Number(s.total_paid) || 0;
      return {
        supplierId: s.id, supplierName: s.name, supplierPhone: s.phone ?? '',
        totalPurchasedValue: purchased, totalPaid: paid, balance: purchased - paid,
        unitsPurchased: Number(s.units_purchased) || 0,
      };
    }));
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/supplier-finance/:supplierId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { supplierId } = req.params;
    const supplier = (await pool.query('SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2', [supplierId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const totalValue = Number((await pool.query('SELECT COALESCE(SUM(COALESCE(billed_price, cost_price)), 0) as t FROM product_purchases WHERE supplier_id = $1 AND tenant_id = $2', [supplierId, tenantId])).rows[0]?.t ?? 0) || 0;
    const totalPaid = Number((await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2', [supplierId, tenantId])).rows[0]?.t ?? 0) || 0;
    const payments = (await pool.query('SELECT * FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2 ORDER BY payment_date DESC', [supplierId, tenantId])).rows as Record<string, unknown>[];
    res.json({
      supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone, email: supplier.email, address: supplier.address, gstNumber: supplier.gst_number },
      totalPurchasedValue: totalValue, totalPaid, balance: totalValue - totalPaid,
      payments: payments.map((p) => ({ id: p.id, amount: Number(p.amount), paymentDate: p.payment_date, paymentMethod: p.payment_method, referenceNumber: p.reference_number, notes: p.notes })),
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/api/supplier-finance/:supplierId/payments', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { supplierId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNumber, notes, batchId } = req.body;
    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount must be a valid number greater than 0' });
    const supplier = (await pool.query('SELECT id FROM suppliers WHERE id = $1 AND tenant_id = $2', [supplierId, tenantId])).rows[0];
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const id = uid('SP');
    await pool.query(
      'INSERT INTO supplier_payments (id, tenant_id, supplier_id, amount, payment_date, payment_method, reference_number, notes, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, tenantId, supplierId, parsedAmount, paymentDate || new Date().toISOString().slice(0, 10), paymentMethod || 'Cash', referenceNumber || null, notes || null, batchId || null]
    );
    const row = (await pool.query('SELECT * FROM supplier_payments WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown>;
    res.status(201).json({ id: row.id, amount: Number(row.amount), paymentDate: row.payment_date, paymentMethod: row.payment_method });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
