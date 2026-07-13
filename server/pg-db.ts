import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DATABASE_POOL_SIZE ? parseInt(process.env.DATABASE_POOL_SIZE, 10) : (process.env.NODE_ENV === 'production' ? 10 : 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(process.env.DATABASE_URL?.includes('render.com') || process.env.DATABASE_URL?.includes('neon.tech') || process.env.DATABASE_SSL === 'true'
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
        footer_text TEXT DEFAULT 'Powered by DG ERP Management',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vendor_portal_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS barcode_system_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS inventory_tracking_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS multi_language_enabled BOOLEAN DEFAULT true');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ');
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tab_config JSONB DEFAULT '${JSON.stringify({
      dashboard:    { label: 'Dashboard',      visible: true },
      inventory:    { label: 'Inventory',      visible: true },
      purchases:    { label: 'Purchases',      visible: true },
      distribution: { label: 'Distribution',   visible: true },
      sales:        { label: 'Sales Entry',    visible: true },
      verification: { label: 'Search / Verify', visible: true },
      warranty:     { label: 'Warranty',        visible: true },
      replacements: { label: 'Replacements',   visible: true },
      rewards:      { label: 'Rewards',         visible: true },
      finance:      { label: 'Finance',         visible: true },
      quotations:   { label: 'Quotations',      visible: true },
      accounts:     { label: 'Accounts',        visible: true },
      reports:      { label: 'Reports',          visible: true },
      chatbot:      { label: 'Chatbot',         visible: true },
      settings:     { label: 'Settings',        visible: true },
    })}'`);

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

    // Add accounts + quotations tabs to existing tenants
    await client.query(`UPDATE tenants SET tab_config = tab_config || '{"accounts":{"label":"Accounts","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'accounts'`);
    await client.query(`UPDATE tenants SET tab_config = tab_config || '{"quotations":{"label":"Quotations","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'quotations'`);

    // Add purchases tab to existing tenants
    await client.query(`UPDATE tenants SET tab_config = tab_config || '{"purchases":{"label":"Purchases","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'purchases'`);

    // Vendor GSTIN for GST reports
    await client.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_number TEXT");

    // Add reports tab to existing tenants that don't have it
    await client.query(`UPDATE tenants SET tab_config = tab_config || '{"reports":{"label":"Reports","visible":true}}'::jsonb WHERE tab_config IS NOT NULL AND NOT tab_config ? 'reports'`);

    // Pack size support
    await client.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size INTEGER DEFAULT 1");
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

    // Dispatch tracking on distributions
    await client.query("ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'pending'");
    await client.query("ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS dispatched_by TEXT");
    await client.query("ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ");

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
    await client.query('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(tenant_id, vendor_id)');

    // UNIQUE constraints — prevent duplicates at DB level
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users(tenant_id, LOWER(email))');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_name ON products(tenant_id, LOWER(name))');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tenant_name ON vendors(tenant_id, LOWER(name))');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_tenant_name ON suppliers(tenant_id, LOWER(name))');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_pi_tenant_barcode ON product_inventory(tenant_id, barcode)');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_banks_tenant_acct ON banks(tenant_id, account_number) WHERE account_number IS NOT NULL');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_tenant_num ON quotations(tenant_id, quotation_number)');

    // Missing performance indexes
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS price_includes_gst BOOLEAN DEFAULT false');
    await client.query('ALTER TABLE product_distribution ADD COLUMN IF NOT EXISTS ewb_number TEXT');
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
    await client.query('CREATE INDEX IF NOT EXISTS idx_pi_batch ON product_inventory(tenant_id, batch_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customers_vendor ON customers(tenant_id, vendor_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_warranties_product ON warranties(tenant_id, product_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ps_customer ON product_sales(tenant_id, customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_si_date ON standalone_invoices(tenant_id, invoice_date)');

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
    await client.query('CREATE INDEX IF NOT EXISTS idx_si_tenant ON standalone_invoices(tenant_id, created_at DESC)');

    // Purchase invoice number for GSTR-2B reconciliation
    await client.query("ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS invoice_number TEXT");

    // Business type
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'manufacturer'");

    // Backup settings
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN DEFAULT false");
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_frequency TEXT DEFAULT 'weekly'");
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_interval_days INTEGER DEFAULT 7");
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_last_at TIMESTAMPTZ");
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS backup_email TEXT");

    console.log('  ✓ Database schema ready');
  } finally {
    client.release();
  }
}

export async function seedPlatformData() {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!superAdminEmail || !superAdminPassword) {
    console.log('  ⚠ Set SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD env vars to create admin');
    return;
  }

  const existing = await pool.query('SELECT id FROM super_admins WHERE email = $1', [superAdminEmail]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(superAdminPassword, 12);
    await pool.query(
      'INSERT INTO super_admins (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)',
      ['SA1', superAdminEmail, hash, 'Platform Owner', 'owner']
    );
    console.log(`  ✓ Super admin created: ${superAdminEmail}`);
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
  console.log('  ✓ Plans seeded (Trial, Basic, Standard, Professional)');
}

export async function initDatabase() {
  await initSchema();
  await seedPlatformData();
  console.log('  ✓ Database ready');
}
