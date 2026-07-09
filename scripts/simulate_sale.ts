import { pool } from '../server/pg-db';
import dotenv from 'dotenv';

dotenv.config();

const TENANT_ID = 'T-RADHE-KRISHNA';
const VENDOR_ID = 'V-RADHE-1';
const PRODUCT_ID = 'P-RADHE-PHONE';
const BARCODE = 'IPHONE-001';
const POINTS = 100;
const WARRANTY_MONTHS = 12;

async function simulate() {
  console.log('⏳ Setting up iPhone 15 Pro inventory for Radhe Krishna Retail...');
  try {
    // 1. Insert Product
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, barcode, description, reward_points_value, price, warranty_months, stock)
       VALUES ($1, $2, 'iPhone 15 Pro', $3, 'Space Gray 256GB', $4, 90000, $5, 5)
       ON CONFLICT (id, tenant_id) DO UPDATE SET 
         name = 'iPhone 15 Pro', barcode = $3, price = 90000, warranty_months = $5, stock = 5`,
      [PRODUCT_ID, TENANT_ID, BARCODE, POINTS, WARRANTY_MONTHS]
    );
    console.log('✓ Product configured in DB');

    // 2. Insert Inventory Items
    const inventory = [
      { id: 'I-IPHONE-1', barcode: 'IPHONE-001', status: 'Distributed' },
      { id: 'I-IPHONE-2', barcode: 'IPHONE-002', status: 'Distributed' },
      { id: 'I-IPHONE-3', barcode: 'IPHONE-003', status: 'InStock' },
      { id: 'I-IPHONE-4', barcode: 'IPHONE-004', status: 'InStock' },
      { id: 'I-IPHONE-5', barcode: 'IPHONE-005', status: 'InStock' },
    ];

    for (const item of inventory) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id, tenant_id) DO UPDATE SET status = $5`,
        [item.id, TENANT_ID, PRODUCT_ID, item.barcode, item.status]
      );
    }
    console.log('✓ 5 inventory units created (2 Distributed, 3 InStock)');

    // 3. Insert Distribution Items (to make IPHONE-001 & IPHONE-002 sellable by Ganesh Electronics)
    const distributions = [
      { id: 'D-IPHONE-1', barcode: 'IPHONE-001', net_price: 85000, billed_price: 90000 },
      { id: 'D-IPHONE-2', barcode: 'IPHONE-002', net_price: 85000, billed_price: 90000 },
    ];

    for (const dist of distributions) {
      await pool.query(
        `INSERT INTO product_distribution (id, batch_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price, gst_applied, billed_price, tenant_id)
         VALUES ($1, 'B-IPHONE-01', $2, $3, $4, CURRENT_DATE, 'Distributed', 5, $5, true, $6, $7)
         ON CONFLICT (id, tenant_id) DO UPDATE SET status = 'Distributed'`,
        [dist.id, PRODUCT_ID, dist.barcode, VENDOR_ID, dist.net_price, dist.billed_price, TENANT_ID]
      );
    }
    console.log('✓ 2 distribution units assigned to Ganesh Electronics');

    // 4. Perform database transaction to record the sale
    console.log('⏳ Simulating sale of IPHONE-001 directly in the database...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const customerId = 'C-RADHE-TEST-1';
      const saleId = 'S-IPHONE-SALE-1';
      const date = new Date().toISOString().slice(0, 10);

      // A. Create/Update Customer
      await client.query(
        `INSERT INTO customers (id, tenant_id, name, phone, email, address, vendor_id)
         VALUES ($1, $2, 'Rahul Bansod', '9999999999', 'rahul@test.com', 'Rajkot, Gujarat', $3)
         ON CONFLICT (id, tenant_id) DO UPDATE SET vendor_id = $3`,
        [customerId, TENANT_ID, VENDOR_ID]
      );

      // B. Insert Product Sale
      await client.query(
        `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_id, customer_name, customer_phone, customer_email, purchase_date, reward_points_earned, sale_price)
         VALUES ($1, $2, $3, $4, $5, $6, 'Rahul Bansod', '9999999999', 'rahul@test.com', $7, $8, 90000)
         ON CONFLICT (id, tenant_id) DO NOTHING`,
        [saleId, TENANT_ID, BARCODE, PRODUCT_ID, VENDOR_ID, customerId, date, POINTS]
      );

      // C. Update Distribution & Inventory status to Sold
      await client.query("UPDATE product_distribution SET status = 'Sold' WHERE barcode = $1 AND tenant_id = $2", [BARCODE, TENANT_ID]);
      await client.query("UPDATE product_inventory SET status = 'Sold' WHERE barcode = $1 AND tenant_id = $2", [BARCODE, TENANT_ID]);

      // D. Update Vendor sales metrics
      await client.query(
        `UPDATE vendors 
         SET total_sales = total_sales + 1, total_reward_points = total_reward_points + $1 
         WHERE id = $2 AND tenant_id = $3`,
        [POINTS, VENDOR_ID, TENANT_ID]
      );

      // E. Log rewards
      const rewardId = `R-SALE-TEST-1`;
      await client.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id, sale_id)
         VALUES ($1, $2, 'U-radhe-krishna-ADMIN', $3, 'Earned', 'iPhone 15 Pro sold', $4, $5, $6)
         ON CONFLICT (id, tenant_id) DO NOTHING`,
        [rewardId, TENANT_ID, POINTS, date, VENDOR_ID, saleId]
      );

      // F. Create active warranty (12 months)
      const expiryDateObj = new Date(date);
      expiryDateObj.setMonth(expiryDateObj.getMonth() + WARRANTY_MONTHS);
      const expiryDate = expiryDateObj.toISOString().slice(0, 10);
      const warrantyId = `W-WARRANTY-TEST-1`;

      await client.query(
        `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
         VALUES ($1, $2, $3, $4, 'Rahul Bansod', '9999999999', $5, $6, 'Active')
         ON CONFLICT (id, tenant_id) DO NOTHING`,
        [warrantyId, TENANT_ID, PRODUCT_ID, BARCODE, date, expiryDate]
      );

      await client.query('COMMIT');
      console.log('🎉 SALE TRANSACTION COMMITTED SUCCESSFULLY!');
      console.log('------------------------------------');
      console.log('✅ Barcode IPHONE-001 updated to "Sold".');
      console.log('✅ Customer Rahul (9999999999) created/updated.');
      console.log('✅ Product Sale of ₹90,000 recorded.');
      console.log('✅ Ganesh Electronics awarded 100 points.');
      console.log('✅ 12-month active warranty registered (Expires:', expiryDate, ').');
      console.log('------------------------------------');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Simulation failed:', err);
  } finally {
    await pool.end();
  }
}

simulate();
