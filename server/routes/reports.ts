import { Router } from 'express';
import { pool } from '../pg-db';
import { DISTRIBUTION_BILL_UNIT_SQL } from '../utils/helpers';

const router = Router();

router.get('/api/reports/sales-register', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to, vendorId, productId } = req.query;
    let sql = `
      SELECT ps.id, ps.barcode, ps.purchase_date, ps.customer_name, ps.customer_phone, ps.sale_price,
             p.name as product_name, p.hsn_code, p.price as product_price, p.gst_rate,
             v.name as vendor_name
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      LEFT JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $1
      WHERE ps.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (from) { idx++; sql += ` AND ps.purchase_date >= $${idx}`; params.push(from); }
    if (to) { idx++; sql += ` AND ps.purchase_date <= $${idx}`; params.push(to); }
    if (vendorId) { idx++; sql += ` AND ps.vendor_id = $${idx}`; params.push(vendorId); }
    if (productId) { idx++; sql += ` AND ps.product_id = $${idx}`; params.push(productId); }
    sql += ' ORDER BY ps.purchase_date DESC, ps.id DESC';

    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    const mapped = rows.map((r) => {
      const rate = Number(r.sale_price ?? r.product_price ?? 0);
      const gstRate = Number(r.gst_rate ?? 18);
      const taxable = Math.round(rate * 100 / (100 + gstRate));
      const gstAmt = rate - taxable;
      const halfGst = Math.round(gstAmt / 2);
      return {
        id: r.id, date: r.purchase_date, barcode: r.barcode, customerName: r.customer_name,
        customerPhone: r.customer_phone, vendorName: r.vendor_name, productName: r.product_name,
        hsnCode: r.hsn_code || '', gstRate, rate, taxableValue: taxable,
        cgst: halfGst, sgst: gstAmt - halfGst, total: rate,
      };
    });
    const totals = mapped.reduce((acc, r) => {
      acc.taxableValue += r.taxableValue; acc.cgst += r.cgst; acc.sgst += r.sgst; acc.total += r.total;
      return acc;
    }, { taxableValue: 0, cgst: 0, sgst: 0, total: 0 });
    res.json({ rows: mapped, totals, count: mapped.length });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/reports/distribution-register', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to, vendorId, productId } = req.query;
    let sql = `
      SELECT pd.batch_id, pd.distribution_date, pd.barcode, pd.status, pd.discount_percent,
             pd.net_price, pd.gst_applied, pd.billed_price,
             p.name as product_name, p.hsn_code, p.price as product_price, p.gst_rate,
             v.name as vendor_name, v.gst_number as vendor_gstin
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (from) { idx++; sql += ` AND pd.distribution_date >= $${idx}`; params.push(from); }
    if (to) { idx++; sql += ` AND pd.distribution_date <= $${idx}`; params.push(to); }
    if (vendorId) { idx++; sql += ` AND pd.vendor_id = $${idx}`; params.push(vendorId); }
    if (productId) { idx++; sql += ` AND pd.product_id = $${idx}`; params.push(productId); }
    sql += ' ORDER BY pd.distribution_date DESC, pd.batch_id DESC';

    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    const mapped = rows.map((r) => {
      const netPrice = Number(r.net_price ?? r.product_price ?? 0);
      const billedPrice = Number(r.billed_price ?? netPrice);
      const gstAmt = r.gst_applied ? billedPrice - netPrice : 0;
      const halfGst = Math.round(gstAmt / 2);
      return {
        batchId: r.batch_id, date: r.distribution_date, barcode: r.barcode, status: r.status,
        vendorName: r.vendor_name, vendorGstin: r.vendor_gstin || '', productName: r.product_name,
        hsnCode: r.hsn_code || '', gstRate: Number(r.gst_rate ?? 18),
        rate: Number(r.product_price), discountPercent: Number(r.discount_percent ?? 0),
        taxableValue: netPrice, cgst: halfGst, sgst: gstAmt - halfGst,
        total: billedPrice,
      };
    });
    const totals = mapped.reduce((acc, r) => {
      acc.taxableValue += r.taxableValue; acc.cgst += r.cgst; acc.sgst += r.sgst; acc.total += r.total;
      return acc;
    }, { taxableValue: 0, cgst: 0, sgst: 0, total: 0 });
    res.json({ rows: mapped, totals, count: mapped.length });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/reports/outstanding', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vendors = (await pool.query(`
      SELECT v.id, v.name,
        COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_billed,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid
      FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1 ORDER BY v.name
    `, [tenantId])).rows as Record<string, unknown>[];

    const now = new Date();
    const rows = [];
    for (const v of vendors) {
      const billed = Number(v.total_billed);
      const paid = Number(v.total_paid);
      const balance = billed - paid;
      if (balance <= 0) continue;

      const batches = (await pool.query(`
        SELECT COALESCE(pd.batch_id, pd.id) as batch_id, MIN(pd.distribution_date) as dist_date,
          SUM(${DISTRIBUTION_BILL_UNIT_SQL}) as batch_billed
        FROM product_distribution pd
        JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
        WHERE pd.vendor_id = $2 AND pd.tenant_id = $1
        GROUP BY COALESCE(pd.batch_id, pd.id)
        ORDER BY MIN(pd.distribution_date)
      `, [tenantId, v.id])).rows as { batch_id: string; dist_date: string; batch_billed: string }[];

      const batchPayments: Record<string, number> = {};
      const payRows = (await pool.query(
        'SELECT batch_id, SUM(amount) as paid FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2 AND batch_id IS NOT NULL GROUP BY batch_id',
        [v.id, tenantId]
      )).rows as { batch_id: string; paid: string }[];
      for (const pr of payRows) batchPayments[pr.batch_id] = Number(pr.paid);

      const unlinkedPaid = paid - Object.values(batchPayments).reduce((s, p) => s + p, 0);
      let remainingUnlinked = Math.max(0, unlinkedPaid);

      let d0_30 = 0, d31_60 = 0, d61_90 = 0, d90plus = 0;
      for (const b of batches) {
        let batchBal = Number(b.batch_billed) - (batchPayments[b.batch_id] ?? 0);
        if (remainingUnlinked > 0 && batchBal > 0) {
          const apply = Math.min(remainingUnlinked, batchBal);
          batchBal -= apply;
          remainingUnlinked -= apply;
        }
        if (batchBal <= 0) continue;
        const days = Math.floor((now.getTime() - new Date(b.dist_date).getTime()) / 86400000);
        if (days <= 30) d0_30 += batchBal;
        else if (days <= 60) d31_60 += batchBal;
        else if (days <= 90) d61_90 += batchBal;
        else d90plus += batchBal;
      }
      rows.push({ vendorId: v.id, vendorName: v.name, totalBilled: billed, totalPaid: paid, balance, d0_30, d31_60, d61_90, d90plus });
    }
    const totals = rows.reduce((acc, r) => {
      acc.totalBilled += r.totalBilled; acc.totalPaid += r.totalPaid; acc.balance += r.balance;
      acc.d0_30 += r.d0_30; acc.d31_60 += r.d31_60; acc.d61_90 += r.d61_90; acc.d90plus += r.d90plus;
      return acc;
    }, { totalBilled: 0, totalPaid: 0, balance: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 });
    res.json({ rows, totals, count: rows.length });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/reports/payment-register', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to, vendorId, method } = req.query;
    let sql = `
      SELECT vp.id, vp.payment_date, vp.amount, vp.payment_method, vp.reference_number, vp.notes, vp.batch_id,
             v.name as vendor_name
      FROM vendor_payments vp
      JOIN vendors v ON vp.vendor_id = v.id AND v.tenant_id = $1
      WHERE vp.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (from) { idx++; sql += ` AND vp.payment_date >= $${idx}`; params.push(from); }
    if (to) { idx++; sql += ` AND vp.payment_date <= $${idx}`; params.push(to); }
    if (vendorId) { idx++; sql += ` AND vp.vendor_id = $${idx}`; params.push(vendorId); }
    if (method) { idx++; sql += ` AND vp.payment_method = $${idx}`; params.push(method); }
    sql += ' ORDER BY vp.payment_date DESC, vp.id DESC';

    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    const mapped = rows.map((r) => ({
      id: r.id, date: r.payment_date, vendorName: r.vendor_name, amount: Number(r.amount),
      method: r.payment_method, reference: r.reference_number || '', batchId: r.batch_id || '', notes: r.notes || '',
    }));
    const totals = { amount: mapped.reduce((s, r) => s + r.amount, 0) };
    res.json({ rows: mapped, totals, count: mapped.length });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/reports/stock-summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (await pool.query(`
      SELECT p.id, p.name, p.hsn_code, p.price,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as total_inventory,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as in_stock,
        (SELECT COUNT(*) FROM product_distribution pd WHERE pd.product_id = p.id AND pd.status = 'Distributed' AND pd.tenant_id = $1) as with_vendors,
        (SELECT COUNT(*) FROM product_distribution pd WHERE pd.product_id = p.id AND pd.status = 'Sold' AND pd.tenant_id = $1) as sold
      FROM products p WHERE p.tenant_id = $1 ORDER BY p.name
    `, [tenantId])).rows as Record<string, unknown>[];
    const mapped = rows.map((r) => {
      const total = Number(r.total_inventory);
      const inStock = Number(r.in_stock);
      const withVendors = Number(r.with_vendors);
      const sold = Number(r.sold);
      const price = Number(r.price);
      return {
        id: r.id, name: r.name, hsnCode: r.hsn_code || '', unitPrice: price,
        totalInventory: total, inStock, withVendors, sold,
        closingStock: inStock + withVendors,
        stockValue: (inStock + withVendors) * price,
      };
    });
    const totals = mapped.reduce((acc, r) => {
      acc.totalInventory += r.totalInventory; acc.inStock += r.inStock; acc.withVendors += r.withVendors;
      acc.sold += r.sold; acc.closingStock += r.closingStock; acc.stockValue += r.stockValue;
      return acc;
    }, { totalInventory: 0, inStock: 0, withVendors: 0, sold: 0, closingStock: 0, stockValue: 0 });
    res.json({ rows: mapped, totals, count: mapped.length });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/reports/gst-summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { month, year } = req.query;
    const m = parseInt(String(month), 10) || new Date().getMonth() + 1;
    const y = parseInt(String(year), 10) || new Date().getFullYear();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    const distRows = (await pool.query(`
      SELECT v.name as vendor_name, v.gst_number as vendor_gstin,
             p.name as product_name, p.hsn_code, p.gst_rate,
             pd.batch_id, pd.net_price, pd.billed_price, pd.gst_applied
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1 AND pd.distribution_date >= $2 AND pd.distribution_date < $3
      ORDER BY v.name, pd.batch_id
    `, [tenantId, startDate, endDate])).rows as Record<string, unknown>[];

    const b2b: Record<string, { vendorName: string; gstin: string; taxable: number; cgst: number; sgst: number; total: number; invoiceCount: number }> = {};
    let b2cTaxable = 0, b2cCgst = 0, b2cSgst = 0, b2cTotal = 0;
    const hsnMap: Record<string, { hsn: string; description: string; qty: number; taxable: number; cgst: number; sgst: number; total: number }> = {};

    for (const r of distRows) {
      const net = Number(r.net_price ?? 0);
      const billed = Number(r.billed_price ?? net);
      const gstAmt = r.gst_applied ? billed - net : 0;
      const halfGst = Math.round(gstAmt / 2);
      const gstin = (r.vendor_gstin as string) || '';
      const hsn = (r.hsn_code as string) || 'N/A';

      if (gstin) {
        if (!b2b[gstin]) b2b[gstin] = { vendorName: r.vendor_name as string, gstin, taxable: 0, cgst: 0, sgst: 0, total: 0, invoiceCount: 0 };
        b2b[gstin].taxable += net; b2b[gstin].cgst += halfGst; b2b[gstin].sgst += gstAmt - halfGst; b2b[gstin].total += billed;
        b2b[gstin].invoiceCount++;
      } else {
        b2cTaxable += net; b2cCgst += halfGst; b2cSgst += gstAmt - halfGst; b2cTotal += billed;
      }

      if (!hsnMap[hsn]) hsnMap[hsn] = { hsn, description: r.product_name as string, qty: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      hsnMap[hsn].qty++; hsnMap[hsn].taxable += net; hsnMap[hsn].cgst += halfGst; hsnMap[hsn].sgst += gstAmt - halfGst; hsnMap[hsn].total += billed;
    }

    res.json({
      period: `${String(m).padStart(2, '0')}/${y}`,
      b2b: Object.values(b2b),
      b2c: { taxable: b2cTaxable, cgst: b2cCgst, sgst: b2cSgst, total: b2cTotal },
      hsnSummary: Object.values(hsnMap),
      totalTaxable: Object.values(b2b).reduce((s, v) => s + v.taxable, 0) + b2cTaxable,
      totalTax: Object.values(b2b).reduce((s, v) => s + v.cgst + v.sgst, 0) + b2cCgst + b2cSgst,
      totalValue: Object.values(b2b).reduce((s, v) => s + v.total, 0) + b2cTotal,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
