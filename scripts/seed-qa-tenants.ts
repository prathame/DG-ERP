/**
 * Phase 2 QA seed script — creates two realistic, isolated test tenants.
 *
 * Tenant A: Shree Radha Jewellers (manufacturer — silver/gold jewelry)
 * Tenant B: TechSeva Solutions     (service — IT consulting)
 *
 * Deliberately different so cross-tenant contamination is obvious in tests.
 * Run with:  tsx scripts/seed-qa-tenants.ts
 *
 * Idempotent: uses ON CONFLICT DO NOTHING throughout.
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import { pool, initDatabase } from '../server/pg-db';

// ─── Tenant IDs ──────────────────────────────────────────────────────────────

export const QA_A = {
  tenantId: 'T-QA-SRJEWEL',
  slug: 'qa-srjewel',
  companyName: 'Shree Radha Jewellers',
  businessType: 'manufacturer',
  gstin: '27SRJQA1234J1Z5',
  adminEmail: 'admin@srjewel.qa',
  adminName: 'Raj Mehta',
};

export const QA_B = {
  tenantId: 'T-QA-TECHSEVA',
  slug: 'qa-techseva',
  companyName: 'TechSeva Solutions Pvt Ltd',
  businessType: 'service',
  gstin: '29TECHSV1234T1Z2',
  adminEmail: 'admin@techseva.qa',
  adminName: 'Priya Sharma',
};

// User IDs
const USERS = {
  A: {
    admin: 'U-QA-A-ADMIN',
    manager: 'U-QA-A-MGR',
    staff: 'U-QA-A-STAFF',
    warehouse: 'U-QA-A-WH',
    vendor: 'U-QA-A-VND',
  },
  B: {
    admin: 'U-QA-B-ADMIN',
    manager: 'U-QA-B-MGR',
    staff: 'U-QA-B-STAFF',
  },
};

async function run() {
  await initDatabase();
  const hash = await bcrypt.hash('QaTest@2026!', 12);

  // ─── Tenant A: Shree Radha Jewellers ────────────────────────────────────────
  console.log('Seeding Tenant A — Shree Radha Jewellers...');

  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id,
       gst_number, business_type, address, phone)
     VALUES ($1,$2,$3,$4,$5,'active','PROFESSIONAL',$6,$7,
       '14, Gandhi Road, Zaveri Bazaar, Mumbai - 400002, Maharashtra',
       '9820001234')
     ON CONFLICT (id) DO NOTHING`,
    [QA_A.tenantId, QA_A.companyName, QA_A.slug, QA_A.adminEmail, QA_A.adminName, QA_A.gstin, QA_A.businessType],
  );

  // Users — Tenant A
  const usersA = [
    [USERS.A.admin, QA_A.tenantId, 'raj.mehta@srjewel.qa', 'Admin', 'Raj Mehta', '9820001234', QA_A.gstin],
    [USERS.A.manager, QA_A.tenantId, 'sunita.shah@srjewel.qa', 'Manager', 'Sunita Shah', '9820001235', null],
    [USERS.A.staff, QA_A.tenantId, 'vikram.jain@srjewel.qa', 'Staff', 'Vikram Jain', '9820001236', null],
    [USERS.A.warehouse, QA_A.tenantId, 'mohan.das@srjewel.qa', 'Warehouse', 'Mohan Das', '9820001237', null],
  ];
  for (const [id, tid, email, role, name, phone, gst] of usersA) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, phone, gst_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [id, tid, email, hash, name, role, phone, gst],
    );
  }

  // Vendor A (with linked portal user)
  await pool.query(
    `INSERT INTO vendors (id, tenant_id, name, phone, email, gst_number)
     VALUES ('VEND-A-KRISHNA','${QA_A.tenantId}','Krishna Silver Works','9820055001','krishna@silworks.com','27KRSNA1234K1Z5'),
            ('VEND-A-BOMBAY', '${QA_A.tenantId}','Bombay Bullion Traders','9820055002','info@bombaybullion.com','27BOMBA1234B1Z5'),
            ('VEND-A-JAIPUR', '${QA_A.tenantId}','Jaipur Gems Exports','9820055003','jaipur@gems.com','08JAIGA1234J1Z3')
     ON CONFLICT DO NOTHING`,
  );
  // Linked vendor portal user
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role, vendor_id)
     VALUES ('${USERS.A.vendor}','${QA_A.tenantId}','portal@krishna.qa','${hash}','Krishna Portal','Vendor','VEND-A-KRISHNA')
     ON CONFLICT DO NOTHING`,
  );

  // Categories A
  await pool.query(
    `INSERT INTO categories (id, tenant_id, name) VALUES
     ('CAT-A-CHAIN', '${QA_A.tenantId}', 'Silver Chains'),
     ('CAT-A-RING',  '${QA_A.tenantId}', 'Rings'),
     ('CAT-A-BANGLE','${QA_A.tenantId}', 'Bangles'),
     ('CAT-A-ANKLET','${QA_A.tenantId}', 'Anklets')
     ON CONFLICT DO NOTHING`,
  );

  // Products A
  const productsA = [
    ['PROD-A-SC001', 'Silver Chain 20inch', '3211', 18, 'CAT-A-CHAIN', 1850],
    ['PROD-A-SC002', 'Silver Chain 22inch', '3211', 18, 'CAT-A-CHAIN', 2100],
    ['PROD-A-RG001', 'Silver Ring Plain', '7113', 3, 'CAT-A-RING', 650],
    ['PROD-A-RG002', 'Silver Ring Floral', '7113', 3, 'CAT-A-RING', 950],
    ['PROD-A-BN001', 'Silver Bangle Set 2pc', '7113', 3, 'CAT-A-BANGLE', 3200],
    ['PROD-A-AK001', 'Silver Anklet Pair', '7113', 3, 'CAT-A-ANKLET', 2400],
  ];
  for (const [id, name, hsn, gst, , price] of productsA) {
    // Note: products table has no category_id column; categories are a separate table
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, hsn_code, gst_rate, price, stock)
       VALUES ($1,$2,$3,$4,$5,$6,0) ON CONFLICT DO NOTHING`,
      [id, QA_A.tenantId, name, hsn, gst, price],
    );
  }

  // Inventory barcodes for Product A SC001 (10 pcs)
  for (let i = 1; i <= 10; i++) {
    const bc = `SRJ-SC001-${String(i).padStart(4, '0')}`;
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ($1,$2,'PROD-A-SC001',$3,'InStock') ON CONFLICT DO NOTHING`,
      [`PI-A-SC001-${i}`, QA_A.tenantId, bc],
    );
  }
  await pool.query(`UPDATE products SET stock = 10 WHERE id = 'PROD-A-SC001' AND tenant_id = '${QA_A.tenantId}'`);

  // Inventory barcodes for rings (5 pcs)
  for (let i = 1; i <= 5; i++) {
    const bc = `SRJ-RG001-${String(i).padStart(4, '0')}`;
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ($1,$2,'PROD-A-RG001',$3,'InStock') ON CONFLICT DO NOTHING`,
      [`PI-A-RG001-${i}`, QA_A.tenantId, bc],
    );
  }
  await pool.query(`UPDATE products SET stock = 5 WHERE id = 'PROD-A-RG001' AND tenant_id = '${QA_A.tenantId}'`);

  // Suppliers A
  await pool.query(
    `INSERT INTO suppliers (id, tenant_id, name, phone, email, gst_number, address)
     VALUES ('SUPP-A-RAJKOT','${QA_A.tenantId}','Rajkot Silver Foundry','2826001111','info@rajkotsilver.com',
             '24RAJSL1234R1Z7','Silver Market, Rajkot - 360001, Gujarat'),
            ('SUPP-A-MUMBAI','${QA_A.tenantId}','Mumbai Metal Merchants','2266001234','mmbm@metals.com',
             '27MUMBA1234M1Z8','Metal Bazaar, Kalbadevi, Mumbai - 400002')
     ON CONFLICT DO NOTHING`,
  );

  // Purchase batch — Tenant A bought 20 chains from Rajkot
  await pool.query(
    `INSERT INTO product_purchases
     (id, tenant_id, product_id, barcode, supplier_id, purchase_date, cost_price, gst_applied, billed_price, batch_id)
     VALUES ('PUR-A-001-1','${QA_A.tenantId}','PROD-A-SC001','SRJ-SC001-0001','SUPP-A-RAJKOT',
             '2026-07-01',1500,true,1770,'BATCH-PUR-A-001'),
            ('PUR-A-001-2','${QA_A.tenantId}','PROD-A-SC001','SRJ-SC001-0002','SUPP-A-RAJKOT',
             '2026-07-01',1500,true,1770,'BATCH-PUR-A-001')
     ON CONFLICT DO NOTHING`,
  );

  // Customers A
  await pool.query(
    `INSERT INTO customers (id, tenant_id, name, phone, email, address, vendor_id) VALUES
     ('CUST-A-001','${QA_A.tenantId}','Meena Agarwal','9833001001','meena@gmail.com','Borivali West, Mumbai','VEND-A-KRISHNA'),
     ('CUST-A-002','${QA_A.tenantId}','Rekha Sharma','9833001002','rekha@hotmail.com','Andheri East, Mumbai','VEND-A-KRISHNA'),
     ('CUST-A-003','${QA_A.tenantId}','Sonal Patel','9833001003',null,'Surat, Gujarat','VEND-A-BOMBAY')
     ON CONFLICT DO NOTHING`,
  );

  // Distribution — 3 barcodes sent to VEND-A-KRISHNA
  for (let i = 1; i <= 3; i++) {
    const bc = `SRJ-SC001-${String(i).padStart(4, '0')}`;
    await pool.query(
      `INSERT INTO product_distribution
       (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status,
        gst_applied, net_price, billed_price, discount_percent, batch_id)
       VALUES ($1,$2,'PROD-A-SC001',$3,'VEND-A-KRISHNA','2026-07-15','Distributed',
               true,1850,2183,0,'BATCH-DIST-A-001')
       ON CONFLICT DO NOTHING`,
      [`DIST-A-${i}`, QA_A.tenantId, bc],
    );
  }
  await pool.query(
    `UPDATE product_inventory SET status='Distributed'
     WHERE tenant_id='${QA_A.tenantId}' AND barcode IN ('SRJ-SC001-0001','SRJ-SC001-0002','SRJ-SC001-0003')`,
  );

  // Vendor payment — partial
  await pool.query(
    `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_date, payment_method, notes)
     VALUES ('VP-A-001','${QA_A.tenantId}','VEND-A-KRISHNA',2000,'2026-07-20','UPI','Partial advance against July batch')
     ON CONFLICT DO NOTHING`,
  );

  // Sale of 2 barcodes by VEND-A-KRISHNA
  for (let i = 1; i <= 2; i++) {
    const bc = `SRJ-SC001-${String(i).padStart(4, '0')}`;
    await pool.query(
      `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_id,
        customer_name, customer_phone, purchase_date, sale_price)
       VALUES ($1,$2,$3,'PROD-A-SC001','VEND-A-KRISHNA','CUST-A-00${i}',
         ${i === 1 ? "'Meena Agarwal','9833001001'" : "'Rekha Sharma','9833001002'"},
         '2026-07-22',2200)
       ON CONFLICT DO NOTHING`,
      [`SALE-A-${i}`, QA_A.tenantId, bc],
    );
    await pool.query(
      `UPDATE product_inventory SET status='Sold'
       WHERE tenant_id='${QA_A.tenantId}' AND barcode='${bc}'`,
    );
    await pool.query(
      `UPDATE product_distribution SET status='Sold'
       WHERE tenant_id='${QA_A.tenantId}' AND barcode='${bc}'`,
    );
  }

  // Warranty for 2 sold items
  for (let i = 1; i <= 2; i++) {
    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone,
        activation_date, expiry_date, status)
       VALUES ($1,$2,'PROD-A-SC001','SRJ-SC001-000${i}',
         ${i === 1 ? "'Meena Agarwal','9833001001'" : "'Rekha Sharma','9833001002'"},
         '2026-07-22','2027-07-22','Active')
       ON CONFLICT DO NOTHING`,
      [`WR-A-${i}`, QA_A.tenantId],
    );
  }

  // Quotation A
  await pool.query(
    `INSERT INTO quotations (id, tenant_id, quotation_number, vendor_id, vendor_name,
      customer_name, quotation_date, valid_until, status, items, subtotal, gst_rate, gst_amount, total, notes)
     VALUES ('QUOT-A-001','${QA_A.tenantId}','QT-0001','VEND-A-JAIPUR','Jaipur Gems Exports',
       'Rajesh Kumar','2026-08-01','2026-08-31','Draft',
       '[{"productId":"PROD-A-BN001","productName":"Silver Bangle Set 2pc","quantity":5,"price":3200,"lineNet":16000,"lineGst":480,"lineTotal":16480}]',
       16000,3,480,16480,'Bulk order for Diwali season')
     ON CONFLICT DO NOTHING`,
  );

  // Orders A
  await pool.query(
    `INSERT INTO orders (id, tenant_id, order_number, vendor_id, vendor_name,
      customer_name, order_date, status, items, subtotal, gst_rate, gst_amount, total, notes)
     VALUES ('ORD-A-001','${QA_A.tenantId}','ORD-0001','VEND-A-KRISHNA','Krishna Silver Works',
       null,'2026-08-05','Pending',
       '[{"productId":"PROD-A-RG001","productName":"Silver Ring Plain","quantity":10,"price":650,"lineNet":6500,"lineGst":195,"lineTotal":6695}]',
       6500,3,195,6695,'Restock order')
     ON CONFLICT DO NOTHING`,
  );

  // Standalone invoice A
  await pool.query(
    `INSERT INTO standalone_invoices (id, tenant_id, invoice_number, customer_name, customer_gstin,
      customer_phone, items, subtotal, tax_total, grand_total, status, invoice_date,
      gst_enabled, invoice_kind, tax_cgst, tax_sgst, tax_igst, is_interstate, party_type, party_id)
     VALUES ('INV-A-001','${QA_A.tenantId}','INV/25-26/0001','Bombay Boutique','27BMBBT1234B1Z5',
       '9820099001',
       '[{"description":"Silver Chain 20inch x 5","quantity":5,"price":1850,"taxable":9250,"tax":1665,"gstRate":18,"total":10915}]',
       9250,1665,10915,'sent','2026-08-10',
       true,'sale',832.50,832.50,0,false,'vendor','VEND-A-BOMBAY')
     ON CONFLICT DO NOTHING`,
  );

  // Invoice payment — partial
  await pool.query(
    `INSERT INTO invoice_payments (id, tenant_id, invoice_id, amount, payment_date, payment_method, notes)
     VALUES ('IP-A-001','${QA_A.tenantId}','INV-A-001',5000,'2026-08-12','Bank Transfer','Advance payment')
     ON CONFLICT DO NOTHING`,
  );

  // Expenses A
  await pool.query(
    `INSERT INTO expenses (id, tenant_id, category, description, amount, expense_date, payment_method)
     VALUES ('EXP-A-001','${QA_A.tenantId}','Rent','Shop rent - Zaveri Bazaar July 2026',45000,'2026-07-01','Bank Transfer'),
            ('EXP-A-002','${QA_A.tenantId}','Electricity','Electricity bill July 2026',3200,'2026-07-31','UPI'),
            ('EXP-A-003','${QA_A.tenantId}','Packaging','Silver pouches and boxes',1800,'2026-08-05','Cash')
     ON CONFLICT DO NOTHING`,
  );

  // Staff A
  await pool.query(
    `INSERT INTO staff_members (id, tenant_id, name, phone, role, salary, joining_date, status)
     VALUES ('STF-A-001','${QA_A.tenantId}','Ramesh Gupta','9820101001','Salesperson',18000,'2024-01-15','active'),
            ('STF-A-002','${QA_A.tenantId}','Kavita Patil','9820101002','Accountant',22000,'2024-03-01','active')
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO staff_payments (id, tenant_id, staff_name, amount, payment_date, payment_type, payment_method, month, year)
     VALUES ('SP-A-001','${QA_A.tenantId}','Ramesh Gupta',18000,'2026-07-31','salary','Bank Transfer','July',2026),
            ('SP-A-002','${QA_A.tenantId}','Kavita Patil',22000,'2026-07-31','salary','Bank Transfer','July',2026)
     ON CONFLICT DO NOTHING`,
  );

  // Banks A
  await pool.query(
    `INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code)
     VALUES ('BNK-A-001','${QA_A.tenantId}','HDFC Current A/C','00123456789012','HDFC Bank','Zaveri Bazaar Mumbai','HDFC0001234'),
            ('BNK-A-002','${QA_A.tenantId}','SBI Savings','12345678901234','State Bank of India','Fort Mumbai','SBIN0000234')
     ON CONFLICT DO NOTHING`,
  );

  // Credit note A
  await pool.query(
    `INSERT INTO credit_debit_notes (id, tenant_id, note_number, note_type, vendor_id, vendor_name,
      note_date, reason, items, subtotal, gst_rate, gst_amount, total, status)
     VALUES ('CDN-A-001','${QA_A.tenantId}','CN-0001','credit','VEND-A-KRISHNA','Krishna Silver Works',
       '2026-08-11','Defective chain returned',
       '[{"description":"Silver Chain 20inch","quantity":1,"price":1850,"withGst":true,"lineNet":1850,"lineGst":333,"lineTotal":2183}]',
       1850,18,333,2183,'Active')
     ON CONFLICT DO NOTHING`,
  );

  // Bill settings A
  await pool.query(
    `INSERT INTO bill_settings (tenant_id, primary_color, tagline, show_hsn_sac,
      footer_text, invoice_template_style, fssai_license)
     VALUES ('${QA_A.tenantId}','#8B4513','Pure Silver. Pure Trust.',true,
       'Thank you for your business | BIS Hallmark Certified',
       'modern', null)
     ON CONFLICT (tenant_id) DO NOTHING`,
  );

  // Reward rules A
  await pool.query(
    `INSERT INTO reward_rules (id, tenant_id, products_sold_threshold, reward_points, description)
     VALUES ('RR-A-001','${QA_A.tenantId}',5,50,'5 products = 50 points'),
            ('RR-A-002','${QA_A.tenantId}',10,120,'10 products = 120 points')
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO redemption_settings (id, tenant_id, min_balance, min_points)
     VALUES ('default','${QA_A.tenantId}',100,50)
     ON CONFLICT DO NOTHING`,
  );

  // Price lists A
  await pool.query(
    `INSERT INTO price_lists (id, tenant_id, name, product_id, vendor_id, min_qty, price, is_active)
     VALUES ('PL-A-001','${QA_A.tenantId}','Krishna Wholesale','PROD-A-SC001','VEND-A-KRISHNA',10,1750,true),
            ('PL-A-002','${QA_A.tenantId}','Bombay Bulk','PROD-A-SC001','VEND-A-BOMBAY',25,1700,true)
     ON CONFLICT DO NOTHING`,
  );

  // Books account groups A
  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref) VALUES
     ('BAG-A-ASSET',  '${QA_A.tenantId}','Current Assets','A','ops:G-ASSET'),
     ('BAG-A-LIAB',   '${QA_A.tenantId}','Current Liabilities','L','ops:G-LIAB'),
     ('BAG-A-INC',    '${QA_A.tenantId}','Sales Income','I','ops:G-INCOME'),
     ('BAG-A-EXP',    '${QA_A.tenantId}','Expenses','E','ops:G-EXP'),
     ('BAG-A-CASH',   '${QA_A.tenantId}','Cash-in-Hand','A','ops:G-CASH'),
     ('BAG-A-BANK',   '${QA_A.tenantId}','Bank Accounts','A','ops:G-BANK'),
     ('BAG-A-PURCH',  '${QA_A.tenantId}','Purchases','E','ops:G-PURCHASE')
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, is_system, external_ref) VALUES
     ('BL-A-CASH','${QA_A.tenantId}','Cash Account','BAG-A-CASH','A','CS',true,'ops:CASH'),
     ('BL-A-HDFC','${QA_A.tenantId}','HDFC Bank','BAG-A-BANK','A','BK',true,'ops:BANK'),
     ('BL-A-SALES','${QA_A.tenantId}','Sales Income','BAG-A-INC','I','IN',true,'ops:SALES_INCOME'),
     ('BL-A-PURCH','${QA_A.tenantId}','Purchase Account','BAG-A-PURCH','E','EX',true,'ops:PURCHASE'),
     ('BL-A-KRISHNA-PARTY','${QA_A.tenantId}','Krishna Silver Works A/C','BAG-A-LIAB','L',null,false,null)
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, start_date, end_date, is_active)
     VALUES ('BFY-A-2526','${QA_A.tenantId}','2025-26','FY 2025-26','2025-04-01','2026-03-31',true)
     ON CONFLICT DO NOTHING`,
  );

  // ─── Tenant B: TechSeva Solutions ────────────────────────────────────────────
  console.log('Seeding Tenant B — TechSeva Solutions...');

  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id,
       gst_number, business_type, address, phone)
     VALUES ($1,$2,$3,$4,$5,'active','PROFESSIONAL',$6,$7,
       '501, Prestige Tech Park, Outer Ring Road, Bengaluru - 560103, Karnataka',
       '9980001234')
     ON CONFLICT (id) DO NOTHING`,
    [QA_B.tenantId, QA_B.companyName, QA_B.slug, QA_B.adminEmail, QA_B.adminName, QA_B.gstin, QA_B.businessType],
  );

  const usersB = [
    [USERS.B.admin, QA_B.tenantId, 'priya.sharma@techseva.qa', 'Admin', 'Priya Sharma', '9980001234'],
    [USERS.B.manager, QA_B.tenantId, 'arjun.nair@techseva.qa', 'Manager', 'Arjun Nair', '9980001235'],
    [USERS.B.staff, QA_B.tenantId, 'neha.iyer@techseva.qa', 'Staff', 'Neha Iyer', '9980001236'],
  ];
  for (const [id, tid, email, role, name, phone] of usersB) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [id, tid, email, hash, name, role, phone],
    );
  }

  // Vendors B (clients for service business)
  await pool.query(
    `INSERT INTO vendors (id, tenant_id, name, phone, email, gst_number, address)
     VALUES ('VEND-B-INFOSYS','${QA_B.tenantId}','Infosys Limited','8028520261','vendor@infosys.com',
             '29INFSYS1234I1Z1','Electronics City, Bengaluru'),
            ('VEND-B-WIPRO','${QA_B.tenantId}','Wipro Technologies','8028522000','billing@wipro.com',
             '29WIPROT1234W1Z2','Sarjapur Road, Bengaluru'),
            ('VEND-B-STARTUP','${QA_B.tenantId}','ZeroToOne Startup','9898001234','hello@zerotoone.in',
             null,'Koramangala, Bengaluru')
     ON CONFLICT DO NOTHING`,
  );

  // Categories B (service categories)
  await pool.query(
    `INSERT INTO categories (id, tenant_id, name) VALUES
     ('CAT-B-WEB','${QA_B.tenantId}','Web Development'),
     ('CAT-B-CLOUD','${QA_B.tenantId}','Cloud Solutions'),
     ('CAT-B-SUPPORT','${QA_B.tenantId}','IT Support'),
     ('CAT-B-CONSULT','${QA_B.tenantId}','Consulting')
     ON CONFLICT DO NOTHING`,
  );

  // Products B (services)
  await pool.query(
    `INSERT INTO products (id, tenant_id, name, hsn_code, gst_rate, price, stock)
     VALUES ('PROD-B-WEBAPP','${QA_B.tenantId}','Web Application Development',998314,18,150000,0),
            ('PROD-B-CLOUD','${QA_B.tenantId}','Cloud Migration Services',998314,18,200000,0),
            ('PROD-B-SUPPORT','${QA_B.tenantId}','Annual IT Support Contract',998313,18,84000,0),
            ('PROD-B-CONSULT','${QA_B.tenantId}','Technical Consulting (per day)',998314,18,25000,0)
     ON CONFLICT DO NOTHING`,
  );

  // Invoices B — typical service invoices
  const invB = [
    [
      'INV-B-001',
      'INV/25-26/0001',
      'VEND-B-INFOSYS',
      'Infosys Limited',
      '29INFSYS1234I1Z1',
      '2026-07-01',
      'paid',
      254237,
      45763,
      300000,
      'CGST:22881.50,SGST:22881.50',
      false,
      'vendor',
    ],
    [
      'INV-B-002',
      'INV/25-26/0002',
      'VEND-B-WIPRO',
      'Wipro Technologies',
      '29WIPROT1234W1Z2',
      '2026-07-15',
      'sent',
      127119,
      22881,
      150000,
      'CGST:11440.50,SGST:11440.50',
      false,
      'vendor',
    ],
    [
      'INV-B-003',
      'INV/25-26/0003',
      'VEND-B-STARTUP',
      'ZeroToOne Startup',
      null,
      '2026-08-01',
      'draft',
      21186,
      3814,
      25000,
      'CGST:1907,SGST:1907',
      false,
      'vendor',
    ],
  ];
  for (const [id, num, partyId, custName, gstin, date, status, sub, tax, grand, gstDetail, interstate, ptype] of invB) {
    const taxCgst = parseFloat(String(gstDetail).split(',')[0].split(':')[1]);
    const taxSgst = parseFloat(String(gstDetail).split(',')[1].split(':')[1]);
    await pool.query(
      `INSERT INTO standalone_invoices (id, tenant_id, invoice_number, customer_name, customer_gstin,
        items, subtotal, tax_total, grand_total, status, invoice_date, gst_enabled,
        invoice_kind, tax_cgst, tax_sgst, tax_igst, is_interstate, party_type, party_id)
       VALUES ($1,$2,$3,$4,$5,
         '[{"description":"Professional Services","quantity":1,"price":${sub},"taxable":${sub},"tax":${tax},"total":${grand}}]',
         $6,$7,$8,$9,$10,true,'sale',$11,$12,0,$13,$14,$15)
       ON CONFLICT DO NOTHING`,
      [
        id,
        QA_B.tenantId,
        num,
        custName,
        gstin,
        sub,
        tax,
        grand,
        status,
        date,
        taxCgst,
        taxSgst,
        interstate,
        ptype,
        partyId,
      ],
    );
  }

  // Payment for INV-B-001 (fully paid)
  await pool.query(
    `INSERT INTO invoice_payments (id, tenant_id, invoice_id, amount, payment_date, payment_method, notes)
     VALUES ('IP-B-001','${QA_B.tenantId}','INV-B-001',300000,'2026-07-31','Bank Transfer','Full payment NEFT')
     ON CONFLICT DO NOTHING`,
  );

  // Expenses B
  await pool.query(
    `INSERT INTO expenses (id, tenant_id, category, description, amount, expense_date, payment_method)
     VALUES ('EXP-B-001','${QA_B.tenantId}','Office Rent','Prestige Tech Park July 2026',85000,'2026-07-01','Bank Transfer'),
            ('EXP-B-002','${QA_B.tenantId}','Internet','Airtel Leased Line July 2026',12000,'2026-07-31','Bank Transfer'),
            ('EXP-B-003','${QA_B.tenantId}','Software','GitHub Team subscription',7200,'2026-08-01','Credit Card'),
            ('EXP-B-004','${QA_B.tenantId}','Travel','Client visit to Hyderabad',8500,'2026-08-05','Cash')
     ON CONFLICT DO NOTHING`,
  );

  // Staff B
  await pool.query(
    `INSERT INTO staff_members (id, tenant_id, name, phone, role, salary, joining_date, status)
     VALUES ('STF-B-001','${QA_B.tenantId}','Rohit Verma','9980201001','Full Stack Developer',65000,'2023-06-01','active'),
            ('STF-B-002','${QA_B.tenantId}','Ananya Singh','9980201002','QA Engineer',55000,'2024-01-15','active'),
            ('STF-B-003','${QA_B.tenantId}','Suresh Kumar','9980201003','DevOps Engineer',72000,'2023-09-01','active')
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO staff_payments (id, tenant_id, staff_name, amount, payment_date, payment_type, payment_method, month, year)
     VALUES ('SP-B-001','${QA_B.tenantId}','Rohit Verma',65000,'2026-07-31','salary','Bank Transfer','July',2026),
            ('SP-B-002','${QA_B.tenantId}','Ananya Singh',55000,'2026-07-31','salary','Bank Transfer','July',2026),
            ('SP-B-003','${QA_B.tenantId}','Suresh Kumar',72000,'2026-07-31','salary','Bank Transfer','July',2026)
     ON CONFLICT DO NOTHING`,
  );

  // Banks B
  await pool.query(
    `INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code)
     VALUES ('BNK-B-001','${QA_B.tenantId}','ICICI Current','11223344556677','ICICI Bank','Koramangala Bengaluru','ICIC0001122'),
            ('BNK-B-002','${QA_B.tenantId}','Axis Payroll','99887766554433','Axis Bank','MG Road Bengaluru','UTIB0000099')
     ON CONFLICT DO NOTHING`,
  );

  // Bill settings B
  await pool.query(
    `INSERT INTO bill_settings (tenant_id, primary_color, tagline, show_hsn_sac, footer_text, invoice_template_style)
     VALUES ('${QA_B.tenantId}','#2563EB','Transforming Business Through Technology',true,
       'MSME Registered | ISO 9001:2015 Certified','modern')
     ON CONFLICT (tenant_id) DO NOTHING`,
  );

  // Books for B
  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref) VALUES
     ('BAG-B-ASSET','${QA_B.tenantId}','Current Assets','A','ops:G-ASSET'),
     ('BAG-B-LIAB', '${QA_B.tenantId}','Current Liabilities','L','ops:G-LIAB'),
     ('BAG-B-INC',  '${QA_B.tenantId}','Service Revenue','I','ops:G-INCOME'),
     ('BAG-B-EXP',  '${QA_B.tenantId}','Expenses','E','ops:G-EXP'),
     ('BAG-B-CASH', '${QA_B.tenantId}','Cash-in-Hand','A','ops:G-CASH'),
     ('BAG-B-BANK', '${QA_B.tenantId}','Bank Accounts','A','ops:G-BANK'),
     ('BAG-B-PURCH','${QA_B.tenantId}','Purchases','E','ops:G-PURCHASE')
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, is_system, external_ref) VALUES
     ('BL-B-CASH','${QA_B.tenantId}','Cash Account','BAG-B-CASH','A','CS',true,'ops:CASH'),
     ('BL-B-ICICI','${QA_B.tenantId}','ICICI Bank','BAG-B-BANK','A','BK',true,'ops:BANK'),
     ('BL-B-SALES','${QA_B.tenantId}','Service Revenue','BAG-B-INC','I','IN',true,'ops:SALES_INCOME'),
     ('BL-B-PURCH','${QA_B.tenantId}','Expenses','BAG-B-PURCH','E','EX',true,'ops:PURCHASE')
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, start_date, end_date, is_active)
     VALUES ('BFY-B-2526','${QA_B.tenantId}','2025-26','FY 2025-26','2025-04-01','2026-03-31',true)
     ON CONFLICT DO NOTHING`,
  );

  console.log('\n✅ QA seed data created successfully.');
  console.log(`\nTenant A: ${QA_A.companyName} (${QA_A.tenantId})`);
  console.log(`  Login: ${QA_A.adminEmail} / QaTest@2026!`);
  console.log(`  Slug: /${QA_A.slug}`);
  console.log(`\nTenant B: ${QA_B.companyName} (${QA_B.tenantId})`);
  console.log(`  Login: ${QA_B.adminEmail} / QaTest@2026!`);
  console.log(`  Slug: /${QA_B.slug}`);

  await pool.end();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
