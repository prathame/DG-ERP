import { Router } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { pool, setTenantContext } from '../pg-db';
import { parsePagination, applyDateFilter, logAudit, uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';
import { decryptSecret } from '../utils/secret-crypto';

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
      const d = new Date();
      d.setDate(d.getDate() - 7);
      where += ` AND created_at >= $${paramIndex++}`;
      params.push(d.toISOString().slice(0, 10));
    } else if (dateRange === 'month') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      where += ` AND created_at >= $${paramIndex++}`;
      params.push(d.toISOString().slice(0, 10));
    } else {
      if (typeof dateFrom === 'string' && dateFrom) {
        where += ` AND created_at >= $${paramIndex++}`;
        params.push(dateFrom);
      }
      if (typeof dateTo === 'string' && dateTo) {
        where += ` AND created_at <= $${paramIndex++}`;
        params.push(dateTo);
      }
    }

    const { entityType } = req.query;
    if (typeof entityType === 'string' && entityType) {
      where += ` AND entity_type = $${paramIndex++}`;
      params.push(entityType);
    }

    const total = ((await pool.query(`SELECT COUNT(*) as c FROM audit_log ${where}`, params)).rows[0] as { c: number })
      .c;

    const dataParams = [...params, limit, offset];
    const rows = (
      await pool.query(
        `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        dataParams,
      )
    ).rows as Record<string, unknown>[];

    res.json({
      data: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: r.details,
        createdAt: r.created_at,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/backup', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const tables = Object.keys(BACKUP_COLUMN_ALLOWLIST);

    const backup: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    await Promise.all(
      tables.map(async table => {
        try {
          const cols = [...BACKUP_COLUMN_ALLOWLIST[table]].join(', ');
          const { rows } = await pool.query(`SELECT ${cols} FROM ${table} WHERE tenant_id = $1`, [tenantId]);
          backup[table] = rows;
          counts[table] = rows.length;
        } catch (err) {
          logger.warn('Backup table export skipped', {
            table,
            tenantId,
            error: err instanceof Error ? err.message : String(err),
          });
          backup[table] = [];
          counts[table] = 0;
        }
      }),
    );

    const tenant = (await pool.query('SELECT company_name, slug, admin_email FROM tenants WHERE id = $1', [tenantId]))
      .rows[0] as Record<string, unknown> | undefined;
    const users = (
      await pool.query('SELECT id, email, name, role, phone, address FROM users WHERE tenant_id = $1', [tenantId])
    ).rows;

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
    await logAudit(
      pool,
      tenantId,
      'Database Backup',
      'system',
      undefined,
      `Exported ${data._meta.totalRecords} records across ${tables.length} tables`,
    );

    const json = JSON.stringify(data, null, 2);
    const filename = `backup-${tenant?.slug || tenantId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Permitted backup columns per table — prevents SQL injection via attacker-controlled column names
const BACKUP_COLUMN_ALLOWLIST: Record<string, Set<string>> = {
  products: new Set([
    'id',
    'name',
    'barcode',
    'description',
    'reward_points_value',
    'manufacturing_date',
    'batch_number',
    'status',
    'warranty_months',
    'price',
    'stock',
    'tenant_id',
    'pack_size',
    'pack_name',
    'hsn_code',
    'gst_rate',
    'price_includes_gst',
    'warranty_applicable',
    'created_at',
  ]),
  product_inventory: new Set([
    'id',
    'product_id',
    'barcode',
    'batch_id',
    'status',
    'tenant_id',
    'unit_type',
    'created_at',
  ]),
  product_sales: new Set([
    'id',
    'product_id',
    'barcode',
    'vendor_id',
    'customer_name',
    'customer_phone',
    'customer_email',
    'sale_price',
    'purchase_date',
    'tenant_id',
    'reward_points_earned',
    'created_at',
  ]),
  product_distribution: new Set([
    'id',
    'batch_id',
    'product_id',
    'barcode',
    'vendor_id',
    'distribution_date',
    'status',
    'discount_percent',
    'net_price',
    'gst_applied',
    'billed_price',
    'tenant_id',
    'created_at',
  ]),
  product_purchases: new Set([
    'id',
    'tenant_id',
    'batch_id',
    'product_id',
    'supplier_id',
    'purchase_date',
    'cost_price',
    'gst_applied',
    'billed_price',
    'discount_percent',
    'invoice_number',
    'created_at',
  ]),
  product_replacements: new Set([
    'id',
    'tenant_id',
    'old_barcode',
    'new_barcode',
    'warranty_id',
    'product_id',
    'product_name',
    'customer_name',
    'customer_phone',
    'replaced_date',
    'reason',
    'vendor_id',
    'created_at',
  ]),
  vendors: new Set([
    'id',
    'name',
    'contact_person',
    'phone',
    'email',
    'address',
    'total_sales',
    'total_reward_points',
    'tenant_id',
    'created_at',
  ]),
  vendor_payments: new Set([
    'id',
    'vendor_id',
    'amount',
    'payment_date',
    'payment_method',
    'reference_number',
    'notes',
    'tenant_id',
    'batch_id',
    'created_at',
  ]),
  vendor_reminder_settings: new Set([
    'vendor_id',
    'tenant_id',
    'enabled',
    'reminder_days',
    'last_reminder_date',
    'created_at',
  ]),
  customers: new Set(['id', 'name', 'phone', 'email', 'address', 'vendor_id', 'tenant_id', 'created_at']),
  categories: new Set(['id', 'name', 'tenant_id']),
  warranties: new Set([
    'id',
    'product_id',
    'barcode',
    'customer_name',
    'customer_phone',
    'activation_date',
    'expiry_date',
    'status',
    'tenant_id',
    'created_at',
  ]),
  rewards: new Set([
    'id',
    'tenant_id',
    'user_id',
    'points',
    'type',
    'description',
    'date',
    'vendor_id',
    'sale_id',
    'created_at',
  ]),
  reward_rules: new Set([
    'id',
    'tenant_id',
    'category_id',
    'products_sold_threshold',
    'reward_points',
    'description',
    'created_at',
  ]),
  redemption_settings: new Set(['id', 'tenant_id', 'min_balance', 'min_points']),
  banks: new Set(['id', 'name', 'account_number', 'ifsc_code', 'branch', 'tenant_id', 'created_at']),
  suppliers: new Set([
    'id',
    'name',
    'contact_person',
    'phone',
    'email',
    'address',
    'gst_number',
    'tenant_id',
    'created_at',
  ]),
  supplier_payments: new Set([
    'id',
    'tenant_id',
    'supplier_id',
    'amount',
    'payment_date',
    'payment_method',
    'reference_number',
    'notes',
    'batch_id',
    'created_at',
  ]),
  expenses: new Set([
    'id',
    'category',
    'amount',
    'expense_date',
    'description',
    'payment_method',
    'reference_number',
    'notes',
    'tenant_id',
    'created_at',
  ]),
  staff_members: new Set([
    'id',
    'tenant_id',
    'name',
    'phone',
    'role',
    'address',
    'salary',
    'joining_date',
    'status',
    'created_at',
  ]),
  staff_payments: new Set([
    'id',
    'tenant_id',
    'staff_name',
    'amount',
    'payment_date',
    'payment_type',
    'payment_method',
    'reference_number',
    'notes',
    'month',
    'year',
    'created_at',
  ]),
  standalone_invoices: new Set([
    'id',
    'tenant_id',
    'invoice_number',
    'invoice_date',
    'due_date',
    'status',
    'customer_name',
    'customer_phone',
    'customer_address',
    'customer_gstin',
    'party_type',
    'party_id',
    'items',
    'subtotal',
    'tax_total',
    'grand_total',
    'notes',
    'terms',
    'created_at',
    'updated_at',
  ]),
  invoice_payments: new Set([
    'id',
    'tenant_id',
    'invoice_id',
    'amount',
    'payment_date',
    'payment_method',
    'reference_number',
    'notes',
    'created_at',
  ]),
  quotations: new Set([
    'id',
    'quotation_number',
    'vendor_id',
    'quotation_date',
    'status',
    'total',
    'notes',
    'tenant_id',
    'created_at',
  ]),
  orders: new Set([
    'id',
    'tenant_id',
    'order_number',
    'vendor_id',
    'vendor_name',
    'customer_name',
    'customer_phone',
    'customer_gst_number',
    'order_date',
    'required_date',
    'status',
    'items',
    'subtotal',
    'gst_rate',
    'gst_amount',
    'total',
    'notes',
    'fulfilled_batch_id',
    'created_at',
  ]),
  credit_debit_notes: new Set([
    'id',
    'tenant_id',
    'note_number',
    'note_type',
    'vendor_id',
    'vendor_name',
    'customer_name',
    'note_date',
    'reason',
    'items',
    'subtotal',
    'gst_rate',
    'gst_amount',
    'total',
    'reference_invoice',
    'reference_type',
    'status',
    'created_at',
  ]),
  price_lists: new Set([
    'id',
    'tenant_id',
    'name',
    'product_id',
    'vendor_id',
    'min_qty',
    'max_qty',
    'price',
    'is_active',
    'valid_from',
    'valid_to',
    'created_at',
  ]),
  bill_settings: new Set([
    'tenant_id',
    'primary_color',
    'tagline',
    'invoice_prefix',
    'challan_prefix',
    'bank_account_name',
    'bank_account_number',
    'bank_name',
    'bank_branch',
    'bank_ifsc',
    'bank_upi_id',
    'terms_and_conditions',
    'signatory_name',
    'signatory_designation',
    'show_rewards',
    'show_barcode',
    'show_warranty',
    'show_hsn_sac',
    'footer_text',
    'invoice_template_style',
  ]),
  barcode_label_templates: new Set([
    'id',
    'tenant_id',
    'name',
    'description',
    'width_mm',
    'height_mm',
    'orientation',
    'status',
    'is_default',
    'version',
    'elements',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ]),
};

router.post('/api/backup/restore', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const data = req.body;
    if (!data || !data._meta) return res.status(400).json({ error: 'Invalid backup file — missing _meta header' });
    if (data._meta.version !== '1.0')
      return res.status(400).json({ error: `Unsupported backup version: ${data._meta.version}` });

    // Tenant safety: backup must belong to the authenticated tenant.
    // Restoring another tenant's backup would overwrite this tenant's data with foreign records.
    if (!data._meta.tenantId || data._meta.tenantId !== tenantId) {
      return res.status(400).json({
        error: 'Backup belongs to a different tenant and cannot be restored.',
      });
    }

    const restoreTables = Object.keys(BACKUP_COLUMN_ALLOWLIST);
    // FK-safe delete order: children before parents
    const clearOrder = [
      'invoice_payments',
      'vendor_payments',
      'supplier_payments',
      'staff_payments',
      'product_replacements',
      'product_sales',
      'rewards',
      'product_distribution',
      'product_inventory',
      'product_purchases',
      'warranties',
      'quotations',
      'orders',
      'standalone_invoices',
      'credit_debit_notes',
      'price_lists',
      'expenses',
      'reward_rules',
      'redemption_settings',
      'vendor_reminder_settings',
      'barcode_label_templates',
      'bill_settings',
      'customers',
      'banks',
      'staff_members',
      'suppliers',
      'vendors',
      'categories',
      'products',
    ].filter(t => BACKUP_COLUMN_ALLOWLIST[t]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await setTenantContext(client, tenantId);

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
          // bill_settings PK is tenant_id; vendor_reminder_settings PK is (vendor_id, tenant_id)
          const onConflict =
            table === 'bill_settings'
              ? 'ON CONFLICT (tenant_id) DO NOTHING'
              : table === 'vendor_reminder_settings'
                ? 'ON CONFLICT (vendor_id, tenant_id) DO NOTHING'
                : cols.includes('id')
                  ? 'ON CONFLICT (id, tenant_id) DO NOTHING'
                  : 'ON CONFLICT DO NOTHING';
          try {
            await client.query(
              `INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')}) ${onConflict}`,
              cols.map(k => row[k]),
            );
            restored++;
          } catch (rowErr) {
            logger.warn('Backup restore row skipped', {
              table,
              tenantId,
              error: rowErr instanceof Error ? rowErr.message : String(rowErr),
            });
          }
        }
      }

      await client.query('COMMIT');
      await logAudit(
        pool,
        tenantId,
        'Database Restored',
        'system',
        undefined,
        `Restored ${restored} records from backup (${data._meta.exportedAt})`,
      );
      res.json({
        ok: true,
        restored,
        source: { exportedAt: data._meta.exportedAt, companyName: data._meta.companyName },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/backup/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const row = (
      await pool.query(
        'SELECT backup_enabled, backup_frequency, backup_interval_days, backup_last_at, backup_email FROM tenants WHERE id = $1',
        [tenantId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    res.json({
      enabled: row?.backup_enabled ?? false,
      frequency: (row?.backup_frequency as string) || 'weekly',
      intervalDays: Number(row?.backup_interval_days) || 7,
      lastBackupAt: row?.backup_last_at || null,
      email: (row?.backup_email as string) || null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/backup/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { enabled, frequency, intervalDays, email } = req.body;
    const freq = ['daily', 'weekly', 'monthly', 'custom'].includes(frequency) ? frequency : 'weekly';
    const days =
      freq === 'daily'
        ? 1
        : freq === 'weekly'
          ? 7
          : freq === 'monthly'
            ? 30
            : Math.max(1, parseInt(String(intervalDays), 10) || 7);
    await pool.query(
      'UPDATE tenants SET backup_enabled = $1, backup_frequency = $2, backup_interval_days = $3, backup_email = $4 WHERE id = $5',
      [!!enabled, freq, days, email || null, tenantId],
    );
    await logAudit(
      pool,
      tenantId,
      'Backup Settings Updated',
      'system',
      undefined,
      `${enabled ? 'Enabled' : 'Disabled'} — ${freq} (every ${days} days)`,
    );
    res.json({ ok: true, enabled: !!enabled, frequency: freq, intervalDays: days, email: email || null });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Tally XML export ──────────────────────────────────────────────────────────
router.get('/api/backup/tally', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const tenant = (await pool.query('SELECT company_name, slug, admin_email FROM tenants WHERE id = $1', [tenantId]))
      .rows[0] as Record<string, unknown> | undefined;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const esc = (s: unknown) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const fmtDate = (d: unknown) => {
      if (!d) return '';
      const dt = new Date(String(d));
      if (isNaN(dt.getTime())) return String(d);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    };

    const [sales, purchases, expenses, vendors, suppliers, customers, invoices, payments] = await Promise.all([
      pool.query('SELECT * FROM product_sales WHERE tenant_id = $1 ORDER BY purchase_date', [tenantId]),
      pool.query('SELECT * FROM product_purchases WHERE tenant_id = $1 ORDER BY purchase_date', [tenantId]),
      pool.query('SELECT * FROM expenses WHERE tenant_id = $1 ORDER BY expense_date', [tenantId]),
      pool.query('SELECT id, name FROM vendors WHERE tenant_id = $1', [tenantId]),
      pool.query('SELECT id, name FROM suppliers WHERE tenant_id = $1', [tenantId]),
      pool.query('SELECT id, name FROM customers WHERE tenant_id = $1', [tenantId]),
      pool.query('SELECT * FROM standalone_invoices WHERE tenant_id = $1 ORDER BY invoice_date', [tenantId]),
      pool.query('SELECT * FROM vendor_payments WHERE tenant_id = $1 ORDER BY payment_date', [tenantId]),
    ]);

    const vendorMap = Object.fromEntries(vendors.rows.map((v: Record<string, string>) => [v.id, v.name]));
    const supplierMap = Object.fromEntries(suppliers.rows.map((s: Record<string, string>) => [s.id, s.name]));
    const customerMap = Object.fromEntries(customers.rows.map((c: Record<string, string>) => [c.id, c.name]));

    const companyName = esc(tenant.company_name);
    const lines: string[] = [];

    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<ENVELOPE>`);
    lines.push(`<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>`);
    lines.push(`<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>`);
    lines.push(`<STATICVARIABLES><SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY></STATICVARIABLES>`);
    lines.push(`</REQUESTDESC><REQUESTDATA>`);

    for (const row of sales.rows as Record<string, unknown>[]) {
      const party = esc(row.customer_name || vendorMap[row.vendor_id as string] || 'Cash');
      lines.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">`);
      lines.push(`<VOUCHER VCHTYPE="Sales" ACTION="Create">`);
      lines.push(`<DATE>${fmtDate(row.purchase_date)}</DATE>`);
      lines.push(`<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>`);
      lines.push(`<VOUCHERNUMBER>${esc(row.id)}</VOUCHERNUMBER>`);
      lines.push(`<PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>`);
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${party}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${Number(row.sale_price || 0).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${Number(row.sale_price || 0).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(`</VOUCHER></TALLYMESSAGE>`);
    }

    for (const row of purchases.rows as Record<string, unknown>[]) {
      const party = esc(supplierMap[row.supplier_id as string] || 'Cash');
      const amt = Number(row.billed_price || row.cost_price || 0).toFixed(2);
      lines.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">`);
      lines.push(`<VOUCHER VCHTYPE="Purchase" ACTION="Create">`);
      lines.push(`<DATE>${fmtDate(row.purchase_date)}</DATE>`);
      lines.push(`<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>`);
      lines.push(`<VOUCHERNUMBER>${esc(row.invoice_number || row.id)}</VOUCHERNUMBER>`);
      lines.push(`<PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>`);
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${party}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Purchase</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(`</VOUCHER></TALLYMESSAGE>`);
    }

    for (const row of expenses.rows as Record<string, unknown>[]) {
      const amt = Number(row.amount || 0).toFixed(2);
      lines.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">`);
      lines.push(`<VOUCHER VCHTYPE="Payment" ACTION="Create">`);
      lines.push(`<DATE>${fmtDate(row.expense_date)}</DATE>`);
      lines.push(`<VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>`);
      lines.push(`<NARRATION>${esc(row.description || row.category)}</NARRATION>`);
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(row.category || 'Expenses')}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(`</VOUCHER></TALLYMESSAGE>`);
    }

    for (const row of invoices.rows as Record<string, unknown>[]) {
      const party = esc(row.customer_name || 'Cash');
      const amt = Number(row.grand_total || 0).toFixed(2);
      lines.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">`);
      lines.push(`<VOUCHER VCHTYPE="Sales" ACTION="Create">`);
      lines.push(`<DATE>${fmtDate(row.invoice_date)}</DATE>`);
      lines.push(`<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>`);
      lines.push(`<VOUCHERNUMBER>${esc(row.invoice_number)}</VOUCHERNUMBER>`);
      lines.push(`<PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>`);
      lines.push(`<NARRATION>${esc(row.notes)}</NARRATION>`);
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${party}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(`</VOUCHER></TALLYMESSAGE>`);
    }

    for (const row of payments.rows as Record<string, unknown>[]) {
      const party = esc(vendorMap[row.vendor_id as string] || 'Vendor');
      const amt = Number(row.amount || 0).toFixed(2);
      lines.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">`);
      lines.push(`<VOUCHER VCHTYPE="Payment" ACTION="Create">`);
      lines.push(`<DATE>${fmtDate(row.payment_date)}</DATE>`);
      lines.push(`<VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>`);
      lines.push(`<NARRATION>${esc(row.notes || row.reference_number)}</NARRATION>`);
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${party}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      );
      lines.push(`</VOUCHER></TALLYMESSAGE>`);
    }

    lines.push(`</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`);

    const xml = lines.join('\n');
    const filename = `tally-${tenant.slug || tenantId}-${new Date().toISOString().slice(0, 10)}.xml`;
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Miracle DBF export ───────────────────────────────────────────────────────
router.get('/api/backup/miracle', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const tenant = (await pool.query('SELECT slug FROM tenants WHERE id = $1', [tenantId])).rows[0] as
      Record<string, unknown> | undefined;

    const { buildMiracleExportZip } = await import('../services/miracleExport');
    const zipBuf = await buildMiracleExportZip(pool, tenantId);

    const filename = `miracle-${tenant?.slug || tenantId}-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(zipBuf);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Company payment-reminder policy for Distribution / Vendor Finance (non-service).
 * GET is readable by any authenticated tenant user (needed to filter Remind CTAs);
 * PUT remains admin-only. */
router.get('/api/settings/reminders', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const row = (
      await pool.query(
        'SELECT reminders_enabled, reminder_cadence_days, reminder_min_due_amount, business_type FROM tenants WHERE id = $1',
        [tenantId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    if (row.business_type === 'service') {
      return res.status(403).json({ error: 'Payment reminders apply to distribution businesses only' });
    }
    const cadenceDays = Math.max(1, parseInt(String(row.reminder_cadence_days ?? 15), 10) || 15);
    const minDueAmount = Math.max(0, Number(row.reminder_min_due_amount) || 0);
    res.json({
      enabled: row.reminders_enabled !== false,
      cadenceDays,
      minDueAmount,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/settings/reminders', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const biz = (await pool.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0] as
      { business_type?: string } | undefined;
    if (!biz) return res.status(404).json({ error: 'Tenant not found' });
    if (biz.business_type === 'service') {
      return res.status(403).json({ error: 'Payment reminders apply to distribution businesses only' });
    }
    const { enabled, cadenceDays, minDueAmount } = req.body as {
      enabled?: boolean;
      cadenceDays?: number;
      minDueAmount?: number;
    };
    const days = Math.max(1, Math.min(365, parseInt(String(cadenceDays ?? 15), 10) || 15));
    const minDue = Math.max(0, Number(minDueAmount) || 0);
    if (!Number.isFinite(minDue)) return res.status(400).json({ error: 'Invalid minimum due amount' });
    await pool.query(
      `UPDATE tenants SET reminders_enabled = $1, reminder_cadence_days = $2, reminder_min_due_amount = $3
       WHERE id = $4`,
      [enabled !== false, days, minDue, tenantId],
    );
    await logAudit(
      pool,
      tenantId,
      'Payment Reminder Settings Updated',
      'system',
      undefined,
      `${enabled !== false ? 'Enabled' : 'Disabled'} — every ${days} days, min due ₹${minDue}`,
    );
    res.json({ ok: true, enabled: enabled !== false, cadenceDays: days, minDueAmount: minDue });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Shared backup generator ───────────────────────────────────────────────────

export async function generateBackupJson(
  tenantId: string,
): Promise<{ json: string; filename: string; totalRecords: number }> {
  const tables = Object.keys(BACKUP_COLUMN_ALLOWLIST);
  const backup: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  await Promise.all(
    tables.map(async table => {
      try {
        const cols = [...BACKUP_COLUMN_ALLOWLIST[table]].join(', ');
        const { rows } = await pool.query(`SELECT ${cols} FROM ${table} WHERE tenant_id = $1`, [tenantId]);
        backup[table] = rows;
        counts[table] = rows.length;
      } catch {
        backup[table] = [];
        counts[table] = 0;
      }
    }),
  );
  const tenant = (await pool.query('SELECT company_name, slug, admin_email FROM tenants WHERE id = $1', [tenantId]))
    .rows[0] as Record<string, unknown> | undefined;
  const users = (
    await pool.query('SELECT id, email, name, role, phone, address FROM users WHERE tenant_id = $1', [tenantId])
  ).rows;
  const totalRecords = Object.values(counts).reduce((s, c) => s + c, 0);
  const data = {
    _meta: {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tenantId,
      companyName: tenant?.company_name || '',
      slug: tenant?.slug || '',
      adminEmail: tenant?.admin_email || '',
      tableCounts: counts,
      totalRecords,
    },
    users,
    ...backup,
  };
  const filename = `backup-${tenant?.slug || tenantId}-${new Date().toISOString().slice(0, 10)}.json`;
  return { json: JSON.stringify(data, null, 2), filename, totalRecords };
}

// ── Email backup (manual + scheduled) ────────────────────────────────────────

/** Send backup JSON as email attachment using tenant's configured SMTP. */
export async function sendBackupEmail(tenantId: string, toEmail: string): Promise<void> {
  const emailRow = (await pool.query('SELECT * FROM email_settings WHERE tenant_id = $1', [tenantId])).rows[0] as
    Record<string, unknown> | undefined;
  if (!emailRow?.smtp_user || !emailRow?.smtp_password)
    throw new Error('Email SMTP not configured. Go to Settings → Communication → Email first.');
  const password = decryptSecret(emailRow.smtp_password as string);
  const transporter = nodemailer.createTransport({
    host: (emailRow.smtp_host as string) || 'smtp.gmail.com',
    port: Number(emailRow.smtp_port) || 587,
    secure: emailRow.use_ssl === true,
    auth: { user: emailRow.smtp_user as string, pass: password },
  });
  const tenant = (await pool.query('SELECT company_name FROM tenants WHERE id = $1', [tenantId])).rows[0] as
    { company_name?: string } | undefined;
  const { json, filename, totalRecords } = await generateBackupJson(tenantId);
  await transporter.sendMail({
    from: emailRow.from_name
      ? `"${emailRow.from_name}" <${emailRow.from_email}>`
      : String(emailRow.from_email || emailRow.smtp_user),
    to: toEmail,
    subject: `Dhandho Backup — ${tenant?.company_name || tenantId} — ${new Date().toLocaleDateString('en-IN')}`,
    text: `Please find your Dhandho data backup attached.\n\nRecords: ${totalRecords}\nDate: ${new Date().toLocaleString('en-IN')}\n\nKeep this file safe — it can be used to restore your data.`,
    attachments: [{ filename, content: Buffer.from(json, 'utf-8'), contentType: 'application/json' }],
  });
  await pool.query('UPDATE tenants SET backup_last_at = NOW() WHERE id = $1', [tenantId]);
  logger.info('Backup emailed', { tenantId, toEmail, records: totalRecords });
}

router.post('/api/backup/email', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { email } = req.body as { email?: string };
    // Use provided email or fall back to backup_email setting
    const toEmail =
      email || (await pool.query('SELECT backup_email FROM tenants WHERE id = $1', [tenantId])).rows[0]?.backup_email;
    if (!toEmail) return res.status(400).json({ error: 'No email address. Provide one or set it in backup settings.' });
    await sendBackupEmail(tenantId, toEmail);
    res.json({ ok: true, sentTo: toEmail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not configured/i.test(msg)) return res.status(500).json({ error: msg });
    return handleApiError(req, res, err, 'Backup email failed');
  }
});

// ── Scheduled backup check (called by server cron) ───────────────────────────

export async function runScheduledBackups(): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT t.id as tenant_id, t.backup_email, t.backup_interval_days, t.backup_last_at
      FROM tenants t
      WHERE t.backup_enabled = true
        AND t.backup_email IS NOT NULL AND t.backup_email != ''
        AND (
          t.backup_last_at IS NULL
          OR t.backup_last_at < NOW() - (t.backup_interval_days || ' days')::INTERVAL
        )
    `);
    if (rows.length === 0) return;
    logger.info('Scheduled backup: processing', { count: rows.length });
    for (const row of rows as { tenant_id: string; backup_email: string }[]) {
      try {
        await sendBackupEmail(row.tenant_id, row.backup_email);
        logger.info('Scheduled backup sent', { tenantId: row.tenant_id, to: row.backup_email });
      } catch (err) {
        logger.warn('Scheduled backup failed', {
          tenantId: row.tenant_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.warn('Scheduled backup runner failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

export default router;
