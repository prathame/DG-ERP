import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { logger } from './utils/logger';

dotenv.config();

export const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 200);

// Set tenant context on a connection for RLS (P2 fix)
// Use true = transaction-local (resets after COMMIT/ROLLBACK)
export async function setTenantContext(client: import('pg').PoolClient, tenantId: string) {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

/**
 * P2 fix: Run a callback with a dedicated pool client scoped to a tenant.
 * Sets app.tenant_id so RLS policies can enforce isolation as a second layer
 * (on top of the explicit WHERE tenant_id = $1 in every query).
 *
 * Use this for destructive operations and sensitive reads.
 */
export async function withTenantClient<T>(
  tenantId: string,
  fn: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      logger.error('Transaction rollback failed', {
        tenantId,
        error: rbErr instanceof Error ? rbErr.message : String(rbErr),
        cause: err instanceof Error ? err.message : String(err),
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    const isDeadlock = /deadlock/i.test(msg);
    const isTimeout = /timeout|canceling statement/i.test(msg);
    logger.error(isDeadlock ? 'Transaction deadlock' : isTimeout ? 'Transaction timeout' : 'Transaction rolled back', {
      tenantId,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  } finally {
    client.release();
  }
}

// Cloud production always TLS; on-prem embedded Postgres stays local (no TLS)
const dbUrl = process.env.DATABASE_URL ?? '';
const isManagedCloudDb = process.env.RENDER === 'true' || /render\.com|neon\.tech/i.test(dbUrl);

const useSsl =
  (process.env.NODE_ENV === 'production' && process.env.DEPLOYMENT_MODE !== 'onprem') ||
  process.env.DATABASE_SSL === 'true' ||
  isManagedCloudDb;

// Render/Neon terminate TLS with certs Node does not trust by default →
// "Error: self-signed certificate" unless rejectUnauthorized is false.
// Strict verification remains the default for other production hosts.
const rejectUnauthorized = isManagedCloudDb
  ? process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true'
  : process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DATABASE_POOL_SIZE
    ? parseInt(process.env.DATABASE_POOL_SIZE, 10)
    : process.env.NODE_ENV === 'production'
      ? 10
      : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(useSsl ? { ssl: { rejectUnauthorized } } : {}),
});

// Pool-level connection errors (e.g. PG shutting down while connections are open)
pool.on('error', err => {
  if (process.env.DEPLOYMENT_MODE === 'onprem') return; // expected on app close
  logger.fatal('Unexpected database pool error', {
    error: err.message,
    stack: err.stack,
    code: (err as NodeJS.ErrnoException).code,
  });
});

/**
 * Instrumented query helper — prefer for new code / hot paths.
 * Logs slow queries (>= SLOW_QUERY_MS) and failures. Never logs bind params.
 */
export async function loggedQuery<T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<import('pg').QueryResult<T>> {
  const started = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const durationMs = Date.now() - started;
    if (durationMs >= SLOW_QUERY_MS) {
      logger.warn('Slow database query', {
        durationMs,
        thresholdMs: SLOW_QUERY_MS,
        sql: text.replace(/\s+/g, ' ').slice(0, 200),
      });
    }
    return result;
  } catch (err) {
    logger.error('Database query failed', {
      durationMs: Date.now() - started,
      sql: text.replace(/\s+/g, ' ').slice(0, 200),
      error: err instanceof Error ? err.message : String(err),
      code: err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}

export async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`

      -- ============ PLATFORM TABLES (no tenant_id) ============

      CREATE TABLE IF NOT EXISTS super_admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'owner',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        max_products INTEGER DEFAULT -1,
        max_vendors INTEGER DEFAULT -1,
        max_users INTEGER DEFAULT -1,
        max_barcodes INTEGER DEFAULT -1,
        features JSONB DEFAULT '{}',
        price_monthly NUMERIC(10,2) DEFAULT 0,
        price_yearly NUMERIC(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        admin_email TEXT NOT NULL,
        admin_name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        gst_number TEXT,
        plan_id TEXT REFERENCES plans(id),
        status TEXT DEFAULT 'active',
        trial_ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_active_at TIMESTAMPTZ,
        bootstrap_token TEXT  -- one-time token for first-admin signup (P1 fix)
      );
      -- Add bootstrap_token to existing tenants tables (idempotent)
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bootstrap_token TEXT;

      CREATE TABLE IF NOT EXISTS tenant_stats (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        products_count INTEGER DEFAULT 0,
        vendors_count INTEGER DEFAULT 0,
        users_count INTEGER DEFAULT 0,
        sales_count INTEGER DEFAULT 0,
        revenue NUMERIC(12,2) DEFAULT 0,
        barcodes_count INTEGER DEFAULT 0,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ============ TENANT-SCOPED TABLES ============

      CREATE TABLE IF NOT EXISTS users (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        role TEXT DEFAULT 'Admin',
        company_name TEXT,
        permissions JSONB,
        vendor_id TEXT,
        auto_whatsapp BOOLEAN DEFAULT false,
        gst_number TEXT,
        default_gst_rate NUMERIC(5,2) DEFAULT 18,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS vendors (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        total_sales INTEGER DEFAULT 0,
        total_reward_points INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        vendor_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(tenant_id, name);
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);

      CREATE TABLE IF NOT EXISTS products (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        barcode TEXT,
        description TEXT,
        reward_points_value INTEGER DEFAULT 0,
        manufacturing_date DATE,
        batch_number TEXT,
        status TEXT DEFAULT 'Active',
        warranty_months INTEGER DEFAULT 12,
        warranty_applicable BOOLEAN DEFAULT true,
        price NUMERIC(12,2) DEFAULT 0,
        stock INTEGER DEFAULT 0,
        hsn_code TEXT,
        gst_rate NUMERIC(5,2) DEFAULT 18,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(tenant_id, name);

      CREATE TABLE IF NOT EXISTS product_inventory (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        batch_id TEXT,
        status TEXT DEFAULT 'InStock',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pi_tenant ON product_inventory(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_pi_barcode ON product_inventory(tenant_id, barcode);
      CREATE INDEX IF NOT EXISTS idx_pi_product_status ON product_inventory(tenant_id, product_id, status);

      CREATE TABLE IF NOT EXISTS product_distribution (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        distribution_date DATE NOT NULL,
        status TEXT DEFAULT 'Distributed',
        discount_percent NUMERIC(5,2) DEFAULT 0,
        net_price NUMERIC(12,2),
        gst_applied BOOLEAN DEFAULT false,
        billed_price NUMERIC(12,2),
        batch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pd_tenant ON product_distribution(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_pd_barcode ON product_distribution(tenant_id, barcode);
      CREATE INDEX IF NOT EXISTS idx_pd_vendor ON product_distribution(tenant_id, vendor_id);

      CREATE TABLE IF NOT EXISTS product_sales (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        barcode TEXT NOT NULL,
        product_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        purchase_date DATE NOT NULL,
        reward_points_earned INTEGER DEFAULT 0,
        sale_price NUMERIC(12,2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ps_tenant ON product_sales(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_ps_barcode ON product_sales(tenant_id, barcode);
      CREATE INDEX IF NOT EXISTS idx_ps_vendor ON product_sales(tenant_id, vendor_id);
      CREATE INDEX IF NOT EXISTS idx_ps_date ON product_sales(tenant_id, purchase_date);

      CREATE TABLE IF NOT EXISTS warranties (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        activation_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        status TEXT DEFAULT 'Active',
        replaced_barcode TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_warranties_tenant ON warranties(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_warranties_barcode ON warranties(tenant_id, barcode);

      CREATE TABLE IF NOT EXISTS product_replacements (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        old_barcode TEXT NOT NULL,
        new_barcode TEXT NOT NULL,
        warranty_id TEXT,
        product_id TEXT,
        product_name TEXT,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        replaced_date DATE NOT NULL,
        reason TEXT,
        vendor_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS rewards (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        points INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        date DATE NOT NULL,
        vendor_id TEXT,
        sale_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS reward_rules (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        category_id TEXT,
        products_sold_threshold INTEGER NOT NULL,
        reward_points INTEGER NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS redemption_settings (
        id TEXT NOT NULL DEFAULT 'default',
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        min_balance INTEGER DEFAULT 100,
        min_points INTEGER DEFAULT 50,
        PRIMARY KEY (id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS banks (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        account_number TEXT,
        bank_name TEXT,
        branch TEXT,
        ifsc_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS vendor_payments (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        vendor_id TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT DEFAULT 'Cash',
        reference_number TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_vp_tenant ON vendor_payments(tenant_id, vendor_id);

      CREATE TABLE IF NOT EXISTS vendor_reminder_settings (
        vendor_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT false,
        reminder_days INTEGER DEFAULT 7,
        last_reminder_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (vendor_id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT,
        user_name TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at);

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS bill_settings (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        logo_base64 TEXT,
        primary_color TEXT DEFAULT '#F27D26',
        tagline TEXT,
        invoice_prefix TEXT,
        challan_prefix TEXT,
        bank_account_name TEXT,
        bank_account_number TEXT,
        bank_name TEXT,
        bank_branch TEXT,
        bank_ifsc TEXT,
        bank_upi_id TEXT,
        terms_and_conditions TEXT,
        signatory_name TEXT,
        signatory_designation TEXT,
        signature_base64 TEXT,
        show_rewards BOOLEAN DEFAULT true,
        show_barcode BOOLEAN DEFAULT true,
        show_warranty BOOLEAN DEFAULT true,
        show_hsn_sac BOOLEAN DEFAULT true,
        footer_text TEXT DEFAULT 'Powered by Dhandho Management',
        invoice_template_style TEXT DEFAULT 'modern',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(
      `ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS invoice_template_style TEXT DEFAULT 'modern'`,
    );
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS show_hsn_sac BOOLEAN DEFAULT true`);

    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vendor_portal_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS barcode_system_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS inventory_tracking_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS multi_language_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ');
    await client.query(
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tab_config JSONB DEFAULT '${JSON.stringify({
        dashboard: { label: 'Dashboard', visible: true },
        inventory: { label: 'Inventory', visible: true },
        purchases: { label: 'Purchases', visible: true },
        distribution: { label: 'Distribution', visible: true },
        sales: { label: 'Sales Entry', visible: true },
        verification: { label: 'Search / Verify', visible: true },
        warranty: { label: 'Warranty', visible: true },
        replacements: { label: 'Replacements', visible: true },
        rewards: { label: 'Rewards', visible: true },
        finance: { label: 'Finance', visible: true },
        quotations: { label: 'Quotations', visible: true },
        accounts: { label: 'Accounts', visible: true },
        reports: { label: 'Reports', visible: true },
        chatbot: { label: 'Chatbot', visible: true },
        settings: { label: 'Settings', visible: true },
      })}'`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        tenant_id TEXT,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Purchase module tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        gst_number TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_purchases (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        batch_id TEXT,
        product_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        purchase_date DATE NOT NULL,
        cost_price NUMERIC(12,2),
        gst_applied BOOLEAN DEFAULT false,
        billed_price NUMERIC(12,2),
        discount_percent NUMERIC(5,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        supplier_id TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT DEFAULT 'Cash',
        reference_number TEXT,
        notes TEXT,
        batch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pp_tenant ON product_purchases(tenant_id, supplier_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sp_tenant ON supplier_payments(tenant_id, supplier_id)');

    // Quotation module
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        quotation_number TEXT,
        vendor_id TEXT,
        vendor_name TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        quotation_date DATE NOT NULL,
        valid_until DATE,
        status TEXT DEFAULT 'Draft',
        items JSONB NOT NULL,
        subtotal NUMERIC(12,2),
        gst_rate NUMERIC(5,2) DEFAULT 18,
        gst_amount NUMERIC(12,2),
        total NUMERIC(12,2),
        notes TEXT,
        converted_batch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_quotations_tenant ON quotations(tenant_id)');
    await client.query('ALTER TABLE quotations ADD COLUMN IF NOT EXISTS converted_invoice_id TEXT');

    // Add accounts + quotations tabs to existing tenants
    await client.query(
      `UPDATE tenants SET tab_config = tab_config || '{"accounts":{"label":"Accounts","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'accounts'`,
    );
    await client.query(
      `UPDATE tenants SET tab_config = tab_config || '{"quotations":{"label":"Quotations","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'quotations'`,
    );

    // Add purchases tab to existing tenants
    await client.query(
      `UPDATE tenants SET tab_config = tab_config || '{"purchases":{"label":"Purchases","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'purchases'`,
    );

    // Vendor GSTIN for GST reports
    await client.query('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_number TEXT');

    // Add reports tab to existing tenants that don't have it
    await client.query(
      `UPDATE tenants SET tab_config = tab_config || '{"reports":{"label":"Reports","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'reports'`,
    );

    // Pack size support
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size INTEGER DEFAULT 1');
    await client.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_name TEXT DEFAULT 'Piece'");

    // Feature toggles for new modules
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotations_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS accounts_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS purchases_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN DEFAULT true');

    // Expenses
    await client.query(`CREATE TABLE IF NOT EXISTS expenses (
      id TEXT NOT NULL, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      category TEXT NOT NULL, description TEXT, amount NUMERIC(12,2) NOT NULL,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE, payment_method TEXT DEFAULT 'Cash',
      reference_number TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(id, tenant_id)
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(tenant_id, expense_date)');

    // Staff directory
    await client.query(`CREATE TABLE IF NOT EXISTS staff_members (
      id TEXT NOT NULL, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL, phone TEXT, role TEXT, address TEXT,
      salary NUMERIC(12,2), joining_date DATE, status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(id, tenant_id)
    )`);

    // Staff payroll (mini)
    await client.query(`CREATE TABLE IF NOT EXISTS staff_payments (
      id TEXT NOT NULL, tenant_id TEXT NOT NULL REFERENCES tenants(id), staff_name TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL, payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      payment_type TEXT DEFAULT 'salary', payment_method TEXT DEFAULT 'Cash',
      reference_number TEXT, notes TEXT,
      month TEXT, year INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(id, tenant_id)
    )`);
    await client.query("ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'salary'");
    await client.query('CREATE INDEX IF NOT EXISTS idx_staff_pay ON staff_payments(tenant_id, payment_date)');

    // Batch-level payment tracking
    await client.query('ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS batch_id TEXT');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vp_batch ON vendor_payments(tenant_id, batch_id)');

    // Performance indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_ps_date ON product_sales(tenant_id, purchase_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pd_date ON product_distribution(tenant_id, distribution_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vp_vendor ON vendor_payments(tenant_id, vendor_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pi_product ON product_inventory(tenant_id, product_id)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_invoices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        invoice_number TEXT NOT NULL,
        period_start DATE,
        period_end DATE,
        plan_name TEXT,
        amount NUMERIC(12,2) NOT NULL,
        gst_amount NUMERIC(12,2) DEFAULT 0,
        total NUMERIC(12,2) NOT NULL,
        status TEXT DEFAULT 'unpaid',
        paid_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Fix: tenant users should be 'Admin' not 'Super Admin' (Super Admin is platform-level only)
    await client.query("UPDATE users SET role = 'Admin' WHERE role = 'Super Admin' AND tenant_id IS NOT NULL");

    // Track whether each barcode represents a box or a piece
    await client.query("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'piece'");

    // Silver casting / metal piece attributes (grams; purity as parts-per-thousand e.g. 925)
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS gross_weight NUMERIC(12,3)');
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS net_weight NUMERIC(12,3)');
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS purity NUMERIC(8,3)');
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS fine_weight NUMERIC(12,3)');
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS making_rate NUMERIC(12,2)');
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS making_amount NUMERIC(12,2)');
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS huid TEXT');
    await client.query('ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS metal_rate NUMERIC(12,2)');

    // Dispatch tracking on distributions
    await client.query(
      "ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'pending'",
    );
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS dispatched_by TEXT');
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ');

    // Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_number TEXT,
        vendor_id TEXT,
        vendor_name TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_gst_number TEXT,
        order_date DATE NOT NULL DEFAULT CURRENT_DATE,
        required_date DATE,
        status TEXT DEFAULT 'Pending',
        items JSONB NOT NULL DEFAULT '[]',
        subtotal NUMERIC(12,2) DEFAULT 0,
        gst_rate NUMERIC(5,2) DEFAULT 18,
        gst_amount NUMERIC(12,2) DEFAULT 0,
        total NUMERIC(12,2) DEFAULT 0,
        notes TEXT,
        fulfilled_batch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id)');

    // Credit/Debit Notes
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_debit_notes (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        note_number TEXT,
        note_type TEXT NOT NULL DEFAULT 'credit',
        vendor_id TEXT,
        vendor_name TEXT,
        customer_name TEXT,
        note_date DATE NOT NULL DEFAULT CURRENT_DATE,
        reason TEXT,
        items JSONB NOT NULL DEFAULT '[]',
        subtotal NUMERIC(12,2) DEFAULT 0,
        gst_rate NUMERIC(5,2) DEFAULT 18,
        gst_amount NUMERIC(12,2) DEFAULT 0,
        total NUMERIC(12,2) DEFAULT 0,
        reference_invoice TEXT,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_cdn_tenant ON credit_debit_notes(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_cdn_type ON credit_debit_notes(tenant_id, note_type)');
    await client.query('ALTER TABLE credit_debit_notes ADD COLUMN IF NOT EXISTS reference_type TEXT');
    await client.query('ALTER TABLE credit_debit_notes ADD COLUMN IF NOT EXISTS reference_id TEXT');
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_cdn_ref ON credit_debit_notes(tenant_id, reference_type, reference_id)',
    );

    // Price Lists — customer-wise + slab pricing
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        product_id TEXT NOT NULL,
        vendor_id TEXT,
        min_qty INTEGER DEFAULT 1,
        max_qty INTEGER,
        price NUMERIC(12,2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_pl_tenant ON price_lists(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pl_product ON price_lists(tenant_id, product_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pl_vendor ON price_lists(tenant_id, vendor_id)');
    await client.query('ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS valid_from DATE');
    await client.query('ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS valid_to DATE');
    // Natural key for bulk upsert (NULL vendor → empty string). Skip if legacy duplicates exist.
    await client.query(`
      DO $$ BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_price_lists_natural
        ON price_lists (tenant_id, product_id, COALESCE(vendor_id, ''), min_qty);
      EXCEPTION WHEN unique_violation OR OTHERS THEN
        NULL;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(tenant_id, vendor_id)');

    // UNIQUE constraints — prevent duplicates at DB level
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users(tenant_id, LOWER(email))');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_name ON products(tenant_id, LOWER(name))');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tenant_name ON vendors(tenant_id, LOWER(name))');
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_tenant_name ON suppliers(tenant_id, LOWER(name))',
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_pi_tenant_barcode ON product_inventory(tenant_id, barcode)',
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_banks_tenant_acct ON banks(tenant_id, account_number) WHERE account_number IS NOT NULL',
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_tenant_num ON quotations(tenant_id, quotation_number)',
    );

    // Missing performance indexes
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS price_includes_gst BOOLEAN DEFAULT false');
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS ewb_number TEXT');
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS irn TEXT');
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS irn_ack_no TEXT');
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS irn_ack_dt TEXT');
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS irn_qr TEXT');
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS gst_api_mode TEXT DEFAULT 'mock'`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS gst_api_gstin TEXT`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS gst_api_username TEXT`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS gst_api_password TEXT`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS gst_api_client_id TEXT`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS gst_api_client_secret TEXT`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS gst_api_seller_pin TEXT`);
    await client.query('ALTER TABLE product_purchases ALTER COLUMN barcode DROP NOT NULL');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pp_batch ON product_purchases(tenant_id, batch_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pp_date ON product_purchases(tenant_id, purchase_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pp_product ON product_purchases(tenant_id, product_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sp_batch ON supplier_payments(tenant_id, batch_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pd_batch ON product_distribution(tenant_id, batch_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pd_status ON product_distribution(tenant_id, status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(tenant_id, status)');

    // Performance indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_pr_old_barcode ON product_replacements(tenant_id, old_barcode)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pr_tenant ON product_replacements(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_rewards_tenant ON rewards(tenant_id)');
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_prt_active ON password_reset_tokens(expires_at) WHERE used = false',
    );
    await client.query('CREATE INDEX IF NOT EXISTS idx_pi_batch ON product_inventory(tenant_id, batch_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customers_vendor ON customers(tenant_id, vendor_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_warranties_product ON warranties(tenant_id, product_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ps_customer ON product_sales(tenant_id, customer_id)');
    // Standalone invoices (non-inventory billing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS standalone_invoices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        invoice_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_gstin TEXT,
        customer_address TEXT,
        customer_phone TEXT,
        items JSONB NOT NULL DEFAULT '[]',
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        terms TEXT,
        status TEXT DEFAULT 'draft',
        invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
        due_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_si_date ON standalone_invoices(tenant_id, invoice_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_si_tenant ON standalone_invoices(tenant_id, created_at DESC)');
    // Stable party link for Invoice Finance (vendor/customer id) — name alone can split ledgers
    await client.query(`ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS party_type TEXT`);
    await client.query(`ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS party_id TEXT`);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_si_party ON standalone_invoices(tenant_id, party_type, party_id)',
    );
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS tax_cgst NUMERIC(12,2) DEFAULT 0');
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS tax_sgst NUMERIC(12,2) DEFAULT 0');
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS tax_igst NUMERIC(12,2) DEFAULT 0');
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN DEFAULT false');
    // Frozen at create: GST vs non-GST invoice (print must not follow later settings toggles)
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS gst_enabled BOOLEAN');
    await client.query(
      `UPDATE standalone_invoices SET gst_enabled = (COALESCE(tax_total, 0) > 0) WHERE gst_enabled IS NULL`,
    );

    // In-app notifications (Super Admin / control-panel pushes)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_notifications (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        source TEXT NOT NULL DEFAULT 'super_admin',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        read_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        PRIMARY KEY (id, tenant_id)
      )
    `);
    // NULL user_id = whole tenant; set = targeted seat/user only (Service Cloud SA)
    await client.query(`ALTER TABLE tenant_notifications ADD COLUMN IF NOT EXISTS user_id TEXT`);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_tn_tenant_unread ON tenant_notifications(tenant_id, read_at, created_at DESC)',
    );
    await client.query('CREATE INDEX IF NOT EXISTS idx_tn_tenant_user ON tenant_notifications(tenant_id, user_id)');

    // Invoice payments — partial/batch payments against standalone invoices
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id TEXT NOT NULL, tenant_id TEXT NOT NULL REFERENCES tenants(id),
        invoice_id TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method TEXT DEFAULT 'Cash', reference_number TEXT, notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_inv_payments ON invoice_payments(tenant_id, invoice_id)');
    // Drop orphan payment rows then enforce FK (ON DELETE RESTRICT)
    await client.query(`
      DELETE FROM invoice_payments ip
      WHERE NOT EXISTS (SELECT 1 FROM standalone_invoices si WHERE si.id = ip.invoice_id)
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE invoice_payments
          ADD CONSTRAINT invoice_payments_invoice_fk
          FOREIGN KEY (invoice_id) REFERENCES standalone_invoices(id) ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Platform config — key/value store for super admin settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // On-premises license management (platform-level, no tenant_id)
    await client.query(`
      CREATE TABLE IF NOT EXISTS onprem_licenses (
        id TEXT PRIMARY KEY,
        license_key TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        business_type TEXT DEFAULT 'manufacturer',
        admin_email TEXT,
        max_users INT DEFAULT 5,
        valid_until DATE,
        status TEXT DEFAULT 'active',
        machine_id TEXT,
        machine_os TEXT,
        app_version TEXT,
        last_seen TIMESTAMPTZ,
        active_users INT DEFAULT 0,
        disk_mb INT DEFAULT 0,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_onprem_key ON onprem_licenses(license_key)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_onprem_status ON onprem_licenses(status)');

    // Purchase invoice number for GSTR-2B reconciliation
    await client.query('ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS invoice_number TEXT');

    // Business type
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'manufacturer'");

    // Backup settings
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN DEFAULT false');
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_frequency TEXT DEFAULT 'weekly'");
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_interval_days INTEGER DEFAULT 7');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_last_at TIMESTAMPTZ');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_email TEXT');
    await client.query('ALTER TABLE onprem_licenses ADD COLUMN IF NOT EXISTS settings_pushed_at TIMESTAMPTZ');
    await client.query('ALTER TABLE onprem_licenses ADD COLUMN IF NOT EXISTS settings_applied_at TIMESTAMPTZ');

    // SA → on-prem Bell messages (delivered on heartbeat / hard sync)
    await client.query(`
      CREATE TABLE IF NOT EXISTS onprem_notifications (
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL REFERENCES onprem_licenses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        source TEXT NOT NULL DEFAULT 'super_admin',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_onprem_notif_pending
       ON onprem_notifications(license_id, created_at)
       WHERE delivered_at IS NULL`,
    );

    // Capacitor cloud-mobile removed — drop leftover table/columns from older deploys (idempotent).
    await client.query(`DROP TABLE IF EXISTS mobile_seats CASCADE`);
    await client.query(`DROP TABLE IF EXISTS mobile_devices CASCADE`);
    await client.query(`DROP INDEX IF EXISTS idx_tenants_mobile_invite`);
    for (const col of [
      'mobile_invite_code',
      'mobile_invite_expires_at',
      'mobile_force_sync_at',
      'mobile_min_version',
      'mobile_latest_version',
    ]) {
      await client.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS ${col}`);
    }

    // Service Mobile (offline phone) — separate from on-prem desktop licenses
    // business_type always service; max_users always 1 (1 license = 1 user = 1 device)
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_mobile_licenses (
        id TEXT PRIMARY KEY,
        license_key TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        business_type TEXT NOT NULL DEFAULT 'service',
        admin_email TEXT,
        max_users INT NOT NULL DEFAULT 1,
        valid_until DATE,
        status TEXT DEFAULT 'active',
        machine_id TEXT,
        machine_os TEXT,
        app_version TEXT,
        last_seen TIMESTAMPTZ,
        settings JSONB DEFAULT '{}',
        settings_pushed_at TIMESTAMPTZ,
        settings_applied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_key ON service_mobile_licenses(license_key)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_status ON service_mobile_licenses(status)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS service_mobile_notifications (
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL REFERENCES service_mobile_licenses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        source TEXT NOT NULL DEFAULT 'super_admin',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_sm_notif_pending
       ON service_mobile_notifications(license_id, created_at)
       WHERE delivered_at IS NULL`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS service_mobile_backups (
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL REFERENCES service_mobile_licenses(id) ON DELETE CASCADE,
        ciphertext BYTEA NOT NULL,
        nonce TEXT NOT NULL,
        wrap TEXT,
        byte_size INT NOT NULL DEFAULT 0,
        app_version TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_sm_backups_license
       ON service_mobile_backups(license_id, created_at DESC)`,
    );

    // Service cloud seats (online) — access mode + device slots + single-tenant session
    // Only meaningful when tenants.business_type = 'service'
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS client_access_mode TEXT`);
    // client_access_mode: mobile | desktop | both | NULL (unset / N/A)

    await client.query(`
      CREATE TABLE IF NOT EXISTS service_cloud_device_slots (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        device_kind TEXT NOT NULL CHECK (device_kind IN ('mobile', 'desktop')),
        machine_id TEXT,
        label TEXT,
        bound_at TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sc_slots_tenant ON service_cloud_device_slots(tenant_id)`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_sc_slots_user ON service_cloud_device_slots(tenant_id, user_id)`,
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_sc_slots_machine
       ON service_cloud_device_slots(tenant_id, machine_id)
       WHERE machine_id IS NOT NULL`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS service_cloud_sessions (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        client TEXT NOT NULL CHECK (client IN ('mobile', 'desktop', 'web')),
        user_name TEXT,
        heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sc_sessions_expires ON service_cloud_sessions(expires_at)`);

    // One active login session per tenant user (desktop/mobile single-device auth)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        device_id TEXT,
        platform TEXT NOT NULL DEFAULT 'unknown',
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, tenant_id),
        FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant ON user_sessions(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS super_admin_sessions (
        user_id TEXT PRIMARY KEY REFERENCES super_admins(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        device_id TEXT,
        platform TEXT NOT NULL DEFAULT 'unknown',
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Row Level Security (RLS) — DB-level tenant isolation safety net
    // RLS policies enforce tenant_id filtering at the DB level.
    // Table owner (our pool user) bypasses RLS — this is intentional.
    // RLS protects against: direct DB access, SQL injection, developer mistakes.
    // To enforce RLS on owner too: ALTER TABLE ... FORCE ROW LEVEL SECURITY
    const rlsTables = [
      'users',
      'vendors',
      'customers',
      'products',
      'product_inventory',
      'product_distribution',
      'product_sales',
      'product_purchases',
      'warranties',
      'product_replacements',
      'rewards',
      'reward_rules',
      'redemption_settings',
      'banks',
      'vendor_payments',
      'vendor_reminder_settings',
      'audit_log',
      'categories',
      'bill_settings',
      'credit_debit_notes',
      'price_lists',
      'quotations',
      'orders',
      'suppliers',
      'supplier_payments',
      'expenses',
      'staff_members',
      'staff_payments',
      'standalone_invoices',
      'tenant_notifications',
      'tenant_invoices',
      'tenant_stats',
    ];
    for (const table of rlsTables) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      // Clear leftover FORCE from the reverted experiment — FORCE + unset app.tenant_id
      // breaks SA inserts (42501) and silently empties pool.query() SELECTs.
      await client.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${table}_tenant_isolation') THEN
            CREATE POLICY ${table}_tenant_isolation ON ${table}
              USING (tenant_id = current_setting('app.tenant_id', true))
              WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
          END IF;
        END $$
      `);
    }
    // RLS policies are enabled (not forced) — the pool owner bypasses them,
    // but the explicit WHERE tenant_id = $1 in every handler is the primary isolation.
    // FORCE ROW LEVEL SECURITY was removed: without per-request SET LOCAL inside the
    // same transaction, handlers use pool.query() on different connections where
    // app.tenant_id is unset → FORCE RLS returns empty rows (silent data loss).
    logger.info('Row Level Security policies applied');

    logger.info('Database schema ready');
  } finally {
    client.release();
  }
}

/** Upsert TRIAL/BASIC/STANDARD/PROFESSIONAL so cloud tenant create never hits plan_id FK 500s on empty DBs. */
export async function ensureDefaultPlans() {
  const plans = [
    [
      'TRIAL',
      'Trial',
      -1,
      -1,
      -1,
      -1,
      '{"warranty":true,"replacements":true,"rewards":true,"finance":true,"chatbot":true,"billCustomization":true,"multiLanguage":true,"vendorPortal":true,"barcodeSystem":true}',
      0,
      0,
    ],
    [
      'BASIC',
      'Basic',
      50,
      5,
      3,
      0,
      '{"warranty":false,"replacements":false,"rewards":false,"finance":true,"chatbot":false,"billCustomization":true,"multiLanguage":true,"vendorPortal":false,"barcodeSystem":false}',
      499,
      4999,
    ],
    [
      'STANDARD',
      'Standard',
      200,
      15,
      10,
      5000,
      '{"warranty":false,"replacements":false,"rewards":false,"finance":true,"chatbot":false,"billCustomization":true,"multiLanguage":true,"vendorPortal":true,"barcodeSystem":true}',
      999,
      9999,
    ],
    [
      'PROFESSIONAL',
      'Professional',
      -1,
      -1,
      -1,
      -1,
      '{"warranty":true,"replacements":true,"rewards":true,"finance":true,"chatbot":true,"billCustomization":true,"multiLanguage":true,"vendorPortal":true,"barcodeSystem":true}',
      1999,
      19999,
    ],
  ];

  for (const p of plans) {
    await pool.query(
      `INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET name = $2, max_products = $3, max_vendors = $4, max_users = $5, max_barcodes = $6, features = $7`,
      p,
    );
  }
  logger.info('Plans seeded', { plans: ['Trial', 'Basic', 'Standard', 'Professional'] });
}

export async function seedPlatformData() {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!superAdminEmail || !superAdminPassword) {
    logger.warn('SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD not set — skipping admin seed');
  } else {
    const existing = await pool.query('SELECT id FROM super_admins WHERE email = $1', [superAdminEmail]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(superAdminPassword, 12);
      await pool.query('INSERT INTO super_admins (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)', [
        'SA1',
        superAdminEmail,
        hash,
        'Platform Owner',
        'owner',
      ]);
      logger.info('Super admin created');
    }
  }

  await ensureDefaultPlans();
}

export async function initDatabase() {
  await initSchema();
  await seedPlatformData();
  logger.info('Database ready');
}
