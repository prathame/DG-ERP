import { pool } from '../pg-db';
import bcrypt from 'bcrypt';

export async function provisionTenant(data: {
  companyName: string;
  adminEmail: string;
  adminName: string;
  adminPassword?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  planId: string;
  status?: string;
  trialEndsAt?: string;
}) {
  const tenantId = `T${Date.now()}`;
  const baseSlug = data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // Ensure slug is unique — append suffix if taken
  let slug = baseSlug;
  const existing = (await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug])).rows[0];
  if (existing) {
    throw Object.assign(new Error(`Company name "${data.companyName}" generates slug "${slug}" which is already taken. Use a different company name.`), { code: 'DUPLICATE_SLUG' });
  }
  const crypto = await import('crypto');
  const defaultPassword = data.adminPassword || crypto.randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(defaultPassword, 12);
  const userId = `U${Date.now()}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Default tab config — super-admin route overrides this with business-type preset after provisioning
    const defaultTabConfig = JSON.stringify({
      analytics: { label: 'Analytics', visible: true }, masters: { label: 'Masters', visible: true },
      inventory: { label: 'Inventory', visible: true }, distribution: { label: 'Distribution', visible: true },
      sales: { label: 'Sales Entry', visible: true }, purchases: { label: 'Purchases', visible: true },
      verification: { label: 'Search / Verify', visible: true }, quotations: { label: 'Quotes & Orders', visible: true },
      invoices: { label: 'Invoices', visible: true }, finance: { label: 'Finance', visible: true },
      accounts: { label: 'Accounts', visible: true }, warranty: { label: 'Warranty', visible: true },
      replacements: { label: 'Replacements', visible: true }, rewards: { label: 'Rewards', visible: true },
      chatbot: { label: 'Chatbot', visible: true }, settings: { label: 'Settings', visible: true },
    });
    await client.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, phone, address, gst_number, plan_id, status, trial_ends_at, tab_config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tenantId, data.companyName, slug, data.adminEmail, data.adminName, data.phone || null, data.address || null, data.gstNumber || null, data.planId, data.status || 'active', data.trialEndsAt || null, defaultTabConfig]
    );

    await client.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, phone, address, role, company_name, gst_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [userId, tenantId, data.adminEmail, passwordHash, data.adminName, data.phone || null, data.address || null, 'Admin', data.companyName, data.gstNumber || null]
    );

    await client.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,$3)`,
      ['OWNER', tenantId, 'Owner']
    );

    await client.query(
      `INSERT INTO redemption_settings (id, tenant_id, min_balance, min_points) VALUES ($1,$2,$3,$4)`,
      ['default', tenantId, 100, 50]
    );

    await client.query('COMMIT');

    return {
      tenantId,
      slug,
      credentials: { email: data.adminEmail, password: defaultPassword },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteTenant(tenantId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tables = [
      'expenses', 'staff_payments', 'staff_members', 'bill_settings', 'audit_log',
      'credit_debit_notes', 'price_lists', 'orders', 'quotations',
      'reward_rules', 'rewards', 'product_replacements', 'warranties',
      'password_reset_tokens', 'transactions', 'tenant_invoices', 'tenant_stats',
      'supplier_payments', 'product_purchases', 'vendor_payments',
      'invoice_payments', 'standalone_invoices',
      'product_sales', 'product_distribution', 'product_inventory',
      'customers', 'banks', 'suppliers', 'vendors', 'categories', 'products',
      'redemption_settings', 'vendor_reminder_settings', 'users',
    ];
    for (const table of tables) {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    }
    await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getTenantStats(tenantId: string) {
  const [products, vendors, users, sales, revenue, barcodes] = await Promise.all([
    pool.query('SELECT COUNT(*) as c FROM products WHERE tenant_id = $1', [tenantId]),
    pool.query("SELECT COUNT(*) as c FROM vendors WHERE tenant_id = $1 AND id != 'OWNER'", [tenantId]),
    pool.query('SELECT COUNT(*) as c FROM users WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT COUNT(*) as c FROM product_sales WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT COUNT(*) as c FROM product_inventory WHERE tenant_id = $1', [tenantId]),
  ]);
  return {
    products: products.rows[0].c,
    vendors: vendors.rows[0].c,
    users: users.rows[0].c,
    sales: sales.rows[0].c,
    revenue: revenue.rows[0].t,
    barcodes: barcodes.rows[0].c,
  };
}
