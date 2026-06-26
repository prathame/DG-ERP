import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.NODE_ENV === 'production' ? 10 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(process.env.DATABASE_URL?.includes('render.com') || process.env.DATABASE_URL?.includes('neon.tech')
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

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
        warranty_enabled BOOLEAN DEFAULT true,
        replacement_enabled BOOLEAN DEFAULT true,
        rewards_enabled BOOLEAN DEFAULT true,
        last_active_at TIMESTAMPTZ
      );

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
        warranty_enabled BOOLEAN DEFAULT true,
        replacement_enabled BOOLEAN DEFAULT true,
        rewards_enabled BOOLEAN DEFAULT true,
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

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        type TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'Completed',
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
        footer_text TEXT DEFAULT 'Powered by DG ERP Management',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS warranty_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS replacement_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rewards_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS finance_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bill_customization_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS multi_language_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vendor_portal_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS barcode_system_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ');

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

    console.log('✓ Schema created');
  } finally {
    client.release();
  }
}

export async function seedPlatformData() {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@spre.ai';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';

  const existing = await pool.query('SELECT id FROM super_admins WHERE email = $1', [superAdminEmail]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(superAdminPassword, 10);
    await pool.query(
      'INSERT INTO super_admins (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)',
      ['SA1', superAdminEmail, hash, 'Platform Owner', 'owner']
    );
    console.log(`✓ Super admin created: ${superAdminEmail} / ${superAdminPassword}`);
  }

  const plans = [
    ['TRIAL', 'Trial', -1, -1, -1, -1, '{"warranty":true,"replacements":true,"rewards":true,"finance":true,"chatbot":true,"billCustomization":true,"multiLanguage":true,"vendorPortal":true,"barcodeSystem":true}', 0, 0],
    ['BASIC', 'Basic', 50, 5, 3, 0, '{"warranty":false,"replacements":false,"rewards":false,"finance":true,"chatbot":false,"billCustomization":true,"multiLanguage":true,"vendorPortal":false,"barcodeSystem":false}', 499, 4999],
    ['STANDARD', 'Standard', 200, 15, 10, 5000, '{"warranty":false,"replacements":false,"rewards":false,"finance":true,"chatbot":false,"billCustomization":true,"multiLanguage":true,"vendorPortal":true,"barcodeSystem":true}', 999, 9999],
    ['PROFESSIONAL', 'Professional', -1, -1, -1, -1, '{"warranty":true,"replacements":true,"rewards":true,"finance":true,"chatbot":true,"billCustomization":true,"multiLanguage":true,"vendorPortal":true,"barcodeSystem":true}', 1999, 19999],
  ];

  for (const p of plans) {
    await pool.query(
      `INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET name = $2, max_products = $3, max_vendors = $4, max_users = $5, max_barcodes = $6, features = $7`,
      p
    );
  }
  console.log('✓ Plans seeded (Trial, Basic, Standard, Professional)');
}

export async function initDatabase() {
  await initSchema();
  await seedPlatformData();
  console.log('✓ Database ready');
}
