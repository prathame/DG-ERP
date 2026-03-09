import express from 'express';
import path from 'path';
import { db } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());

// Serve static files in production
app.use(express.static(path.join(process.cwd(), 'dist')));

// ============ PRODUCTS ============
app.get('/api/products', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM products ORDER BY name');
    const rows = stmt.all();
    const products = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      serialNumber: r.serial_number,
      category: r.category,
      warrantyMonths: r.warranty_months,
      price: r.price,
      stock: r.stock,
    }));
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const { name, serialNumber, category, warrantyMonths, price, stock } = req.body;
    const id = `P${Date.now()}`;
    const stmt = db.prepare(`
      INSERT INTO products (id, name, serial_number, category, warranty_months, price, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, serialNumber, category, warrantyMonths ?? 12, price ?? 0, stock ?? 0);
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      name: row.name,
      serialNumber: row.serial_number,
      category: row.category,
      warrantyMonths: row.warranty_months,
      price: row.price,
      stock: row.stock,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, serialNumber, category, warrantyMonths, price, stock } = req.body;
    const stmt = db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        serial_number = COALESCE(?, serial_number),
        category = COALESCE(?, category),
        warranty_months = COALESCE(?, warranty_months),
        price = COALESCE(?, price),
        stock = COALESCE(?, stock)
      WHERE id = ?
    `);
    const result = stmt.run(name, serialNumber, category, warrantyMonths, price, stock, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({
      id: row.id,
      name: row.name,
      serialNumber: row.serial_number,
      category: row.category,
      warrantyMonths: row.warranty_months,
      price: row.price,
      stock: row.stock,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM products WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ WARRANTIES ============
app.get('/api/warranties', (req, res) => {
  try {
    const { search, status } = req.query;
    let sql = 'SELECT * FROM warranties WHERE 1=1';
    const params: (string | number)[] = [];
    if (typeof search === 'string' && search) {
      sql += ' AND (serial_number LIKE ? OR customer_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (typeof status === 'string' && status && status !== 'All Status') {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY activation_date DESC';
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    const warranties = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      productId: r.product_id,
      serialNumber: r.serial_number,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      activationDate: r.activation_date,
      expiryDate: r.expiry_date,
      status: r.status,
    }));
    res.json(warranties);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/warranties', (req, res) => {
  try {
    const { serialNumber, customerName, customerPhone } = req.body;
    const id = `W${Date.now()}`;
    const activationDate = new Date().toISOString().slice(0, 10);
    const product = db.prepare('SELECT id, warranty_months FROM products WHERE serial_number = ?').get(serialNumber) as { id: string; warranty_months: number } | undefined;
    const warrantyMonths = product?.warranty_months ?? 24;
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
    const expiryStr = expiryDate.toISOString().slice(0, 10);
    const productId = product?.id ?? '1';
    const stmt = db.prepare(`
      INSERT INTO warranties (id, product_id, serial_number, customer_name, customer_phone, activation_date, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
    `);
    stmt.run(id, productId, serialNumber, customerName, customerPhone, activationDate, expiryStr);
    const row = db.prepare('SELECT * FROM warranties WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      productId: row.product_id,
      serialNumber: row.serial_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      activationDate: row.activation_date,
      expiryDate: row.expiry_date,
      status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ TRANSACTIONS ============
app.get('/api/transactions', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM transactions ORDER BY date DESC');
    const rows = stmt.all();
    const transactions = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      date: r.date,
      type: r.type,
      amount: r.amount,
      description: r.description,
      status: r.status,
    }));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/transactions', (req, res) => {
  try {
    const { date, type, amount, description, status } = req.body;
    const id = `T${Date.now()}`;
    const stmt = db.prepare(`
      INSERT INTO transactions (id, date, type, amount, description, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, date ?? new Date().toISOString().slice(0, 10), type, amount, description, status ?? 'Completed');
    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      date: row.date,
      type: row.type,
      amount: row.amount,
      description: row.description,
      status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ REWARDS ============
app.get('/api/rewards', (req, res) => {
  try {
    const { type } = req.query;
    let rows: Record<string, unknown>[];
    if (typeof type === 'string' && type && type !== 'All') {
      const stmt = db.prepare('SELECT * FROM rewards WHERE type = ? ORDER BY date DESC');
      rows = stmt.all(type) as Record<string, unknown>[];
    } else {
      const stmt = db.prepare('SELECT * FROM rewards ORDER BY date DESC');
      rows = stmt.all() as Record<string, unknown>[];
    }
    const rewards = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      points: r.points,
      type: r.type,
      description: r.description,
      date: r.date,
    }));
    res.json(rewards);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/rewards/balance', (req, res) => {
  try {
    const earned = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned'").get() as { total: number };
    const redeemed = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Redeemed'").get() as { total: number };
    res.json({ balance: earned.total - redeemed.total });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ DASHBOARD ============
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Sales'").get() as { total: number };
    const warranties = db.prepare("SELECT COUNT(*) as count FROM warranties WHERE status = 'Active'").get() as { count: number };
    const pendingClaims = db.prepare("SELECT COUNT(*) as count FROM warranties WHERE status = 'Under Claim'").get() as { count: number };
    const rewardsEarned = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned'").get() as { total: number };
    res.json({
      totalRevenue: revenue.total,
      activeWarranties: warranties.count,
      pendingClaims: pendingClaims.count,
      rewardPointsIssued: rewardsEarned.total,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/dashboard/chart', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT strftime('%m', date) as month_num, strftime('%Y', date) as year, type, SUM(amount) as total
      FROM transactions
      WHERE date >= date('now', '-6 months')
      GROUP BY year, month_num, type
    `).all() as { month_num: string; year: string; type: string; total: number }[];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const byMonth: Record<string, { sales: number; claims: number }> = {};
    for (const r of rows) {
      const key = `${r.year}-${r.month_num}`;
      if (!byMonth[key]) byMonth[key] = { sales: 0, claims: 0 };
      if (r.type === 'Sales') byMonth[key].sales += r.total;
      else if (r.type === 'Purchase') byMonth[key].claims += r.total;
    }
    const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    let chartData = sorted.map(([k, v]) => {
      const [, m] = k.split('-');
      return { name: monthNames[parseInt(m, 10) - 1], sales: Math.round(v.sales), claims: Math.round(v.claims) };
    });
    if (chartData.length === 0) {
      chartData = [{ name: 'N/A', sales: 0, claims: 0 }];
    }
    res.json(chartData);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ MASTERS (counts) ============
app.get('/api/masters/counts', (req, res) => {
  try {
    const products = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
    res.json({
      customerMaster: 0,
      vendorMaster: 0,
      itemMaster: products.count,
      bankMaster: 0,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
