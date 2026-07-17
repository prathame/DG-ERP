import { Router } from 'express';
import { pool } from '../pg-db';
import { AuthRequest, vendorScopeId } from '../middleware/auth';
import { handleApiError } from '../utils/http-error';

const router = Router();

export type NotificationDigest = {
  id: string;
  kind: string;
  priority: 'high' | 'medium';
  title: string;
  body: string;
  count?: number;
  hrefTab?: string;
  source?: string;
  type?: string;
  createdAt?: string;
  read?: boolean;
};

function todayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

async function buildDigests(tenantId: string, businessType: string): Promise<NotificationDigest[]> {
  const isService = businessType === 'service';
  const bucket = todayBucket();
  const items: NotificationDigest[] = [];

  // Price lists expiring in 7 days
  const pl = await pool.query(
    `SELECT COUNT(*)::int AS c,
            MIN(valid_to)::text AS soonest
     FROM price_lists
     WHERE tenant_id = $1 AND is_active = true
       AND valid_to IS NOT NULL
       AND valid_to >= CURRENT_DATE
       AND valid_to <= CURRENT_DATE + INTERVAL '7 days'`,
    [tenantId],
  );
  const plCount = Number(pl.rows[0]?.c || 0);
  if (plCount > 0) {
    items.push({
      id: `price_list_expiring:${bucket}`,
      kind: 'price_list_expiring',
      priority: 'high',
      title: 'Price list rules expiring',
      body: `${plCount} active rule${plCount === 1 ? '' : 's'} expire within 7 days${pl.rows[0]?.soonest ? ` (from ${String(pl.rows[0].soonest).slice(0, 10)})` : ''}.`,
      count: plCount,
      hrefTab: 'masters',
    });
  }

  // Quotes expiring in 3 days (Sent / Accepted)
  const q = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM quotations
     WHERE tenant_id = $1 AND status IN ('Sent','Accepted')
       AND valid_until IS NOT NULL
       AND valid_until >= CURRENT_DATE
       AND valid_until <= CURRENT_DATE + INTERVAL '3 days'`,
    [tenantId],
  );
  const qCount = Number(q.rows[0]?.c || 0);
  if (qCount > 0) {
    items.push({
      id: `quote_expiring:${bucket}`,
      kind: 'quote_expiring',
      priority: 'high',
      title: 'Quotations expiring soon',
      body: `${qCount} quote${qCount === 1 ? '' : 's'} expire within 3 days.`,
      count: qCount,
      hrefTab: 'quotations',
    });
  }

  if (!isService) {
    // Low stock
    const ls = await pool.query(
      `SELECT COUNT(*)::int AS c FROM (
         SELECT p.id,
           CASE WHEN COALESCE(inv.total, 0) > 0 THEN COALESCE(inv.in_stock, 0) ELSE COALESCE(p.stock, 0) END AS remaining
         FROM products p
         LEFT JOIN (
           SELECT product_id, COUNT(*) as total, COUNT(*) FILTER (WHERE status='InStock') as in_stock
           FROM product_inventory WHERE tenant_id = $1 GROUP BY product_id
         ) inv ON inv.product_id = p.id
         WHERE p.tenant_id = $1
       ) t WHERE remaining < 10`,
      [tenantId],
    );
    const lsCount = Number(ls.rows[0]?.c || 0);
    if (lsCount > 0) {
      items.push({
        id: `low_stock:${bucket}`,
        kind: 'low_stock',
        priority: 'high',
        title: 'Low stock',
        body: `${lsCount} product${lsCount === 1 ? '' : 's'} below threshold (10).`,
        count: lsCount,
        hrefTab: 'inventory',
      });
    }

    // Warranties expiring in 14 days
    const w = await pool.query(
      `SELECT COUNT(*)::int AS c FROM warranties
       WHERE tenant_id = $1 AND status = 'Active'
         AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'`,
      [tenantId],
    );
    const wCount = Number(w.rows[0]?.c || 0);
    if (wCount > 0) {
      items.push({
        id: `warranty_expiring:${bucket}`,
        kind: 'warranty_expiring',
        priority: 'medium',
        title: 'Warranties expiring',
        body: `${wCount} active warrant${wCount === 1 ? 'y' : 'ies'} expire within 14 days.`,
        count: wCount,
        hrefTab: 'warranty',
      });
    }

    // Outstanding overdue (>30 days aging) — simplified: unpaid batches older than 30 days
    const od = await pool.query(
      `WITH billed AS (
         SELECT pd.vendor_id,
           COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) AS total_billed
         FROM product_distribution pd
         JOIN products p ON p.id = pd.product_id AND p.tenant_id = pd.tenant_id
         WHERE pd.tenant_id = $1 AND pd.distribution_date < CURRENT_DATE - INTERVAL '30 days'
         GROUP BY pd.vendor_id
       ),
       paid AS (
         SELECT vendor_id, COALESCE(SUM(amount), 0) AS total_paid
         FROM vendor_payments WHERE tenant_id = $1 GROUP BY vendor_id
       )
       SELECT COALESCE(SUM(GREATEST(b.total_billed - COALESCE(p.total_paid, 0), 0)), 0) AS overdue
       FROM billed b
       LEFT JOIN paid p ON p.vendor_id = b.vendor_id`,
      [tenantId],
    );
    const overdue = Number(od.rows[0]?.overdue || 0);
    if (overdue > 0) {
      items.push({
        id: `outstanding_overdue:${bucket}`,
        kind: 'outstanding_overdue',
        priority: 'high',
        title: 'Overdue collections',
        body: `About ₹${Math.round(overdue).toLocaleString('en-IN')} linked to dispatches older than 30 days.`,
        count: 1,
        hrefTab: 'finance',
      });
    }
  } else {
    // Service: overdue unpaid invoices
    const inv = await pool.query(
      `SELECT COUNT(*)::int AS c,
              COALESCE(SUM(GREATEST(si.grand_total - COALESCE(pay.paid, 0), 0)), 0) AS bal
       FROM standalone_invoices si
       LEFT JOIN (
         SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments WHERE tenant_id = $1 GROUP BY invoice_id
       ) pay ON pay.invoice_id = si.id
       WHERE si.tenant_id = $1
         AND si.status IN ('sent','draft')
         AND si.due_date IS NOT NULL AND si.due_date < CURRENT_DATE
         AND si.grand_total > COALESCE(pay.paid, 0)`,
      [tenantId],
    );
    const invCount = Number(inv.rows[0]?.c || 0);
    const bal = Number(inv.rows[0]?.bal || 0);
    if (invCount > 0) {
      items.push({
        id: `outstanding_overdue:${bucket}`,
        kind: 'outstanding_overdue',
        priority: 'high',
        title: 'Overdue invoices',
        body: `${invCount} invoice${invCount === 1 ? '' : 's'} past due (≈ ₹${Math.round(bal).toLocaleString('en-IN')}).`,
        count: invCount,
        hrefTab: 'finance',
      });
    }
  }

  // Subscription / trial
  const t = (await pool.query('SELECT trial_ends_at, subscription_ends_at FROM tenants WHERE id = $1', [tenantId]))
    .rows[0] as { trial_ends_at?: string; subscription_ends_at?: string } | undefined;
  if (t) {
    const ends = t.subscription_ends_at || t.trial_ends_at;
    if (ends) {
      const endDate = new Date(ends);
      const days = Math.ceil((endDate.getTime() - Date.now()) / 86400000);
      if (days >= 0 && days <= 15) {
        const label = t.subscription_ends_at ? 'Subscription' : 'Trial';
        items.push({
          id: `subscription:${bucket}`,
          kind: 'subscription',
          priority: 'high',
          title: `${label} ending soon`,
          body: `${label} ends in ${days} day${days === 1 ? '' : 's'}.`,
          count: 1,
          hrefTab: 'settings',
        });
      }
    }
  }

  // Cap digests
  return items.slice(0, 6);
}

router.get('/api/notifications', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const tenant = (await pool.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0] as
      { business_type?: string } | undefined;
    const businessType = tenant?.business_type || 'manufacturer';

    // SA / control-panel messages: unread first, then recent read (7 days), unexpired
    const saRows = (
      await pool.query(
        `SELECT id, title, body, type, source, created_at, read_at
         FROM tenant_notifications
         WHERE tenant_id = $1
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (read_at IS NULL OR read_at > NOW() - INTERVAL '7 days')
         ORDER BY (read_at IS NULL) DESC, created_at DESC
         LIMIT 10`,
        [tenantId],
      )
    ).rows as Record<string, unknown>[];

    const adminItems: NotificationDigest[] = saRows.slice(0, 5).map(r => ({
      id: String(r.id),
      kind: 'admin_message',
      priority: 'high',
      title: String(r.title),
      body: String(r.body),
      source: String(r.source || 'super_admin'),
      type: String(r.type || 'info'),
      createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : undefined,
      read: !!r.read_at,
      hrefTab: undefined,
    }));

    // Vendors: only SA messages (no business digests that leak other vendors)
    const digests = vendorScopeId(req) ? [] : await buildDigests(tenantId, businessType);

    const items = [...adminItems, ...digests];
    const unreadCount = adminItems.filter(i => !i.read).length + digests.length; // digests unread tracked client-side; badge uses full digest count until dismissed locally — API reports unreadAdmin + digestCount separately

    res.json({
      items,
      generatedAt: new Date().toISOString(),
      unreadAdmin: adminItems.filter(i => !i.read).length,
      digestCount: digests.length,
      unreadCount, // server hint; client computes badge with local dismissals
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/notifications/:id/read', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query(
      `UPDATE tenant_notifications SET read_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND read_at IS NULL`,
      [req.params.id, tenantId],
    );
    if (result.rowCount === 0) {
      // Already read or not found — idempotent ok if exists
      const exists = await pool.query('SELECT id FROM tenant_notifications WHERE id = $1 AND tenant_id = $2', [
        req.params.id,
        tenantId,
      ]);
      if (exists.rowCount === 0) return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/notifications/read-all', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    await pool.query(
      `UPDATE tenant_notifications SET read_at = NOW()
       WHERE tenant_id = $1 AND read_at IS NULL`,
      [tenantId],
    );
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
