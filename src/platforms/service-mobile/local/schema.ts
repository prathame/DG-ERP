/** Minimal Postgres schema for Service Mobile (service business type). */
export const SERVICE_MOBILE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_products INT DEFAULT -1,
  max_vendors INT DEFAULT -1,
  max_users INT DEFAULT -1,
  max_barcodes INT DEFAULT -1,
  features JSONB DEFAULT '{}',
  price_monthly NUMERIC DEFAULT 0,
  price_yearly NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan_id TEXT REFERENCES plans(id),
  status TEXT DEFAULT 'active',
  business_type TEXT DEFAULT 'service',
  tab_config JSONB DEFAULT '{}',
  admin_email TEXT,
  barcode_system_enabled BOOLEAN DEFAULT false,
  multi_language_enabled BOOLEAN DEFAULT true,
  inventory_tracking_enabled BOOLEAN DEFAULT false,
  vendor_portal_enabled BOOLEAN DEFAULT false,
  quotations_enabled BOOLEAN DEFAULT true,
  accounts_enabled BOOLEAN DEFAULT true,
  purchases_enabled BOOLEAN DEFAULT true,
  chatbot_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'Admin',
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  category_id TEXT,
  price NUMERIC DEFAULT 0,
  gst_percent NUMERIC DEFAULT 18,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS banks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_number TEXT,
  ifsc TEXT,
  balance NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT,
  amount NUMERIC NOT NULL,
  description TEXT,
  expense_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_number TEXT,
  client_name TEXT,
  client_id TEXT,
  status TEXT DEFAULT 'draft',
  items JSONB DEFAULT '[]',
  total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number TEXT,
  client_name TEXT,
  status TEXT DEFAULT 'open',
  items JSONB DEFAULT '[]',
  total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS standalone_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number TEXT,
  client_name TEXT,
  client_id TEXT,
  status TEXT DEFAULT 'unpaid',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  invoice_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id TEXT,
  amount NUMERIC NOT NULL,
  payment_date DATE,
  method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_lists (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bill_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  source TEXT DEFAULT 'system',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id TEXT,
  amount NUMERIC NOT NULL,
  payment_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sm_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly, is_active)
VALUES ('LOCAL', 'Service Mobile License', -1, -1, 1, -1, '{}', 0, 0, true)
ON CONFLICT (id) DO NOTHING;
`;

export const SERVICE_TAB_PRESET: Record<string, { label: string; visible: boolean }> = {
  analytics: { label: 'Analytics', visible: true },
  masters: { label: 'Masters', visible: true },
  inventory: { label: 'Inventory', visible: false },
  distribution: { label: 'Distribution', visible: false },
  sales: { label: 'Sales Entry', visible: false },
  purchases: { label: 'Expenses', visible: true },
  verification: { label: 'Search / Verify', visible: false },
  quotations: { label: 'Quotes & Orders', visible: true },
  invoices: { label: 'Invoices', visible: true },
  finance: { label: 'Invoice Finance', visible: true },
  accounts: { label: 'Accounts', visible: true },
  warranty: { label: 'Warranty', visible: false },
  replacements: { label: 'Replacements', visible: false },
  rewards: { label: 'Rewards', visible: false },
  chatbot: { label: 'Chatbot', visible: true },
  settings: { label: 'Settings', visible: true },
};
