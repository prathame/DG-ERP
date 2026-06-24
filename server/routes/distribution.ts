import { Router } from 'express';
import { db } from '../db';
import { logAudit } from '../utils/helpers';

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
    const { vendorId } = req.query;
    let sql = `
      SELECT pd.id, pd.product_id, pd.barcode, pd.vendor_id, pd.distribution_date, pd.status,
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
    sql += ' ORDER BY pd.distribution_date DESC';
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    res.json(rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      barcode: r.barcode,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      distributionDate: r.distribution_date,
      status: r.status,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/distribution', (req, res) => {
  try {
    const { productId, vendorId, distributionDate, quantity } = req.body;
    if (!productId || !vendorId) return res.status(400).json({ error: 'Product and vendor are required' });
    const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId) as { id: string } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const invRows = db.prepare(`
      SELECT id, barcode FROM product_inventory WHERE product_id = ? AND status = 'InStock' ORDER BY id LIMIT ?
    `).all(product.id, qty) as { id: string; barcode: string }[];
    const availableStock = invRows.length;
    if (availableStock < qty) return res.status(400).json({ error: `Insufficient stock. Available: ${availableStock}, requested: ${qty}` });
    const baseId = `D${Date.now()}`;
    const date = distributionDate || new Date().toISOString().slice(0, 10);
    const runDist = db.transaction(() => {
      for (let i = 0; i < invRows.length; i++) {
        const inv = invRows[i];
        const distId = invRows.length === 1 ? baseId : `${baseId}-${i + 1}`;
        db.prepare('INSERT INTO product_distribution (id, product_id, barcode, vendor_id, distribution_date, status) VALUES (?, ?, ?, ?, ?, ?)')
          .run(distId, product.id, inv.barcode, vendorId, date, 'Distributed');
        db.prepare('UPDATE product_inventory SET status = ? WHERE id = ?').run('Distributed', inv.id);
      }
    });
    runDist();
    logAudit('Distribution Created', 'distribution', baseId, `${qty} units to vendor ${vendorId}`);
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
      productId: firstRow?.product_id ?? product.id,
      productName: firstRow?.product_name,
      barcode: invRows[0]?.barcode ?? firstRow?.barcode,
      quantity: invRows.length,
      vendorId: firstRow?.vendor_id ?? vendorId,
      vendorName: firstRow?.vendor_name,
      distributionDate: date,
      status: 'Distributed',
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ DISTRIBUTION BILL (CHALLAN) ============
router.get('/api/distribution/bill', (req, res) => {
  try {
    const { vendorId, productId, distributionDate } = req.query;
    if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });
    let sql = `
      SELECT pd.id, pd.barcode, pd.distribution_date, pd.status,
             p.name as product_name, p.price, p.category_id, p.batch_number,
             c.name as category_name,
             v.name as vendor_name, v.contact_person as vendor_contact, v.phone as vendor_phone, v.email as vendor_email, v.address as vendor_address
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE pd.vendor_id = ?
    `;
    const params: string[] = [vendorId as string];
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
    const company = db.prepare("SELECT name, company_name, phone, address FROM users WHERE role IN ('Super Admin', 'Admin') ORDER BY id LIMIT 1").get() as { name: string; company_name: string | null; phone: string | null; address: string | null } | undefined;
    const totalValue = rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    res.json({
      challanId: `CH-${(first.vendor_name as string || 'V').substring(0, 3).toUpperCase()}-${(first.distribution_date as string || '').replace(/-/g, '')}`,
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
      },
      items: rows.map((r, i) => ({
        sno: i + 1,
        barcode: r.barcode,
        productName: r.product_name,
        category: r.category_name ?? null,
        batchNumber: r.batch_number ?? null,
        price: r.price ?? 0,
        status: r.status,
      })),
      totalQuantity: rows.length,
      totalValue,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
