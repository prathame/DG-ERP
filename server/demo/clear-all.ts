import { db } from '../db';
import { hashPassword } from '../utils/helpers';

console.log('Clearing ALL data...\n');

db.prepare('PRAGMA foreign_keys = OFF').run();

const tables = [
  'audit_log',
  'vendor_payments',
  'vendor_reminder_settings',
  'rewards',
  'product_replacements',
  'warranties',
  'product_sales',
  'product_distribution',
  'product_inventory',
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
    const count = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`  Cleared ${table} (${count} rows)`);
  } catch (e) {
    console.warn(`  Skip ${table}: ${(e as Error).message}`);
  }
}

try {
  db.prepare('DELETE FROM redemption_settings').run();
  db.prepare('INSERT INTO redemption_settings (id, min_balance, min_points) VALUES (?, ?, ?)').run('default', 100, 50);
  console.log('  Reset redemption_settings');
} catch (_) {}

db.prepare('PRAGMA foreign_keys = ON').run();

// Recreate essentials
db.prepare('INSERT INTO vendors (id, name) VALUES (?, ?)').run('OWNER', 'Owner');
console.log('\n  Created Owner vendor');

db.prepare(`
  INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('U1', 'admin@splendor.com', hashPassword('admin123'), 'Admin', null, null, 'Super Admin', 'Splendor Pump LLP');
console.log('  Created admin user (admin@splendor.com / admin123)');

console.log('\n═══════════════════════════════════════════');
console.log('  All data cleared!');
console.log('  Database is empty except:');
console.log('    - Owner vendor');
console.log('    - Admin user (admin@splendor.com / admin123)');
console.log('═══════════════════════════════════════════');
