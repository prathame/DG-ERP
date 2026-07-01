import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

router.get('/api/notifications', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const today = new Date().toISOString().slice(0, 10);
    const items: { id: string; type: string; title: string; message: string; severity: string }[] = [];

    const lowStock = (await pool.query(`
      SELECT p.id, p.name, COUNT(pi.id) as stock FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1
      WHERE p.tenant_id = $1
      GROUP BY p.id, p.name HAVING COUNT(pi.id) < 10
    `, [tenantId])).rows as { id: string; name: string; stock: number }[];
    for (const p of lowStock) {
      items.push({ id: `low-${p.id}`, type: 'low_stock', title: 'Low Stock', message: `${p.name} has only ${p.stock} units left`, severity: Number(p.stock) === 0 ? 'critical' : 'warning' });
    }

    const expiring = (await pool.query(`
      SELECT id, barcode, customer_name, expiry_date FROM warranties
      WHERE status = 'Active' AND expiry_date BETWEEN $1 AND (CAST($1 AS DATE) + INTERVAL '30 days') AND tenant_id = $2
      ORDER BY expiry_date ASC LIMIT 10
    `, [today, tenantId])).rows as { id: string; barcode: string; customer_name: string; expiry_date: string }[];
    for (const w of expiring) {
      items.push({ id: `exp-${w.id}`, type: 'warranty_expiring', title: 'Warranty Expiring', message: `${w.customer_name} (${w.barcode}) expires ${w.expiry_date}`, severity: 'info' });
    }

    const pendingPayments = (await pool.query(`
      SELECT v.id, v.name,
        COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as val,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as paid
      FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1
      GROUP BY v.id, v.name
      HAVING COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) -
             COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) > 0
      ORDER BY (COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) -
                COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0)) DESC
      LIMIT 5
    `, [tenantId])).rows as { id: string; name: string; val: number; paid: number }[];
    for (const v of pendingPayments) {
      const bal = v.val - v.paid;
      items.push({ id: `pay-${v.id}`, type: 'payment_due', title: 'Payment Pending', message: `${v.name} owes ₹${bal.toLocaleString()}`, severity: bal > 50000 ? 'warning' : 'info' });
    }

    res.json({ notifications: items, count: items.length });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
