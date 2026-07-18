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
  chatbot_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'Admin',
  phone TEXT,
  address TEXT,
  company_name TEXT,
  gst_number TEXT,
  auto_whatsapp BOOLEAN DEFAULT false,
  default_gst_rate NUMERIC DEFAULT 18,
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
  payment_method TEXT DEFAULT 'Cash',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_debit_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  note_number TEXT,
  note_type TEXT NOT NULL,
  vendor_id TEXT,
  vendor_name TEXT,
  customer_name TEXT,
  note_date DATE,
  reason TEXT,
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  gst_rate NUMERIC DEFAULT 18,
  gst_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  reference_invoice TEXT,
  reference_type TEXT,
  reference_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_number TEXT,
  quotation_number TEXT,
  vendor_id TEXT,
  vendor_name TEXT,
  client_name TEXT,
  client_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  quotation_date DATE,
  valid_until DATE,
  status TEXT DEFAULT 'Draft',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  gst_rate NUMERIC DEFAULT 18,
  gst_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  notes TEXT,
  converted_batch_id TEXT,
  converted_invoice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number TEXT,
  vendor_id TEXT,
  vendor_name TEXT,
  client_name TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_gst_number TEXT,
  order_date DATE,
  required_date DATE,
  status TEXT DEFAULT 'Pending',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  gst_rate NUMERIC DEFAULT 18,
  gst_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  notes TEXT,
  fulfilled_batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS standalone_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number TEXT,
  customer_name TEXT,
  client_name TEXT,
  client_id TEXT,
  customer_gstin TEXT,
  customer_address TEXT,
  customer_phone TEXT,
  party_type TEXT,
  party_id TEXT,
  status TEXT DEFAULT 'draft',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  tax_total NUMERIC DEFAULT 0,
  tax_cgst NUMERIC DEFAULT 0,
  tax_sgst NUMERIC DEFAULT 0,
  tax_igst NUMERIC DEFAULT 0,
  is_interstate BOOLEAN DEFAULT false,
  grand_total NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  notes TEXT,
  terms TEXT,
  invoice_date DATE,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_purchases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id TEXT,
  product_id TEXT,
  barcode TEXT,
  supplier_id TEXT,
  purchase_date DATE,
  cost_price NUMERIC DEFAULT 0,
  gst_applied BOOLEAN DEFAULT false,
  billed_price NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  qty NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id TEXT,
  amount NUMERIC NOT NULL,
  payment_date DATE,
  payment_method TEXT DEFAULT 'Cash',
  reference_number TEXT,
  notes TEXT,
  batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id TEXT,
  amount NUMERIC NOT NULL,
  payment_date DATE,
  method TEXT,
  payment_method TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_lists (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product_id TEXT,
  vendor_id TEXT,
  min_qty INTEGER DEFAULT 1,
  max_qty INTEGER,
  price NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  valid_from DATE,
  valid_to DATE,
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
  role TEXT,
  address TEXT,
  salary NUMERIC DEFAULT 0,
  joining_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id TEXT,
  staff_name TEXT,
  amount NUMERIC NOT NULL,
  payment_type TEXT DEFAULT 'salary',
  payment_date DATE,
  payment_method TEXT DEFAULT 'Cash',
  reference_number TEXT,
  notes TEXT,
  month TEXT,
  year INT,
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

/** Migrations for existing PGlite installs (CREATE TABLE IF NOT EXISTS alone is not enough). */
export const SERVICE_MOBILE_MIGRATIONS_SQL = `
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS customer_gstin TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS party_type TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS party_id TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS tax_total NUMERIC DEFAULT 0;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS tax_cgst NUMERIC DEFAULT 0;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS tax_sgst NUMERIC DEFAULT 0;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS tax_igst NUMERIC DEFAULT 0;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN DEFAULT false;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC DEFAULT 0;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS staff_name TEXT;
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'salary';
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash';
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS month TEXT;
ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS year INT;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS min_qty INTEGER DEFAULT 1;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS max_qty INTEGER;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gst_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_whatsapp BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_gst_rate NUMERIC DEFAULT 18;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_number TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_date DATE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 18;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS gst_amount NUMERIC DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS converted_batch_id TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS converted_invoice_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_gst_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS required_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 18;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_batch_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes TEXT;
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
  chatbot: { label: 'Chatbot', visible: false },
  settings: { label: 'Settings', visible: true },
};
