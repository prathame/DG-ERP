import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const hashPassword = (p: string) => crypto.createHash('sha256').update(p).digest('hex');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'splendor.db');

export const db = new Database(dbPath);

// Initialize schema (order matters for FKs)
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_reward_points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    vendor_id TEXT REFERENCES vendors(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    barcode TEXT,
    category_id TEXT REFERENCES categories(id),
    description TEXT,
    reward_points_value INTEGER NOT NULL DEFAULT 0,
    manufacturing_date TEXT,
    batch_number TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Sold', 'Returned')),
    warranty_months INTEGER NOT NULL DEFAULT 12,
    price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS product_inventory (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    barcode TEXT NOT NULL UNIQUE,
    batch_id TEXT,
    status TEXT NOT NULL DEFAULT 'InStock' CHECK(status IN ('InStock', 'Distributed', 'Sold')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS product_distribution (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    barcode TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    distribution_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Distributed' CHECK(status IN ('Distributed', 'Sold', 'Returned', 'Replaced', 'Damaged')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    UNIQUE(barcode)
  );

  CREATE TABLE IF NOT EXISTS product_sales (
    id TEXT PRIMARY KEY,
    barcode TEXT NOT NULL UNIQUE,
    product_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    purchase_date TEXT NOT NULL,
    reward_points_earned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
  );

  CREATE TABLE IF NOT EXISTS reward_rules (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    products_sold_threshold INTEGER NOT NULL,
    reward_points INTEGER NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS warranties (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    barcode TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    activation_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Expired', 'Under Claim')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Sales', 'Purchase', 'Expense')),
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Completed' CHECK(status IN ('Completed', 'Pending')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    points INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Earned', 'Redeemed')),
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    role TEXT NOT NULL DEFAULT 'Admin',
    company_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS banks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_number TEXT,
    bank_name TEXT,
    branch TEXT,
    ifsc_code TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Performance indexes for fast search
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_product_inventory_barcode ON product_inventory(barcode);
    CREATE INDEX IF NOT EXISTS idx_product_inventory_product_status ON product_inventory(product_id, status);
    CREATE INDEX IF NOT EXISTS idx_product_distribution_barcode ON product_distribution(barcode);
    CREATE INDEX IF NOT EXISTS idx_product_distribution_vendor ON product_distribution(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_product_sales_barcode ON product_sales(barcode);
    CREATE INDEX IF NOT EXISTS idx_product_sales_vendor ON product_sales(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_product_sales_customer_phone ON product_sales(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_warranties_barcode ON warranties(barcode);
    CREATE INDEX IF NOT EXISTS idx_warranties_customer_name ON warranties(customer_name);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_vendor ON customers(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
  `);
} catch (_) {}

// Migrations for existing tables
function addColumnIfMissing(table: string, column: string, def: string) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!info.some((r) => r.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  } catch (_) {}
}

addColumnIfMissing('customers', 'vendor_id', 'TEXT REFERENCES vendors(id)');
addColumnIfMissing('products', 'barcode', 'TEXT');
addColumnIfMissing('products', 'category_id', 'TEXT REFERENCES categories(id)');
addColumnIfMissing('products', 'description', 'TEXT');
addColumnIfMissing('products', 'reward_points_value', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('products', 'manufacturing_date', 'TEXT');
addColumnIfMissing('products', 'batch_number', 'TEXT');
addColumnIfMissing('products', 'status', "TEXT NOT NULL DEFAULT 'Active'");
addColumnIfMissing('vendors', 'total_sales', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('vendors', 'total_reward_points', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('product_inventory', 'batch_id', 'TEXT');
addColumnIfMissing('product_sales', 'customer_id', 'TEXT REFERENCES customers(id)');
addColumnIfMissing('product_sales', 'sale_price', 'REAL');
addColumnIfMissing('warranties', 'replaced_barcode', 'TEXT');
addColumnIfMissing('users', 'permissions', 'TEXT');
addColumnIfMissing('users', 'vendor_id', 'TEXT REFERENCES vendors(id)');
addColumnIfMissing('users', 'auto_whatsapp', "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing('users', 'gst_number', 'TEXT');
addColumnIfMissing('users', 'default_gst_rate', 'REAL NOT NULL DEFAULT 18');
addColumnIfMissing('product_distribution', 'discount_percent', 'REAL NOT NULL DEFAULT 0');
addColumnIfMissing('product_distribution', 'net_price', 'REAL');
addColumnIfMissing('products', 'hsn_code', 'TEXT');
addColumnIfMissing('products', 'gst_rate', 'REAL NOT NULL DEFAULT 18');
addColumnIfMissing('rewards', 'vendor_id', 'TEXT REFERENCES vendors(id)');
addColumnIfMissing('rewards', 'sale_id', 'TEXT REFERENCES product_sales(id)');
addColumnIfMissing('product_replacements', 'vendor_id', 'TEXT REFERENCES vendors(id)');

// Audit log: track who did what
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
  `);
} catch (_) {}

// Vendor payments: track money received from vendors
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_payments (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT DEFAULT 'Cash',
      reference_number TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
  `);
} catch (_) {}

// Vendor reminder settings: auto-remind for pending payments
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_reminder_settings (
      vendor_id TEXT PRIMARY KEY REFERENCES vendors(id),
      enabled INTEGER NOT NULL DEFAULT 0,
      reminder_days INTEGER NOT NULL DEFAULT 7,
      last_reminder_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
} catch (_) {}

// Product replacements: track warranty replacements (old barcode -> new barcode)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_replacements (
    id TEXT PRIMARY KEY,
    old_barcode TEXT NOT NULL,
    new_barcode TEXT NOT NULL,
    warranty_id TEXT REFERENCES warranties(id),
    product_id TEXT REFERENCES products(id),
    product_name TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    replaced_date TEXT NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
  `);
} catch (_) {}

// Redemption settings: min balance to redeem, min points per redemption
try {
  db.exec(`
  CREATE TABLE IF NOT EXISTS redemption_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      min_balance INTEGER NOT NULL DEFAULT 100,
      min_points INTEGER NOT NULL DEFAULT 50
    )
  `);
  const row = db.prepare('SELECT id FROM redemption_settings WHERE id = ?').get('default');
  if (!row) {
    db.prepare('INSERT INTO redemption_settings (id, min_balance, min_points) VALUES (?, ?, ?)').run('default', 100, 50);
  }
} catch (_) {}

// Backfill customer_id for existing product_sales (match by phone to first customer)
try {
  const hasCol = db.prepare("PRAGMA table_info(product_sales)").all() as { name: string }[];
  if (hasCol.some((r) => r.name === 'customer_id')) {
    const unlinked = db.prepare('SELECT id, customer_phone FROM product_sales WHERE customer_id IS NULL').all() as { id: string; customer_phone: string | null }[];
    for (const row of unlinked) {
      const c = db.prepare("SELECT id FROM customers WHERE TRIM(COALESCE(phone, '')) = TRIM(COALESCE(?, ''))").get(row.customer_phone ?? '') as { id: string } | undefined;
      if (c) db.prepare('UPDATE product_sales SET customer_id = ? WHERE id = ?').run(c.id, row.id);
    }
  }
} catch (_) {}

// Migration: remove serial_number, use barcode (SQLite 3.35+)
try {
  const prodInfo = db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
  if (prodInfo.some((r) => r.name === 'serial_number')) {
    db.exec('ALTER TABLE products DROP COLUMN serial_number');
  }
} catch (_) {}
try {
  const warrInfo = db.prepare('PRAGMA table_info(warranties)').all() as { name: string }[];
  if (warrInfo.some((r) => r.name === 'serial_number')) {
    if (!warrInfo.some((r) => r.name === 'barcode')) {
      db.exec('ALTER TABLE warranties ADD COLUMN barcode TEXT');
      db.exec('UPDATE warranties SET barcode = serial_number');
    }
    db.exec('ALTER TABLE warranties DROP COLUMN serial_number');
  }
} catch (_) {}

// Migration: ensure Owner vendor exists (for direct sales from inventory)
try {
  const owner = db.prepare('SELECT id FROM vendors WHERE id = ?').get('OWNER');
  if (!owner) {
    db.prepare('INSERT INTO vendors (id, name) VALUES (?, ?)').run('OWNER', 'Owner');
  }
} catch (_) {}

// Migration: ensure default admin user exists (email: admin@splendor.com, password: admin123)
try {
  const usersExist = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (usersExist) {
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@splendor.com');
    if (!admin) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('U1', 'admin@splendor.com', hashPassword('admin123'), 'Admin', null, null, 'Super Admin', 'Splendor Pump LLP');
    }
  }
} catch (_) {}

// Migration: populate product_inventory from existing products (barcode + stock)
try {
  const invExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_inventory'").get();
  if (invExists) {
    const count = db.prepare('SELECT COUNT(*) as c FROM product_inventory').get() as { c: number };
    if (count.c === 0) {
      const prods = db.prepare('SELECT id, barcode, stock FROM products WHERE stock > 0').all() as { id: string; barcode: string | null; stock: number }[];
      for (const p of prods) {
        const base = p.barcode || p.id;
        for (let i = 1; i <= p.stock; i++) {
          const barcode = p.stock === 1 ? base : `${base}-${i}`;
          try {
            db.prepare('INSERT INTO product_inventory (id, product_id, barcode, status) VALUES (?, ?, ?, ?)')
              .run(`IM-${p.id}-${i}`, p.id, barcode, 'InStock');
          } catch (_) {}
        }
      }
    }
  }
} catch (_) {}

// Migration: add 'Replaced' status to product_distribution (for replacement tracking)
try {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='product_distribution'").get() as { sql: string } | undefined;
  const needsMigration = schema && !schema.sql.includes("'Damaged'");
  if (needsMigration) {
    db.exec(`DROP TABLE IF EXISTS product_distribution_new`);
    db.exec(`
      CREATE TABLE product_distribution_new (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        distribution_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Distributed' CHECK(status IN ('Distributed', 'Sold', 'Returned', 'Replaced', 'Damaged')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id),
        UNIQUE(barcode)
      );
      INSERT INTO product_distribution_new SELECT * FROM product_distribution;
      DROP TABLE product_distribution;
      ALTER TABLE product_distribution_new RENAME TO product_distribution;
    `);
  }
} catch (_) {}

// Backfill rewards from product_sales (earned points for each sale)
try {
  const hasSaleId = db.prepare("PRAGMA table_info(rewards)").all() as { name: string }[];
  if (hasSaleId.some((c) => c.name === 'sale_id')) {
    const sales = db.prepare(`
      SELECT ps.id, ps.product_id, ps.vendor_id, ps.purchase_date, ps.reward_points_earned
      FROM product_sales ps
      WHERE NOT EXISTS (SELECT 1 FROM rewards r WHERE r.sale_id = ps.id)
    `).all() as { id: string; product_id: string; vendor_id: string; purchase_date: string; reward_points_earned: number }[];
    for (const s of sales) {
      const p = db.prepare('SELECT name FROM products WHERE id = ?').get(s.product_id) as { name: string } | undefined;
      const rid = `R${Date.now()}-${s.id}`;
      db.prepare(`
        INSERT INTO rewards (id, user_id, points, type, description, date, vendor_id, sale_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(rid, 'D1', s.reward_points_earned, 'Earned', `${p?.name ?? 'Product'} sold`, s.purchase_date, s.vendor_id, s.id);
    }
  }
} catch (_) {}
