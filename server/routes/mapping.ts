import { Router } from 'express';
import { pool } from '../pg-db';
import { handleApiError } from '../utils/http-error';
import { AuthRequest, vendorScopeId } from '../middleware/auth';

const router = Router();

router.get('/api/mapping/vendors-with-customers', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vid = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !vid) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }

    const rows = (
      await pool.query(
        `
      SELECT v.id, v.name as vendor_name, v.contact_person, v.phone,
             c.id as customer_id, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM vendors v
      LEFT JOIN customers c ON c.vendor_id = v.id AND c.tenant_id = $1
      WHERE v.tenant_id = $1 ${vid ? 'AND v.id = $2' : ''}
      ORDER BY v.name, c.name
    `,
        vid ? [tenantId, vid] : [tenantId],
      )
    ).rows as {
      id: string;
      vendor_name: string;
      contact_person: string;
      phone: string;
      customer_id: string | null;
      customer_name: string | null;
      customer_phone: string | null;
      customer_email: string | null;
    }[];

    const byVendor: Record<
      string,
      {
        vendor: { id: string; name: string; contactPerson: string; phone: string };
        customers: { id: string; name: string; phone: string; email: string }[];
      }
    > = {};
    for (const r of rows) {
      if (!byVendor[r.id]) {
        byVendor[r.id] = {
          vendor: { id: r.id, name: r.vendor_name, contactPerson: r.contact_person, phone: r.phone },
          customers: [],
        };
      }
      if (r.customer_id) {
        byVendor[r.id].customers.push({
          id: r.customer_id,
          name: r.customer_name!,
          phone: r.customer_phone ?? '',
          email: r.customer_email ?? '',
        });
      }
    }

    const directCustomers = vid
      ? []
      : ((
          await pool.query(
            'SELECT id, name, phone, email FROM customers WHERE vendor_id IS NULL AND tenant_id = $1 ORDER BY name',
            [tenantId],
          )
        ).rows as { id: string; name: string; phone: string; email: string }[]);

    res.json({
      vendors: Object.values(byVendor),
      directCustomers,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
