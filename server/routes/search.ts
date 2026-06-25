import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

router.get('/api/search', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length < 1) return res.json({ products: [], customers: [], vendors: [], warranties: [], sales: [] });
    const like = `%${q}%`;
    const limit = 6;

    const products = (await pool.query(`
      SELECT p.id, p.name, p.price,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as stock
      FROM products p WHERE p.name ILIKE $2 AND p.tenant_id = $1 ORDER BY p.name LIMIT $3
    `, [tenantId, like, limit])).rows as { id: string; name: string; price: number; stock: number }[];

    const customers = (await pool.query(`
      SELECT id, name, phone, email FROM customers WHERE (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1) AND tenant_id = $2 ORDER BY name LIMIT $3
    `, [like, tenantId, limit])).rows as { id: string; name: string; phone: string; email: string }[];

    const vendors = (await pool.query(`
      SELECT id, name, contact_person, phone FROM vendors WHERE (name ILIKE $1 OR contact_person ILIKE $1 OR phone ILIKE $1) AND tenant_id = $2 ORDER BY name LIMIT $3
    `, [like, tenantId, limit])).rows as { id: string; name: string; contact_person: string; phone: string }[];

    const barcodeResults = (await pool.query(`
      SELECT pi.barcode, p.name as product_name, p.id as product_id, pi.status
      FROM product_inventory pi JOIN products p ON pi.product_id = p.id
      WHERE pi.barcode ILIKE $1 AND pi.tenant_id = $2 LIMIT $3
    `, [like, tenantId, limit])).rows as { barcode: string; product_name: string; product_id: string; status: string }[];

    res.json({
      products: products.map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stock, type: 'product' as const })),
      customers: customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', type: 'customer' as const })),
      vendors: vendors.map((v) => ({ id: v.id, name: v.name, contact: v.contact_person ?? '', phone: v.phone ?? '', type: 'vendor' as const })),
      barcodes: barcodeResults.map((b) => ({ barcode: b.barcode, productName: b.product_name, productId: b.product_id, status: b.status, type: 'barcode' as const })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
