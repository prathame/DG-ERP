import { db } from './db';
import crypto from 'crypto';

const hashPassword = (p: string) => crypto.createHash('sha256').update(p).digest('hex');

// Disable foreign keys for bulk delete
db.prepare('PRAGMA foreign_keys = OFF').run();

const tables = [
  'rewards',
  'product_replacements',
  'warranties',
  'product_sales',
  'product_distribution',
  'product_inventory',
  'transactions',
  'reward_rules',
  'customers',
  'products',
  'categories',
  'vendors',
  'banks',
  'users',
];

for (const table of tables) {
  try {
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`Cleared ${table}`);
  } catch (e) {
    console.warn(`Skip ${table}:`, (e as Error).message);
  }
}

// Reset redemption_settings to defaults
try {
  db.prepare('DELETE FROM redemption_settings').run();
  db.prepare('INSERT INTO redemption_settings (id, min_balance, min_points) VALUES (?, ?, ?)').run('default', 100, 50);
  console.log('Reset redemption_settings');
} catch (_) {}

// Re-enable foreign keys
db.prepare('PRAGMA foreign_keys = ON').run();

// Recreate Owner vendor and default admin (required for app to work)
try {
  db.prepare('INSERT INTO vendors (id, name) VALUES (?, ?)').run('OWNER', 'Owner');
  console.log('Created Owner vendor');
} catch (_) {}

try {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('U1', 'admin@splendor.com', hashPassword('admin123'), 'Admin', null, null, 'Super Admin', 'Splendor Pump LLP');
  console.log('Created admin user (admin@splendor.com / admin123)');
} catch (_) {}

console.log('All data cleared. Database is empty except Owner vendor and admin user.');
