import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { handleApiError } from '../utils/http-error';

const router = Router();

router.get('/api/masters/counts', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    // ponytail: single round-trip instead of 6 sequential COUNT queries
    const {
      rows: [r],
    } = await pool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM customers    WHERE tenant_id = $1) AS customers,
        (SELECT COUNT(*) FROM vendors      WHERE tenant_id = $1) AS vendors,
        (SELECT COUNT(*) FROM products     WHERE tenant_id = $1) AS products,
        (SELECT COUNT(*) FROM banks        WHERE tenant_id = $1) AS banks,
        (SELECT COUNT(*) FROM categories   WHERE tenant_id = $1) AS categories,
        (SELECT COUNT(*) FROM staff_members WHERE tenant_id = $1) AS staff
    `,
      [tenantId],
    );

    const n = (v: unknown) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    res.json({
      customerMaster: n(r.customers),
      vendorMaster: n(r.vendors),
      itemMaster: n(r.products),
      bankMaster: n(r.banks),
      categoryMaster: n(r.categories),
      staffCount: n(r.staff),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
