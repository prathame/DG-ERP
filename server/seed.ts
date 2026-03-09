import { db } from './db';

// Seed initial data
const products = [
  { id: '1', name: 'Splendor Submersible Pump 5HP', serial_number: 'SP-5HP-001', category: 'Submersible', warranty_months: 24, price: 12500, stock: 45 },
  { id: '2', name: 'Splendor Monoblock Pump 2HP', serial_number: 'SP-2HP-042', category: 'Monoblock', warranty_months: 12, price: 8500, stock: 120 },
  { id: '3', name: 'Splendor Openwell Pump 3HP', serial_number: 'SP-3HP-089', category: 'Openwell', warranty_months: 18, price: 10200, stock: 30 },
];

const warranties = [
  { id: 'W1', product_id: '1', serial_number: 'SP-5HP-001', customer_name: 'Rajesh Kumar', customer_phone: '9876543210', activation_date: '2023-10-15', expiry_date: '2025-10-15', status: 'Active' },
  { id: 'W2', product_id: '2', serial_number: 'SP-2HP-042', customer_name: 'Amit Shah', customer_phone: '9123456789', activation_date: '2024-01-20', expiry_date: '2025-01-20', status: 'Active' },
  { id: 'W3', product_id: '3', serial_number: 'SP-3HP-089', customer_name: 'Suresh Raina', customer_phone: '9988776655', activation_date: '2022-05-10', expiry_date: '2023-11-10', status: 'Expired' },
];

const transactions = [
  { id: 'T1', date: '2024-03-01', type: 'Sales', amount: 25000, description: 'Bulk Sale to Dealer A', status: 'Completed' },
  { id: 'T2', date: '2024-03-02', type: 'Purchase', amount: 15000, description: 'Raw Material - Copper Wire', status: 'Completed' },
  { id: 'T3', date: '2024-03-03', type: 'Expense', amount: 2000, description: 'Electricity Bill', status: 'Completed' },
  { id: 'T4', date: '2024-03-04', type: 'Sales', amount: 12000, description: 'Direct Customer Sale', status: 'Pending' },
];

const rewards = [
  { id: 'R1', user_id: 'D1', points: 500, type: 'Earned', description: 'Target Achievement Bonus', date: '2024-03-01' },
  { id: 'R2', user_id: 'D1', points: 100, type: 'Redeemed', description: 'Gift Voucher Redemption', date: '2024-03-05' },
];

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products (id, name, serial_number, category, warranty_months, price, stock)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertWarranty = db.prepare(`
  INSERT OR IGNORE INTO warranties (id, product_id, serial_number, customer_name, customer_phone, activation_date, expiry_date, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTransaction = db.prepare(`
  INSERT OR IGNORE INTO transactions (id, date, type, amount, description, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertReward = db.prepare(`
  INSERT OR IGNORE INTO rewards (id, user_id, points, type, description, date)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const p of products) {
  insertProduct.run(p.id, p.name, p.serial_number, p.category, p.warranty_months, p.price, p.stock);
}
for (const w of warranties) {
  insertWarranty.run(w.id, w.product_id, w.serial_number, w.customer_name, w.customer_phone, w.activation_date, w.expiry_date, w.status);
}
for (const t of transactions) {
  insertTransaction.run(t.id, t.date, t.type, t.amount, t.description, t.status);
}
for (const r of rewards) {
  insertReward.run(r.id, r.user_id, r.points, r.type, r.description, r.date);
}

console.log('Seed data inserted.');
