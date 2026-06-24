import { db } from '../db';
import { hashPassword } from '../utils/helpers';

console.log('Seeding Silver Jewellery demo data...\n');

// Update admin company name
db.prepare("UPDATE users SET company_name = ?, name = ? WHERE id = 'U1'").run('Shree Silver Jewellers', 'Shree Admin');
console.log('✓ Company set to: Shree Silver Jewellers\n');

// ============ VENDORS (12 jewellery shops) ============
const vendors = [
  { id: 'JV01', name: 'Laxmi Jewellers', contactPerson: 'Ramesh Soni', phone: '9876101001', email: 'ramesh@laxmijewellers.com', address: 'Zaveri Bazar, Mumbai, Maharashtra' },
  { id: 'JV02', name: 'Shri Ganesh Silver House', contactPerson: 'Suresh Agarwal', phone: '9876101002', email: 'suresh@ganeshsilver.com', address: 'Johri Bazar, Jaipur, Rajasthan' },
  { id: 'JV03', name: 'Meenakshi Silver Palace', contactPerson: 'Deepak Jain', phone: '9876101003', email: 'deepak@meenakshisilver.com', address: 'T Nagar, Chennai, Tamil Nadu' },
  { id: 'JV04', name: 'Gurukrupa Jewellers', contactPerson: 'Kiran Patel', phone: '9876101004', email: 'kiran@gurukrupa.com', address: 'Manek Chowk, Ahmedabad, Gujarat' },
  { id: 'JV05', name: 'Bharat Silver Emporium', contactPerson: 'Vikas Sharma', phone: '9876101005', email: 'vikas@bharatsilver.com', address: 'Chandni Chowk, Delhi' },
  { id: 'JV06', name: 'Sai Ornaments', contactPerson: 'Anil Gupta', phone: '9876101006', email: 'anil@saiornaments.com', address: 'Laxmi Road, Pune, Maharashtra' },
  { id: 'JV07', name: 'Mahalaxmi Silver Works', contactPerson: 'Rajesh Mehta', phone: '9876101007', email: 'rajesh@mahalaxmi.com', address: 'Commercial Street, Bangalore, Karnataka' },
  { id: 'JV08', name: 'Bombay Silver Art', contactPerson: 'Prakash Shah', phone: '9876101008', email: 'prakash@bombaysilver.com', address: 'Bhuleshwar, Mumbai, Maharashtra' },
  { id: 'JV09', name: 'Rajputana Jewels', contactPerson: 'Mohan Rajput', phone: '9876101009', email: 'mohan@rajputanajewels.com', address: 'MI Road, Jaipur, Rajasthan' },
  { id: 'JV10', name: 'Kolkata Silver House', contactPerson: 'Biplab Ghosh', phone: '9876101010', email: 'biplab@kolkatasilver.com', address: 'Bowbazar, Kolkata, West Bengal' },
  { id: 'JV11', name: 'Nath Jewellers', contactPerson: 'Santosh Nath', phone: '9876101011', email: 'santosh@nathjewellers.com', address: 'Sadar Bazar, Nagpur, Maharashtra' },
  { id: 'JV12', name: 'Devi Silver Gallery', contactPerson: 'Priya Devi', phone: '9876101012', email: 'priya@devisilver.com', address: 'Aminabad, Lucknow, Uttar Pradesh' },
];

const insertVendor = db.prepare('INSERT OR IGNORE INTO vendors (id, name, contact_person, phone, email, address, total_sales, total_reward_points) VALUES (?, ?, ?, ?, ?, ?, 0, 0)');
const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name, phone, address, role, company_name, vendor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

for (const v of vendors) {
  insertVendor.run(v.id, v.name, v.contactPerson, v.phone, v.email, v.address);
  const pwd = v.name.replace(/\s+/g, '').toLowerCase().slice(0, 15) + '@123';
  insertUser.run(`U-${v.id}`, v.email, hashPassword(pwd), v.contactPerson, v.phone, v.address, 'Vendor', v.name, v.id);
  console.log(`  Vendor: ${v.name} (login: ${v.email} / ${pwd})`);
}
console.log(`✓ ${vendors.length} vendors created\n`);

// ============ PRODUCTS (12 silver jewellery items) ============
const products = [
  { id: 'JP01', name: 'Silver Anklet (Payal) - Heavy', prefix: 'ANKH', qty: 60, price: 3500, reward: 15, warranty: 6, hsn: '7113', gst: 3, desc: '925 Sterling Silver anklet, heavy design' },
  { id: 'JP02', name: 'Silver Anklet (Payal) - Light', prefix: 'ANKL', qty: 80, price: 1800, reward: 8, warranty: 6, hsn: '7113', gst: 3, desc: '925 Sterling Silver anklet, lightweight daily wear' },
  { id: 'JP03', name: 'Silver Chain - Mens 22inch', prefix: 'CHNM', qty: 50, price: 4200, reward: 18, warranty: 12, hsn: '7113', gst: 3, desc: 'Mens silver chain, 22 inch, Italian design' },
  { id: 'JP04', name: 'Silver Chain - Ladies 18inch', prefix: 'CHNL', qty: 55, price: 2800, reward: 12, warranty: 12, hsn: '7113', gst: 3, desc: 'Ladies silver chain, 18 inch, delicate' },
  { id: 'JP05', name: 'Silver Ring - Solitaire Design', prefix: 'RING', qty: 100, price: 1500, reward: 6, warranty: 6, hsn: '7113', gst: 3, desc: 'Solitaire style silver ring with CZ stone' },
  { id: 'JP06', name: 'Silver Bangle Set (4pc)', prefix: 'BNGL', qty: 40, price: 5500, reward: 22, warranty: 12, hsn: '7113', gst: 3, desc: 'Set of 4 carved silver bangles' },
  { id: 'JP07', name: 'Silver Necklace - Temple Design', prefix: 'NKTM', qty: 30, price: 12000, reward: 45, warranty: 12, hsn: '7113', gst: 3, desc: 'Traditional temple design necklace, oxidized silver' },
  { id: 'JP08', name: 'Silver Pendant - Om', prefix: 'PNDM', qty: 70, price: 950, reward: 4, warranty: 6, hsn: '7113', gst: 3, desc: 'Om symbol silver pendant' },
  { id: 'JP09', name: 'Silver Earrings - Jhumka', prefix: 'ERJK', qty: 65, price: 2200, reward: 10, warranty: 6, hsn: '7113', gst: 3, desc: 'Traditional silver jhumka earrings' },
  { id: 'JP10', name: 'Silver Toe Ring Set (6pc)', prefix: 'TOES', qty: 90, price: 800, reward: 3, warranty: 3, hsn: '7113', gst: 3, desc: 'Adjustable silver toe rings, set of 6' },
  { id: 'JP11', name: 'Silver Bracelet - Mens', prefix: 'BRCM', qty: 45, price: 3800, reward: 16, warranty: 12, hsn: '7113', gst: 3, desc: 'Heavy mens silver bracelet, curb chain' },
  { id: 'JP12', name: 'Silver Pooja Thali Set', prefix: 'PUJA', qty: 20, price: 8500, reward: 35, warranty: 24, hsn: '7114', gst: 3, desc: 'Silver pooja thali with accessories' },
];

const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id, name, barcode, description, reward_points_value, warranty_months, price, stock, hsn_code, gst_rate) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)');
const insertInventory = db.prepare('INSERT OR IGNORE INTO product_inventory (id, product_id, barcode, batch_id, status) VALUES (?, ?, ?, ?, ?)');

for (const p of products) {
  insertProduct.run(p.id, p.name, null, p.desc, p.reward, p.warranty, p.price, p.hsn, p.gst);
  const batchId = `DEMO-${p.id}`;
  for (let i = 1; i <= p.qty; i++) {
    const barcode = `${p.prefix}${String(i).padStart(3, '0')}`;
    insertInventory.run(`INV-${p.id}-${i}`, p.id, barcode, batchId, 'InStock');
  }
  console.log(`  ${p.name} — ${p.qty} units (${p.prefix}001–${p.prefix}${String(p.qty).padStart(3, '0')}) — ₹${p.price}`);
}
console.log(`✓ ${products.length} products (${products.reduce((s, p) => s + p.qty, 0)} total units)\n`);

// ============ CUSTOMERS (15) ============
const customers = [
  { id: 'JC01', name: 'Priya Sharma', phone: '9876201001', email: 'priya.s@email.com', address: 'Andheri, Mumbai', vendorId: 'JV01' },
  { id: 'JC02', name: 'Neha Agarwal', phone: '9876201002', email: 'neha.a@email.com', address: 'Malad, Mumbai', vendorId: 'JV01' },
  { id: 'JC03', name: 'Sunita Kumari', phone: '9876201003', email: 'sunita.k@email.com', address: 'Vaishali Nagar, Jaipur', vendorId: 'JV02' },
  { id: 'JC04', name: 'Kavita Jain', phone: '9876201004', email: 'kavita.j@email.com', address: 'Adyar, Chennai', vendorId: 'JV03' },
  { id: 'JC05', name: 'Rekha Patel', phone: '9876201005', email: 'rekha.p@email.com', address: 'Navrangpura, Ahmedabad', vendorId: 'JV04' },
  { id: 'JC06', name: 'Aarti Gupta', phone: '9876201006', email: 'aarti.g@email.com', address: 'Karol Bagh, Delhi', vendorId: 'JV05' },
  { id: 'JC07', name: 'Meena Deshmukh', phone: '9876201007', email: 'meena.d@email.com', address: 'Shivajinagar, Pune', vendorId: 'JV06' },
  { id: 'JC08', name: 'Lakshmi Rao', phone: '9876201008', email: 'lakshmi.r@email.com', address: 'Indiranagar, Bangalore', vendorId: 'JV07' },
  { id: 'JC09', name: 'Anjali Shah', phone: '9876201009', email: 'anjali.s@email.com', address: 'Dadar, Mumbai', vendorId: 'JV08' },
  { id: 'JC10', name: 'Pooja Rajput', phone: '9876201010', email: 'pooja.r@email.com', address: 'Tonk Road, Jaipur', vendorId: 'JV09' },
  { id: 'JC11', name: 'Ritu Ghosh', phone: '9876201011', email: 'ritu.g@email.com', address: 'Park Street, Kolkata', vendorId: 'JV10' },
  { id: 'JC12', name: 'Shalini Nath', phone: '9876201012', email: 'shalini.n@email.com', address: 'Sitabuldi, Nagpur', vendorId: 'JV11' },
  { id: 'JC13', name: 'Deepa Mishra', phone: '9876201013', email: 'deepa.m@email.com', address: 'Hazratganj, Lucknow', vendorId: 'JV12' },
  { id: 'JC14', name: 'Manisha Kulkarni', phone: '9876201014', email: 'manisha.k@email.com', address: 'Kothrud, Pune', vendorId: null },
  { id: 'JC15', name: 'Swati Verma', phone: '9876201015', email: 'swati.v@email.com', address: 'Banjara Hills, Hyderabad', vendorId: null },
];

const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (id, name, phone, email, address, vendor_id) VALUES (?, ?, ?, ?, ?, ?)');
for (const c of customers) insertCustomer.run(c.id, c.name, c.phone, c.email, c.address, c.vendorId);
console.log(`✓ ${customers.length} customers\n`);

// ============ DISTRIBUTE TO VENDORS ============
console.log('Distributing jewellery to vendors...');
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const distributions = [
  { vendorId: 'JV01', productId: 'JP01', count: 10, discount: 12 },
  { vendorId: 'JV01', productId: 'JP05', count: 15, discount: 12 },
  { vendorId: 'JV02', productId: 'JP07', count: 5, discount: 8 },
  { vendorId: 'JV02', productId: 'JP09', count: 10, discount: 10 },
  { vendorId: 'JV03', productId: 'JP03', count: 8, discount: 10 },
  { vendorId: 'JV04', productId: 'JP06', count: 8, discount: 15 },
  { vendorId: 'JV05', productId: 'JP02', count: 15, discount: 10 },
  { vendorId: 'JV05', productId: 'JP10', count: 20, discount: 12 },
  { vendorId: 'JV06', productId: 'JP04', count: 10, discount: 8 },
  { vendorId: 'JV06', productId: 'JP08', count: 12, discount: 10 },
  { vendorId: 'JV07', productId: 'JP11', count: 8, discount: 10 },
  { vendorId: 'JV08', productId: 'JP01', count: 8, discount: 10 },
  { vendorId: 'JV09', productId: 'JP12', count: 5, discount: 5 },
  { vendorId: 'JV10', productId: 'JP05', count: 12, discount: 12 },
  { vendorId: 'JV11', productId: 'JP09', count: 8, discount: 10 },
  { vendorId: 'JV12', productId: 'JP02', count: 10, discount: 8 },
];

const insertDist = db.prepare('INSERT OR IGNORE INTO product_distribution (id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const updateInvStatus = db.prepare("UPDATE product_inventory SET status = 'Distributed' WHERE barcode = ?");

let distCount = 0;
for (const d of distributions) {
  const product = products.find(p => p.id === d.productId)!;
  const netPrice = Math.round(product.price * (100 - d.discount) / 100);
  const invRows = db.prepare("SELECT barcode FROM product_inventory WHERE product_id = ? AND status = 'InStock' LIMIT ?").all(d.productId, d.count) as { barcode: string }[];
  const date = daysAgo(Math.floor(Math.random() * 30) + 5);
  for (let i = 0; i < invRows.length; i++) {
    insertDist.run(`JD-${d.vendorId}-${d.productId}-${i + 1}`, d.productId, invRows[i].barcode, d.vendorId, date, 'Distributed', d.discount, netPrice);
    updateInvStatus.run(invRows[i].barcode);
    distCount++;
  }
  console.log(`  ${d.count} x ${product.name} → ${vendors.find(v => v.id === d.vendorId)!.name} (${d.discount}% off)`);
}
console.log(`✓ ${distCount} units distributed\n`);

// ============ VENDOR PAYMENTS ============
const insertPayment = db.prepare('INSERT OR IGNORE INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
const payments = [
  { vendorId: 'JV01', amount: 35000, method: 'Bank Transfer', ref: 'NEFT-JW001' },
  { vendorId: 'JV02', amount: 50000, method: 'UPI', ref: 'UPI-JW002' },
  { vendorId: 'JV03', amount: 25000, method: 'Cash', ref: null },
  { vendorId: 'JV04', amount: 30000, method: 'Cheque', ref: 'CHQ-JW004' },
  { vendorId: 'JV05', amount: 20000, method: 'UPI', ref: 'UPI-JW005' },
  { vendorId: 'JV06', amount: 18000, method: 'Cash', ref: null },
  { vendorId: 'JV08', amount: 22000, method: 'Bank Transfer', ref: 'NEFT-JW008' },
  { vendorId: 'JV10', amount: 12000, method: 'UPI', ref: 'UPI-JW010' },
];
for (const p of payments) {
  insertPayment.run(`VP-JW-${p.vendorId}`, p.vendorId, p.amount, daysAgo(Math.floor(Math.random() * 15) + 1), p.method, p.ref, 'Demo payment');
}
console.log(`✓ ${payments.length} vendor payments\n`);

// ============ SALES ============
console.log('Recording sales...');
const insertSale = db.prepare('INSERT OR IGNORE INTO product_sales (id, barcode, product_id, vendor_id, customer_id, customer_name, customer_phone, customer_email, purchase_date, reward_points_earned, sale_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertWarranty = db.prepare('INSERT OR IGNORE INTO warranties (id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertReward = db.prepare('INSERT OR IGNORE INTO rewards (id, user_id, points, type, description, date, vendor_id, sale_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const updateDistSold = db.prepare("UPDATE product_distribution SET status = 'Sold' WHERE barcode = ?");
const updateVendorSales = db.prepare('UPDATE vendors SET total_sales = total_sales + 1, total_reward_points = total_reward_points + ? WHERE id = ?');

const sales = [
  { vendorId: 'JV01', customerId: 'JC01', productId: 'JP01', unitIdx: 1, prefix: 'ANKH', price: 3800 },
  { vendorId: 'JV01', customerId: 'JC02', productId: 'JP05', unitIdx: 1, prefix: 'RING', price: 1700 },
  { vendorId: 'JV02', customerId: 'JC03', productId: 'JP07', unitIdx: 1, prefix: 'NKTM', price: 13500 },
  { vendorId: 'JV03', customerId: 'JC04', productId: 'JP03', unitIdx: 1, prefix: 'CHNM', price: 4600 },
  { vendorId: 'JV04', customerId: 'JC05', productId: 'JP06', unitIdx: 1, prefix: 'BNGL', price: 6200 },
  { vendorId: 'JV05', customerId: 'JC06', productId: 'JP02', unitIdx: 1, prefix: 'ANKL', price: 2100 },
  { vendorId: 'JV05', customerId: 'JC06', productId: 'JP10', unitIdx: 1, prefix: 'TOES', price: 950 },
  { vendorId: 'JV06', customerId: 'JC07', productId: 'JP08', unitIdx: 1, prefix: 'PNDM', price: 1100 },
  { vendorId: 'JV07', customerId: 'JC08', productId: 'JP11', unitIdx: 1, prefix: 'BRCM', price: 4200 },
  { vendorId: 'JV09', customerId: 'JC10', productId: 'JP12', unitIdx: 1, prefix: 'PUJA', price: 9500 },
  { vendorId: 'JV10', customerId: 'JC11', productId: 'JP05', unitIdx: 61, prefix: 'RING', price: 1650 },
  { vendorId: 'JV02', customerId: 'JC03', productId: 'JP09', unitIdx: 1, prefix: 'ERJK', price: 2500 },
];

let saleCount = 0;
for (const s of sales) {
  const product = products.find(p => p.id === s.productId)!;
  const customer = customers.find(c => c.id === s.customerId)!;
  const barcode = `${s.prefix}${String(s.unitIdx).padStart(3, '0')}`;
  const saleDate = daysAgo(Math.floor(Math.random() * 20) + 1);
  const saleId = `JS-${saleCount + 1}`;
  const warrantyExpiry = new Date(saleDate);
  warrantyExpiry.setMonth(warrantyExpiry.getMonth() + product.warranty);
  insertSale.run(saleId, barcode, s.productId, s.vendorId, s.customerId, customer.name, customer.phone, customer.email, saleDate, product.reward, s.price);
  updateDistSold.run(barcode);
  db.prepare("UPDATE product_inventory SET status = 'Sold' WHERE barcode = ?").run(barcode);
  insertWarranty.run(`JW-${saleCount + 1}`, s.productId, barcode, customer.name, customer.phone, saleDate, warrantyExpiry.toISOString().slice(0, 10), 'Active');
  insertReward.run(`JR-${saleCount + 1}`, 'D1', product.reward, 'Earned', `${product.name} sold`, saleDate, s.vendorId, saleId);
  updateVendorSales.run(product.reward, s.vendorId);
  saleCount++;
  console.log(`  ${customer.name} bought ${product.name} — ₹${s.price}`);
}
console.log(`✓ ${saleCount} sales\n`);

// ============ TRANSACTIONS ============
const transactions = [
  { id: 'JT01', date: daysAgo(25), type: 'Sales', amount: 85000, desc: 'Wholesale to Laxmi Jewellers', status: 'Completed' },
  { id: 'JT02', date: daysAgo(22), type: 'Sales', amount: 120000, desc: 'Monthly dispatch to Ganesh Silver House', status: 'Completed' },
  { id: 'JT03', date: daysAgo(20), type: 'Purchase', amount: 55000, desc: 'Raw silver purchase - 1kg', status: 'Completed' },
  { id: 'JT04', date: daysAgo(15), type: 'Purchase', amount: 12000, desc: 'CZ stones and gems', status: 'Completed' },
  { id: 'JT05', date: daysAgo(12), type: 'Expense', amount: 8000, desc: 'Karigari (artisan labor)', status: 'Completed' },
  { id: 'JT06', date: daysAgo(10), type: 'Sales', amount: 45000, desc: 'Direct sale to Rajputana Jewels', status: 'Completed' },
  { id: 'JT07', date: daysAgo(8), type: 'Expense', amount: 5000, desc: 'Hallmarking charges', status: 'Completed' },
  { id: 'JT08', date: daysAgo(5), type: 'Sales', amount: 32000, desc: 'Pooja thali orders - Devi Silver', status: 'Pending' },
];
const insertTx = db.prepare('INSERT OR IGNORE INTO transactions (id, date, type, amount, description, status) VALUES (?, ?, ?, ?, ?, ?)');
for (const t of transactions) insertTx.run(t.id, t.date, t.type, t.amount, t.desc, t.status);
console.log(`✓ ${transactions.length} transactions\n`);

// ============ BANKS ============
const banks = [
  { id: 'JB01', name: 'Business Current Account', accountNumber: '50200098765432', bankName: 'HDFC Bank', branch: 'Zaveri Bazar, Mumbai', ifscCode: 'HDFC0000123' },
  { id: 'JB02', name: 'Savings Account', accountNumber: '30987654321098', bankName: 'Bank of Baroda', branch: 'Fort, Mumbai', ifscCode: 'BARB0FORTMU' },
];
const insertBank = db.prepare('INSERT OR IGNORE INTO banks (id, name, account_number, bank_name, branch, ifsc_code) VALUES (?, ?, ?, ?, ?, ?)');
for (const b of banks) insertBank.run(b.id, b.name, b.accountNumber, b.bankName, b.branch, b.ifscCode);
console.log(`✓ ${banks.length} bank accounts\n`);

// ============ REWARD RULES ============
db.prepare('INSERT OR IGNORE INTO reward_rules (id, products_sold_threshold, reward_points, description) VALUES (?, ?, ?, ?)').run('JRR1', 10, 100, 'Sell 10 items = 100 bonus pts');
db.prepare('INSERT OR IGNORE INTO reward_rules (id, products_sold_threshold, reward_points, description) VALUES (?, ?, ?, ?)').run('JRR2', 25, 300, 'Sell 25 items = 300 bonus pts');
db.prepare('INSERT OR IGNORE INTO reward_rules (id, products_sold_threshold, reward_points, description) VALUES (?, ?, ?, ?)').run('JRR3', 50, 750, 'Sell 50 items = 750 bonus pts');
console.log('✓ 3 reward rules\n');

console.log('═══════════════════════════════════════════════');
console.log('  Silver Jewellery demo data seeded!');
console.log('  Company: Shree Silver Jewellers');
console.log('  Admin: admin@splendor.com / admin123');
console.log('  12 vendors, 12 products (705 units)');
console.log('  15 customers, 12 sales, 8 payments');
console.log('═══════════════════════════════════════════════');
