import { Router } from 'express';
import { pool } from '../pg-db';
import { AuthRequest } from '../middleware/auth';
import { getAccessLevel, type AccessLevel } from '../middleware/permissions';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { logAudit } from '../utils/helpers';

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

/** Digest kind → permission module that must be at least view. */
const KIND_MODULE: Record<string, string> = {
  price_list_expiring: 'inventory',
  quote_expiring: 'quotations',
  low_stock: 'inventory',
  warranty_expiring: 'warranty',
  outstanding_overdue: 'finance',
  // subscription: admin-ish — gated separately
};

function todayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

function canView(
  permissions: Record<string, AccessLevel> | undefined,
  role: string | undefined,
  module: string,
): boolean {
  return getAccessLevel(permissions, role, module) !== 'hidden';
}

function isVendorUser(req: AuthRequest): boolean {
  return req.user?.role === 'Vendor';
}

async function buildDigests(
  tenantId: string,
  businessType: string,
  permissions: Record<string, AccessLevel> | undefined,
  role: string | undefined,
): Promise<NotificationDigest[]> {
  const isService = businessType === 'service';
  const bucket = todayBucket();
  const items: NotificationDigest[] = [];

  const allow = (kind: string) => {
    const mod = KIND_MODULE[kind];
    if (!mod) return true;
    return canView(permissions, role, mod);
  };

  if (allow('price_list_expiring')) {
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
  }

  if (allow('quote_expiring')) {
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
  }

  if (!isService) {
    if (allow('low_stock')) {
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
    }

    if (allow('warranty_expiring')) {
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
    }

    if (allow('outstanding_overdue')) {
      // Vendors with positive balance whose oldest dispatch is > 30 days ago
      const od = await pool.query(
        `WITH bal AS (
           SELECT v.id,
             COALESCE((
               SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price))
               FROM product_distribution pd
               JOIN products p ON p.id = pd.product_id AND p.tenant_id = pd.tenant_id
               WHERE pd.tenant_id = $1 AND pd.vendor_id = v.id
             ), 0) AS billed,
             COALESCE((
               SELECT SUM(amount) FROM vendor_payments WHERE tenant_id = $1 AND vendor_id = v.id
             ), 0) AS paid,
             (
               SELECT MIN(pd.distribution_date)
               FROM product_distribution pd
               WHERE pd.tenant_id = $1 AND pd.vendor_id = v.id
             ) AS oldest
           FROM vendors v
           WHERE v.tenant_id = $1 AND v.id <> 'OWNER'
         )
         SELECT COUNT(*)::int AS c
         FROM bal
         WHERE billed > paid
           AND oldest IS NOT NULL
           AND oldest < CURRENT_DATE - INTERVAL '30 days'`,
        [tenantId],
      );
      const odCount = Number(od.rows[0]?.c || 0);
      if (odCount > 0) {
        items.push({
          id: `outstanding_overdue:${bucket}`,
          kind: 'outstanding_overdue',
          priority: 'high',
          title: 'Overdue collections',
          body: `${odCount} vendor${odCount === 1 ? '' : 's'} with outstanding balance and oldest dispatch over 30 days.`,
          count: odCount,
          hrefTab: 'finance',
        });
      }
    }
  } else if (allow('outstanding_overdue')) {
    // Service: overdue unpaid *sent* invoices only (not drafts)
    const inv = await pool.query(
      `SELECT COUNT(*)::int AS c,
              COALESCE(SUM(GREATEST(si.grand_total - COALESCE(pay.paid, 0), 0)), 0) AS bal
       FROM standalone_invoices si
       LEFT JOIN (
         SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments WHERE tenant_id = $1 GROUP BY invoice_id
       ) pay ON pay.invoice_id = si.id
       WHERE si.tenant_id = $1
         AND si.status = 'sent'
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

  // Subscription — Admin / Manager / anyone with settings access
  if (canView(permissions, role, 'settings') || ['Admin', 'Super Admin', 'Manager'].includes(role || '')) {
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
  }

  return items.slice(0, 6);
}

router.get('/api/notifications', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const tenant = (await pool.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0] as
      { business_type?: string } | undefined;
    const businessType = tenant?.business_type || 'manufacturer';
    const role = req.user?.role;
    const permissions = req.user?.permissions as Record<string, AccessLevel> | undefined;

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

    // Vendors (linked or not): only SA messages — never tenant-wide digests
    const digests = isVendorUser(req) ? [] : await buildDigests(tenantId, businessType, permissions, role);

    const items = [...adminItems, ...digests];

    res.json({
      items,
      generatedAt: new Date().toISOString(),
      unreadAdmin: adminItems.filter(i => !i.read).length,
      digestCount: digests.length,
      unreadCount: adminItems.filter(i => !i.read).length + digests.length,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/notifications/:id/read', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const notifId = req.params.id as string;
    const result = await pool.query(
      `UPDATE tenant_notifications SET read_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND read_at IS NULL`,
      [notifId, tenantId],
    );
    if (result.rowCount === 0) {
      const exists = await pool.query('SELECT id FROM tenant_notifications WHERE id = $1 AND tenant_id = $2', [
        notifId,
        tenantId,
      ]);
      if (exists.rowCount === 0) return res.status(404).json({ error: 'Notification not found' });
    } else {
      logger.info('Notification marked read', {
        tenantId,
        notifId,
        userId: req.user?.userId,
      });
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
    const result = await pool.query(
      `UPDATE tenant_notifications SET read_at = NOW()
       WHERE tenant_id = $1 AND read_at IS NULL`,
      [tenantId],
    );
    const marked = result.rowCount ?? 0;
    if (marked > 0) {
      await logAudit(
        pool,
        tenantId,
        'UPDATE',
        'notification',
        undefined,
        `Marked ${marked} notification(s) read`,
        req.user?.userId,
        req.user?.name,
      );
      logger.info('Notifications read-all', { tenantId, marked, userId: req.user?.userId });
    }
    res.json({ ok: true, marked });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
