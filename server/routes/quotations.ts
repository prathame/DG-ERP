import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/quotations', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.query;
    let sql = 'SELECT * FROM quotations WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof status === 'string' && status) { sql += ' AND status = $2'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    res.json(rows.map(r => ({
      id: r.id, quotationNumber: r.quotation_number, vendorId: r.vendor_id, vendorName: r.vendor_name,
      customerName: r.customer_name, customerPhone: r.customer_phone, customerEmail: r.customer_email,
      quotationDate: r.quotation_date, validUntil: r.valid_until, status: r.status,
      items: r.items, subtotal: Number(r.subtotal) || 0, gstRate: Number(r.gst_rate) || 18,
      gstAmount: Number(r.gst_amount) || 0, total: Number(r.total) || 0,
      notes: r.notes, convertedBatchId: r.converted_batch_id,
    })));
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/api/quotations', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { vendorId, customerName, customerPhone, customerEmail, quotationDate, validUntil, items, gstRate, notes } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one item' });

    const rate = Number(gstRate) || 18;
    let subtotal = 0;
    const resolvedItems = [];
    for (const item of items) {
      const product = (await pool.query('SELECT id, name, price FROM products WHERE id = $1 AND tenant_id = $2', [item.productId, tenantId])).rows[0] as { id: string; name: string; price: number } | undefined;
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });
      const price = item.customPrice ? Number(item.customPrice) : Number(product.price);
      const qty = Math.max(1, Number(item.quantity) || 1);
      const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
      const lineNet = Math.round(price * qty * (100 - disc) / 100);
      const lineGst = item.withGst !== false ? Math.round(lineNet * rate / 100) : 0;
      subtotal += lineNet;
      resolvedItems.push({ productId: product.id, productName: product.name, quantity: qty, price, discountPercent: disc, withGst: item.withGst !== false, lineNet, lineGst, lineTotal: lineNet + lineGst });
    }
    const gstAmount = resolvedItems.reduce((s, i) => s + i.lineGst, 0);
    const total = subtotal + gstAmount;

    const id = uid('Q');
    const maxNum = (await pool.query("SELECT MAX(CAST(SUBSTRING(quotation_number FROM 4) AS INTEGER)) as m FROM quotations WHERE tenant_id = $1 AND quotation_number LIKE 'QT-%'", [tenantId])).rows[0]?.m;
    const qNum = `QT-${String((Number(maxNum) || 0) + 1).padStart(4, '0')}`;

    let vendorName = customerName || null;
    if (vendorId) {
      const v = (await pool.query('SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as { name: string } | undefined;
      if (v) vendorName = v.name;
    }

    await pool.query(
      `INSERT INTO quotations (id, tenant_id, quotation_number, vendor_id, vendor_name, customer_name, customer_phone, customer_email, quotation_date, valid_until, status, items, subtotal, gst_rate, gst_amount, total, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [id, tenantId, qNum, vendorId || null, vendorName, customerName || vendorName, customerPhone || null, customerEmail || null, quotationDate || new Date().toISOString().slice(0, 10), validUntil || null, 'Draft', JSON.stringify(resolvedItems), subtotal, rate, gstAmount, total, notes || null]
    );

    await logAudit(pool, tenantId, 'Quotation Created', 'quotation', id, `${qNum} for ${vendorName || 'customer'}, ₹${total}`);

    res.status(201).json({
      id, quotationNumber: qNum, vendorId, vendorName, customerName: customerName || vendorName,
      customerPhone, customerEmail, quotationDate: quotationDate || new Date().toISOString().slice(0, 10),
      validUntil, status: 'Draft', items: resolvedItems, subtotal, gstRate: rate, gstAmount, total, notes,
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/quotations/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const row = (await pool.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'Quotation not found' });
    res.json({
      id: row.id, quotationNumber: row.quotation_number, vendorId: row.vendor_id, vendorName: row.vendor_name,
      customerName: row.customer_name, customerPhone: row.customer_phone, customerEmail: row.customer_email,
      quotationDate: row.quotation_date, validUntil: row.valid_until, status: row.status,
      items: row.items, subtotal: Number(row.subtotal), gstRate: Number(row.gst_rate), gstAmount: Number(row.gst_amount), total: Number(row.total),
      notes: row.notes, convertedBatchId: row.converted_batch_id,
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/api/quotations/:id/status', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.body;
    if (!['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const current = (await pool.query('SELECT status FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])).rows[0] as { status: string } | undefined;
    if (!current) return res.status(404).json({ error: 'Quotation not found' });
    const validTransitions: Record<string, string[]> = { Draft: ['Sent', 'Rejected', 'Expired'], Sent: ['Accepted', 'Rejected', 'Expired'], Accepted: ['Converted'], Rejected: ['Draft'], Expired: ['Draft'], Converted: [] };
    if (!(validTransitions[current.status] ?? []).includes(status)) return res.status(400).json({ error: `Cannot change from ${current.status} to ${status}` });
    const result = await pool.query('UPDATE quotations SET status = $1 WHERE id = $2 AND tenant_id = $3', [status, req.params.id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Quotation not found' });
    res.json({ ok: true, status });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/quotations/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM quotations WHERE id = $1 AND tenant_id = $2 AND status IN ($3, $4)', [req.params.id, tenantId, 'Draft', 'Rejected']);
    if (result.rowCount === 0) return res.status(400).json({ error: 'Can only delete Draft or Rejected quotations' });
    res.json({ ok: true });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/api/quotations/:id/convert', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const quote = (await pool.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });
    if (quote.status === 'Converted') return res.status(400).json({ error: 'Already converted' });
    if (quote.status !== 'Accepted') return res.status(400).json({ error: 'Quotation must be accepted before converting' });
    if (!quote.vendor_id) return res.status(400).json({ error: 'Quotation must have a vendor to convert to distribution' });

    const items = quote.items as { productId: string; quantity: number; price: number; discountPercent: number; withGst: boolean }[];
    const distItems = items.map(i => ({ productId: i.productId, quantity: i.quantity, customPrice: i.price, discountPercent: i.discountPercent, withGst: i.withGst }));

    // Create distribution batch via internal call
    const gstRate = Number(quote.gst_rate) || 18;
    const date = (quote.quotation_date as string) || new Date().toISOString().slice(0, 10);
    const vendorId = quote.vendor_id as string;

    // Inline distribution creation (mirrors POST /distribution/batch logic)
    const batchId = uid('D');
    let totalBilled = 0;
    let totalQty = 0;
    const productNames: string[] = [];
    const unitRows: { distId: string; productId: string; barcode: string; invId: string; disc: number; netPrice: number; gstApplied: number; billedPrice: number }[] = [];

    for (const item of distItems) {
      const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
      const product = (await pool.query('SELECT id, name, price FROM products WHERE id = $1 AND tenant_id = $2', [item.productId, tenantId])).rows[0] as { id: string; name: string; price: number } | undefined;
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });
      const basePrice = item.customPrice ? Number(item.customPrice) : product.price;
      const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
      const netPricePerUnit = Math.round((basePrice * (100 - disc) / 100) * 100) / 100;
      const gstApplied = item.withGst !== false ? 1 : 0;
      const billedPricePerUnit = gstApplied ? Math.round(netPricePerUnit * (100 + gstRate) / 100) : netPricePerUnit;
      const invRows = (await pool.query(`SELECT id, barcode FROM product_inventory WHERE product_id = $1 AND status = 'InStock' AND tenant_id = $2 ORDER BY id LIMIT $3`, [product.id, tenantId, qty])).rows as { id: string; barcode: string }[];
      if (invRows.length < qty) return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${invRows.length}, requested: ${qty}` });
      productNames.push(product.name);
      for (const inv of invRows) {
        unitRows.push({ distId: '', productId: product.id, barcode: inv.barcode, invId: inv.id, disc, netPrice: netPricePerUnit, gstApplied, billedPrice: billedPricePerUnit });
        totalBilled += billedPricePerUnit;
        totalQty++;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < unitRows.length; i++) {
        const u = unitRows[i];
        const distId = `${batchId}-${i + 1}`;
        await client.query(
          'INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [distId, batchId, u.productId, u.barcode, vendorId, date, 'Distributed', u.disc, u.netPrice, u.gstApplied, u.billedPrice, tenantId]
        );
        await client.query('UPDATE product_inventory SET status = $1 WHERE id = $2 AND tenant_id = $3', ['Distributed', u.invId, tenantId]);
      }
      await client.query('UPDATE quotations SET status = $1, converted_batch_id = $2 WHERE id = $3 AND tenant_id = $4', ['Converted', batchId, req.params.id, tenantId]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    await logAudit(pool, tenantId, 'Quotation Converted', 'quotation', req.params.id as string, `Converted to distribution ${batchId}, ${totalQty} units`);

    res.json({ ok: true, batchId, total: totalQty, billValue: totalBilled });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
