import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

router.get('/api/masters/counts', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const customers = (await pool.query('SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1', [tenantId])).rows[0] as { count: number };
    const vendors = (await pool.query('SELECT COUNT(*) as count FROM vendors WHERE tenant_id = $1', [tenantId])).rows[0] as { count: number };
    const products = (await pool.query('SELECT COUNT(*) as count FROM products WHERE tenant_id = $1', [tenantId])).rows[0] as { count: number };
    const banks = (await pool.query('SELECT COUNT(*) as count FROM banks WHERE tenant_id = $1', [tenantId])).rows[0] as { count: number };
    const categories = (await pool.query('SELECT COUNT(*) as count FROM categories WHERE tenant_id = $1', [tenantId])).rows[0] as { count: number };

    res.json({
      customerMaster: customers.count,
      vendorMaster: vendors.count,
      itemMaster: products.count,
      bankMaster: banks.count,
      categoryMaster: categories.count,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
