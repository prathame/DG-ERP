import { db } from './db';

// Remove dummy/seed rewards so points history shows only real data
try {
  db.prepare("DELETE FROM rewards WHERE id IN ('R1', 'R2')").run();
} catch (_) {}

// Seed categories first
const categories = [
  { id: 'CAT1', name: 'Submersible' },
  { id: 'CAT2', name: 'Monoblock' },
  { id: 'CAT3', name: 'Openwell' },
  { id: 'CAT4', name: 'Electronics' },
  { id: 'CAT5', name: 'Accessories' },
];
const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)');
for (const c of categories) {
  insertCategory.run(c.id, c.name);
}

// Seed initial data
const products = [
  { id: '1', name: 'Splendor Submersible Pump 5HP', barcode: '8901234567890', category_id: 'CAT1', description: '5HP submersible pump', reward_points_value: 50, warranty_months: 24, price: 12500, stock: 45 },
  { id: '2', name: 'Splendor Monoblock Pump 2HP', barcode: '8901234567891', category_id: 'CAT2', description: '2HP monoblock pump', reward_points_value: 30, warranty_months: 12, price: 8500, stock: 120 },
  { id: '3', name: 'Splendor Openwell Pump 3HP', barcode: '8901234567892', category_id: 'CAT3', description: '3HP openwell pump', reward_points_value: 40, warranty_months: 18, price: 10200, stock: 30 },
];

const warranties = [
  { id: 'W1', product_id: '1', barcode: '8901234567890', customer_name: 'Rajesh Kumar', customer_phone: '9876543210', activation_date: '2023-10-15', expiry_date: '2025-10-15', status: 'Active' },
  { id: 'W2', product_id: '2', barcode: '8901234567891', customer_name: 'Amit Shah', customer_phone: '9123456789', activation_date: '2024-01-20', expiry_date: '2025-01-20', status: 'Active' },
  { id: 'W3', product_id: '3', barcode: '8901234567892', customer_name: 'Suresh Raina', customer_phone: '9988776655', activation_date: '2022-05-10', expiry_date: '2023-11-10', status: 'Expired' },
];

const transactions = [
  { id: 'T1', date: '2024-03-01', type: 'Sales', amount: 25000, description: 'Bulk Sale to Dealer A', status: 'Completed' },
  { id: 'T2', date: '2024-03-02', type: 'Purchase', amount: 15000, description: 'Raw Material - Copper Wire', status: 'Completed' },
  { id: 'T3', date: '2024-03-03', type: 'Expense', amount: 2000, description: 'Electricity Bill', status: 'Completed' },
  { id: 'T4', date: '2024-03-04', type: 'Sales', amount: 12000, description: 'Direct Customer Sale', status: 'Pending' },
];

const customers = [
  { id: 'C1', name: 'Rajesh Kumar', phone: '9876543210', email: 'rajesh@example.com', address: 'Mumbai, Maharashtra', vendor_id: 'V1' },
  { id: 'C2', name: 'Amit Shah', phone: '9123456789', email: 'amit@example.com', address: 'Ahmedabad, Gujarat', vendor_id: 'V1' },
  { id: 'C3', name: 'Priya Singh', phone: '9988776655', email: 'priya@example.com', address: 'Delhi', vendor_id: 'V2' },
  { id: 'C4', name: 'Direct Factory Buyer', phone: '9999888877', email: 'direct@example.com', address: 'Bangalore', vendor_id: null },
];

const vendors = [
  { id: 'V1', name: 'Pump Supplies Co', contact_person: 'Suresh', phone: '9876123456', email: 'vendor1@example.com', address: 'Chennai' },
  { id: 'V2', name: 'Industrial Parts Ltd', contact_person: 'Ramesh', phone: '9123456780', email: 'vendor2@example.com', address: 'Pune' },
];

const banks = [
  { id: 'B1', name: 'Main Account', account_number: '1234567890', bank_name: 'HDFC Bank', branch: 'Mumbai Main', ifsc_code: 'HDFC0001234' },
  { id: 'B2', name: 'Operations', account_number: '0987654321', bank_name: 'ICICI Bank', branch: 'Delhi Central', ifsc_code: 'ICIC0005678' },
];

const insertProduct = db.prepare(`
  INSERT OR REPLACE INTO products (id, name, barcode, category_id, description, reward_points_value, warranty_months, price, stock)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertWarranty = db.prepare(`
  INSERT OR IGNORE INTO warranties (id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTransaction = db.prepare(`
  INSERT OR IGNORE INTO transactions (id, date, type, amount, description, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertCustomer = db.prepare(`
  INSERT INTO customers (id, name, phone, email, address, vendor_id)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET vendor_id = excluded.vendor_id
`);

const insertVendor = db.prepare(`
  INSERT OR IGNORE INTO vendors (id, name, contact_person, phone, email, address, total_sales, total_reward_points)
  VALUES (?, ?, ?, ?, ?, ?, 0, 0)
`);

const insertBank = db.prepare(`
  INSERT OR IGNORE INTO banks (id, name, account_number, bank_name, branch, ifsc_code)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const p of products) {
  insertProduct.run(p.id, p.name, p.barcode ?? null, p.category_id, p.description ?? null, p.reward_points_value ?? 0, p.warranty_months, p.price, p.stock);
}

// Seed reward rules
const rewardRules = [
  { id: 'RR1', category_id: 'CAT1', products_sold_threshold: 10, reward_points: 100, description: '10 Submersible sold = 100 pts' },
  { id: 'RR2', category_id: 'CAT2', products_sold_threshold: 5, reward_points: 50, description: '5 Monoblock sold = 50 pts' },
];
const insertRewardRule = db.prepare(`
  INSERT OR IGNORE INTO reward_rules (id, category_id, products_sold_threshold, reward_points, description)
  VALUES (?, ?, ?, ?, ?)
`);
for (const rr of rewardRules) {
  insertRewardRule.run(rr.id, rr.category_id, rr.products_sold_threshold, rr.reward_points, rr.description);
}
for (const w of warranties) {
  insertWarranty.run(w.id, w.product_id, w.barcode, w.customer_name, w.customer_phone, w.activation_date, w.expiry_date, w.status);
}
for (const t of transactions) {
  insertTransaction.run(t.id, t.date, t.type, t.amount, t.description, t.status);
}
for (const v of vendors) {
  insertVendor.run(v.id, v.name, v.contact_person, v.phone, v.email, v.address);
}
// Customers after vendors (customers.vendor_id references vendors)
for (const c of customers) {
  insertCustomer.run(c.id, c.name, c.phone, c.email, c.address, c.vendor_id);
}
for (const b of banks) {
  insertBank.run(b.id, b.name, b.account_number, b.bank_name, b.branch, b.ifsc_code);
}

// Populate product_inventory from products (for products with stock but no inventory rows)
try {
  const prods = db.prepare('SELECT id, barcode, stock FROM products WHERE stock > 0').all() as { id: string; barcode: string | null; stock: number }[];
  for (const p of prods) {
    const existing = db.prepare('SELECT 1 FROM product_inventory WHERE product_id = ?').get(p.id);
    if (existing) continue;
    const base = p.barcode || p.id;
    for (let i = 1; i <= p.stock; i++) {
      const barcode = p.stock === 1 ? base : `${base}-${i}`;
      try {
        db.prepare('INSERT INTO product_inventory (id, product_id, barcode, status) VALUES (?, ?, ?, ?)')
          .run(`IS-${p.id}-${i}`, p.id, barcode, 'InStock');
      } catch (_) {}
    }
  }
} catch (_) {}

console.log('Seed data inserted.');
