import { Router } from 'express';
import { pool } from '../pg-db';
const router = Router();
router.get('/api/mapping/vendors-with-customers', async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'];
        if (!tenantId)
            return res.status(401).json({ error: 'Tenant ID required' });
        const rows = (await pool.query(`
      SELECT v.id, v.name as vendor_name, v.contact_person, v.phone,
             c.id as customer_id, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM vendors v
      LEFT JOIN customers c ON c.vendor_id = v.id AND c.tenant_id = $1
      WHERE v.tenant_id = $1
      ORDER BY v.name, c.name
    `, [tenantId])).rows;
        const byVendor = {};
        for (const r of rows) {
            if (!byVendor[r.id]) {
                byVendor[r.id] = { vendor: { id: r.id, name: r.vendor_name, contactPerson: r.contact_person, phone: r.phone }, customers: [] };
            }
            if (r.customer_id) {
                byVendor[r.id].customers.push({ id: r.customer_id, name: r.customer_name, phone: r.customer_phone ?? '', email: r.customer_email ?? '' });
            }
        }
        const directCustomers = (await pool.query('SELECT id, name, phone, email FROM customers WHERE vendor_id IS NULL AND tenant_id = $1 ORDER BY name', [tenantId])).rows;
        res.json({
            vendors: Object.values(byVendor),
            directCustomers,
        });
    }
    catch (err) {
        console.error(`💥 ${req.method} ${req.originalUrl} failed:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
