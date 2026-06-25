import { Router } from 'express';
import { db } from '../db';
import { logAudit, DISTRIBUTION_BILL_UNIT_SQL } from '../utils/helpers';

const router = Router();

router.get('/api/distribution/summary', (_req, res) => {
  try {
    const availableInInventory = db.prepare('SELECT COALESCE(SUM(stock), 0) as total FROM products').get() as { total: number };
    const totalDistributed = db.prepare('SELECT COUNT(*) as count FROM product_distribution').get() as { count: number };
    const vendorStats = db.prepare(`
      SELECT v.id, v.name,
        COUNT(pd.id) as distributed,
        SUM(CASE WHEN pd.status = 'Sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN pd.status = 'Replaced' THEN 1 ELSE 0 END) as replaced,
        SUM(CASE WHEN pd.status = 'Damaged' THEN 1 ELSE 0 END) as damaged
      FROM vendors v
      LEFT JOIN product_distribution pd ON pd.vendor_id = v.id
      GROUP BY v.id, v.name
    `).all() as { id: string; name: string; distributed: number; sold: number; replaced: number; damaged: number }[];
    const totalBeforeDistribution = availableInInventory.total + totalDistributed.count;
    res.json({
      totalBeforeDistribution: totalBeforeDistribution,
      availableInInventory: availableInInventory.total,
      totalDistributed: totalDistributed.count,
      vendorStats: vendorStats.map((v) => ({
        vendorId: v.id,
        vendorName: v.name,
        distributed: v.distributed,
        sold: v.sold,
        replaced: v.replaced ?? 0,
        damaged: v.damaged ?? 0,
        availableWithVendor: v.distributed - v.sold - (v.replaced ?? 0) - (v.damaged ?? 0),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/distribution', (req, res) => {
  try {
    const { vendorId, batchId } = req.query;
    let sql = `
      SELECT pd.id, pd.batch_id, pd.product_id, pd.barcode, pd.vendor_id, pd.distribution_date, pd.status,
        pd.discount_percent, pd.net_price, pd.gst_applied, pd.billed_price,
        p.name as product_name, v.name as vendor_name
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (typeof vendorId === 'string' && vendorId) {
      sql += ' AND pd.vendor_id = ?';
      params.push(vendorId);
    }
    if (typeof batchId === 'string' && batchId) {
      sql += ' AND pd.batch_id = ?';
      params.push(batchId);
    }
    sql += ' ORDER BY pd.distribution_date DESC, pd.id';
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
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
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/distribution/batches', (req, res) => {
  try {
    const { vendorId } = req.query;
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
        GROUP_CONCAT(DISTINCT p.name) as product_names,
        MAX(pd.discount_percent) as discount_percent,
        MAX(pd.gst_applied) as gst_applied
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (typeof vendorId === 'string' && vendorId) {
      sql += ' AND pd.vendor_id = ?';
      params.push(vendorId);
    }
    sql += `
      GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id, v.name
      ORDER BY MIN(pd.distribution_date) DESC, batch_id DESC
    `;
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    res.json(rows.map((r) => ({
      batchId: r.batch_id as string,
      vendorId: r.vendor_id as string,
      vendorName: r.vendor_name as string,
      distributionDate: r.distribution_date as string,
      productNames: (r.product_names as string || '').split(',').filter(Boolean),
      total: r.total as number,
      sold: r.sold as number,
      replaced: r.replaced as number ?? 0,
      damaged: r.damaged as number ?? 0,
      availableWithVendor: r.available_with_vendor as number,
      billValue: r.bill_value as number,
      discountPercent: r.discount_percent as number ?? 0,
      gstApplied: !!(r.gst_applied as number),
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Create one distribution batch from the "Distribute Products to Vendor" modal (all rows = one event)
router.post('/api/distribution/batch', (req, res) => {
  try {
    const { vendorId, distributionDate, amountPaid, items, gstRate: reqGstRate } = req.body as {
      vendorId?: string;
      distributionDate?: string;
      amountPaid?: number;
      gstRate?: number;
      items?: { productId: string; quantity: number; discountPercent?: number; withGst?: boolean }[];
    };
    if (!vendorId) return res.status(400).json({ error: 'Vendor is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one product' });

    const gstRate = Number(reqGstRate) || 18;
    const date = distributionDate || new Date().toISOString().slice(0, 10);
    const batchId = `D${Date.now()}`;
    const paidAmount = typeof amountPaid === 'number' && amountPaid > 0 ? amountPaid : null;

    let totalBilled = 0;
    let totalQty = 0;
    const productNames: string[] = [];
    const unitRows: { distId: string; productId: string; barcode: string; invId: string; disc: number; netPrice: number; gstApplied: number; billedPrice: number }[] = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
      const product = db.prepare('SELECT id, name, price FROM products WHERE id = ?').get(item.productId) as { id: string; name: string; price: number } | undefined;
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });
      const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
      const netPricePerUnit = Math.round((product.price * (100 - disc) / 100) * 100) / 100;
      const gstApplied = item.withGst !== false ? 1 : 0;
      const billedPricePerUnit = gstApplied ? Math.round(netPricePerUnit * (100 + gstRate) / 100) : netPricePerUnit;
      const invRows = db.prepare(`
        SELECT id, barcode FROM product_inventory WHERE product_id = ? AND status = 'InStock' ORDER BY id LIMIT ?
      `).all(product.id, qty) as { id: string; barcode: string }[];
      if (invRows.length < qty) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${invRows.length}, requested: ${qty}` });
      }
      productNames.push(product.name);
      for (const inv of invRows) {
        unitRows.push({
          distId: '', // assigned below
          productId: product.id,
          barcode: inv.barcode,
          invId: inv.id,
          disc,
          netPrice: netPricePerUnit,
          gstApplied,
          billedPrice: billedPricePerUnit,
        });
        totalBilled += billedPricePerUnit;
        totalQty++;
      }
    }

    if (paidAmount && paidAmount > totalBilled) {
      return res.status(400).json({ error: `Amount paid (₹${paidAmount}) cannot exceed billed amount (₹${totalBilled})` });
    }

    const totalUnits = unitRows.length;
    unitRows.forEach((u, i) => {
      u.distId = totalUnits === 1 ? batchId : `${batchId}-${i + 1}`;
    });

    const vendorName = (db.prepare('SELECT name FROM vendors WHERE id = ?').get(vendorId) as { name: string } | undefined)?.name ?? vendorId;

    const runBatch = db.transaction(() => {
      const insert = db.prepare('INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const updateInv = db.prepare('UPDATE product_inventory SET status = ? WHERE id = ?');
      for (const u of unitRows) {
        insert.run(u.distId, batchId, u.productId, u.barcode, vendorId, date, 'Distributed', u.disc, u.netPrice, u.gstApplied, u.billedPrice);
        updateInv.run('Distributed', u.invId);
      }
      if (paidAmount) {
        const payId = `VP${Date.now()}`;
        db.prepare('INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(payId, vendorId, paidAmount, date, 'Cash', null, `Payment against distribution ${batchId}`);
        logAudit('Payment Recorded', 'payment', payId, `${vendorName} paid ₹${paidAmount} (with distribution)`);
      }
    });
    runBatch();

    logAudit('Distribution Created', 'distribution', batchId, `${totalQty} units (${productNames.join(', ')}) to ${vendorName}`);

    res.status(201).json({
      batchId,
      vendorId,
      vendorName,
      distributionDate: date,
      productNames: [...new Set(productNames)],
      total: totalQty,
      sold: 0,
      replaced: 0,
      damaged: 0,
      availableWithVendor: totalQty,
      billValue: totalBilled,
      discountPercent: 0,
      gstApplied: items.some((i) => i.withGst !== false),
      amountPaid: paidAmount ?? 0,
      balanceRemaining: totalBilled - (paidAmount ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/distribution', (req, res) => {
  try {
    const { productId, vendorId, distributionDate, quantity, discountPercent, amountPaid, withGst, gstRate: reqGstRate, batchId: reqBatchId } = req.body;
    if (!productId || !vendorId) return res.status(400).json({ error: 'Product and vendor are required' });
    const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
    const product = db.prepare('SELECT id, price FROM products WHERE id = ?').get(productId) as { id: string; price: number } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const disc = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    const grossValue = product.price * qty;
    const discountAmount = Math.round(grossValue * disc / 100);
    const netAmount = grossValue - discountAmount;
    const netPricePerUnit = Math.round((product.price * (100 - disc) / 100) * 100) / 100;
    const gstApplied = withGst !== false;
    const gstRate = Number(reqGstRate) || 18;
    const billedPricePerUnit = gstApplied ? Math.round(netPricePerUnit * (100 + gstRate) / 100) : netPricePerUnit;
    const totalBilled = billedPricePerUnit * qty;
    const paidAmount = typeof amountPaid === 'number' && amountPaid > 0 ? amountPaid : null;
    if (paidAmount && paidAmount > totalBilled) return res.status(400).json({ error: `Amount paid (₹${paidAmount}) cannot exceed billed amount (₹${totalBilled})` });
    const invRows = db.prepare(`
      SELECT id, barcode FROM product_inventory WHERE product_id = ? AND status = 'InStock' ORDER BY id LIMIT ?
    `).all(product.id, qty) as { id: string; barcode: string }[];
    const availableStock = invRows.length;
    if (availableStock < qty) return res.status(400).json({ error: `Insufficient stock. Available: ${availableStock}, requested: ${qty}` });
    const baseId = typeof reqBatchId === 'string' && reqBatchId ? reqBatchId : `D${Date.now()}`;
    const date = distributionDate || new Date().toISOString().slice(0, 10);
    const existingInBatch = typeof reqBatchId === 'string' && reqBatchId
      ? (db.prepare('SELECT COUNT(*) as c FROM product_distribution WHERE batch_id = ?').get(reqBatchId) as { c: number }).c
      : 0;
    const runDist = db.transaction(() => {
      for (let i = 0; i < invRows.length; i++) {
        const inv = invRows[i];
        const seq = existingInBatch + i + 1;
        const distId = invRows.length === 1 && existingInBatch === 0 ? baseId : `${baseId}-${seq}`;
        db.prepare('INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(distId, baseId, product.id, inv.barcode, vendorId, date, 'Distributed', disc, netPricePerUnit, gstApplied ? 1 : 0, billedPricePerUnit);
        db.prepare('UPDATE product_inventory SET status = ? WHERE id = ?').run('Distributed', inv.id);
      }
    });
    runDist();
    const vendorName = (db.prepare('SELECT name FROM vendors WHERE id = ?').get(vendorId) as { name: string } | undefined)?.name ?? vendorId;
    logAudit('Distribution Created', 'distribution', baseId, `${qty} units to ${vendorName}, Discount: ${disc}%`);
    if (paidAmount) {
      const payId = `VP${Date.now()}`;
      db.prepare('INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(payId, vendorId, paidAmount, date, 'Cash', null, `Payment against distribution ${baseId}`);
      logAudit('Payment Recorded', 'payment', payId, `${vendorName} paid ₹${paidAmount} (with distribution)`);
    }
    const firstRow = db.prepare(`
      SELECT pd.*, p.name as product_name, v.name as vendor_name, v.id as vendor_id
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE pd.product_id = ? AND pd.vendor_id = ? AND pd.distribution_date = ?
      ORDER BY pd.id DESC LIMIT 1
    `).get(product.id, vendorId, date) as Record<string, unknown>;
    res.status(201).json({
      id: baseId,
      batchId: baseId,
      productId: firstRow?.product_id ?? product.id,
      productName: firstRow?.product_name,
      barcode: invRows[0]?.barcode ?? firstRow?.barcode,
      quantity: invRows.length,
      vendorId: firstRow?.vendor_id ?? vendorId,
      vendorName: firstRow?.vendor_name,
      distributionDate: date,
      status: 'Distributed',
      grossValue,
      discountPercent: disc,
      discountAmount,
      netAmount,
      amountPaid: paidAmount ?? 0,
      balanceRemaining: netAmount - (paidAmount ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Mark distribution units as GST or non-GST billed (updates finance amounts)
router.put('/api/distribution/apply-billing', (req, res) => {
  try {
    const { vendorId, batchId, gstUnits, nonGstUnits, gstRate } = req.body;
    if (!vendorId && !batchId) return res.status(400).json({ error: 'vendorId or batchId required' });
    const rate = Number(gstRate) || 18;
    let sql = `
      SELECT pd.id, COALESCE(pd.net_price, p.price) as unit_price
      FROM product_distribution pd JOIN products p ON pd.product_id = p.id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (batchId) {
      sql += ' AND pd.batch_id = ?';
      params.push(batchId as string);
    } else {
      sql += ' AND pd.vendor_id = ? AND pd.billed_price IS NULL';
      params.push(vendorId as string);
    }
    sql += ' ORDER BY pd.id';
    const units = db.prepare(sql).all(...params) as { id: string; unit_price: number }[];
    const totalUnits = units.length;
    const gstCount = Math.min(gstUnits ?? 0, totalUnits);
    const nonGstCount = Math.min(nonGstUnits ?? 0, totalUnits - gstCount);
    let idx = 0;
    for (let i = 0; i < gstCount && idx < units.length; i++, idx++) {
      const u = units[idx];
      const billedPrice = Math.round(u.unit_price * (100 + rate) / 100);
      db.prepare('UPDATE product_distribution SET gst_applied = 1, billed_price = ? WHERE id = ?').run(billedPrice, u.id);
    }
    for (let i = 0; i < nonGstCount && idx < units.length; i++, idx++) {
      const u = units[idx];
      db.prepare('UPDATE product_distribution SET gst_applied = 0, billed_price = ? WHERE id = ?').run(u.unit_price, u.id);
    }
    logAudit('Billing Applied', 'distribution', batchId || vendorId, `GST: ${gstCount} units, Non-GST: ${nonGstCount} units`);
    res.json({ ok: true, gstUnits: gstCount, nonGstUnits: nonGstCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ DISTRIBUTION BILL (CHALLAN) ============
router.get('/api/distribution/bill', (req, res) => {
  try {
    const { vendorId, productId, distributionDate, batchId } = req.query;
    if (!vendorId && !batchId) return res.status(400).json({ error: 'vendorId or batchId is required' });
    let sql = `
      SELECT pd.id, pd.batch_id, pd.barcode, pd.distribution_date, pd.status, pd.discount_percent, pd.net_price, pd.billed_price, pd.gst_applied,
             pd.product_id, p.name as product_name, p.price, p.category_id, p.batch_number,
             c.name as category_name,
             v.name as vendor_name, v.contact_person as vendor_contact, v.phone as vendor_phone, v.email as vendor_email, v.address as vendor_address
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (typeof batchId === 'string' && batchId) {
      sql += ' AND pd.batch_id = ?';
      params.push(batchId);
    } else {
      sql += ' AND pd.vendor_id = ?';
      params.push(vendorId as string);
    }
    if (typeof productId === 'string' && productId) {
      sql += ' AND pd.product_id = ?';
      params.push(productId);
    }
    if (typeof distributionDate === 'string' && distributionDate) {
      sql += ' AND pd.distribution_date = ?';
      params.push(distributionDate);
    }
    sql += ' ORDER BY pd.distribution_date DESC, pd.id';
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    if (rows.length === 0) return res.status(404).json({ error: 'No distribution records found' });
    const first = rows[0];
    const company = db.prepare("SELECT name, company_name, phone, address, gst_number, default_gst_rate FROM users WHERE role IN ('Super Admin', 'Admin') ORDER BY id LIMIT 1").get() as { name: string; company_name: string | null; phone: string | null; address: string | null; gst_number: string | null; default_gst_rate: number | null } | undefined;
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
      },
      company: {
        name: company?.company_name ?? 'Splendor',
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
        category: r.category_name ?? null,
        batchNumber: r.batch_number ?? null,
        originalPrice: r.price ?? 0,
        discountPercent: r.discount_percent ?? 0,
        price: Number(r.net_price) || Number(r.price) || 0,
        status: r.status,
      })),
      groupedItems: (() => {
        const groups: Record<string, { productName: string; barcodes: string[]; originalPrice: number; discountPercent: number; netPrice: number }> = {};
        for (const r of rows) {
          const key = `${r.product_id}-${r.discount_percent ?? 0}-${r.distribution_date}`;
          if (!groups[key]) groups[key] = { productName: r.product_name as string, barcodes: [], originalPrice: Number(r.price) || 0, discountPercent: Number(r.discount_percent) || 0, netPrice: Number(r.net_price) || Number(r.price) || 0 };
          groups[key].barcodes.push(r.barcode as string);
        }
        return Object.values(groups).map((g, i) => {
          const sorted = g.barcodes.sort();
          return {
            sno: i + 1,
            productName: g.productName,
            barcodeRange: sorted.length === 1 ? sorted[0] : `${sorted[0]} – ${sorted[sorted.length - 1]}`,
            quantity: sorted.length,
            originalPrice: g.originalPrice,
            discountPercent: g.discountPercent,
            netPrice: g.netPrice,
            lineTotal: g.netPrice * sorted.length,
          };
        });
      })(),
      totalQuantity: rows.length,
      grossValue,
      totalDiscount,
      totalValue: netTotal,
      totalBilled,
      payment: (() => {
        if (typeof batchId === 'string' && batchId) {
          return { totalDistributedValue: totalBilled, totalPaid: 0, balance: totalBilled };
        }
        const vid = vendorId as string;
        const totalDistValue = (db.prepare('SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) as t FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = ?').get(vid) as { t: number }).t;
        const totalPaid = (db.prepare('SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = ?').get(vid) as { t: number }).t;
        return { totalDistributedValue: totalDistValue, totalPaid, balance: totalDistValue - totalPaid };
      })(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Update a distribution batch (date, per-product qty/discount/GST)
router.put('/api/distribution/batch/:batchId', (req, res) => {
  try {
    const { batchId } = req.params;
    const { distributionDate, items, gstRate: reqGstRate } = req.body as {
      distributionDate?: string;
      items?: { productId: string; quantity: number; discountPercent?: number; withGst?: boolean }[];
      gstRate?: number;
    };
    const gstRate = Number(reqGstRate) || 18;
    const date = typeof distributionDate === 'string' && distributionDate ? distributionDate : null;

    const allRows = db.prepare(`
      SELECT pd.id, pd.product_id, pd.barcode, pd.status, pd.gst_applied, pd.discount_percent,
             p.price, p.name as product_name
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      WHERE pd.batch_id = ?
      ORDER BY pd.id
    `).all(batchId) as {
      id: string; product_id: string; barcode: string; status: string;
      gst_applied: number; discount_percent: number; price: number; product_name: string;
    }[];
    if (allRows.length === 0) return res.status(404).json({ error: 'Distribution batch not found' });

    const vendorRow = db.prepare('SELECT vendor_id, distribution_date FROM product_distribution WHERE batch_id = ? LIMIT 1').get(batchId) as { vendor_id: string; distribution_date: string };
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

    const runUpdate = db.transaction(() => {
      const applyPricing = (rowId: string, price: number, disc: number, withGst: boolean) => {
        const netPrice = Math.round((price * (100 - disc) / 100) * 100) / 100;
        const gstOn = withGst ? 1 : 0;
        const billed = withGst ? Math.round(netPrice * (100 + gstRate) / 100) : netPrice;
        db.prepare('UPDATE product_distribution SET discount_percent = ?, net_price = ?, gst_applied = ?, billed_price = ? WHERE id = ?')
          .run(disc, netPrice, gstOn, billed, rowId);
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
        const price = productRows[0]?.price ?? (db.prepare('SELECT price FROM products WHERE id = ?').get(item.productId) as { price: number } | undefined)?.price ?? 0;

        if (newQty > productRows.length) {
          const toAdd = newQty - productRows.length;
          const invRows = db.prepare(`
            SELECT id, barcode FROM product_inventory WHERE product_id = ? AND status = 'InStock' ORDER BY id LIMIT ?
          `).all(item.productId, toAdd) as { id: string; barcode: string }[];
          if (invRows.length < toAdd) {
            const name = productRows[0]?.product_name ?? item.productId;
            throw new Error(`Insufficient stock for ${name}. Available: ${invRows.length}, need ${toAdd} more`);
          }
          const netPrice = Math.round((price * (100 - disc) / 100) * 100) / 100;
          const gstOn = withGst ? 1 : 0;
          const billed = withGst ? Math.round(netPrice * (100 + gstRate) / 100) : netPrice;
          const insert = db.prepare('INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          const updateInv = db.prepare('UPDATE product_inventory SET status = ? WHERE id = ?');
          let seq = (db.prepare('SELECT COUNT(*) as c FROM product_distribution WHERE batch_id = ?').get(batchId) as { c: number }).c;
          for (const inv of invRows) {
            seq++;
            const distId = seq === 1 && invRows.length === 1 && productRows.length === 0 && newQty === 1 ? batchId : `${batchId}-${seq}`;
            insert.run(distId, batchId, item.productId, inv.barcode, vendorId, effectiveDate, 'Distributed', disc, netPrice, gstOn, billed);
            updateInv.run('Distributed', inv.id);
          }
        } else if (newQty < productRows.length) {
          const toRemove = productRows.length - newQty;
          const removable = [...distributed].reverse().slice(0, toRemove);
          for (const row of removable) {
            db.prepare('UPDATE product_inventory SET status = ? WHERE barcode = ?').run('InStock', row.barcode);
            db.prepare('DELETE FROM product_distribution WHERE id = ?').run(row.id);
          }
        }

        const remaining = db.prepare(`
          SELECT pd.id, p.price FROM product_distribution pd JOIN products p ON pd.product_id = p.id
          WHERE pd.batch_id = ? AND pd.product_id = ?
        `).all(batchId, item.productId) as { id: string; price: number }[];
        for (const row of remaining) {
          applyPricing(row.id, row.price, disc, withGst);
        }
        if (date) {
          db.prepare('UPDATE product_distribution SET distribution_date = ? WHERE batch_id = ? AND product_id = ?').run(effectiveDate, batchId, item.productId);
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
          db.prepare('UPDATE product_inventory SET status = ? WHERE barcode = ?').run('InStock', row.barcode);
          db.prepare('DELETE FROM product_distribution WHERE id = ?').run(row.id);
        }
      }

      if (date && itemList.length === 0) {
        db.prepare('UPDATE product_distribution SET distribution_date = ? WHERE batch_id = ?').run(effectiveDate, batchId);
      }
    });

    try {
      runUpdate();
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const remaining = (db.prepare('SELECT COUNT(*) as c FROM product_distribution WHERE batch_id = ?').get(batchId) as { c: number }).c;
    if (remaining === 0) {
      return res.json({ deleted: true, batchId });
    }

    logAudit('Distribution Updated', 'distribution', batchId, 'Batch edited');
    const batch = db.prepare(`
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
        GROUP_CONCAT(DISTINCT p.name) as product_names,
        MAX(pd.discount_percent) as discount_percent,
        MAX(pd.gst_applied) as gst_applied
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE pd.batch_id = ?
      GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id, v.name
    `).get(batchId) as Record<string, unknown> | undefined;

    res.json({
      batchId,
      vendorId: batch?.vendor_id,
      vendorName: batch?.vendor_name,
      distributionDate: batch?.distribution_date,
      productNames: String(batch?.product_names || '').split(',').filter(Boolean),
      total: batch?.total,
      sold: batch?.sold,
      replaced: batch?.replaced ?? 0,
      damaged: batch?.damaged ?? 0,
      availableWithVendor: batch?.available_with_vendor,
      billValue: batch?.bill_value,
      discountPercent: batch?.discount_percent ?? 0,
      gstApplied: !!(batch?.gst_applied as number),
      canDelete: Number(batch?.sold ?? 0) + Number(batch?.replaced ?? 0) + Number(batch?.damaged ?? 0) === 0,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Get batch detail for edit
router.get('/api/distribution/batch/:batchId', (req, res) => {
  try {
    const { batchId } = req.params;
    const rows = db.prepare(`
      SELECT pd.product_id, pd.status, pd.discount_percent, pd.gst_applied,
             p.name as product_name, p.price,
             (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock') as available_stock
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      WHERE pd.batch_id = ?
    `).all(batchId) as Record<string, unknown>[];
    if (rows.length === 0) return res.status(404).json({ error: 'Distribution batch not found' });

    const batch = db.prepare(`
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
        GROUP_CONCAT(DISTINCT p.name) as product_names
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE pd.batch_id = ?
      GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id, v.name
    `).get(batchId) as Record<string, unknown>;

    const groups: Record<string, {
      productId: string; productName: string; quantity: number; minQuantity: number;
      sold: number; replaced: number; damaged: number;
      discountPercent: number; withGst: boolean; availableStock: number;
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
          availableStock: Number(r.available_stock) || 0,
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

    res.json({
      batchId,
      vendorId: batch.vendor_id,
      vendorName: batch.vendor_name,
      distributionDate: batch.distribution_date,
      productNames: String(batch.product_names || '').split(',').filter(Boolean),
      total: batch.total,
      sold,
      replaced,
      damaged,
      availableWithVendor: batch.available_with_vendor,
      billValue: batch.bill_value,
      canDelete: sold + replaced + damaged === 0,
      items: Object.values(groups),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Delete entire distribution batch (only if nothing sold/replaced/damaged)
router.delete('/api/distribution/batch/:batchId', (req, res) => {
  try {
    const { batchId } = req.params;
    const rows = db.prepare('SELECT id, barcode, status FROM product_distribution WHERE batch_id = ?').all(batchId) as { id: string; barcode: string; status: string }[];
    if (rows.length === 0) return res.status(404).json({ error: 'Distribution batch not found' });

    const blocked = rows.filter((r) => r.status !== 'Distributed');
    if (blocked.length > 0) {
      return res.status(400).json({
        error: `Cannot delete: ${blocked.length} unit(s) are sold, replaced, or damaged. Reduce quantity to locked minimum instead.`,
      });
    }

    db.transaction(() => {
      for (const row of rows) {
        db.prepare("UPDATE product_inventory SET status = 'InStock' WHERE barcode = ?").run(row.barcode);
        db.prepare('DELETE FROM product_distribution WHERE id = ?').run(row.id);
      }
    })();

    logAudit('Distribution Deleted', 'distribution', batchId, `${rows.length} units returned to inventory`);
    res.json({ ok: true, batchId, unitsReturned: rows.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
