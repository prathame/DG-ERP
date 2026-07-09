import { pool } from '../server/pg-db';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const defaultTabConfig = {
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
};

async function seed() {
  console.log('⏳ Seeding database with preloaded tenants, users, and vendors...');
  try {
    const passwordHash = await bcrypt.hash('password123', 12);

    const tenants = [
      {
        id: 'T-RADHE-KRISHNA',
        company_name: 'Radhe Krishna Retail',
        slug: 'radhe-krishna',
        admin_email: 'admin@radhe.com',
        admin_name: 'Radhe Admin',
        plan_id: 'BASIC',
      },
      {
        id: 'T-SHIV-SHAKTI',
        company_name: 'Shiv Shakti Distributors',
        slug: 'shiv-shakti',
        admin_email: 'admin@shiv.com',
        admin_name: 'Shiv Admin',
        plan_id: 'STANDARD',
      },
      {
        id: 'T-AMBIKA-MFG',
        company_name: 'Ambika Manufacturing',
        slug: 'ambika',
        admin_email: 'admin@ambika.com',
        admin_name: 'Ambika Admin',
        plan_id: 'PROFESSIONAL',
      },
    ];

    for (const t of tenants) {
      // 1. Insert Tenant
      await pool.query(
        `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, plan_id, status, tab_config)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
         ON CONFLICT (id) DO UPDATE SET 
           company_name = $2, slug = $3, admin_email = $4, admin_name = $5, plan_id = $6, tab_config = $7`,
        [t.id, t.company_name, t.slug, t.admin_email, t.admin_name, t.plan_id, JSON.stringify(defaultTabConfig)]
      );
      console.log(`✓ Tenant created/updated: ${t.company_name} (/${t.slug})`);

      // 2. Insert Tenant Admin User
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5, 'Admin')
         ON CONFLICT (id, tenant_id) DO UPDATE SET 
           email = $3, password_hash = $4, name = $5`,
        [`U-${t.slug}-ADMIN`, t.id, t.admin_email, passwordHash, t.admin_name]
      );
      console.log(`  └─ Admin user: ${t.admin_email} (password: password123)`);
    }

    // 3. Insert Vendors
    const vendors = [
      // Radhe Krishna Vendors
      { id: 'V-RADHE-1', tenant_id: 'T-RADHE-KRISHNA', name: 'Ganesh Electronics', contact_person: 'Ganesh Bhai', phone: '9876543210', email: 'ganesh@test.com', address: 'Yagnik Road, Rajkot' },
      { id: 'V-RADHE-2', tenant_id: 'T-RADHE-KRISHNA', name: 'Maruti Suppliers', contact_person: 'Maruti Bhai', phone: '9876543211', email: 'maruti@test.com', address: 'Gondal Road, Rajkot' },
      
      // Shiv Shakti Vendors
      { id: 'V-SHIV-1', tenant_id: 'T-SHIV-SHAKTI', name: 'Balaji Enterprises', contact_person: 'Balaji Bhai', phone: '9876543212', email: 'balaji@test.com', address: 'Mavdi Plot, Rajkot' },
      { id: 'V-SHIV-2', tenant_id: 'T-SHIV-SHAKTI', name: 'Vrindavan Traders', contact_person: 'Vrindavan Bhai', phone: '9876543213', email: 'vrindavan@test.com', address: 'Shastri Nagar, Rajkot' },
      
      // Ambika Vendors
      { id: 'V-AMBIKA-1', tenant_id: 'T-AMBIKA-MFG', name: 'Rajkot Steel Co', contact_person: 'Rajesh Bhai', phone: '9876543214', email: 'rajesh@steel.com', address: 'Aji Vasahat, Rajkot' },
      { id: 'V-AMBIKA-2', tenant_id: 'T-AMBIKA-MFG', name: 'Saurashtra Castings', contact_person: 'Saurashtra Bhai', phone: '9876543215', email: 'saurashtra@cast.com', address: 'Metoda GIDC, Rajkot' },
    ];

    for (const v of vendors) {
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id, tenant_id) DO UPDATE SET 
           name = $3, contact_person = $4, phone = $5, email = $6, address = $7`,
        [v.id, v.tenant_id, v.name, v.contact_person, v.phone, v.email, v.address]
      );
      console.log(`✓ Vendor created: ${v.name} (Tenant: ${v.tenant_id})`);
    }

    console.log('🎉 Database seeding completed successfully!');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
  } finally {
    await pool.end();
  }
}

seed();
