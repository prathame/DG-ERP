import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/api/mapping/vendors-with-customers', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT v.id, v.name as vendor_name, v.contact_person, v.phone,
             c.id as customer_id, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM vendors v
      LEFT JOIN customers c ON c.vendor_id = v.id
      ORDER BY v.name, c.name
    `).all() as { id: string; vendor_name: string; contact_person: string; phone: string; customer_id: string | null; customer_name: string | null; customer_phone: string | null; customer_email: string | null }[];
    const byVendor: Record<string, { vendor: { id: string; name: string; contactPerson: string; phone: string }; customers: { id: string; name: string; phone: string; email: string }[] }> = {};
    for (const r of rows) {
      if (!byVendor[r.id]) {
        byVendor[r.id] = { vendor: { id: r.id, name: r.vendor_name, contactPerson: r.contact_person, phone: r.phone }, customers: [] };
      }
      if (r.customer_id) {
        byVendor[r.id].customers.push({ id: r.customer_id, name: r.customer_name!, phone: r.customer_phone ?? '', email: r.customer_email ?? '' });
      }
    }
    const directCustomers = db.prepare('SELECT id, name, phone, email FROM customers WHERE vendor_id IS NULL ORDER BY name').all() as { id: string; name: string; phone: string; email: string }[];
    res.json({
      vendors: Object.values(byVendor),
      directCustomers,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
