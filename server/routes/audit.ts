import { Router } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { parsePagination, applyDateFilter, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/audit-log', requireAdmin, async (req: AuthRequest, res) => {
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

router.get('/api/backup', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const tables = ['products', 'product_inventory', 'product_distribution', 'product_sales', 'product_purchases',
      'vendors', 'vendor_payments', 'customers', 'warranties', 'rewards', 'reward_rules',
      'quotations', 'orders', 'credit_debit_notes', 'price_lists', 'categories',
      'suppliers', 'supplier_payments', 'banks', 'bill_settings', 'staff_members', 'staff_payments', 'audit_log'];

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

    await pool.query('UPDATE tenants SET backup_last_at = NOW() WHERE id = $1', [tenantId]);
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


// Permitted backup columns per table — prevents SQL injection via attacker-controlled column names
const BACKUP_COLUMN_ALLOWLIST: Record<string, Set<string>> = {
  products:             new Set(['id','name','barcode','description','reward_points_value','manufacturing_date','batch_number','status','warranty_months','price','stock','tenant_id','pack_size','pack_name','hsn_code','gst_rate','price_includes_gst','warranty_applicable','created_at']),
  product_inventory:    new Set(['id','product_id','barcode','batch_id','status','tenant_id','unit_type','created_at']),
  product_sales:        new Set(['id','product_id','barcode','vendor_id','customer_name','customer_phone','customer_email','sale_price','purchase_date','warranty_months','tenant_id','reward_points_earned','created_at']),
  product_distribution: new Set(['id','batch_id','product_id','barcode','vendor_id','distribution_date','status','discount_percent','net_price','gst_applied','billed_price','tenant_id','created_at']),
  product_purchases:    new Set(['id','tenant_id','batch_id','product_id','supplier_id','purchase_date','cost_price','gst_applied','billed_price','discount_percent','invoice_number','created_at']),
  vendors:              new Set(['id','name','contact_person','phone','email','address','total_sales','total_reward_points','tenant_id','created_at']),
  customers:            new Set(['id','name','phone','email','address','vendor_id','tenant_id','created_at']),
  categories:           new Set(['id','name','tenant_id']),
  warranties:           new Set(['id','product_id','barcode','customer_name','customer_phone','purchase_date','expiry_date','status','tenant_id','created_at']),
  vendor_payments:      new Set(['id','vendor_id','amount','payment_date','payment_method','reference_number','notes','tenant_id','batch_id','created_at']),
  expenses:             new Set(['id','category','amount','expense_date','description','vendor_id','tenant_id','created_at']),
  banks:                new Set(['id','name','account_number','ifsc','branch','tenant_id','created_at']),
  suppliers:            new Set(['id','name','contact_person','phone','email','address','gst_number','tenant_id','created_at']),
  standalone_invoices:  new Set(['id','invoice_number','invoice_date','customer_name','customer_phone','customer_email','customer_address','status','grand_total','notes','tenant_id','created_at']),
  quotations:           new Set(['id','quote_number','vendor_id','quote_date','status','total_amount','notes','tenant_id','created_at']),
};

router.post('/api/backup/restore', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const data = req.body;
    if (!data || !data._meta) return res.status(400).json({ error: 'Invalid backup file — missing _meta header' });
    if (data._meta.version !== '1.0') return res.status(400).json({ error: `Unsupported backup version: ${data._meta.version}` });

    // H3: only clear/restore tables that have a column allowlist — never wipe
    // tables we cannot reinsert (staff_members, audit_log, rewards, etc.).
    const restoreTables = Object.keys(BACKUP_COLUMN_ALLOWLIST);
    const clearOrder = [
      'vendor_payments', 'product_sales', 'product_distribution', 'product_inventory',
      'product_purchases', 'warranties', 'quotations', 'standalone_invoices', 'expenses',
      'customers', 'banks', 'suppliers', 'vendors', 'categories', 'products',
    ].filter((t) => BACKUP_COLUMN_ALLOWLIST[t]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const table of clearOrder) {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      }

      let restored = 0;
      for (const table of restoreTables) {
        const rows = data[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        for (const row of rows) {
          row.tenant_id = tenantId;
          const allowed = BACKUP_COLUMN_ALLOWLIST[table];
          if (!allowed) continue;
          const cols = Object.keys(row).filter(k => allowed.has(k));
          if (cols.length === 0) continue;
          const vals = cols.map((_, i) => `$${i + 1}`);
          const onConflict = cols.includes('id') ? `ON CONFLICT (id, tenant_id) DO NOTHING` : 'ON CONFLICT DO NOTHING';
          try {
            await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')}) ${onConflict}`, cols.map(k => row[k]));
            restored++;
          } catch {
            // skip rows that fail (schema mismatch, etc)
          }
        }
      }

      await client.query('COMMIT');
      await logAudit(pool, tenantId, 'Database Restored', 'system', undefined, `Restored ${restored} records from backup (${data._meta.exportedAt})`);
      res.json({ ok: true, restored, source: { exportedAt: data._meta.exportedAt, companyName: data._meta.companyName } });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/backup/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const row = (await pool.query('SELECT backup_enabled, backup_frequency, backup_interval_days, backup_last_at, backup_email FROM tenants WHERE id = $1', [tenantId])).rows[0] as Record<string, unknown> | undefined;
    res.json({
      enabled: row?.backup_enabled ?? false,
      frequency: (row?.backup_frequency as string) || 'weekly',
      intervalDays: Number(row?.backup_interval_days) || 7,
      lastBackupAt: row?.backup_last_at || null,
      email: (row?.backup_email as string) || null,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/backup/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { enabled, frequency, intervalDays, email } = req.body;
    const freq = ['daily', 'weekly', 'monthly', 'custom'].includes(frequency) ? frequency : 'weekly';
    const days = freq === 'daily' ? 1 : freq === 'weekly' ? 7 : freq === 'monthly' ? 30 : Math.max(1, parseInt(String(intervalDays), 10) || 7);
    await pool.query(
      'UPDATE tenants SET backup_enabled = $1, backup_frequency = $2, backup_interval_days = $3, backup_email = $4 WHERE id = $5',
      [!!enabled, freq, days, email || null, tenantId]
    );
    await logAudit(pool, tenantId, 'Backup Settings Updated', 'system', undefined, `${enabled ? 'Enabled' : 'Disabled'} — ${freq} (every ${days} days)`);
    res.json({ ok: true, enabled: !!enabled, frequency: freq, intervalDays: days, email: email || null });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
