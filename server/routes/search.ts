import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/api/search', (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length < 1) return res.json({ products: [], customers: [], vendors: [], warranties: [], sales: [] });
    const like = `%${q}%`;
    const limit = 6;
    const products = db.prepare(`
      SELECT p.id, p.name, p.price,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock') as stock
      FROM products p WHERE p.name LIKE ? ORDER BY p.name LIMIT ?
    `).all(like, limit) as { id: string; name: string; price: number; stock: number }[];
    const customers = db.prepare(`
      SELECT id, name, phone, email FROM customers WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY name LIMIT ?
    `).all(like, like, like, limit) as { id: string; name: string; phone: string; email: string }[];
    const vendors = db.prepare(`
      SELECT id, name, contact_person, phone FROM vendors WHERE name LIKE ? OR contact_person LIKE ? OR phone LIKE ? ORDER BY name LIMIT ?
    `).all(like, like, like, limit) as { id: string; name: string; contact_person: string; phone: string }[];
    const barcodeResults = db.prepare(`
      SELECT pi.barcode, p.name as product_name, p.id as product_id, pi.status
      FROM product_inventory pi JOIN products p ON pi.product_id = p.id
      WHERE pi.barcode LIKE ? LIMIT ?
    `).all(like, limit) as { barcode: string; product_name: string; product_id: string; status: string }[];
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
