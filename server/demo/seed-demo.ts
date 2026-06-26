import { db } from '../db';
import { hashPassword } from '../utils/helpers';

console.log('Seeding demo data...\n');

// ============ VENDORS (15) ============
const vendors = [
  { id: 'VD01', name: 'Rajesh Electricals', contactPerson: 'Rajesh Sharma', phone: '9876543210', email: 'rajesh@electricals.com', address: 'MG Road, Pune, Maharashtra' },
  { id: 'VD02', name: 'Sharma Pump House', contactPerson: 'Vikram Sharma', phone: '9823456789', email: 'vikram@sharmapumps.com', address: 'Station Road, Nashik, Maharashtra' },
  { id: 'VD03', name: 'Patel Motor Works', contactPerson: 'Hitesh Patel', phone: '9712345678', email: 'hitesh@patelmotors.com', address: 'Ring Road, Ahmedabad, Gujarat' },
  { id: 'VD04', name: 'Singh Pump Agency', contactPerson: 'Harpreet Singh', phone: '9856789012', email: 'harpreet@singhpumps.com', address: 'GT Road, Ludhiana, Punjab' },
  { id: 'VD05', name: 'Gupta & Sons Trading', contactPerson: 'Amit Gupta', phone: '9934567890', email: 'amit@guptasons.com', address: 'Bara Bazar, Kolkata, West Bengal' },
  { id: 'VD06', name: 'Reddy Irrigation Systems', contactPerson: 'Venkat Reddy', phone: '9848123456', email: 'venkat@reddyirrigation.com', address: 'Ameerpet, Hyderabad, Telangana' },
  { id: 'VD07', name: 'Nair Pump Distributors', contactPerson: 'Suresh Nair', phone: '9447123456', email: 'suresh@nairpumps.com', address: 'MG Road, Kochi, Kerala' },
  { id: 'VD08', name: 'Deshmukh Agri Supplies', contactPerson: 'Sachin Deshmukh', phone: '9881234567', email: 'sachin@deshmukh.com', address: 'Sadar Bazar, Nagpur, Maharashtra' },
  { id: 'VD09', name: 'Joshi Hardware & Pumps', contactPerson: 'Mahesh Joshi', phone: '9422123456', email: 'mahesh@joshihardware.com', address: 'Laxmi Road, Pune, Maharashtra' },
  { id: 'VD10', name: 'Iyer Borewells', contactPerson: 'Ramesh Iyer', phone: '9845612345', email: 'ramesh@iyerborewells.com', address: 'Jayanagar, Bangalore, Karnataka' },
  { id: 'VD11', name: 'Khan Water Solutions', contactPerson: 'Imran Khan', phone: '9321456789', email: 'imran@khanwater.com', address: 'Camp Area, Pune, Maharashtra' },
  { id: 'VD12', name: 'Yadav Pump Centre', contactPerson: 'Sunil Yadav', phone: '9415678901', email: 'sunil@yadavpumps.com', address: 'Civil Lines, Lucknow, Uttar Pradesh' },
  { id: 'VD13', name: 'Mehta Industrial Supply', contactPerson: 'Kiran Mehta', phone: '9825678901', email: 'kiran@mehtaindustrial.com', address: 'Ashram Road, Ahmedabad, Gujarat' },
  { id: 'VD14', name: 'Das Engineering Works', contactPerson: 'Biplab Das', phone: '9830567890', email: 'biplab@dasengineering.com', address: 'Salt Lake, Kolkata, West Bengal' },
  { id: 'VD15', name: 'Verma Agro Traders', contactPerson: 'Rakesh Verma', phone: '9425678901', email: 'rakesh@vermaagro.com', address: 'Palasia, Indore, Madhya Pradesh' },
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

// ============ PRODUCTS (10) ============
const products = [
  { id: 'PD01', name: 'Splendor Submersible Pump 1HP', prefix: 'SUB1H', qty: 50, price: 8500, reward: 20, warranty: 24, hsn: '8413', gst: 18, desc: '1HP submersible pump for domestic use' },
  { id: 'PD02', name: 'Splendor Submersible Pump 3HP', prefix: 'SUB3H', qty: 40, price: 18500, reward: 40, warranty: 24, hsn: '8413', gst: 18, desc: '3HP submersible for agriculture' },
  { id: 'PD03', name: 'Splendor Submersible Pump 5HP', prefix: 'SUB5H', qty: 30, price: 25000, reward: 60, warranty: 24, hsn: '8413', gst: 18, desc: '5HP heavy duty submersible' },
  { id: 'PD04', name: 'Splendor Monoblock Pump 1HP', prefix: 'MNO1H', qty: 60, price: 6500, reward: 15, warranty: 12, hsn: '8413', gst: 18, desc: '1HP monoblock self-priming' },
  { id: 'PD05', name: 'Splendor Monoblock Pump 2HP', prefix: 'MNO2H', qty: 45, price: 9500, reward: 25, warranty: 12, hsn: '8413', gst: 18, desc: '2HP monoblock for farming' },
  { id: 'PD06', name: 'Splendor Openwell Pump 3HP', prefix: 'OPN3H', qty: 35, price: 12000, reward: 30, warranty: 18, hsn: '8413', gst: 18, desc: '3HP openwell pump' },
  { id: 'PD07', name: 'Splendor Borewell Compressor 5HP', prefix: 'BWC5H', qty: 20, price: 32000, reward: 70, warranty: 24, hsn: '8414', gst: 18, desc: '5HP borewell compressor' },
  { id: 'PD08', name: 'Splendor Control Panel Digital', prefix: 'CPNLD', qty: 80, price: 3500, reward: 10, warranty: 12, hsn: '8537', gst: 18, desc: 'Digital motor control panel' },
  { id: 'PD09', name: 'Splendor Pressure Booster 1HP', prefix: 'PBR1H', qty: 25, price: 14000, reward: 35, warranty: 18, hsn: '8413', gst: 18, desc: '1HP pressure booster for buildings' },
  { id: 'PD10', name: 'Splendor Solar Pump Controller', prefix: 'SOLAR', qty: 15, price: 45000, reward: 100, warranty: 36, hsn: '8537', gst: 12, desc: 'Solar pump VFD controller' },
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
  console.log(`  Product: ${p.name} — ${p.qty} units (${p.prefix}001 to ${p.prefix}${String(p.qty).padStart(3, '0')})`);
}
console.log(`✓ ${products.length} products created (${products.reduce((s, p) => s + p.qty, 0)} total units)\n`);

// ============ CUSTOMERS (20) ============
const customers = [
  { id: 'CD01', name: 'Ramesh Patil', phone: '9876001001', email: 'ramesh.patil@email.com', address: 'Kothrud, Pune', vendorId: 'VD01' },
  { id: 'CD02', name: 'Sunita Devi', phone: '9876001002', email: 'sunita.devi@email.com', address: 'Hadapsar, Pune', vendorId: 'VD01' },
  { id: 'CD03', name: 'Manoj Kumar', phone: '9876001003', email: 'manoj.k@email.com', address: 'Baner, Pune', vendorId: 'VD02' },
  { id: 'CD04', name: 'Priya Desai', phone: '9876001004', email: 'priya.d@email.com', address: 'Pimpri, Pune', vendorId: 'VD02' },
  { id: 'CD05', name: 'Anil Joshi', phone: '9876001005', email: 'anil.j@email.com', address: 'Navrangpura, Ahmedabad', vendorId: 'VD03' },
  { id: 'CD06', name: 'Kavita Patel', phone: '9876001006', email: 'kavita.p@email.com', address: 'Satellite, Ahmedabad', vendorId: 'VD03' },
  { id: 'CD07', name: 'Gurpreet Kaur', phone: '9876001007', email: 'gurpreet.k@email.com', address: 'Model Town, Ludhiana', vendorId: 'VD04' },
  { id: 'CD08', name: 'Deepak Gupta', phone: '9876001008', email: 'deepak.g@email.com', address: 'Howrah, Kolkata', vendorId: 'VD05' },
  { id: 'CD09', name: 'Lakshmi Reddy', phone: '9876001009', email: 'lakshmi.r@email.com', address: 'Secunderabad, Hyderabad', vendorId: 'VD06' },
  { id: 'CD10', name: 'Ajay Nair', phone: '9876001010', email: 'ajay.n@email.com', address: 'Ernakulam, Kochi', vendorId: 'VD07' },
  { id: 'CD11', name: 'Neha Deshmukh', phone: '9876001011', email: 'neha.d@email.com', address: 'Dharampeth, Nagpur', vendorId: 'VD08' },
  { id: 'CD12', name: 'Sanjay Kulkarni', phone: '9876001012', email: 'sanjay.k@email.com', address: 'Shivajinagar, Pune', vendorId: 'VD09' },
  { id: 'CD13', name: 'Meena Iyer', phone: '9876001013', email: 'meena.i@email.com', address: 'Koramangala, Bangalore', vendorId: 'VD10' },
  { id: 'CD14', name: 'Farhan Sheikh', phone: '9876001014', email: 'farhan.s@email.com', address: 'Kondhwa, Pune', vendorId: 'VD11' },
  { id: 'CD15', name: 'Pooja Yadav', phone: '9876001015', email: 'pooja.y@email.com', address: 'Gomti Nagar, Lucknow', vendorId: 'VD12' },
  { id: 'CD16', name: 'Ravi Mehta', phone: '9876001016', email: 'ravi.m@email.com', address: 'CG Road, Ahmedabad', vendorId: 'VD13' },
  { id: 'CD17', name: 'Tapas Bhattacharya', phone: '9876001017', email: 'tapas.b@email.com', address: 'Jadavpur, Kolkata', vendorId: 'VD14' },
  { id: 'CD18', name: 'Ashok Verma', phone: '9876001018', email: 'ashok.v@email.com', address: 'Vijay Nagar, Indore', vendorId: 'VD15' },
  { id: 'CD19', name: 'Sita Ram', phone: '9876001019', email: 'sita.r@email.com', address: 'Wagholi, Pune', vendorId: null },
  { id: 'CD20', name: 'Ganesh Bhosale', phone: '9876001020', email: 'ganesh.b@email.com', address: 'Hinjewadi, Pune', vendorId: null },
];

const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (id, name, phone, email, address, vendor_id) VALUES (?, ?, ?, ?, ?, ?)');
for (const c of customers) {
  insertCustomer.run(c.id, c.name, c.phone, c.email, c.address, c.vendorId);
}
console.log(`✓ ${customers.length} customers created\n`);

// ============ DISTRIBUTE PRODUCTS TO VENDORS ============
console.log('Distributing products to vendors...');
const distributions = [
  // First batch — 25 days ago
  { vendorId: 'VD01', productId: 'PD01', count: 5, discount: 10, daysAgoVal: 25 },
  { vendorId: 'VD01', productId: 'PD04', count: 6, discount: 10, daysAgoVal: 25 },
  { vendorId: 'VD02', productId: 'PD02', count: 4, discount: 8, daysAgoVal: 25 },
  { vendorId: 'VD02', productId: 'PD05', count: 5, discount: 8, daysAgoVal: 25 },
  { vendorId: 'VD03', productId: 'PD03', count: 3, discount: 12, daysAgoVal: 25 },
  { vendorId: 'VD03', productId: 'PD06', count: 4, discount: 12, daysAgoVal: 25 },
  { vendorId: 'VD04', productId: 'PD01', count: 4, discount: 7, daysAgoVal: 20 },
  { vendorId: 'VD05', productId: 'PD04', count: 6, discount: 10, daysAgoVal: 20 },
  { vendorId: 'VD06', productId: 'PD07', count: 3, discount: 5, daysAgoVal: 20 },
  { vendorId: 'VD07', productId: 'PD08', count: 10, discount: 15, daysAgoVal: 18 },
  { vendorId: 'VD08', productId: 'PD02', count: 3, discount: 8, daysAgoVal: 18 },
  { vendorId: 'VD09', productId: 'PD05', count: 4, discount: 10, daysAgoVal: 15 },
  { vendorId: 'VD10', productId: 'PD09', count: 3, discount: 6, daysAgoVal: 15 },
  { vendorId: 'VD11', productId: 'PD06', count: 3, discount: 10, daysAgoVal: 15 },
  { vendorId: 'VD12', productId: 'PD01', count: 3, discount: 5, daysAgoVal: 12 },
  { vendorId: 'VD13', productId: 'PD10', count: 2, discount: 8, daysAgoVal: 12 },
  { vendorId: 'VD14', productId: 'PD08', count: 6, discount: 12, daysAgoVal: 10 },
  { vendorId: 'VD15', productId: 'PD03', count: 3, discount: 10, daysAgoVal: 10 },
  // Repeat orders — same vendors ordering same products again on different dates
  { vendorId: 'VD01', productId: 'PD01', count: 3, discount: 10, daysAgoVal: 8 },
  { vendorId: 'VD01', productId: 'PD04', count: 4, discount: 12, daysAgoVal: 8 },
  { vendorId: 'VD02', productId: 'PD02', count: 2, discount: 10, daysAgoVal: 5 },
  { vendorId: 'VD03', productId: 'PD03', count: 2, discount: 12, daysAgoVal: 5 },
  { vendorId: 'VD05', productId: 'PD04', count: 4, discount: 10, daysAgoVal: 3 },
  { vendorId: 'VD07', productId: 'PD08', count: 5, discount: 15, daysAgoVal: 3 },
  { vendorId: 'VD10', productId: 'PD09', count: 2, discount: 8, daysAgoVal: 2 },
];

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const insertDist = db.prepare('INSERT OR IGNORE INTO product_distribution (id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const updateInvStatus = db.prepare("UPDATE product_inventory SET status = 'Distributed' WHERE barcode = ?");

let distCount = 0;
for (let di = 0; di < distributions.length; di++) {
  const d = distributions[di];
  const product = products.find(p => p.id === d.productId)!;
  const netPrice = Math.round(product.price * (100 - d.discount) / 100);
  const invRows = db.prepare("SELECT barcode FROM product_inventory WHERE product_id = ? AND status = 'InStock' LIMIT ?").all(d.productId, d.count) as { barcode: string }[];
  const date = daysAgo(d.daysAgoVal);
  for (let i = 0; i < invRows.length; i++) {
    const bc = invRows[i].barcode;
    insertDist.run(`DD-${di}-${d.vendorId}-${d.productId}-${i + 1}`, d.productId, bc, d.vendorId, date, 'Distributed', d.discount, netPrice);
    updateInvStatus.run(bc);
    distCount++;
  }
  console.log(`  ${invRows.length} x ${product.name} → ${vendors.find(v => v.id === d.vendorId)!.name} (${d.discount}% off, ${date})`);
}
console.log(`✓ ${distCount} units distributed\n`);

// ============ VENDOR PAYMENTS (partial) ============
console.log('Recording vendor payments...');
const insertPayment = db.prepare('INSERT OR IGNORE INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');

const payments = [
  { vendorId: 'VD01', amount: 80000, method: 'Bank Transfer', ref: 'NEFT-001234' },
  { vendorId: 'VD02', amount: 120000, method: 'UPI', ref: 'UPI-9823456789' },
  { vendorId: 'VD03', amount: 150000, method: 'Cheque', ref: 'CHQ-445566' },
  { vendorId: 'VD04', amount: 30000, method: 'Cash', ref: null },
  { vendorId: 'VD05', amount: 40000, method: 'UPI', ref: 'UPI-9934567890' },
  { vendorId: 'VD06', amount: 100000, method: 'Bank Transfer', ref: 'NEFT-005678' },
  { vendorId: 'VD07', amount: 25000, method: 'Cash', ref: null },
  { vendorId: 'VD08', amount: 60000, method: 'Bank Transfer', ref: 'NEFT-007890' },
  { vendorId: 'VD10', amount: 40000, method: 'UPI', ref: 'UPI-9845612345' },
  { vendorId: 'VD13', amount: 80000, method: 'Bank Transfer', ref: 'NEFT-009012' },
];

for (const p of payments) {
  insertPayment.run(`VP-DEMO-${p.vendorId}`, p.vendorId, p.amount, daysAgo(Math.floor(Math.random() * 15) + 1), p.method, p.ref, 'Demo payment');
  const vn = vendors.find(v => v.id === p.vendorId)!.name;
  console.log(`  ${vn}: ₹${p.amount.toLocaleString()} via ${p.method}`);
}
console.log(`✓ ${payments.length} payments recorded\n`);

// ============ SOME SALES (simulate vendor selling to customers) ============
console.log('Recording sample sales...');
const insertSale = db.prepare('INSERT OR IGNORE INTO product_sales (id, barcode, product_id, vendor_id, customer_id, customer_name, customer_phone, customer_email, purchase_date, reward_points_earned, sale_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertWarranty = db.prepare('INSERT OR IGNORE INTO warranties (id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertReward = db.prepare('INSERT OR IGNORE INTO rewards (id, user_id, points, type, description, date, vendor_id, sale_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const updateDistSold = db.prepare("UPDATE product_distribution SET status = 'Sold' WHERE barcode = ?");
const updateVendorSales = db.prepare('UPDATE vendors SET total_sales = total_sales + 1, total_reward_points = total_reward_points + ? WHERE id = ?');

const sales = [
  { vendorId: 'VD01', customerId: 'CD01', productId: 'PD01', prefix: 'SUB1H', unitIdx: 1, price: 9000 },
  { vendorId: 'VD01', customerId: 'CD02', productId: 'PD04', unitIdx: 1, prefix: 'MNO1H', price: 7000 },
  { vendorId: 'VD02', customerId: 'CD03', productId: 'PD02', unitIdx: 1, prefix: 'SUB3H', price: 20000 },
  { vendorId: 'VD02', customerId: 'CD04', productId: 'PD05', unitIdx: 1, prefix: 'MNO2H', price: 10500 },
  { vendorId: 'VD03', customerId: 'CD05', productId: 'PD03', unitIdx: 1, prefix: 'SUB5H', price: 27000 },
  { vendorId: 'VD03', customerId: 'CD06', productId: 'PD06', unitIdx: 1, prefix: 'OPN3H', price: 13000 },
  { vendorId: 'VD05', customerId: 'CD08', productId: 'PD04', unitIdx: 11, prefix: 'MNO1H', price: 7200 },
  { vendorId: 'VD06', customerId: 'CD09', productId: 'PD07', unitIdx: 1, prefix: 'BWC5H', price: 35000 },
  { vendorId: 'VD10', customerId: 'CD13', productId: 'PD09', unitIdx: 1, prefix: 'PBR1H', price: 15500 },
  { vendorId: 'VD13', customerId: 'CD16', productId: 'PD10', unitIdx: 1, prefix: 'SOLAR', price: 48000 },
];

let saleCount = 0;
for (const s of sales) {
  const product = products.find(p => p.id === s.productId)!;
  const customer = customers.find(c => c.id === s.customerId)!;
  const barcode = `${s.prefix}${String(s.unitIdx).padStart(3, '0')}`;
  const saleDate = daysAgo(Math.floor(Math.random() * 20) + 1);
  const saleId = `SD-${s.vendorId}-${saleCount + 1}`;
  const warrantyExpiry = new Date(saleDate);
  warrantyExpiry.setMonth(warrantyExpiry.getMonth() + product.warranty);

  insertSale.run(saleId, barcode, s.productId, s.vendorId, s.customerId, customer.name, customer.phone, customer.email, saleDate, product.reward, s.price);
  updateDistSold.run(barcode);
  db.prepare("UPDATE product_inventory SET status = 'Sold' WHERE barcode = ?").run(barcode);
  insertWarranty.run(`WD-${saleCount + 1}`, s.productId, barcode, customer.name, customer.phone, saleDate, warrantyExpiry.toISOString().slice(0, 10), 'Active');
  insertReward.run(`RD-${saleCount + 1}`, 'D1', product.reward, 'Earned', `${product.name} sold`, saleDate, s.vendorId, saleId);
  updateVendorSales.run(product.reward, s.vendorId);
  saleCount++;
  console.log(`  ${customer.name} bought ${product.name} from ${vendors.find(v => v.id === s.vendorId)!.name} — ₹${s.price.toLocaleString()}`);
}
console.log(`✓ ${saleCount} sales recorded\n`);

// ============ BANKS ============
const banks = [
  { id: 'BK01', name: 'Main Current Account', accountNumber: '50200012345678', bankName: 'HDFC Bank', branch: 'Pune Main Branch', ifscCode: 'HDFC0001234' },
  { id: 'BK02', name: 'Savings Account', accountNumber: '912010012345678', bankName: 'State Bank of India', branch: 'Pune City Branch', ifscCode: 'SBIN0005678' },
  { id: 'BK03', name: 'Operations Account', accountNumber: '014104012345678', bankName: 'ICICI Bank', branch: 'Hinjewadi Branch', ifscCode: 'ICIC0001456' },
];

const insertBank = db.prepare('INSERT OR IGNORE INTO banks (id, name, account_number, bank_name, branch, ifsc_code) VALUES (?, ?, ?, ?, ?, ?)');
for (const b of banks) {
  insertBank.run(b.id, b.name, b.accountNumber, b.bankName, b.branch, b.ifscCode);
}
console.log(`✓ ${banks.length} bank accounts created\n`);

// ============ REWARD RULES ============
const rules = [
  { id: 'RR01', threshold: 5, points: 50, desc: 'Sell 5 pumps = 50 bonus pts' },
  { id: 'RR02', threshold: 10, points: 150, desc: 'Sell 10 pumps = 150 bonus pts' },
  { id: 'RR03', threshold: 25, points: 500, desc: 'Sell 25 pumps = 500 bonus pts' },
];

const insertRule = db.prepare('INSERT OR IGNORE INTO reward_rules (id, products_sold_threshold, reward_points, description) VALUES (?, ?, ?, ?)');
for (const r of rules) {
  insertRule.run(r.id, r.threshold, r.points, r.desc);
}
console.log(`✓ ${rules.length} reward rules created\n`);

console.log('═══════════════════════════════════════════');
console.log('  Demo data seeded successfully!');
console.log('  Admin login: admin@splendor.com / admin123');
console.log('  Vendor logins: {vendorname}@{domain} / {name}@123');
console.log('═══════════════════════════════════════════');
