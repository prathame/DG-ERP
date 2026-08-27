import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { logger, requestContext } from './utils/logger';
import { databaseHostname, formatDbConnectError, resolvePoolSsl } from './utils/databaseUrl';

dotenv.config();

export const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 200);

// Simple circuit breaker for loggedQuery — no external dependency.
// Opens after CIRCUIT_THRESHOLD consecutive failures; auto-closes after CIRCUIT_RESET_MS.
// ponytail: global state, fine for single-instance. Multi-instance: each process has its own breaker (acceptable — DB outage affects all).
const CIRCUIT_THRESHOLD = Number(process.env.DB_CIRCUIT_THRESHOLD || 5);
const CIRCUIT_RESET_MS = Number(process.env.DB_CIRCUIT_RESET_MS || 10_000);
let _circuitOpen = false;
let _circuitFailures = 0;
let _circuitOpenedAt = 0;

function recordDbSuccess() {
  _circuitFailures = 0;
  _circuitOpen = false;
}

function recordDbFailure() {
  _circuitFailures++;
  if (_circuitFailures >= CIRCUIT_THRESHOLD) {
    if (!_circuitOpen) {
      _circuitOpen = true;
      _circuitOpenedAt = Date.now();
      // alert: 'circuit_breaker_open' — configure Sentry/Logtail alert on this pattern
      logger.error('Database circuit breaker opened', {
        alert: 'circuit_breaker_open',
        failures: _circuitFailures,
        resetMs: CIRCUIT_RESET_MS,
      });
    }
  }
}

function checkCircuit() {
  if (!_circuitOpen) return;
  if (Date.now() - _circuitOpenedAt >= CIRCUIT_RESET_MS) {
    _circuitOpen = false;
    _circuitFailures = 0;
    logger.info('Database circuit breaker closed (reset after timeout)');
    return;
  }
  throw Object.assign(new Error('Database circuit breaker is open — too many consecutive failures'), {
    code: 'CIRCUIT_OPEN',
  });
}

// Set tenant context on a connection for RLS (P2 fix)
// Use true = transaction-local (resets after COMMIT/ROLLBACK)
export async function setTenantContext(client: import('pg').PoolClient, tenantId: string) {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

/**
 * Dev-time assertion: verify that a SQL string contains a tenant_id filter.
 * Throws in non-production if a tenant-scoped query silently omits isolation.
 * No-ops in production (zero overhead on the hot path).
 */
export function assertTenantScoped(sql: string): void {
  if (process.env.NODE_ENV === 'production') return;
  const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
  // Skip platform-level queries (no tenant column) and DDL
  if (
    /create |alter |drop |insert into (?:tenants|plans|super_admins|platform_config|onprem_licenses|service_mobile_licenses|service_mobile_backups|service_mobile_notifications|onprem_notifications|super_admin_sessions)\b/.test(
      normalized,
    )
  )
    return;
  if (/from (?:tenants|plans|super_admins|platform_config|onprem_licenses|service_mobile_licenses)\b/.test(normalized))
    return;
  if (!normalized.includes('tenant_id')) {
    logger.warn('assertTenantScoped: query missing tenant_id — potential cross-tenant data access', {
      sql: sql.replace(/\s+/g, ' ').slice(0, 300),
    });
  }
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

// Provider-agnostic: Neon, Render PG, Supabase, RDS, self-hosted — driven by DATABASE_URL
const { useSsl, rejectUnauthorized } = resolvePoolSsl();

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

// ── Transparent tenant-context injection for FORCE ROW LEVEL SECURITY ──────────
//
// Override pool.query to automatically set app.tenant_id (transaction-locally)
// when a tenant request context is present in AsyncLocalStorage. This makes
// FORCE RLS work for all existing pool.query() calls without changing route files.
//
// Skipped in test environments (requestContext absent for fixture setup code).
// Skipped for platform queries (no tenantId in context → platform tables bypass RLS).
//
// ponytail: wraps each pool.query in BEGIN/SET LOCAL/query/COMMIT — 4 round-trips.
// Upgrade path when throughput matters: migrate hot routes to withTenantClient()
// which amortises the overhead across multiple queries in one connection.

const _rawPoolQuery = pool.query.bind(pool);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pool as any).query = async function tenantAwareQuery(textOrConfig: unknown, values?: unknown[]) {
  // Circuit breaker: fail fast when the DB is known to be unhealthy.
  // Previously only loggedQuery() checked this; since no routes use loggedQuery()
  // the breaker had zero production effect. Checking here makes it apply to all
  // pool.query() calls regardless of call site.
  checkCircuit();

  const tenantId = requestContext.getStore()?.tenantId;
  if (!tenantId) {
    // No tenant context: platform query, test fixture, or initSchema — bypass.
    try {
      const result = await _rawPoolQuery(textOrConfig as string, values);
      recordDbSuccess();
      return result;
    } catch (err) {
      recordDbFailure();
      throw err;
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(textOrConfig as string, values);
    await client.query('COMMIT');
    recordDbSuccess();
    return result;
  } catch (err) {
    recordDbFailure();
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback error — connection may already be in error state */
    }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Instrumented query helper — prefer for new code / hot paths.
 * Logs slow queries (>= SLOW_QUERY_MS) and failures. Never logs bind params.
 */
export async function loggedQuery<T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<import('pg').QueryResult<T>> {
  checkCircuit();
  const started = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const durationMs = Date.now() - started;
    recordDbSuccess();
    if (durationMs >= SLOW_QUERY_MS) {
      logger.warn('Slow database query', {
        durationMs,
        thresholdMs: SLOW_QUERY_MS,
        sql: text.replace(/\s+/g, ' ').slice(0, 200),
      });
    }
    return result;
  } catch (err) {
    recordDbFailure();
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
      -- E-Invoice & E-Way Bill toggle (added here so auth.ts SELECT works immediately)
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS einvoice_enabled BOOLEAN DEFAULT false;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS einvoice_mode TEXT DEFAULT 'portal';
      UPDATE tenants SET einvoice_mode = 'api' WHERE einvoice_mode IN ('manual', 'auto');
      ALTER TABLE tenants ALTER COLUMN einvoice_mode SET DEFAULT 'portal';
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ewb_with_einvoice BOOLEAN DEFAULT false;

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
        credit_limit NUMERIC(14,2),
        credit_period_days INTEGER,
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
        credit_limit NUMERIC(14,2),
        credit_period_days INTEGER,
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
    // Hotel/restaurant thermal bills: menu prices usually include GST; FSSAI on guest receipt
    await client.query(
      `ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS hosp_prices_include_gst BOOLEAN DEFAULT true`,
    );
    // Hotel guest bills: GST optional (off by default for small restaurants)
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS hosp_charge_gst BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS fssai_license TEXT`);
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS bank_upi_qr_base64 TEXT`);
    // Sale units for invoices/quotations — first label is used on every new bill line
    await client.query(
      `ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS bill_units JSONB DEFAULT '["Piece"]'::jsonb`,
    );
    await client.query(`ALTER TABLE bill_settings ALTER COLUMN bill_units SET DEFAULT '["Piece"]'::jsonb`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS barcode_label_templates (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        width_mm NUMERIC(8,2) NOT NULL DEFAULT 38,
        height_mm NUMERIC(8,2) NOT NULL DEFAULT 25,
        orientation TEXT NOT NULL DEFAULT 'landscape',
        status TEXT NOT NULL DEFAULT 'draft',
        is_default BOOLEAN NOT NULL DEFAULT false,
        version INTEGER NOT NULL DEFAULT 1,
        elements JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_barcode_label_templates_tenant ON barcode_label_templates(tenant_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_barcode_label_templates_default
        ON barcode_label_templates(tenant_id) WHERE is_default = true AND status = 'active';
    `);

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
        is_rcm BOOLEAN DEFAULT false,
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
    await client.query('ALTER TABLE quotations ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_tenant_external_ref
      ON quotations (tenant_id, external_ref)
      WHERE external_ref IS NOT NULL
    `);

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
    // RealBooks-style party credit terms (AR)
    await client.query('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2)');
    await client.query('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS credit_period_days INTEGER');
    await client.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2)');
    await client.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_period_days INTEGER');

    // Miracle / external system refs for idempotent ops import
    await client.query('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tenant_external_ref
      ON vendors (tenant_id, external_ref)
      WHERE external_ref IS NOT NULL
    `);
    await client.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_tenant_external_ref
      ON suppliers (tenant_id, external_ref)
      WHERE external_ref IS NOT NULL
    `);
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_external_ref
      ON products (tenant_id, external_ref)
      WHERE external_ref IS NOT NULL
    `);

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

    // Alternate delivery addresses for distribution buyers (vendors)
    await client.query(`CREATE TABLE IF NOT EXISTS vendor_ship_to (
      id TEXT NOT NULL,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      vendor_id TEXT NOT NULL,
      label TEXT,
      name TEXT NOT NULL,
      gstin TEXT,
      address TEXT,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(id, tenant_id)
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_vendor_ship_to_vendor ON vendor_ship_to(tenant_id, vendor_id)');

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
    await client.query('ALTER TABLE credit_debit_notes ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cdn_tenant_external_ref
      ON credit_debit_notes (tenant_id, external_ref)
      WHERE external_ref IS NOT NULL
    `);

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
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS image_base64 TEXT');
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0');
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
    await client.query(`ALTER TABLE bill_settings ADD COLUMN IF NOT EXISTS whatsapp_invoice_template TEXT`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        image_base64 TEXT,
        image_mimetype TEXT,
        recipient_type TEXT NOT NULL DEFAULT 'all_customers',
        recipient_ids JSONB DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending',
        total_recipients INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_broadcast_recipients (
        id TEXT NOT NULL,
        broadcast_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMPTZ,
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_wbr_broadcast ON whatsapp_broadcast_recipients(broadcast_id, tenant_id)',
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_reminder_log (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        vendor_id TEXT,
        vendor_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        balance NUMERIC(12,2),
        status TEXT NOT NULL DEFAULT 'sent',
        error_message TEXT,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_wrl_tenant ON whatsapp_reminder_log(tenant_id, sent_at DESC)');

    // Email settings + log
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_settings (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        smtp_host TEXT DEFAULT 'smtp.gmail.com',
        smtp_port INTEGER DEFAULT 587,
        smtp_user TEXT,
        smtp_password TEXT,
        from_name TEXT,
        from_email TEXT,
        use_ssl BOOLEAN DEFAULT false,
        invoice_subject TEXT DEFAULT 'Invoice {invoiceNumber} from {businessName}',
        invoice_template TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_log (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        to_email TEXT NOT NULL,
        to_name TEXT,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        error_message TEXT,
        invoice_id TEXT,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_email_log_tenant ON email_log(tenant_id, sent_at DESC)');

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
    // Rename historical duplicates so UNIQUE (tenant_id, invoice_number) can be applied safely
    await client.query(`
      WITH dups AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY tenant_id, invoice_number
                 ORDER BY created_at NULLS LAST, id
               ) AS rn
        FROM standalone_invoices
      )
      UPDATE standalone_invoices si
      SET invoice_number = si.invoice_number || '-dup-' || SUBSTRING(si.id FROM 1 FOR 8)
      FROM dups d
      WHERE si.id = d.id AND d.rn > 1
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_standalone_invoices_tenant_number
      ON standalone_invoices (tenant_id, invoice_number)
    `);
    // Miracle / external system refs — after CREATE TABLE (vendors/products ALTERs are earlier)
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_standalone_invoices_tenant_external_ref
      ON standalone_invoices (tenant_id, external_ref)
      WHERE external_ref IS NOT NULL
    `);
    // E-invoice / E-way on standalone (Miracle-imported + ops desk) invoices
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn TEXT');
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn_ack_no TEXT');
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn_ack_dt TEXT');
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn_qr TEXT');
    await client.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS ewb_number TEXT');
    // sale = party bill; cash_income = rent/scrap/misc (import or Record cash income — same kind)
    await client.query(
      `ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS invoice_kind TEXT NOT NULL DEFAULT 'sale'`,
    );
    await client.query(`
      UPDATE standalone_invoices
      SET invoice_kind = 'cash_income'
      WHERE invoice_kind IS DISTINCT FROM 'cash_income'
        AND (
          invoice_number LIKE 'MIR-CASH-%'
          OR invoice_number LIKE 'CASH-%'
          OR invoice_number LIKE 'CASH/%'
          OR COALESCE(notes, '') ILIKE 'Miracle cash income%'
        )
    `);
    // Strip legacy Miracle-only labels so imported rows read like native cash income
    await client.query(`
      UPDATE standalone_invoices
      SET notes = CASE
        WHEN notes ILIKE 'Miracle cash income: %'
          THEN 'Cash income: ' || substring(notes from length('Miracle cash income: ') + 1)
        WHEN notes ILIKE 'Miracle cash income %'
          THEN 'Cash income: ' || substring(notes from length('Miracle cash income ') + 1)
        ELSE notes
      END
      WHERE invoice_kind = 'cash_income'
        AND notes ILIKE 'Miracle cash income%'
    `);
    await client.query(`
      UPDATE standalone_invoices si
      SET invoice_number = regexp_replace(si.invoice_number, '^MIR-CASH-', 'CASH-')
      WHERE si.invoice_number LIKE 'MIR-CASH-%'
        AND NOT EXISTS (
          SELECT 1 FROM standalone_invoices o
          WHERE o.tenant_id = si.tenant_id
            AND o.id IS DISTINCT FROM si.id
            AND o.invoice_number = regexp_replace(si.invoice_number, '^MIR-CASH-', 'CASH-')
        )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_si_kind ON standalone_invoices(tenant_id, invoice_kind)');

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
    await client.query('ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT');
    // After invoice_payments exists — normalize legacy Miracle cash-income payment notes
    await client.query(`
      UPDATE invoice_payments
      SET notes = CASE
        WHEN notes ILIKE 'Miracle cash income: %'
          THEN 'Cash income: ' || substring(notes from length('Miracle cash income: ') + 1)
        WHEN notes ILIKE 'Miracle cash income %'
          THEN 'Cash income: ' || substring(notes from length('Miracle cash income ') + 1)
        ELSE notes
      END
      WHERE notes ILIKE 'Miracle cash income%'
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_payments_idempotency
      ON invoice_payments (tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
    await client.query('ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_payments_idempotency
      ON vendor_payments (tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
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
    // Reverse charge (RCM) — liability + ITC on GSTR-3B; excluded from forward-charge PURCHASE_TAX_SQL
    await client.query('ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS is_rcm BOOLEAN DEFAULT false');
    await client.query('ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS lot_number TEXT');
    await client.query('ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS mfg_date DATE');
    await client.query('ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS expiry_date DATE');
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE');

    // Local IMS-lite decisions on GSTR-2B reconcile (Accept / Hold / Reject) — not portal push
    await client.query(`
      CREATE TABLE IF NOT EXISTS gstr2b_ims_actions (
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rtnprd TEXT NOT NULL,
        ctin TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        ctin_norm TEXT NOT NULL,
        inum_norm TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('accept','hold','reject')),
        note TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, rtnprd, ctin_norm, inum_norm)
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_gstr2b_ims_tenant_period ON gstr2b_ims_actions(tenant_id, rtnprd)',
    );

    // Business type
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'manufacturer'");

    // Backup settings
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN DEFAULT false');
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_frequency TEXT DEFAULT 'weekly'");
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_interval_days INTEGER DEFAULT 7');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_last_at TIMESTAMPTZ');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_email TEXT');

    // Company payment-reminder policy (Distribution / Vendor Finance — non-service)
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminder_cadence_days INTEGER DEFAULT 15');
    await client.query(
      'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminder_min_due_amount NUMERIC(14,2) DEFAULT 1000',
    );
    await client.query('ALTER TABLE onprem_licenses ADD COLUMN IF NOT EXISTS settings_pushed_at TIMESTAMPTZ');
    await client.query('ALTER TABLE onprem_licenses ADD COLUMN IF NOT EXISTS settings_applied_at TIMESTAMPTZ');

    // ── Hospitality (hotel_restaurant business type) ───────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_dining_tables (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        seats INTEGER NOT NULL DEFAULT 4,
        zone TEXT NOT NULL DEFAULT 'Main',
        status TEXT NOT NULL DEFAULT 'available'
          CHECK(status IN ('available','occupied','billing','cleaning')),
        UNIQUE(tenant_id, name)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hosp_tables_tenant ON hosp_dining_tables(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_menu_categories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(tenant_id, name)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_menu_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES hosp_menu_categories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price NUMERIC(14,2) NOT NULL,
        available BOOLEAN NOT NULL DEFAULT true
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hosp_menu_items_tenant ON hosp_menu_items(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_modifier_groups (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        required BOOLEAN NOT NULL DEFAULT false,
        max_select INTEGER NOT NULL DEFAULT 3
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_modifiers (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES hosp_modifier_groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price_delta NUMERIC(14,2) NOT NULL DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_item_modifier_groups (
        menu_item_id TEXT NOT NULL REFERENCES hosp_menu_items(id) ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES hosp_modifier_groups(id) ON DELETE CASCADE,
        PRIMARY KEY (menu_item_id, group_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        table_id TEXT NOT NULL REFERENCES hosp_dining_tables(id),
        waiter_id TEXT,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK(status IN ('open','billed','closed','cancelled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_hosp_one_open_order
       ON hosp_orders(table_id) WHERE status = 'open'`,
    );

    // Parcel / takeaway orders: nullable table, order_type, customer fields
    await client.query(`ALTER TABLE hosp_orders ALTER COLUMN table_id DROP NOT NULL`);
    await client.query(`ALTER TABLE hosp_orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'dine_in'`);
    await client.query(`ALTER TABLE hosp_orders ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE hosp_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE hosp_orders ADD COLUMN IF NOT EXISTS token TEXT`);
    await client.query(`DROP INDEX IF EXISTS idx_hosp_one_open_order`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_hosp_one_open_order
       ON hosp_orders(table_id) WHERE status = 'open' AND table_id IS NOT NULL`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES hosp_orders(id) ON DELETE CASCADE,
        menu_item_id TEXT NOT NULL REFERENCES hosp_menu_items(id),
        name TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        unit_price NUMERIC(14,2) NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        kitchen_status TEXT NOT NULL DEFAULT 'queued'
          CHECK(kitchen_status IN ('queued','preparing','ready','served')),
        fired_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_order_item_modifiers (
        id TEXT PRIMARY KEY,
        order_item_id TEXT NOT NULL REFERENCES hosp_order_items(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price_delta NUMERIC(14,2) NOT NULL DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_queue_entries (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        guest_name TEXT NOT NULL,
        party_size INTEGER NOT NULL DEFAULT 2,
        status TEXT NOT NULL DEFAULT 'waiting'
          CHECK(status IN ('waiting','called','seated','no_show','left')),
        table_id TEXT REFERENCES hosp_dining_tables(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        called_at TIMESTAMPTZ,
        seated_at TIMESTAMPTZ,
        UNIQUE(tenant_id, token)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hosp_queue_tenant ON hosp_queue_entries(tenant_id, status)`);

    // Hotel memberships + optional member price on dishes
    await client.query(`ALTER TABLE hosp_menu_items ADD COLUMN IF NOT EXISTS member_price NUMERIC(14,2)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_membership_plans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        period TEXT NOT NULL DEFAULT 'monthly'
          CHECK(period IN ('monthly','yearly')),
        fee NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
          CHECK(discount_percent >= 0 AND discount_percent <= 100),
        use_member_prices BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        UNIQUE(tenant_id, name)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hosp_plans_tenant ON hosp_membership_plans(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hosp_members (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        plan_id TEXT NOT NULL REFERENCES hosp_membership_plans(id),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK(status IN ('active','expired','cancelled')),
        valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
        valid_until DATE NOT NULL,
        UNIQUE(tenant_id, phone)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hosp_members_tenant ON hosp_members(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hosp_members_phone ON hosp_members(tenant_id, phone)`);

    await client.query(
      `ALTER TABLE hosp_orders ADD COLUMN IF NOT EXISTS member_id TEXT REFERENCES hosp_members(id) ON DELETE SET NULL`,
    );
    await client.query(
      `ALTER TABLE hosp_orders ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0`,
    );
    await client.query(
      `ALTER TABLE hosp_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0`,
    );

    // Cancel/void open or billed orders (existing DBs may still have the 3-value check).
    await client.query(`ALTER TABLE hosp_orders DROP CONSTRAINT IF EXISTS hosp_orders_status_check`);
    await client.query(`
      ALTER TABLE hosp_orders
        ADD CONSTRAINT hosp_orders_status_check
        CHECK (status IN ('open','billed','closed','cancelled'))
    `);

    // Hotel Party Quotes: flip stale #172 preset hide (Quotes & Orders / Quotations + visible:false).
    // Does not touch SA-off Party Quotes (label "Party Quotes" or custom).
    await client.query(`
      UPDATE tenants
      SET tab_config = jsonb_set(
        COALESCE(tab_config, '{}'::jsonb),
        '{quotations}',
        '{"label":"Party Quotes","visible":true}'::jsonb,
        true
      )
      WHERE business_type = 'hotel_restaurant'
        AND (
          tab_config IS NULL
          OR NOT (tab_config ? 'quotations')
          OR (
            (tab_config->'quotations'->>'visible') = 'false'
            AND COALESCE(tab_config->'quotations'->>'label', '') IN ('Quotes & Orders', 'Quotations')
          )
        )
    `);

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

    // Cloud Cap seats (online) — access mode + device slots; company session lock for service only
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS client_access_mode TEXT`);
    // client_access_mode: mobile | desktop | both | NULL (unset / N/A)
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mobile_features JSONB`);
    // mobile_features: companion pack for Cap Online (non-service); NULL = defaults

    // Hotel / restaurant data hosting (SA onboard): cloud | byo_db | local_server | NULL
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS hotel_deployment TEXT`);
    // Encrypted BYO Postgres URL when hotel_deployment = byo_db
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS hotel_database_url TEXT`);

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

    // Optional Meta WhatsApp Cloud API (cloud tenants) — tokens encrypted at rest; never expose to client session
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_business_enabled BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_send_mode TEXT`);
    // whatsapp_send_mode: company | company_selected | per_user
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_waba_id TEXT`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_display_phone TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_api_allowed BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT`);
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_auto_settings JSONB DEFAULT '{"sale":true,"salary":false,"payment":false}'::jsonb`,
    );

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

    // Books / Accounting mode (Miracle-compatible double-entry) — parallel to distribution ops
    await client.query(`
      CREATE TABLE IF NOT EXISTS book_financial_years (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        label TEXT,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        external_ref TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, code)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_fy_tenant ON book_financial_years(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_settings (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        lock_date DATE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_account_groups (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        parent_id TEXT,
        nature TEXT,
        group_code TEXT,
        external_ref TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, external_ref)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_groups_tenant ON book_account_groups(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_ledgers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        group_id TEXT,
        nature TEXT,
        ledger_type TEXT,
        gstin TEXT,
        opening_balance NUMERIC(18,2) DEFAULT 0,
        opening_side TEXT,
        is_system BOOLEAN DEFAULT false,
        external_ref TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, external_ref)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_ledgers_tenant ON book_ledgers(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_ledgers_name ON book_ledgers(tenant_id, name)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_ledger_details (
        ledger_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        address1 TEXT,
        address2 TEXT,
        address3 TEXT,
        city TEXT,
        state TEXT,
        state_code TEXT,
        pincode TEXT,
        phone TEXT,
        mobile TEXT,
        email TEXT,
        contact_person TEXT,
        PRIMARY KEY (ledger_id, tenant_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_products (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT,
        unit TEXT,
        hsn_code TEXT,
        sale_rate NUMERIC(18,2) DEFAULT 0,
        purchase_rate NUMERIC(18,2) DEFAULT 0,
        mrp NUMERIC(18,2) DEFAULT 0,
        tax_class TEXT,
        external_ref TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, external_ref)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_products_tenant ON book_products(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_vouchers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        financial_year_id TEXT,
        voucher_type TEXT NOT NULL,
        voucher_date DATE NOT NULL,
        voucher_number TEXT,
        party_ledger_id TEXT,
        contra_ledger_id TEXT,
        amount NUMERIC(18,2) DEFAULT 0,
        narration TEXT,
        miracle_type TEXT,
        miracle_subtype TEXT,
        external_ref TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, external_ref)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_vouchers_tenant ON book_vouchers(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_vouchers_date ON book_vouchers(tenant_id, voucher_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_vouchers_type ON book_vouchers(tenant_id, voucher_type)`);
    await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS instrument_ref TEXT`);
    await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS maturity_date DATE`);
    await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS memo_status TEXT`);
    await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS realised_voucher_id TEXT`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_voucher_entries (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        voucher_id TEXT NOT NULL,
        line_no INT DEFAULT 0,
        ledger_id TEXT NOT NULL,
        contra_ledger_id TEXT,
        debit NUMERIC(18,2) DEFAULT 0,
        credit NUMERIC(18,2) DEFAULT 0,
        narration TEXT,
        external_ref TEXT
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_book_ventries_voucher ON book_voucher_entries(tenant_id, voucher_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_book_ventries_ledger ON book_voucher_entries(tenant_id, ledger_id)`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_voucher_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        voucher_id TEXT NOT NULL,
        line_no INT DEFAULT 0,
        product_id TEXT,
        qty NUMERIC(18,4) DEFAULT 0,
        rate NUMERIC(18,2) DEFAULT 0,
        amount NUMERIC(18,2) DEFAULT 0,
        external_ref TEXT
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_book_vitems_voucher ON book_voucher_items(tenant_id, voucher_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_book_vitems_product ON book_voucher_items(tenant_id, product_id)`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_import_jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source TEXT NOT NULL DEFAULT 'miracle',
        company_name TEXT,
        miracle_version TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        summary JSONB,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_book_import_jobs_tenant ON book_import_jobs(tenant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_bank_recon_marks (
        tenant_id TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        ledger_id TEXT NOT NULL,
        reconciled_on DATE NOT NULL,
        PRIMARY KEY (tenant_id, entry_id)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_book_brm_ledger ON book_bank_recon_marks(tenant_id, ledger_id, reconciled_on)`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_bank_recon_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        ledger_id TEXT NOT NULL,
        as_of DATE NOT NULL,
        statement_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, ledger_id, as_of)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_book_brs_ledger ON book_bank_recon_sessions(tenant_id, ledger_id)`,
    );

    await client.query(`
      UPDATE tenants SET tab_config = tab_config || '{"books":{"label":"Books","visible":false},"book_ledgers":{"label":"Ledgers","visible":false},"book_vouchers":{"label":"Vouchers","visible":false},"book_products":{"label":"Book Products","visible":false},"book_import":{"label":"Miracle Import","visible":false}}'::jsonb
      WHERE tab_config IS NOT NULL
        AND NOT (tab_config ? 'books')
    `);

    // Retired business type: Accounting (Miracle) → manufacturer (Miracle import via Masters)
    await client.query(`
      UPDATE tenants SET business_type = 'manufacturer' WHERE business_type = 'accounting'
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
      'barcode_label_templates',
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
      // FORCE RLS: even the pool owner (table creator) must satisfy the RLS policy.
      // app.tenant_id is set transaction-locally by the pool.query() override above,
      // so every tenant request carries the correct context automatically.
      // SA operations that need cross-tenant access use client.query() directly on
      // a connection they control, bypassing the pool.query() override.
      await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
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
    logger.info('Row Level Security policies applied (FORCE enabled)');

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
    // Idempotent: prior deploys may already own fixed id SA1 and/or this email
    // (Neon shared across dg-erp → dhandho-2kdx). Email-only checks miss SA1
    // with a different email and crash boot on super_admins_pkey.
    const existing = await pool.query('SELECT id FROM super_admins WHERE id = $1 OR email = $2 LIMIT 1', [
      'SA1',
      superAdminEmail,
    ]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(superAdminPassword, 12);
      await pool.query(
        `INSERT INTO super_admins (id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        ['SA1', superAdminEmail, hash, 'Platform Owner', 'owner'],
      );
      logger.info('Super admin created');
    } else {
      logger.info('Super admin already present — seed skipped');
    }
  }

  await ensureDefaultPlans();
}

export async function initDatabase() {
  try {
    await initSchema();
    // Run versioned migrations — new schema changes go in server/migrations/index.ts
    const { runMigrations } = await import('./migrations/runner');
    const { migrations } = await import('./migrations/index');
    await runMigrations(pool, migrations);
    await seedPlatformData();
    logger.info('Database ready', {
      host: databaseHostname(process.env.DATABASE_URL || '') || undefined,
    });
  } catch (err) {
    const hint = formatDbConnectError(err);
    logger.fatal('Failed to initialize database', {
      error: hint,
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Single-arg Error — electron tsc targets ES2020 (no `{ cause }` options bag)
    throw new Error(hint);
  }
}
