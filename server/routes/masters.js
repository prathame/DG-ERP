import { Router } from 'express';
import { pool } from '../pg-db';
const router = Router();
router.get('/api/masters/counts', async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'];
        if (!tenantId)
            return res.status(401).json({ error: 'Tenant ID required' });
        const customers = (await pool.query('SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1', [tenantId])).rows[0];
        const vendors = (await pool.query('SELECT COUNT(*) as count FROM vendors WHERE tenant_id = $1', [tenantId])).rows[0];
        const products = (await pool.query('SELECT COUNT(*) as count FROM products WHERE tenant_id = $1', [tenantId])).rows[0];
        const banks = (await pool.query('SELECT COUNT(*) as count FROM banks WHERE tenant_id = $1', [tenantId])).rows[0];
        const categories = (await pool.query('SELECT COUNT(*) as count FROM categories WHERE tenant_id = $1', [tenantId])).rows[0];
        const staff = (await pool.query('SELECT COUNT(*) as count FROM staff_members WHERE tenant_id = $1', [tenantId])).rows[0];
        res.json({
            customerMaster: customers.count,
            vendorMaster: vendors.count,
            itemMaster: products.count,
            bankMaster: banks.count,
            categoryMaster: categories.count,
            staffCount: staff.count,
        });
    }
    catch (err) {
        console.error(`💥 ${req.method} ${req.originalUrl} failed:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
