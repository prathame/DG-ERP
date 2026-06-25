import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/api/notifications', (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const items: { id: string; type: string; title: string; message: string; severity: string }[] = [];
    const lowStock = db.prepare(`
      SELECT p.id, p.name, COUNT(pi.id) as stock FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock'
      GROUP BY p.id HAVING stock < 10
    `).all() as { id: string; name: string; stock: number }[];
    for (const p of lowStock) {
      items.push({ id: `low-${p.id}`, type: 'low_stock', title: 'Low Stock', message: `${p.name} has only ${p.stock} units left`, severity: p.stock === 0 ? 'critical' : 'warning' });
    }
    const expiring = db.prepare(`
      SELECT id, barcode, customer_name, expiry_date FROM warranties
      WHERE status = 'Active' AND expiry_date BETWEEN ? AND date(?, '+30 days')
      ORDER BY expiry_date ASC LIMIT 10
    `).all(today, today) as { id: string; barcode: string; customer_name: string; expiry_date: string }[];
    for (const w of expiring) {
      items.push({ id: `exp-${w.id}`, type: 'warranty_expiring', title: 'Warranty Expiring', message: `${w.customer_name} (${w.barcode}) expires ${w.expiry_date}`, severity: 'info' });
    }
    const pendingPayments = db.prepare(`
      SELECT v.id, v.name,
        COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id), 0) as val,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id), 0) as paid
      FROM vendors v WHERE v.id != 'OWNER'
      HAVING (val - paid) > 0 ORDER BY (val - paid) DESC LIMIT 5
    `).all() as { id: string; name: string; val: number; paid: number }[];
    for (const v of pendingPayments) {
      const bal = v.val - v.paid;
      items.push({ id: `pay-${v.id}`, type: 'payment_due', title: 'Payment Pending', message: `${v.name} owes ₹${bal.toLocaleString()}`, severity: bal > 50000 ? 'warning' : 'info' });
    }
    res.json({ notifications: items, count: items.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
