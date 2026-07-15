import { Router } from 'express';
import { pool } from '../pg-db';
import { AuthRequest, vendorScopeId } from '../middleware/auth';

const router = Router();

router.get('/api/search', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length < 1) return res.json({ products: [], customers: [], vendors: [], warranties: [], sales: [] });
    const like = `%${q}%`;
    const limit = 6;
    const vid = vendorScopeId(req);

    if (vid) {
      // Vendor: only own customers, own distribution batches, own distributed products
      const [products, customers, challans] = await Promise.all([
        pool.query(`
          SELECT DISTINCT p.id, p.name, p.price,
            (SELECT COUNT(*) FROM product_distribution pd2 WHERE pd2.product_id = p.id AND pd2.vendor_id = $3 AND pd2.tenant_id = $1 AND pd2.status = 'Distributed') as stock
          FROM products p
          JOIN product_distribution pd ON pd.product_id = p.id AND pd.vendor_id = $3 AND pd.tenant_id = $1
          WHERE p.name ILIKE $2 AND p.tenant_id = $1 ORDER BY p.name LIMIT $4
        `, [tenantId, like, vid, limit]).then(r => r.rows as { id: string; name: string; price: number; stock: number }[]),
        pool.query(`
          SELECT id, name, phone, email FROM customers
          WHERE vendor_id = $3 AND (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1) AND tenant_id = $2
          ORDER BY name LIMIT $4
        `, [like, tenantId, vid, limit]).then(r => r.rows as { id: string; name: string; phone: string; email: string }[]),
        pool.query(`
          SELECT COALESCE(pd.batch_id, pd.id) as batch_id, v.name as vendor_name,
            MIN(pd.distribution_date) as distribution_date, COUNT(*) as total_units
          FROM product_distribution pd
          JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
          WHERE pd.tenant_id = $1 AND pd.vendor_id = $3 AND COALESCE(pd.batch_id, pd.id) ILIKE $2
          GROUP BY COALESCE(pd.batch_id, pd.id), v.name
          ORDER BY MIN(pd.distribution_date) DESC LIMIT $4
        `, [tenantId, like, vid, limit]).then(r => r.rows as { batch_id: string; vendor_name: string; distribution_date: string; total_units: number }[]),
      ]);
      return res.json({
        products: products.map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stock, type: 'product' as const })),
        customers: customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', type: 'customer' as const })),
        vendors: [],
        barcodes: [],
        challans: challans.map((c) => ({ batchId: c.batch_id, vendorName: c.vendor_name, date: c.distribution_date, units: Number(c.total_units), type: 'challan' as const })),
        staff: [],
      });
    }

    // Run all 6 searches in parallel
    const [products, customers, vendors, barcodeResults, challans, staff] = await Promise.all([
      pool.query(`
        SELECT p.id, p.name, p.price,
          (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as stock
        FROM products p WHERE p.name ILIKE $2 AND p.tenant_id = $1 ORDER BY p.name LIMIT $3
      `, [tenantId, like, limit]).then(r => r.rows as { id: string; name: string; price: number; stock: number }[]),
      pool.query(`
        SELECT id, name, phone, email FROM customers WHERE (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1) AND tenant_id = $2 ORDER BY name LIMIT $3
      `, [like, tenantId, limit]).then(r => r.rows as { id: string; name: string; phone: string; email: string }[]),
      pool.query(`
        SELECT id, name, contact_person, phone FROM vendors WHERE (name ILIKE $1 OR contact_person ILIKE $1 OR phone ILIKE $1) AND tenant_id = $2 ORDER BY name LIMIT $3
      `, [like, tenantId, limit]).then(r => r.rows as { id: string; name: string; contact_person: string; phone: string }[]),
      pool.query(`
        SELECT pi.barcode, p.name as product_name, p.id as product_id, pi.status
        FROM product_inventory pi JOIN products p ON pi.product_id = p.id AND p.tenant_id = $2
        WHERE pi.barcode ILIKE $1 AND pi.tenant_id = $2 LIMIT $3
      `, [like, tenantId, limit]).then(r => r.rows as { barcode: string; product_name: string; product_id: string; status: string }[]),
      pool.query(`
        SELECT COALESCE(pd.batch_id, pd.id) as batch_id, v.name as vendor_name,
          MIN(pd.distribution_date) as distribution_date, COUNT(*) as total_units
        FROM product_distribution pd
        JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
        WHERE pd.tenant_id = $1 AND COALESCE(pd.batch_id, pd.id) ILIKE $2
        GROUP BY COALESCE(pd.batch_id, pd.id), v.name
        ORDER BY MIN(pd.distribution_date) DESC LIMIT $3
      `, [tenantId, like, limit]).then(r => r.rows as { batch_id: string; vendor_name: string; distribution_date: string; total_units: number }[]),
      pool.query(`
        SELECT staff_name, SUM(amount) as total_paid, COUNT(*) as payments, MAX(payment_date) as last_payment
        FROM staff_payments WHERE staff_name ILIKE $1 AND tenant_id = $2
        GROUP BY staff_name ORDER BY total_paid DESC LIMIT $3
      `, [like, tenantId, limit]).then(r => r.rows as { staff_name: string; total_paid: number; payments: number; last_payment: string }[]),
    ]);

    res.json({
      products: products.map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stock, type: 'product' as const })),
      customers: customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', type: 'customer' as const })),
      vendors: vendors.map((v) => ({ id: v.id, name: v.name, contact: v.contact_person ?? '', phone: v.phone ?? '', type: 'vendor' as const })),
      barcodes: barcodeResults.map((b) => ({ barcode: b.barcode, productName: b.product_name, productId: b.product_id, status: b.status, type: 'barcode' as const })),
      challans: challans.map((c) => ({ batchId: c.batch_id, vendorName: c.vendor_name, date: c.distribution_date, units: Number(c.total_units), type: 'challan' as const })),
      staff: staff.map((s) => ({ name: s.staff_name, totalPaid: Number(s.total_paid), payments: Number(s.payments), lastPayment: s.last_payment, type: 'staff' as const })),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
