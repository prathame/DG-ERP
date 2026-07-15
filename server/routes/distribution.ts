import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest, vendorScopeId, assertVendorAccess, assertVendorLinked } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit, DISTRIBUTION_BILL_UNIT_SQL } from '../utils/helpers';

const router = Router();

router.get('/api/distribution/summary', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const jwtVendorId = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !jwtVendorId) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }

    const availableInInventory = jwtVendorId
      ? { total: 0 }
      : ((await pool.query(
          'SELECT COALESCE(SUM(stock), 0) as total FROM products WHERE tenant_id = $1',
          [tenantId]
        )).rows[0] as { total: number });

    const totalDistributed = (await pool.query(
      `SELECT COUNT(*) as count FROM product_distribution WHERE tenant_id = $1 ${jwtVendorId ? 'AND vendor_id = $2' : ''}`,
      jwtVendorId ? [tenantId, jwtVendorId] : [tenantId]
    )).rows[0] as { count: number };

    const vendorStats = (await pool.query(`
      SELECT v.id, v.name,
        COUNT(pd.id) as distributed,
        SUM(CASE WHEN pd.status = 'Sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN pd.status = 'Replaced' THEN 1 ELSE 0 END) as replaced,
        SUM(CASE WHEN pd.status = 'Damaged' THEN 1 ELSE 0 END) as damaged
      FROM vendors v
      LEFT JOIN product_distribution pd ON pd.vendor_id = v.id AND pd.tenant_id = $1
      WHERE v.tenant_id = $1 ${jwtVendorId ? 'AND v.id = $2' : ''}
      GROUP BY v.id, v.name
    `, jwtVendorId ? [tenantId, jwtVendorId] : [tenantId])).rows as { id: string; name: string; distributed: number; sold: number; replaced: number; damaged: number }[];

    const totalBeforeDistribution = Number(availableInInventory.total) + Number(totalDistributed.count);
    res.json({
      totalBeforeDistribution: totalBeforeDistribution,
      availableInInventory: Number(availableInInventory.total),
      totalDistributed: Number(totalDistributed.count),
      vendorStats: vendorStats.map((v) => ({
        vendorId: v.id,
        vendorName: v.name,
        distributed: Number(v.distributed),
        sold: Number(v.sold),
        replaced: Number(v.replaced) || 0,
        damaged: Number(v.damaged) || 0,
        availableWithVendor: Number(v.distributed) - Number(v.sold) - (Number(v.replaced) || 0) - (Number(v.damaged) || 0),
      })),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/distribution', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { batchId } = req.query;
    const jwtVendorId = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !jwtVendorId) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }
    const vendorId = jwtVendorId || (req.query.vendorId as string | undefined);
    let sql = `
      SELECT pd.id, pd.batch_id, pd.product_id, pd.barcode, pd.vendor_id, pd.distribution_date, pd.status,
        pd.discount_percent, pd.net_price, pd.gst_applied, pd.billed_price,
        p.name as product_name, v.name as vendor_name
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1
    `;
    const params: (string | number)[] = [tenantId];
    let paramIdx = 1;
    if (typeof vendorId === 'string' && vendorId) {
      paramIdx++;
      sql += ` AND pd.vendor_id = $${paramIdx}`;
      params.push(vendorId);
    }
    if (typeof batchId === 'string' && batchId) {
      paramIdx++;
      sql += ` AND pd.batch_id = $${paramIdx}`;
      params.push(batchId);
    }
    sql += ' ORDER BY pd.distribution_date DESC, pd.id';
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    res.json(rows.map((r) => ({
      id: r.id,
      batchId: r.batch_id ?? r.id,
      productId: r.product_id,
      productName: r.product_name,
      barcode: r.barcode,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      distributionDate: r.distribution_date,
      status: r.status,
      discountPercent: r.discount_percent ?? 0,
      netPrice: r.net_price,
      gstApplied: !!r.gst_applied,
      billedPrice: r.billed_price,
    })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/distribution/batches', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const unlinked = assertVendorLinked(req);
    if (unlinked) return res.status(403).json({ error: unlinked });

    const { vendorId } = req.query;
    const jwtVendorId = vendorScopeId(req);
    const effectiveVendorId = jwtVendorId || (typeof vendorId === 'string' ? vendorId : undefined);
    let sql = `
      SELECT
        COALESCE(pd.batch_id, pd.id) as batch_id,
        pd.vendor_id,
        v.name as vendor_name,
        MIN(pd.distribution_date) as distribution_date,
        COUNT(*) as total,
        SUM(CASE WHEN pd.status = 'Sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN pd.status = 'Replaced' THEN 1 ELSE 0 END) as replaced,
        SUM(CASE WHEN pd.status = 'Damaged' THEN 1 ELSE 0 END) as damaged,
        SUM(CASE WHEN pd.status = 'Distributed' THEN 1 ELSE 0 END) as available_with_vendor,
        SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) as bill_value,
        STRING_AGG(DISTINCT p.name, ',') as product_names,
        MAX(pd.discount_percent) as discount_percent,
        MAX(pd.gst_applied::int) as gst_applied,
        COALESCE(MAX(pd.dispatch_status), 'pending') as dispatch_status,
        MAX(pd.dispatched_by) as dispatched_by,
        MAX(pd.dispatched_at) as dispatched_at,
        MAX(pd.ewb_number) as ewb_number
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1
    `;
    const params: (string | number)[] = [tenantId];
    let paramIdx = 1;
    if (typeof effectiveVendorId === 'string' && effectiveVendorId) {
      paramIdx++;
      sql += ` AND pd.vendor_id = $${paramIdx}`;
      params.push(effectiveVendorId);
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    sql += `
      GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id, v.name
      ORDER BY MIN(pd.distribution_date) DESC, batch_id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(String(limit), String(offset));
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    const batchIds = rows.map(r => r.batch_id as string);
    const paymentMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const payRows = (await pool.query(
        `SELECT batch_id, SUM(amount) as total_paid FROM vendor_payments WHERE batch_id = ANY($1) AND tenant_id = $2 GROUP BY batch_id`,
        [batchIds, tenantId]
      )).rows as { batch_id: string; total_paid: string }[];
      for (const pr of payRows) paymentMap[pr.batch_id] = Number(pr.total_paid);
    }
    res.json(rows.map((r) => {
      const paid = paymentMap[r.batch_id as string] ?? 0;
      return {
        batchId: r.batch_id as string,
        vendorId: r.vendor_id as string,
        vendorName: r.vendor_name as string,
        distributionDate: r.distribution_date as string,
        productNames: (r.product_names as string || '').split(',').filter(Boolean),
        total: Number(r.total),
        sold: Number(r.sold),
        replaced: Number(r.replaced) || 0,
        damaged: Number(r.damaged) || 0,
        availableWithVendor: Number(r.available_with_vendor),
        billValue: Number(r.bill_value),
        discountPercent: Number(r.discount_percent) || 0,
        gstApplied: !!(Number(r.gst_applied)),
        amountPaid: paid,
        balanceRemaining: Number(r.bill_value) - paid,
        dispatchStatus: (r.dispatch_status as string) || 'pending',
        ewbNumber: (r.ewb_number as string) || null,
        dispatchedBy: r.dispatched_by as string || null,
        dispatchedAt: r.dispatched_at as string || null,
      };
    }));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Create one distribution batch from the "Distribute Products to Vendor" modal (all rows = one event)
router.post('/api/distribution/batch', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId, distributionDate, amountPaid, items, gstRate: reqGstRate } = req.body as {
      vendorId?: string;
      distributionDate?: string;
      amountPaid?: number;
      gstRate?: number;
      items?: { productId: string; quantity: number; discountPercent?: number; withGst?: boolean; customPrice?: number }[];
    };
    if (!vendorId) return res.status(400).json({ error: 'Vendor is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one product' });

    const gstRate = Number(reqGstRate) || 18;
    const date = distributionDate || new Date().toISOString().slice(0, 10);
    const batchId = uid('D');
    const paidAmount = typeof amountPaid === 'number' && amountPaid > 0 ? amountPaid : null;

    let totalBilled = 0;
    let totalQty = 0;
    const productNames: string[] = [];
    const unitRows: { distId: string; productId: string; barcode: string; invId: string; disc: number; netPrice: number; gstApplied: number; billedPrice: number }[] = [];
    const itemsPrepped: { product: { id: string; name: string; price: number; pack_size: number; stock: number }; qty: number; disc: number; netPricePerUnit: number; gstApplied: number; billedPricePerUnit: number }[] = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
      const product = (await pool.query(
        'SELECT id, name, price, pack_size, stock, price_includes_gst, gst_rate FROM products WHERE id = $1 AND tenant_id = $2',
        [item.productId, tenantId]
      )).rows[0] as { id: string; name: string; price: number; pack_size: number; stock: number; price_includes_gst: boolean; gst_rate: number } | undefined;
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });
      const basePrice = item.customPrice ? Number(item.customPrice) : product.price;
      const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
      const priceAfterDisc = Math.round((basePrice * (100 - disc) / 100) * 100) / 100;
      const gstApplied = item.withGst !== false ? 1 : 0;
      let netPricePerUnit: number, billedPricePerUnit: number;
      if (gstApplied && product.price_includes_gst) {
        billedPricePerUnit = priceAfterDisc;
        netPricePerUnit = Math.round((priceAfterDisc / (1 + gstRate / 100)) * 100) / 100;
      } else if (gstApplied) {
        netPricePerUnit = priceAfterDisc;
        billedPricePerUnit = Math.round(priceAfterDisc * (100 + gstRate) / 100);
      } else {
        netPricePerUnit = priceAfterDisc;
        billedPricePerUnit = priceAfterDisc;
      }
      itemsPrepped.push({ product, qty, disc, netPricePerUnit, gstApplied, billedPricePerUnit });
    }

    const vendorName = ((await pool.query(
      'SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2',
      [vendorId, tenantId]
    )).rows[0] as { name: string } | undefined)?.name ?? vendorId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of itemsPrepped) {
        const invRows = (await client.query(
          `SELECT id, barcode FROM product_inventory WHERE product_id = $1 AND status = 'InStock' AND tenant_id = $2 ORDER BY id LIMIT $3 FOR UPDATE SKIP LOCKED`,
          [item.product.id, tenantId, item.qty]
        )).rows as { id: string; barcode: string }[];
        if (invRows.length < item.qty) {
          await client.query('ROLLBACK');
          // C8 fix: don't release here — finally block handles it
          return res.status(400).json({ error: `Insufficient stock for ${item.product.name}. Available: ${invRows.length}, requested: ${item.qty}` });
        }
        productNames.push(item.product.name);
        for (const inv of invRows) {
          unitRows.push({ distId: '', productId: item.product.id, barcode: inv.barcode, invId: inv.id, disc: item.disc, netPrice: item.netPricePerUnit, gstApplied: item.gstApplied, billedPrice: item.billedPricePerUnit });
          totalBilled += item.billedPricePerUnit;
          totalQty++;
        }
      }

      if (paidAmount && paidAmount > totalBilled) {
        await client.query('ROLLBACK');
        // C8 fix: don't release here — finally block handles it
        return res.status(400).json({ error: `Amount paid (₹${paidAmount}) cannot exceed billed amount (₹${totalBilled})` });
      }

      const totalUnits = unitRows.length;
      unitRows.forEach((u, i) => { u.distId = totalUnits === 1 ? batchId : `${batchId}-${i + 1}`; });

      // Bulk INSERT chunked at 5000 rows (12 params/row = 60000 params, under PG's 65535 limit)
      const DIST_CHUNK = 5000;
      if (unitRows.length > 0) {
        for (let offset = 0; offset < unitRows.length; offset += DIST_CHUNK) {
          const chunk = unitRows.slice(offset, offset + DIST_CHUNK);
          const vals: string[] = [];
          const ps: unknown[] = [];
          let idx = 1;
          for (const u of chunk) {
            vals.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10},$${idx+11})`);
            ps.push(u.distId, batchId, u.productId, u.barcode, vendorId, date, 'Distributed', u.disc, u.netPrice, u.gstApplied, u.billedPrice, tenantId);
            idx += 12;
          }
          await client.query(
            `INSERT INTO product_distribution (id,batch_id,product_id,barcode,vendor_id,distribution_date,status,discount_percent,net_price,gst_applied,billed_price,tenant_id) VALUES ${vals.join(',')}`,
            ps
          );
        }
        // Bulk UPDATE inventory statuses
        await client.query(
          `UPDATE product_inventory SET status='Distributed' WHERE id = ANY($1) AND tenant_id = $2`,
          [unitRows.map(u => u.invId), tenantId]
        );
      }
      if (paidAmount) {
        const payId = uid('VP');
        await client.query(
          'INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes, tenant_id, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [payId, vendorId, paidAmount, date, 'Cash', null, `Payment against distribution ${batchId}`, tenantId, batchId]
        );
        // Auto-mark as sold for dealer/retail tenants
        const tenantType = (await client.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0]?.business_type;
        const autoSold = tenantType === 'dealer' || tenantType === 'retail';
        if (autoSold) {
          await client.query("UPDATE product_distribution SET status = 'Sold' WHERE batch_id = $1 AND tenant_id = $2", [batchId, tenantId]);
          await client.query("UPDATE product_inventory SET status = 'Sold' WHERE barcode IN (SELECT barcode FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2) AND tenant_id = $2", [batchId, tenantId]);
        }

        await client.query('COMMIT');
        if (paidAmount) await logAudit(pool, tenantId, 'Payment Recorded', 'payment', payId, `${vendorName} paid ₹${paidAmount} (with distribution)`);
      } else {
        // Auto-mark as sold for dealer/retail tenants
        const tenantType = (await client.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0]?.business_type;
        const autoSold = tenantType === 'dealer' || tenantType === 'retail';
        if (autoSold) {
          await client.query("UPDATE product_distribution SET status = 'Sold' WHERE batch_id = $1 AND tenant_id = $2", [batchId, tenantId]);
          await client.query("UPDATE product_inventory SET status = 'Sold' WHERE barcode IN (SELECT barcode FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2) AND tenant_id = $2", [batchId, tenantId]);
        }
        await client.query('COMMIT');
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const tenantType = (await pool.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0]?.business_type;
    const autoSold = tenantType === 'dealer' || tenantType === 'retail';

    await logAudit(pool, tenantId, 'Distribution Created', 'distribution', batchId, `${totalQty} units (${productNames.join(', ')}) to ${vendorName}`);

    res.status(201).json({
      batchId,
      vendorId,
      vendorName,
      distributionDate: date,
      productNames: [...new Set(productNames)],
      total: totalQty,
      sold: autoSold ? totalQty : 0,
      replaced: 0,
      damaged: 0,
      availableWithVendor: autoSold ? 0 : totalQty,
      billValue: totalBilled,
      discountPercent: 0,
      gstApplied: items.some((i) => i.withGst !== false),
      amountPaid: paidAmount ?? 0,
      balanceRemaining: totalBilled - (paidAmount ?? 0),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/distribution', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { productId, vendorId, distributionDate, quantity, discountPercent, amountPaid, withGst, gstRate: reqGstRate, batchId: reqBatchId, customPrice } = req.body;
    if (!productId || !vendorId) return res.status(400).json({ error: 'Product and vendor are required' });
    const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
    const product = (await pool.query(
      'SELECT id, price FROM products WHERE id = $1 AND tenant_id = $2',
      [productId, tenantId]
    )).rows[0] as { id: string; price: number } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const basePrice = customPrice ? Number(customPrice) : product.price;
    const disc = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    const grossValue = basePrice * qty;
    const discountAmount = Math.round(grossValue * disc / 100);
    const netAmount = grossValue - discountAmount;
    const netPricePerUnit = Math.round((basePrice * (100 - disc) / 100) * 100) / 100;
    const gstApplied = withGst !== false;
    const gstRate = Number(reqGstRate) || 18;
    const billedPricePerUnit = gstApplied ? Math.round(netPricePerUnit * (100 + gstRate) / 100) : netPricePerUnit;
    const totalBilled = billedPricePerUnit * qty;
    const paidAmount = typeof amountPaid === 'number' && amountPaid > 0 ? amountPaid : null;
    if (paidAmount && paidAmount > totalBilled) return res.status(400).json({ error: `Amount paid (₹${paidAmount}) cannot exceed billed amount (₹${totalBilled})` });
    const baseId = typeof reqBatchId === 'string' && reqBatchId ? reqBatchId : uid('D');
    const date = distributionDate || new Date().toISOString().slice(0, 10);

    let distInvRows: { id: string; barcode: string }[] = [];
    let distPayId: string | null = null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      distInvRows = (await client.query(
        `SELECT id, barcode FROM product_inventory WHERE product_id = $1 AND status = 'InStock' AND tenant_id = $2 ORDER BY id LIMIT $3 FOR UPDATE SKIP LOCKED`,
        [product.id, tenantId, qty]
      )).rows as { id: string; barcode: string }[];
      if (distInvRows.length < qty) {
        await client.query('ROLLBACK');
        // C3/C8: don't release here — finally block handles it
        return res.status(400).json({ error: `Insufficient stock. Available: ${distInvRows.length}, requested: ${qty}` });
      }
      const existingInBatch = typeof reqBatchId === 'string' && reqBatchId
        ? Number((await client.query('SELECT COUNT(*) as c FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2', [reqBatchId, tenantId])).rows[0]?.c ?? 0)
        : 0;
      for (let i = 0; i < distInvRows.length; i++) {
        const inv = distInvRows[i];
        const seq = existingInBatch + i + 1;
        const distId = distInvRows.length === 1 && existingInBatch === 0 ? baseId : `${baseId}-${seq}`;
        await client.query(
          'INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
          [distId, baseId, product.id, inv.barcode, vendorId, date, 'Distributed', disc, netPricePerUnit, gstApplied ? 1 : 0, billedPricePerUnit, tenantId]
        );
        await client.query(
          'UPDATE product_inventory SET status = $1 WHERE id = $2 AND tenant_id = $3',
          ['Distributed', inv.id, tenantId]
        );
      }
      if (paidAmount) {
        distPayId = uid('VP');
        await client.query(
          'INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes, tenant_id, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [distPayId, vendorId, paidAmount, date, 'Cash', null, `Payment against distribution ${baseId}`, tenantId, baseId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const vendorName = ((await pool.query(
      'SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2',
      [vendorId, tenantId]
    )).rows[0] as { name: string } | undefined)?.name ?? vendorId;

    await logAudit(pool, tenantId, 'Distribution Created', 'distribution', baseId, `${qty} units to ${vendorName}, Discount: ${disc}%`);
    if (paidAmount && distPayId) await logAudit(pool, tenantId, 'Payment Recorded', 'payment', distPayId, `${vendorName} paid ₹${paidAmount} (with distribution)`);

    const firstRow = (await pool.query(`
      SELECT pd.*, p.name as product_name, v.name as vendor_name, v.id as vendor_id
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.product_id = $2 AND pd.vendor_id = $3 AND pd.distribution_date = $4 AND pd.tenant_id = $1
      ORDER BY pd.id DESC LIMIT 1
    `, [tenantId, product.id, vendorId, date])).rows[0] as Record<string, unknown>;

    res.status(201).json({
      id: baseId,
      batchId: baseId,
      productId: firstRow?.product_id ?? product.id,
      productName: firstRow?.product_name,
      barcode: distInvRows[0]?.barcode ?? firstRow?.barcode,
      quantity: distInvRows.length,
      vendorId: firstRow?.vendor_id ?? vendorId,
      vendorName: firstRow?.vendor_name,
      distributionDate: date,
      status: 'Distributed',
      grossValue,
      discountPercent: disc,
      discountAmount,
      netAmount,
      amountPaid: paidAmount ?? 0,
      balanceRemaining: totalBilled - (paidAmount ?? 0),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark distribution units as GST or non-GST billed (updates finance amounts)
router.put('/api/distribution/apply-billing', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId, batchId, gstUnits, nonGstUnits, gstRate } = req.body;
    if (!vendorId && !batchId) return res.status(400).json({ error: 'vendorId or batchId required' });
    const rate = Number(gstRate) || 18;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let sql = `
        SELECT pd.id, COALESCE(pd.net_price, p.price) as unit_price
        FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
        WHERE pd.tenant_id = $1
      `;
      const params: (string | number)[] = [tenantId];
      let paramIdx = 1;
      if (batchId) {
        paramIdx++;
        sql += ` AND pd.batch_id = $${paramIdx}`;
        params.push(batchId as string);
      } else {
        paramIdx++;
        sql += ` AND pd.vendor_id = $${paramIdx} AND pd.billed_price IS NULL`;
        params.push(vendorId as string);
      }
      sql += ' ORDER BY pd.id FOR UPDATE OF pd';
      const units = (await client.query(sql, params)).rows as { id: string; unit_price: number }[];
      const totalUnits = units.length;
      const gstCount = Math.min(gstUnits ?? 0, totalUnits);
      const nonGstCount = Math.min(nonGstUnits ?? 0, totalUnits - gstCount);
      let idx = 0;
      for (let i = 0; i < gstCount && idx < units.length; i++, idx++) {
        const u = units[idx];
        const billedPrice = Math.round(u.unit_price * (100 + rate) / 100);
        await client.query(
          'UPDATE product_distribution SET gst_applied = true, billed_price = $1 WHERE id = $2 AND tenant_id = $3',
          [billedPrice, u.id, tenantId]
        );
      }
      for (let i = 0; i < nonGstCount && idx < units.length; i++, idx++) {
        const u = units[idx];
        await client.query(
          'UPDATE product_distribution SET gst_applied = false, billed_price = $1 WHERE id = $2 AND tenant_id = $3',
          [u.unit_price, u.id, tenantId]
        );
      }
      await client.query('COMMIT');
      await logAudit(pool, tenantId, 'Billing Applied', 'distribution', batchId || vendorId, `GST: ${gstCount} units, Non-GST: ${nonGstCount} units`);
      res.json({ ok: true, gstUnits: gstCount, nonGstUnits: nonGstCount });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ DISTRIBUTION BILL (CHALLAN) ============
router.get('/api/distribution/bill', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId, productId, distributionDate, batchId } = req.query;
    if (!vendorId && !batchId) return res.status(400).json({ error: 'vendorId or batchId is required' });

    const scoped = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !scoped) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }
    if (typeof vendorId === 'string' && vendorId) {
      const denied = assertVendorAccess(req, vendorId);
      if (denied) return res.status(403).json({ error: denied });
    }
    // Force vendor filter for Vendor JWTs even when only batchId is supplied
    const forcedVendor = scoped || (typeof vendorId === 'string' ? vendorId : undefined);

    let sql = `
      SELECT pd.id, pd.batch_id, pd.barcode, pd.distribution_date, pd.status, pd.discount_percent, pd.net_price, pd.billed_price, pd.gst_applied,
             pd.product_id, p.name as product_name, p.price, p.batch_number, p.pack_size, p.pack_name,
             v.name as vendor_name, v.contact_person as vendor_contact, v.phone as vendor_phone, v.email as vendor_email, v.address as vendor_address, v.gst_number as vendor_gst_number, pd.ewb_number
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1
    `;
    const params: (string | number)[] = [tenantId];
    let paramIdx = 1;
    if (typeof batchId === 'string' && batchId) {
      paramIdx++;
      sql += ` AND pd.batch_id = $${paramIdx}`;
      params.push(batchId);
    }
    if (forcedVendor) {
      paramIdx++;
      sql += ` AND pd.vendor_id = $${paramIdx}`;
      params.push(forcedVendor);
    } else if (typeof vendorId === 'string' && vendorId) {
      paramIdx++;
      sql += ` AND pd.vendor_id = $${paramIdx}`;
      params.push(vendorId);
    }
    if (typeof productId === 'string' && productId) {
      paramIdx++;
      sql += ` AND pd.product_id = $${paramIdx}`;
      params.push(productId);
    }
    if (typeof distributionDate === 'string' && distributionDate) {
      paramIdx++;
      sql += ` AND pd.distribution_date = $${paramIdx}`;
      params.push(distributionDate);
    }
    sql += ' ORDER BY pd.distribution_date DESC, pd.id';
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    if (rows.length === 0) return res.status(404).json({ error: 'No distribution records found' });
    const first = rows[0];
    const company = (await pool.query(
      "SELECT name, company_name, phone, address, gst_number, default_gst_rate FROM users WHERE role IN ('Super Admin', 'Admin') AND tenant_id = $1 ORDER BY id LIMIT 1",
      [tenantId]
    )).rows[0] as { name: string; company_name: string | null; phone: string | null; address: string | null; gst_number: string | null; default_gst_rate: number | null } | undefined;
    const billSettingsRow = (await pool.query('SELECT * FROM bill_settings WHERE tenant_id = $1', [tenantId])).rows[0] as Record<string, unknown> | undefined;
    const grossValue = rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const netTotal = rows.reduce((sum, r) => sum + (Number(r.net_price) || Number(r.price) || 0), 0);
    const totalBilled = rows.reduce((sum, r) => sum + (Number(r.billed_price) || Number(r.net_price) || Number(r.price) || 0), 0);
    const totalDiscount = grossValue - netTotal;
    res.json({
      challanId: batchId
        ? `CH-${String(batchId).replace(/^D/, '').slice(0, 10)}`
        : `CH-${(first.vendor_name as string || 'V').substring(0, 3).toUpperCase()}-${(first.distribution_date as string || '').replace(/-/g, '')}`,
      batchId: (first.batch_id as string) ?? (batchId as string) ?? null,
      distributionDate: first.distribution_date,
      vendor: {
        name: first.vendor_name,
        contactPerson: first.vendor_contact ?? null,
        phone: first.vendor_phone ?? null,
        email: first.vendor_email ?? null,
        address: first.vendor_address ?? null,
        gstNumber: first.vendor_gst_number ?? null,
      },
      ewbNumber: first.ewb_number ?? null,
      company: {
        name: company?.company_name ?? 'DG ERP',
        contactName: company?.name ?? null,
        phone: company?.phone ?? null,
        address: company?.address ?? null,
        gstNumber: company?.gst_number ?? null,
      },
      gstRate: Number(company?.default_gst_rate) || 18,
      items: rows.map((r, i) => ({
        sno: i + 1,
        barcode: r.barcode,
        productName: r.product_name,
        category: null,
        batchNumber: r.batch_number ?? null,
        originalPrice: r.price ?? 0,
        discountPercent: r.discount_percent ?? 0,
        price: Number(r.net_price) || Number(r.price) || 0,
        status: r.status,
      })),
      groupedItems: (() => {
        const groups: Record<string, { productName: string; barcodes: string[]; originalPrice: number; discountPercent: number; netPrice: number; packSize: number; packName: string }> = {};
        for (const r of rows) {
          const key = `${r.product_id}-${r.discount_percent ?? 0}-${r.distribution_date}`;
          if (!groups[key]) groups[key] = { productName: r.product_name as string, barcodes: [], originalPrice: Number(r.price) || 0, discountPercent: Number(r.discount_percent) || 0, netPrice: Number(r.net_price) || Number(r.price) || 0, packSize: Number(r.pack_size) || 1, packName: (r.pack_name as string) || 'Piece' };
          groups[key].barcodes.push(r.barcode as string);
        }
        return Object.values(groups).map((g, i) => {
          const sorted = g.barcodes.sort();
          const qty = sorted.length;
          const ps = g.packSize;
          const packQty = ps > 1 ? `${Math.floor(qty / ps)} ${g.packName}${Math.floor(qty / ps) > 1 ? 's' : ''}${qty % ps > 0 ? ` + ${qty % ps} pcs` : ''}` : null;
          return {
            sno: i + 1,
            productName: g.productName,
            barcodeRange: sorted.length === 1 ? sorted[0] : `${sorted[0]} – ${sorted[sorted.length - 1]}`,
            quantity: qty,
            packQuantity: packQty,
            originalPrice: g.originalPrice,
            discountPercent: g.discountPercent,
            netPrice: g.netPrice,
            lineTotal: g.netPrice * qty,
          };
        });
      })(),
      totalQuantity: rows.length,
      savedGstUnits: rows.filter(r => r.gst_applied === true).length,
      grossValue,
      totalDiscount,
      totalValue: netTotal,
      totalBilled,
      payment: await (async () => {
        if (typeof batchId === 'string' && batchId) {
          const batchPaid = Number((await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE batch_id = $1 AND tenant_id = $2',
            [batchId, tenantId]
          )).rows[0]?.t ?? 0);
          return { totalDistributedValue: totalBilled, totalPaid: batchPaid, balance: totalBilled - batchPaid };
        }
        const vid = vendorId as string;
        const totalDistValue = Number((await pool.query(
          'SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) as t FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.vendor_id = $2 AND pd.tenant_id = $1',
          [tenantId, vid]
        )).rows[0]?.t ?? 0);
        const totalPaid = Number((await pool.query(
          'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2',
          [vid, tenantId]
        )).rows[0]?.t ?? 0);
        return { totalDistributedValue: totalDistValue, totalPaid, balance: totalDistValue - totalPaid };
      })(),
      billSettings: billSettingsRow ? {
        logoBase64: billSettingsRow.logo_base64 ?? null,
        primaryColor: (billSettingsRow.primary_color as string) || '#F27D26',
        tagline: billSettingsRow.tagline ?? null,
        invoicePrefix: billSettingsRow.invoice_prefix ?? null,
        challanPrefix: billSettingsRow.challan_prefix ?? null,
        bankAccountName: billSettingsRow.bank_account_name ?? null,
        bankAccountNumber: billSettingsRow.bank_account_number ?? null,
        bankName: billSettingsRow.bank_name ?? null,
        bankBranch: billSettingsRow.bank_branch ?? null,
        bankIfsc: billSettingsRow.bank_ifsc ?? null,
        bankUpiId: billSettingsRow.bank_upi_id ?? null,
        termsAndConditions: billSettingsRow.terms_and_conditions ?? null,
        signatoryName: billSettingsRow.signatory_name ?? null,
        signatoryDesignation: billSettingsRow.signatory_designation ?? null,
        signatureBase64: billSettingsRow.signature_base64 ?? null,
        showRewards: billSettingsRow.show_rewards !== false,
        showBarcode: billSettingsRow.show_barcode !== false,
        showWarranty: billSettingsRow.show_warranty !== false,
        footerText: (billSettingsRow.footer_text as string) || 'Powered by DG ERP Management',
      } : undefined,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a distribution batch (date, per-product qty/discount/GST)
router.put('/api/distribution/batch/:batchId', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { batchId } = req.params;
    const { distributionDate, items, gstRate: reqGstRate } = req.body as {
      distributionDate?: string;
      items?: { productId: string; quantity: number; discountPercent?: number; withGst?: boolean }[];
      gstRate?: number;
    };
    const gstRate = Number(reqGstRate) || 18;
    const date = typeof distributionDate === 'string' && distributionDate ? distributionDate : null;

    const allRows = (await pool.query(`
      SELECT pd.id, pd.product_id, pd.barcode, pd.status, pd.gst_applied, pd.discount_percent,
             p.price, p.name as product_name
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.batch_id = $2 AND pd.tenant_id = $1
      ORDER BY pd.id
    `, [tenantId, batchId])).rows as {
      id: string; product_id: string; barcode: string; status: string;
      gst_applied: number; discount_percent: number; price: number; product_name: string;
    }[];
    if (allRows.length === 0) return res.status(404).json({ error: 'Distribution batch not found' });

    const vendorRow = (await pool.query(
      'SELECT vendor_id, distribution_date FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2 LIMIT 1',
      [batchId, tenantId]
    )).rows[0] as { vendor_id: string; distribution_date: string } | undefined;
    if (!vendorRow) return res.status(404).json({ error: 'Distribution batch not found' });
    const vendorId = vendorRow.vendor_id;
    const effectiveDate = date ?? vendorRow.distribution_date;

    const byProduct = new Map<string, typeof allRows>();
    for (const row of allRows) {
      const list = byProduct.get(row.product_id) ?? [];
      list.push(row);
      byProduct.set(row.product_id, list);
    }

    const itemList = Array.isArray(items) ? items : [];
    const touchedProductIds = new Set<string>();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const applyPricing = async (rowId: string, price: number, disc: number, withGst: boolean) => {
        const netPrice = Math.round((price * (100 - disc) / 100) * 100) / 100;
        const gstOn = !!withGst;
        const billed = withGst ? Math.round(netPrice * (100 + gstRate) / 100) : netPrice;
        await client.query(
          'UPDATE product_distribution SET discount_percent = $1, net_price = $2, gst_applied = $3, billed_price = $4 WHERE id = $5 AND tenant_id = $6',
          [disc, netPrice, gstOn, billed, rowId, tenantId]
        );
      };

      for (const item of itemList) {
        touchedProductIds.add(item.productId);
        const productRows = byProduct.get(item.productId) ?? [];
        const locked = productRows.filter((r) => r.status !== 'Distributed');
        const distributed = productRows.filter((r) => r.status === 'Distributed');
        const minQty = locked.length;
        const newQty = Math.max(0, parseInt(String(item.quantity), 10) || 0);

        if (newQty < minQty) {
          const name = productRows[0]?.product_name ?? item.productId;
          throw new Error(`Cannot set ${name} below ${minQty} (${minQty} already sold/replaced/damaged)`);
        }

        const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
        const withGst = item.withGst !== false;
        const price = productRows[0]?.price ?? Number(((await client.query(
          'SELECT price FROM products WHERE id = $1 AND tenant_id = $2',
          [item.productId, tenantId]
        )).rows[0] as { price: number } | undefined)?.price ?? 0);

        if (newQty > productRows.length) {
          const toAdd = newQty - productRows.length;
          const invRows = (await client.query(
            `SELECT id, barcode FROM product_inventory WHERE product_id = \$1 AND status = 'InStock' AND tenant_id = \$2 ORDER BY id LIMIT \$3 FOR UPDATE SKIP LOCKED`,
            [item.productId, tenantId, toAdd]
          )).rows as { id: string; barcode: string }[];
          if (invRows.length < toAdd) {
            const name = productRows[0]?.product_name ?? item.productId;
            throw new Error(`Insufficient stock for ${name}. Available: ${invRows.length}, need ${toAdd} more`);
          }
          const netPrice = Math.round((price * (100 - disc) / 100) * 100) / 100;
          const gstOn = !!withGst;
          const billed = withGst ? Math.round(netPrice * (100 + gstRate) / 100) : netPrice;
          let seq = Number((await client.query(
            'SELECT COUNT(*) as c FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2',
            [batchId, tenantId]
          )).rows[0]?.c ?? 0);
          for (const inv of invRows) {
            seq++;
            const distId = seq === 1 && invRows.length === 1 && productRows.length === 0 && newQty === 1 ? batchId : `${batchId}-${seq}`;
            await client.query(
              'INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
              [distId, batchId, item.productId, inv.barcode, vendorId, effectiveDate, 'Distributed', disc, netPrice, gstOn, billed, tenantId]
            );
            await client.query(
              'UPDATE product_inventory SET status = $1 WHERE id = $2 AND tenant_id = $3',
              ['Distributed', inv.id, tenantId]
            );
          }
        } else if (newQty < productRows.length) {
          const toRemove = productRows.length - newQty;
          const removable = [...distributed].reverse().slice(0, toRemove);
          for (const row of removable) {
            await client.query(
              'UPDATE product_inventory SET status = $1 WHERE barcode = $2 AND tenant_id = $3',
              ['InStock', row.barcode, tenantId]
            );
            await client.query(
              'DELETE FROM product_distribution WHERE id = $1 AND tenant_id = $2',
              [row.id, tenantId]
            );
          }
        }

        const remaining = (await client.query(`
          SELECT pd.id, p.price FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
          WHERE pd.batch_id = $2 AND pd.product_id = $3 AND pd.tenant_id = $1
        `, [tenantId, batchId, item.productId])).rows as { id: string; price: number }[];
        for (const row of remaining) {
          await applyPricing(row.id, row.price, disc, withGst);
        }
        if (date) {
          await client.query(
            'UPDATE product_distribution SET distribution_date = $1 WHERE batch_id = $2 AND product_id = $3 AND tenant_id = $4',
            [effectiveDate, batchId, item.productId, tenantId]
          );
        }
      }

      // Products removed from edit form — drop extra distributed units only
      for (const [productId, productRows] of byProduct) {
        if (touchedProductIds.has(productId)) continue;
        const locked = productRows.filter((r) => r.status !== 'Distributed');
        if (locked.length > 0) {
          throw new Error(`Cannot remove ${productRows[0]?.product_name ?? productId}: ${locked.length} unit(s) already sold/replaced/damaged`);
        }
        for (const row of productRows) {
          await client.query(
            'UPDATE product_inventory SET status = $1 WHERE barcode = $2 AND tenant_id = $3',
            ['InStock', row.barcode, tenantId]
          );
          await client.query(
            'DELETE FROM product_distribution WHERE id = $1 AND tenant_id = $2',
            [row.id, tenantId]
          );
        }
      }

      if (date && itemList.length === 0) {
        await client.query(
          'UPDATE product_distribution SET distribution_date = $1 WHERE batch_id = $2 AND tenant_id = $3',
          [effectiveDate, batchId, tenantId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof Error && (err.message.startsWith('Cannot ') || err.message.startsWith('Insufficient '))) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    } finally {
      client.release();
    }

    const remainingCount = Number((await pool.query(
      'SELECT COUNT(*) as c FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2',
      [batchId, tenantId]
    )).rows[0]?.c ?? 0);
    if (remainingCount === 0) {
      return res.json({ deleted: true, batchId });
    }

    await logAudit(pool, tenantId, 'Distribution Updated', 'distribution', batchId, 'Batch edited');

    const batch = (await pool.query(`
      SELECT
        COALESCE(pd.batch_id, pd.id) as batch_id,
        pd.vendor_id,
        v.name as vendor_name,
        MIN(pd.distribution_date) as distribution_date,
        COUNT(*) as total,
        SUM(CASE WHEN pd.status = 'Sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN pd.status = 'Replaced' THEN 1 ELSE 0 END) as replaced,
        SUM(CASE WHEN pd.status = 'Damaged' THEN 1 ELSE 0 END) as damaged,
        SUM(CASE WHEN pd.status = 'Distributed' THEN 1 ELSE 0 END) as available_with_vendor,
        SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) as bill_value,
        STRING_AGG(DISTINCT p.name, ',') as product_names,
        MAX(pd.discount_percent) as discount_percent,
        MAX(pd.gst_applied::int) as gst_applied
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.batch_id = $2 AND pd.tenant_id = $1
      GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id, v.name
    `, [tenantId, batchId])).rows[0] as Record<string, unknown> | undefined;

    const putBatchPaid = Number((await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE batch_id = $1 AND tenant_id = $2',
      [batchId, tenantId]
    )).rows[0]?.t ?? 0);
    const putBillValue = Number(batch?.bill_value);

    res.json({
      batchId,
      vendorId: batch?.vendor_id,
      vendorName: batch?.vendor_name,
      distributionDate: batch?.distribution_date,
      productNames: String(batch?.product_names || '').split(',').filter(Boolean),
      total: Number(batch?.total),
      sold: Number(batch?.sold),
      replaced: Number(batch?.replaced) || 0,
      damaged: Number(batch?.damaged) || 0,
      availableWithVendor: Number(batch?.available_with_vendor),
      billValue: putBillValue,
      amountPaid: putBatchPaid,
      balanceRemaining: putBillValue - putBatchPaid,
      discountPercent: Number(batch?.discount_percent) || 0,
      gstApplied: !!(Number(batch?.gst_applied)),
      canDelete: Number(batch?.sold ?? 0) + Number(batch?.replaced ?? 0) + Number(batch?.damaged ?? 0) === 0,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Get batch detail for edit
router.get('/api/distribution/batch/:batchId', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { batchId } = req.params;
    const jwtVendorId = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !jwtVendorId) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }

    const ownerCheck = (await pool.query(
      `SELECT vendor_id FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2 LIMIT 1`,
      [batchId, tenantId]
    )).rows[0] as { vendor_id: string } | undefined;
    if (!ownerCheck) return res.status(404).json({ error: 'Distribution batch not found' });
    if (jwtVendorId && ownerCheck.vendor_id !== jwtVendorId) {
      return res.status(403).json({ error: 'Access denied for this batch.' });
    }

    const rows = (await pool.query(`
      SELECT pd.product_id, pd.status, pd.discount_percent, pd.gst_applied,
             p.name as product_name, p.price, p.pack_size, p.pack_name,
             (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as available_stock
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.batch_id = $2 AND pd.tenant_id = $1
    `, [tenantId, batchId])).rows as Record<string, unknown>[];
    if (rows.length === 0) return res.status(404).json({ error: 'Distribution batch not found' });

    const batch = (await pool.query(`
      SELECT
        COALESCE(pd.batch_id, pd.id) as batch_id,
        pd.vendor_id,
        v.name as vendor_name,
        MIN(pd.distribution_date) as distribution_date,
        COUNT(*) as total,
        SUM(CASE WHEN pd.status = 'Sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN pd.status = 'Replaced' THEN 1 ELSE 0 END) as replaced,
        SUM(CASE WHEN pd.status = 'Damaged' THEN 1 ELSE 0 END) as damaged,
        SUM(CASE WHEN pd.status = 'Distributed' THEN 1 ELSE 0 END) as available_with_vendor,
        SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) as bill_value,
        STRING_AGG(DISTINCT p.name, ',') as product_names
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.batch_id = $2 AND pd.tenant_id = $1
      GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id, v.name
    `, [tenantId, batchId])).rows[0] as Record<string, unknown>;

    const groups: Record<string, {
      productId: string; productName: string; quantity: number; minQuantity: number;
      sold: number; replaced: number; damaged: number;
      discountPercent: number; withGst: boolean; availableStock: number;
      packSize: number; packName: string;
    }> = {};
    for (const r of rows) {
      const pid = r.product_id as string;
      if (!groups[pid]) {
        groups[pid] = {
          productId: pid,
          productName: r.product_name as string,
          quantity: 0,
          minQuantity: 0,
          sold: 0,
          replaced: 0,
          damaged: 0,
          discountPercent: Number(r.discount_percent) || 0,
          withGst: !!r.gst_applied,
          availableStock: jwtVendorId ? 0 : (Number(r.available_stock) || 0),
          packSize: Number(r.pack_size) || 1,
          packName: (r.pack_name as string) || 'Piece',
        };
      }
      const g = groups[pid];
      g.quantity++;
      const status = r.status as string;
      if (status === 'Sold') { g.sold++; g.minQuantity++; }
      else if (status === 'Replaced') { g.replaced++; g.minQuantity++; }
      else if (status === 'Damaged') { g.damaged++; g.minQuantity++; }
    }

    const sold = Number(batch.sold) || 0;
    const replaced = Number(batch.replaced) || 0;
    const damaged = Number(batch.damaged) || 0;

    const batchPaid = Number((await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE batch_id = $1 AND tenant_id = $2',
      [batchId, tenantId]
    )).rows[0]?.t ?? 0);
    const billValue = Number(batch.bill_value);

    res.json({
      batchId,
      vendorId: batch.vendor_id,
      vendorName: batch.vendor_name,
      distributionDate: batch.distribution_date,
      productNames: String(batch.product_names || '').split(',').filter(Boolean),
      total: Number(batch.total),
      sold,
      replaced,
      damaged,
      availableWithVendor: Number(batch.available_with_vendor),
      billValue,
      amountPaid: batchPaid,
      balanceRemaining: billValue - batchPaid,
      canDelete: sold + replaced + damaged === 0,
      items: Object.values(groups),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Save EWB number on batch
router.put('/api/distribution/batch/:batchId/ewb', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId } = req.params;
    const { ewbNumber } = req.body;
    const result = await pool.query('UPDATE product_distribution SET ewb_number = $1 WHERE batch_id = $2 AND tenant_id = $3', [ewbNumber || null, batchId, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Batch not found' });
    res.json({ ok: true, ewbNumber: ewbNumber || null });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark batch as dispatched/delivered
router.put('/api/distribution/batch/:batchId/dispatch', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId } = req.params;
    const { status } = req.body;
    if (!['dispatched', 'delivered'].includes(status)) return res.status(400).json({ error: 'Status must be dispatched or delivered' });
    const jwtUser = (req as unknown as Record<string, unknown>).user as { userId?: string; name?: string } | undefined;
    const result = await pool.query(
      'UPDATE product_distribution SET dispatch_status = $1, dispatched_by = $2, dispatched_at = NOW() WHERE batch_id = $3 AND tenant_id = $4',
      [status, jwtUser?.name || jwtUser?.userId || 'Unknown', batchId, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Batch not found' });
    await logAudit(pool, tenantId, `Batch ${status}`, 'distribution', batchId, `Marked as ${status} by ${jwtUser?.name || 'user'}`, jwtUser?.userId);
    res.json({ ok: true, status, batchId });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete entire distribution batch (only if nothing sold/replaced/damaged)
router.delete('/api/distribution/batch/:batchId', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { batchId } = req.params;
    const rows = (await pool.query(
      'SELECT id, barcode, status FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2',
      [batchId, tenantId]
    )).rows as { id: string; barcode: string; status: string }[];
    if (rows.length === 0) return res.status(404).json({ error: 'Distribution batch not found' });

    const blocked = rows.filter((r) => r.status !== 'Distributed');
    if (blocked.length > 0) {
      return res.status(400).json({
        error: `Cannot delete: ${blocked.length} unit(s) are sold, replaced, or damaged. Reduce quantity to locked minimum instead.`,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        await client.query(
          "UPDATE product_inventory SET status = 'InStock' WHERE barcode = $1 AND tenant_id = $2",
          [row.barcode, tenantId]
        );
        await client.query(
          'DELETE FROM product_distribution WHERE id = $1 AND tenant_id = $2',
          [row.id, tenantId]
        );
      }
      await client.query(
        'DELETE FROM vendor_payments WHERE batch_id = $1 AND tenant_id = $2',
        [batchId, tenantId]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await logAudit(pool, tenantId, 'Distribution Deleted', 'distribution', batchId, `${rows.length} units returned to inventory`);
    res.json({ ok: true, batchId, unitsReturned: rows.length });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// E-Invoice JSON generation
router.get('/api/distribution/einvoice', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId } = req.query;
    if (!batchId) return res.status(400).json({ error: 'batchId required' });

    const scoped = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !scoped) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }

    // Fetch distribution items
    const items = (await pool.query(`
      SELECT pd.*, p.name as product_name, p.hsn_code, p.gst_rate as product_gst_rate, p.price as product_price, p.pack_size
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.batch_id = $2 AND pd.tenant_id = $1
    `, [tenantId, batchId])).rows as Record<string, unknown>[];
    if (items.length === 0) return res.status(404).json({ error: 'No distribution found for this batch' });

    // Fetch vendor
    const vendorId = items[0].vendor_id as string;
    const denied = assertVendorAccess(req, vendorId);
    if (denied) return res.status(403).json({ error: denied });
    const vendor = (await pool.query('SELECT name, contact_person, phone, email, address, gst_number FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as Record<string, unknown> | undefined;

    // Fetch seller (tenant) details
    const tenant = (await pool.query('SELECT company_name, admin_email, phone, address, gst_number FROM tenants WHERE id = $1', [tenantId])).rows[0] as Record<string, unknown>;
    const user = (await pool.query("SELECT gst_number, name, phone, address FROM users WHERE tenant_id = $1 AND role = 'Admin' LIMIT 1", [tenantId])).rows[0] as Record<string, unknown> | undefined;

    const sellerGstin = (tenant.gst_number || user?.gst_number || '') as string;
    const buyerGstin = (vendor?.gst_number || '') as string;
    const isB2B = buyerGstin.length >= 15;

    // Group items by product + discount
    const grouped: Record<string, { name: string; hsn: string; gstRate: number; qty: number; price: number; disc: number; taxable: number; cgst: number; sgst: number; total: number }> = {};
    for (const row of items) {
      const key = `${row.product_id}-${row.discount_percent}`;
      const netPrice = Number(row.net_price) || Number(row.product_price) || 0;
      const billedPrice = Number(row.billed_price) || netPrice;
      const gstRate = Number(row.product_gst_rate) || 18;
      const gstAmount = row.gst_applied ? billedPrice - netPrice : 0;
      if (!grouped[key]) {
        grouped[key] = { name: row.product_name as string, hsn: (row.hsn_code as string) || '', gstRate, qty: 0, price: netPrice, disc: Number(row.discount_percent) || 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      }
      grouped[key].qty += 1;
      grouped[key].taxable += netPrice;
      grouped[key].cgst += Math.round(gstAmount / 2);
      grouped[key].sgst += Math.round(gstAmount / 2);
      grouped[key].total += billedPrice;
    }

    const itemList = Object.values(grouped).map((g, i) => ({
      SlNo: String(i + 1),
      IsServc: 'N',
      PrdDesc: g.name,
      HsnCd: g.hsn || '0000',
      Qty: g.qty,
      Unit: 'PCS',
      UnitPrice: g.price,
      Discount: g.disc,
      GstRt: g.gstRate,
      CgstAmt: g.cgst,
      SgstAmt: g.sgst,
      IgstAmt: 0,
      CesAmt: 0,
      TotAmt: g.taxable,
      TotItemVal: g.total,
    }));

    const totTaxable = Object.values(grouped).reduce((s, g) => s + g.taxable, 0);
    const totCgst = Object.values(grouped).reduce((s, g) => s + g.cgst, 0);
    const totSgst = Object.values(grouped).reduce((s, g) => s + g.sgst, 0);
    const totVal = Object.values(grouped).reduce((s, g) => s + g.total, 0);

    const distDate = items[0].distribution_date as string;
    const invoiceDate = new Date(distDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');

    const stateFromGstin = (gstin: string) => gstin?.length >= 2 ? gstin.substring(0, 2) : '00';
    const pinFromAddress = (addr: string) => { const m = (addr || '').match(/\b(\d{6})\b/); return m ? parseInt(m[1], 10) : 0; };
    const fromStcd = stateFromGstin(sellerGstin) || '24';
    const toStcd = stateFromGstin(buyerGstin) || fromStcd;
    const fromPin = pinFromAddress((tenant.address as string) || '') || 360001;
    const toPin = pinFromAddress((vendor?.address as string) || '') || fromPin;
    const isInterState = fromStcd !== toStcd;

    const eInvoice = {
      Version: '1.1',
      TranDtls: { TaxSch: 'GST', SupTyp: isB2B ? 'B2B' : 'B2C', RegRev: 'N', IgstOnIntra: isInterState ? 'Y' : 'N' },
      DocDtls: { Typ: 'INV', No: `INV-${batchId}`, Dt: invoiceDate },
      SellerDtls: {
        Gstin: sellerGstin,
        LglNm: tenant.company_name as string,
        Addr1: (tenant.address as string) || 'N/A',
        Loc: (String(tenant.address || '')).split(',').slice(-2, -1)[0]?.trim() || 'N/A',
        Pin: fromPin,
        Stcd: fromStcd,
        Ph: (tenant.phone as string) || '',
        Em: (tenant.admin_email as string) || '',
      },
      BuyerDtls: {
        Gstin: buyerGstin || 'URP',
        LglNm: (vendor?.name as string) || 'Walk-in Customer',
        Pos: toStcd,
        Addr1: (vendor?.address as string) || 'N/A',
        Loc: (vendor?.address as string)?.split(',').slice(-2, -1)[0]?.trim() || 'N/A',
        Pin: toPin,
        Stcd: toStcd,
        Ph: (vendor?.phone as string) || '',
        Em: (vendor?.email as string) || '',
      },
      ...(isB2B ? { ShipDtls: { Gstin: buyerGstin, LglNm: (vendor?.name as string) || '', Addr1: (vendor?.address as string) || 'N/A', Loc: (vendor?.address as string)?.split(',').slice(-2, -1)[0]?.trim() || 'N/A', Pin: toPin, Stcd: toStcd } } : {}),
      ItemList: itemList,
      ValDtls: {
        AssVal: totTaxable,
        CgstVal: isInterState ? 0 : totCgst,
        SgstVal: isInterState ? 0 : totSgst,
        IgstVal: isInterState ? totCgst + totSgst : 0,
        CesVal: 0,
        Discount: 0,
        OthChrg: 0,
        RndOffAmt: 0,
        TotInvVal: totVal,
      },
    };

    // Validations (July 2026 compliant)
    const warnings: string[] = [];
    const errors: string[] = [];
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!sellerGstin) errors.push('Seller GSTIN is missing — add in Settings → Profile');
    else if (!gstinRegex.test(sellerGstin)) errors.push(`Seller GSTIN "${sellerGstin}" format is invalid`);
    if (isB2B && !gstinRegex.test(buyerGstin)) errors.push(`Buyer GSTIN "${buyerGstin}" format is invalid`);
    for (const g of Object.values(grouped)) {
      if (!g.hsn || g.hsn === '0000') errors.push(`Product "${g.name}" has no HSN code`);
      else if (!/^\d{4,8}$/.test(g.hsn)) errors.push(`HSN "${g.hsn}" for "${g.name}" must be 4-8 digits`);
      else if (isB2B && g.hsn.length < 6) warnings.push(`HSN "${g.hsn}" for "${g.name}" should be 6+ digits for B2B`);
    }
    if (!(tenant.address as string)) errors.push('Seller address is missing');
    if (isB2B && !(vendor?.address as string)) warnings.push('Buyer address is missing');
    if (isInterState) warnings.push(`Inter-state supply (${fromStcd} → ${toStcd}) — IGST applied`);
    if (fromPin === 360001 && !(tenant.address as string)?.includes('360001')) warnings.push('Seller pincode defaulted — add pincode in address');

    res.json({ ...eInvoice, _validation: { valid: errors.length === 0, errors, warnings } });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// E-Way Bill JSON generation
router.get('/api/distribution/ewaybill', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId, vehicleNo, transportMode, distance, transporterName, transporterId, shipToGstin } = req.query;
    if (!batchId) return res.status(400).json({ error: 'batchId required' });
    if (!vehicleNo) return res.status(400).json({ error: 'Vehicle number required' });
    if (!distance) return res.status(400).json({ error: 'Distance required' });

    const scoped = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !scoped) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }

    const items = (await pool.query(`
      SELECT pd.*, p.name as product_name, p.hsn_code, p.gst_rate as product_gst_rate, p.price as product_price, p.pack_size
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.batch_id = $2 AND pd.tenant_id = $1
    `, [tenantId, batchId])).rows as Record<string, unknown>[];
    if (items.length === 0) return res.status(404).json({ error: 'No distribution found' });

    const vendorId = items[0].vendor_id as string;
    const denied = assertVendorAccess(req, vendorId);
    if (denied) return res.status(403).json({ error: denied });
    const vendor = (await pool.query('SELECT name, phone, address, gst_number FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    const tenant = (await pool.query('SELECT company_name, phone, address, gst_number FROM tenants WHERE id = $1', [tenantId])).rows[0] as Record<string, unknown>;
    const user = (await pool.query("SELECT gst_number, address FROM users WHERE tenant_id = $1 AND role = 'Admin' LIMIT 1", [tenantId])).rows[0] as Record<string, unknown> | undefined;

    const sellerGstin = (tenant.gst_number || user?.gst_number || '') as string;
    const buyerGstin = (vendor?.gst_number || '') as string;

    // Group items
    const grouped: Record<string, { name: string; hsn: string; gstRate: number; qty: number; taxable: number; cgst: number; sgst: number; total: number }> = {};
    for (const row of items) {
      const key = `${row.product_id}`;
      const netPrice = Number(row.net_price) || Number(row.product_price) || 0;
      const billedPrice = Number(row.billed_price) || netPrice;
      const gstRate = Number(row.product_gst_rate) || 18;
      const gstAmt = row.gst_applied ? billedPrice - netPrice : 0;
      if (!grouped[key]) grouped[key] = { name: row.product_name as string, hsn: (row.hsn_code as string) || '0000', gstRate, qty: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      grouped[key].qty += 1;
      grouped[key].taxable += netPrice;
      grouped[key].cgst += Math.round(gstAmt / 2);
      grouped[key].sgst += Math.round(gstAmt / 2);
      grouped[key].total += billedPrice;
    }

    const itemList = Object.values(grouped).map((g, i) => ({
      SlNo: String(i + 1), PrdDesc: g.name, HsnCd: g.hsn, Qty: g.qty, Unit: 'PCS',
      UnitPrice: g.qty > 0 ? Math.round(g.taxable / g.qty) : 0, TotAmt: g.taxable, GstRt: g.gstRate,
      CgstAmt: g.cgst, SgstAmt: g.sgst, IgstAmt: 0, CesAmt: 0, TotItemVal: g.total,
    }));

    const totTaxable = Object.values(grouped).reduce((s, g) => s + g.taxable, 0);
    const totCgst = Object.values(grouped).reduce((s, g) => s + g.cgst, 0);
    const totSgst = Object.values(grouped).reduce((s, g) => s + g.sgst, 0);
    const totVal = Object.values(grouped).reduce((s, g) => s + g.total, 0);
    const distDate = items[0].distribution_date as string;
    const invoiceDate = new Date(distDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
    const modeMap: Record<string, string> = { Road: '1', Rail: '2', Air: '3', Ship: '4' };

    // Extract state code from GSTIN (first 2 digits) or default
    const stateFromGstin = (gstin: string) => gstin?.length >= 2 ? parseInt(gstin.substring(0, 2), 10) : 0;
    // Extract pincode from address (6-digit number)
    const pinFromAddress = (addr: string) => { const m = (addr || '').match(/\b(\d{6})\b/); return m ? parseInt(m[1], 10) : 0; };

    const fromStateCode = stateFromGstin(sellerGstin) || 24;
    const toStateCode = stateFromGstin(buyerGstin) || fromStateCode;
    const fromPincode = pinFromAddress((tenant.address as string) || '') || 360001;
    const toPincode = pinFromAddress((vendor?.address as string) || '') || fromPincode;
    const isInterState = fromStateCode !== toStateCode;

    // 180-day document date check
    const docDate = new Date(distDate);
    const daysSinceDoc = Math.floor((Date.now() - docDate.getTime()) / (1000 * 60 * 60 * 24));

    // Ship-To GSTIN (mandatory from Aug 2026)
    const shipTo = (shipToGstin as string) || buyerGstin || 'URP';

    const eWayBill = {
      Version: '1.01',
      SupTyp: buyerGstin ? 'B2B' : 'B2C',
      SubSupTyp: 'Supply',
      DocTyp: 'INV',
      DocNo: `INV-${batchId}`,
      DocDt: invoiceDate,
      FromGstin: sellerGstin,
      FromTrdName: tenant.company_name as string,
      FromAddr1: (tenant.address as string) || 'N/A',
      FromPlace: (String(tenant.address || '')).split(',').slice(-2, -1)[0]?.trim() || 'N/A',
      FromPincode: fromPincode,
      FromStateCode: fromStateCode,
      ToGstin: buyerGstin || 'URP',
      ToTrdName: (vendor?.name as string) || 'Walk-in',
      ToAddr1: (vendor?.address as string) || 'N/A',
      ToPlace: (vendor?.address as string)?.split(',').slice(-2, -1)[0]?.trim() || 'N/A',
      ToPincode: toPincode,
      ToStateCode: toStateCode,
      ShipToGstin: shipTo,
      TotalValue: totTaxable,
      CgstValue: isInterState ? 0 : totCgst,
      SgstValue: isInterState ? 0 : totSgst,
      IgstValue: isInterState ? totCgst + totSgst : 0,
      CesValue: 0,
      TotInvValue: totVal,
      TransMode: modeMap[transportMode as string] || '1',
      TransDistance: distance,
      TransporterName: transporterName || '',
      TransporterId: transporterId || '',
      VehicleNo: vehicleNo,
      VehicleType: (transportMode as string) === 'Ship' ? 'O' : 'R',
      ItemList: itemList,
    };

    // Validations (July 2026 compliant)
    const warnings: string[] = [];
    const errors: string[] = [];
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    // GSTIN checks
    if (!sellerGstin) errors.push('Seller GSTIN is missing — add in Settings → Profile');
    else if (!gstinRegex.test(sellerGstin)) errors.push(`Seller GSTIN "${sellerGstin}" format is invalid`);
    if (buyerGstin && !gstinRegex.test(buyerGstin)) errors.push(`Buyer GSTIN "${buyerGstin}" format is invalid`);

    // Ship-To GSTIN (mandatory from Aug 2026)
    if (shipTo === 'URP' && buyerGstin) warnings.push('Ship-To GSTIN defaults to buyer GSTIN — pass shipToGstin if different');

    // 180-day document date limit (Jan 2025 rule)
    if (daysSinceDoc > 180) errors.push(`Document date is ${daysSinceDoc} days old — E-Way Bill cannot be generated for invoices older than 180 days`);

    // ₹50K threshold
    if (totVal < 50000) warnings.push(`Invoice value ₹${totVal.toLocaleString()} is below ₹50,000 — E-Way Bill may not be required`);

    // HSN validation (6-digit mandatory for B2B since Feb 2024)
    for (const g of Object.values(grouped)) {
      if (!g.hsn || g.hsn === '0000') errors.push(`Product "${g.name}" has no HSN code`);
      else if (!/^\d{4,8}$/.test(g.hsn)) errors.push(`HSN "${g.hsn}" for "${g.name}" must be 4-8 digits`);
      else if (buyerGstin && g.hsn.length < 6) warnings.push(`HSN "${g.hsn}" for "${g.name}" should be 6+ digits for B2B (mandatory for AATO > ₹5Cr)`);
    }

    // Vehicle & transport
    if (!(vehicleNo as string).match(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/i)) warnings.push(`Vehicle number "${vehicleNo}" format may be invalid (expected: GJ03AB1234)`);
    if (Number(distance) <= 0) errors.push('Distance must be greater than 0 km');
    if (Number(distance) > 4000) warnings.push(`Distance ${distance} km seems unusually high`);

    // Address & pincode
    if (!(tenant.address as string) || (tenant.address as string) === 'N/A') errors.push('Seller address is missing');
    if (!(vendor?.address as string) || (vendor?.address as string) === 'N/A') warnings.push('Buyer address is missing');
    if (fromPincode === 360001 && !(tenant.address as string)?.includes('360001')) warnings.push('Seller pincode defaulted to 360001 — add pincode in address');
    if (toPincode === fromPincode && vendor?.address) warnings.push('Buyer pincode same as seller — verify buyer address has correct pincode');

    // Inter-state detection
    if (isInterState) warnings.push(`Inter-state supply detected (${fromStateCode} → ${toStateCode}) — IGST applied instead of CGST/SGST`);

    res.json({ ...eWayBill, _validation: { valid: errors.length === 0, errors, warnings } });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
