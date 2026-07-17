import { Router } from 'express';
import { blockVendors, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';

const router = Router();

// List orders
router.get('/api/orders', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.query;
    let sql = 'SELECT * FROM orders WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof status === 'string' && status) {
      sql += ' AND status = $2';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        orderNumber: r.order_number,
        vendorId: r.vendor_id,
        vendorName: r.vendor_name,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        customerGstNumber: r.customer_gst_number,
        orderDate: r.order_date,
        requiredDate: r.required_date,
        status: r.status,
        items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
        subtotal: Number(r.subtotal) || 0,
        gstRate: Number(r.gst_rate) || 18,
        gstAmount: Number(r.gst_amount) || 0,
        total: Number(r.total) || 0,
        notes: r.notes,
        fulfilledBatchId: r.fulfilled_batch_id,
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Get single order
router.get('/api/orders/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const r = (await pool.query('SELECT * FROM orders WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]))
      .rows[0] as Record<string, unknown> | undefined;
    if (!r) return res.status(404).json({ error: 'Order not found' });
    res.json({
      id: r.id,
      orderNumber: r.order_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerGstNumber: r.customer_gst_number,
      orderDate: r.order_date,
      requiredDate: r.required_date,
      status: r.status,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
      subtotal: Number(r.subtotal) || 0,
      gstRate: Number(r.gst_rate) || 18,
      gstAmount: Number(r.gst_amount) || 0,
      total: Number(r.total) || 0,
      notes: r.notes,
      fulfilledBatchId: r.fulfilled_batch_id,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Create order
router.post('/api/orders', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const {
      vendorId,
      vendorName,
      customerName,
      customerPhone,
      customerGstNumber,
      orderDate,
      requiredDate,
      items,
      gstRate,
      notes,
    } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'At least one item is required' });

    const id = uid('ORD');
    const count = (await pool.query('SELECT COUNT(*) as c FROM orders WHERE tenant_id = $1', [tenantId])).rows[0] as {
      c: number;
    };
    const orderNum = `ORD-${String(Number(count.c) + 1).padStart(4, '0')}`;
    const rate = Number(gstRate) || 18;

    // Resolve product names and calculate totals
    const resolvedItems: {
      productId: string;
      productName: string;
      quantity: number;
      price: number;
      discountPercent: number;
      withGst: boolean;
      lineNet: number;
      lineGst: number;
      lineTotal: number;
    }[] = [];
    let subtotal = 0;
    let gstAmount = 0;

    for (const item of items) {
      const product = (
        await pool.query('SELECT name, price FROM products WHERE id = $1 AND tenant_id = $2', [
          item.productId,
          tenantId,
        ])
      ).rows[0] as { name: string; price: number } | undefined;
      const price = item.customPrice ? Number(item.customPrice) : (product?.price ?? 0);
      const qty = Number(item.quantity) || 1;
      const disc = Number(item.discountPercent) || 0;
      const gross = price * qty;
      const discAmt = Math.round((gross * disc) / 100);
      const net = gross - discAmt;
      const gst = item.withGst !== false ? Math.round((net * rate) / 100) : 0;
      resolvedItems.push({
        productId: item.productId,
        productName: product?.name ?? item.productName ?? '',
        quantity: qty,
        price,
        discountPercent: disc,
        withGst: item.withGst !== false,
        lineNet: net,
        lineGst: gst,
        lineTotal: net + gst,
      });
      subtotal += net;
      gstAmount += gst;
    }
    const total = subtotal + gstAmount;

    // Resolve vendor name
    let vName = vendorName || '';
    if (vendorId && !vName) {
      const v = (await pool.query('SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId]))
        .rows[0] as { name: string } | undefined;
      vName = v?.name ?? '';
    }

    await pool.query(
      `INSERT INTO orders (id, tenant_id, order_number, vendor_id, vendor_name, customer_name, customer_phone, customer_gst_number, order_date, required_date, status, items, subtotal, gst_rate, gst_amount, total, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        tenantId,
        orderNum,
        vendorId || null,
        vName,
        customerName || vName,
        customerPhone || null,
        customerGstNumber || null,
        orderDate || new Date().toISOString().slice(0, 10),
        requiredDate || null,
        'Pending',
        JSON.stringify(resolvedItems),
        subtotal,
        rate,
        gstAmount,
        total,
        notes || null,
      ],
    );

    await logAudit(
      pool,
      tenantId,
      'Order Created',
      'order',
      id,
      `${orderNum} — ₹${total} for ${vName || customerName || 'Walk-in'}`,
    );
    res.status(201).json({
      id,
      orderNumber: orderNum,
      vendorId: vendorId || null,
      vendorName: vName,
      customerName: customerName || vName,
      status: 'Pending',
      items: resolvedItems,
      subtotal,
      gstRate: rate,
      gstAmount,
      total,
      orderDate: orderDate || new Date().toISOString().slice(0, 10),
      requiredDate: requiredDate || null,
      notes,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Update order status
router.put('/api/orders/:id/status', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { status } = req.body;
    // Fulfilled only via POST /fulfill (deducts stock). Do not allow status-only bypass.
    if (!['Pending', 'Confirmed', 'Cancelled'].includes(status)) {
      return res
        .status(400)
        .json({
          error:
            status === 'Fulfilled' ? 'Use POST /api/orders/:id/fulfill to fulfill (deducts stock)' : 'Invalid status',
        });
    }
    const current = (
      await pool.query('SELECT status FROM orders WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])
    ).rows[0] as { status: string } | undefined;
    if (!current) return res.status(404).json({ error: 'Order not found' });
    const valid: Record<string, string[]> = {
      Pending: ['Confirmed', 'Cancelled'],
      Confirmed: ['Cancelled'],
      Cancelled: ['Pending'],
      Fulfilled: [],
    };
    if (!(valid[current.status] ?? []).includes(status))
      return res.status(400).json({ error: `Cannot change from ${current.status} to ${status}` });
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2 AND tenant_id = $3', [
      status,
      req.params.id,
      tenantId,
    ]);
    await logAudit(pool, tenantId, 'Order Status Changed', 'order', req.params.id, `${current.status} → ${status}`);
    res.json({ ok: true, status });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Fulfill order → convert to distribution
router.post('/api/orders/:id/fulfill', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = (
        await client.query('SELECT * FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [
          req.params.id,
          tenantId,
        ])
      ).rows[0] as Record<string, unknown> | undefined;
      if (!order) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }
      if (order.status === 'Fulfilled') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Already fulfilled' });
      }
      if (order.status === 'Cancelled') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot fulfill cancelled order' });
      }
      if (order.status === 'Pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Order must be confirmed before fulfilling' });
      }
      if (!order.vendor_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Order must have a vendor to fulfill' });
      }

      const items =
        typeof order.items === 'string'
          ? JSON.parse(order.items as string)
          : (order.items as {
              productId: string;
              quantity: number;
              discountPercent: number;
              withGst: boolean;
              price: number;
            }[]);
      const gstRate = Number(order.gst_rate) || 18;
      const batchId = uid('D');
      const date = (order.order_date as string) || new Date().toISOString().slice(0, 10);
      let totalBilled = 0;
      let totalQty = 0;

      for (const item of items) {
        const qty = Number(item.quantity) || 1;
        const product = (
          await client.query('SELECT id, name, price, pack_size FROM products WHERE id = $1 AND tenant_id = $2', [
            item.productId,
            tenantId,
          ])
        ).rows[0] as { id: string; name: string; price: number; pack_size: number } | undefined;
        if (!product) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Product not found: ${item.productId}` });
        }

        const unitTypeRow = (
          await client.query(
            "SELECT unit_type FROM product_inventory WHERE product_id = $1 AND status = 'InStock' AND tenant_id = $2 LIMIT 1",
            [product.id, tenantId],
          )
        ).rows[0] as { unit_type: string } | undefined;
        const pSz = Number(product.pack_size) || 1;
        const isBoxBarcode = unitTypeRow?.unit_type === 'box' && pSz > 1;
        const basePrice = item.price ? Number(item.price) : isBoxBarcode ? product.price * pSz : product.price;

        const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
        const netPrice = Math.round(((basePrice * (100 - disc)) / 100) * 100) / 100;
        const gstApplied = item.withGst !== false ? 1 : 0;
        const billedPrice = gstApplied ? Math.round((netPrice * (100 + gstRate)) / 100) : netPrice;

        const invRows = (
          await client.query(
            `SELECT id, barcode FROM product_inventory WHERE product_id = $1 AND status = 'InStock' AND tenant_id = $2 ORDER BY id LIMIT $3 FOR UPDATE SKIP LOCKED`,
            [product.id, tenantId, qty],
          )
        ).rows as { id: string; barcode: string }[];
        if (invRows.length < qty) {
          await client.query('ROLLBACK');
          return res
            .status(400)
            .json({ error: `Insufficient stock for ${product.name}. Available: ${invRows.length}, requested: ${qty}` });
        }

        for (const inv of invRows) {
          const distId = `${batchId}-${totalQty + 1}`;
          await client.query(
            'INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [
              distId,
              batchId,
              product.id,
              inv.barcode,
              order.vendor_id,
              date,
              'Distributed',
              disc,
              netPrice,
              gstApplied === 1,
              billedPrice,
              tenantId,
            ],
          );
          await client.query("UPDATE product_inventory SET status = 'Distributed' WHERE id = $1 AND tenant_id = $2", [
            inv.id,
            tenantId,
          ]);
          totalQty++;
          totalBilled += billedPrice;
        }
      }

      const fulfilled = await client.query(
        "UPDATE orders SET status = $1, fulfilled_batch_id = $2 WHERE id = $3 AND tenant_id = $4 AND status = 'Confirmed'",
        ['Fulfilled', batchId, req.params.id, tenantId],
      );
      if (fulfilled.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Already fulfilled' });
      }
      await client.query('COMMIT');

      await logAudit(
        pool,
        tenantId,
        'Order Fulfilled',
        'order',
        req.params.id as string,
        `Fulfilled as distribution batch ${batchId}, ${totalQty} units`,
      );
      res.json({ batchId, total: totalQty, billValue: totalBilled });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Delete order
router.delete('/api/orders/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query(
      "DELETE FROM orders WHERE id = $1 AND tenant_id = $2 AND status IN ('Pending', 'Cancelled')",
      [req.params.id, tenantId],
    );
    if (result.rowCount === 0) return res.status(400).json({ error: 'Can only delete Pending or Cancelled orders' });
    res.status(204).send();
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
