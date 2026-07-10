import { Router } from 'express';
import { pool } from '../pg-db';
import { parsePagination, applyDateFilter, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/audit-log', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const params: unknown[] = [tenantId];
    let paramIndex = 2;
    let where = 'WHERE tenant_id = $1';

    // Apply date filter - need to convert ? placeholders to $N
    const queryObj = req.query as Record<string, unknown>;
    const { dateFrom, dateTo, dateRange } = queryObj;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dateRange === 'today') {
      where += ` AND created_at = $${paramIndex++}`;
      params.push(todayStr);
    } else if (dateRange === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 7);
      where += ` AND created_at >= $${paramIndex++}`;
      params.push(d.toISOString().slice(0, 10));
    } else if (dateRange === 'month') {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      where += ` AND created_at >= $${paramIndex++}`;
      params.push(d.toISOString().slice(0, 10));
    } else {
      if (typeof dateFrom === 'string' && dateFrom) { where += ` AND created_at >= $${paramIndex++}`; params.push(dateFrom); }
      if (typeof dateTo === 'string' && dateTo) { where += ` AND created_at <= $${paramIndex++}`; params.push(dateTo); }
    }

    const { entityType } = req.query;
    if (typeof entityType === 'string' && entityType) { where += ` AND entity_type = $${paramIndex++}`; params.push(entityType); }

    const total = ((await pool.query(`SELECT COUNT(*) as c FROM audit_log ${where}`, params)).rows[0] as { c: number }).c;

    const dataParams = [...params, limit, offset];
    const rows = (await pool.query(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`, dataParams)).rows as Record<string, unknown>[];

    res.json({
      data: rows.map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, action: r.action, entityType: r.entity_type, entityId: r.entity_id, details: r.details, createdAt: r.created_at })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/backup', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const tables = ['products', 'product_inventory', 'product_distribution', 'product_sales', 'product_purchases',
      'vendors', 'vendor_payments', 'customers', 'warranties', 'rewards', 'reward_rules',
      'quotations', 'orders', 'credit_debit_notes', 'price_lists', 'categories',
      'suppliers', 'supplier_payments', 'banks', 'bill_settings', 'audit_log'];

    const backup: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    await Promise.all(tables.map(async (table) => {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]);
        backup[table] = rows;
        counts[table] = rows.length;
      } catch {
        backup[table] = [];
        counts[table] = 0;
      }
    }));

    const tenant = (await pool.query('SELECT company_name, slug, admin_email FROM tenants WHERE id = $1', [tenantId])).rows[0] as Record<string, unknown> | undefined;
    const users = (await pool.query('SELECT id, email, name, role, phone, address FROM users WHERE tenant_id = $1', [tenantId])).rows;

    const data = {
      _meta: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        tenantId,
        companyName: tenant?.company_name || '',
        slug: tenant?.slug || '',
        adminEmail: tenant?.admin_email || '',
        tableCounts: counts,
        totalRecords: Object.values(counts).reduce((s, c) => s + c, 0),
      },
      users,
      ...backup,
    };

    await logAudit(pool, tenantId, 'Database Backup', 'system', undefined, `Exported ${data._meta.totalRecords} records across ${tables.length} tables`);

    const json = JSON.stringify(data, null, 2);
    const filename = `backup-${(tenant?.slug || tenantId)}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
