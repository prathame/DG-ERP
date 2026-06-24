import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/api/customers', (req, res) => {
  try {
    const { search, vendorId } = req.query;
    let sql = 'SELECT * FROM customers';
    const params: string[] = [];
    const conditions: string[] = [];
    if (typeof vendorId === 'string' && vendorId) {
      conditions.push('vendor_id = ?');
      params.push(vendorId);
    }
    if (typeof search === 'string' && search) {
      conditions.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY name';
    const stmt = db.prepare(sql);
    const rows = params.length ? stmt.all(...params) : stmt.all();
    const list = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      vendorId: r.vendor_id ?? null,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/customers', (req, res) => {
  try {
    const { name, phone, email, address, vendorId } = req.body;
    const id = `C${Date.now()}`;
    const stmt = db.prepare('INSERT INTO customers (id, name, phone, email, address, vendor_id) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(id, name ?? '', phone, email, address, vendorId || null);
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, vendorId: row.vendor_id ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/customers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, address, vendorId } = req.body;
    const stmt = db.prepare('UPDATE customers SET name=COALESCE(?,name), phone=COALESCE(?,phone), email=COALESCE(?,email), address=COALESCE(?,address), vendor_id=? WHERE id=?');
    const result = stmt.run(name, phone, email, address, vendorId === '' || vendorId === undefined ? null : vendorId, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, vendorId: row.vendor_id ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/customers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM customers WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/customers/:id/purchases', (req, res) => {
  try {
    const { id } = req.params;
    const customer = db.prepare('SELECT id, phone FROM customers WHERE id = ?').get(id) as { id: string; phone: string | null } | undefined;
    if (!customer) return res.json([]);
    const rows = db.prepare(`
      SELECT ps.barcode, ps.purchase_date, p.name as product_name, p.id as product_id, v.name as vendor_name, v.id as vendor_id
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id
      JOIN vendors v ON ps.vendor_id = v.id
      WHERE ps.customer_id = ? OR (ps.customer_id IS NULL AND ps.customer_phone = ?)
      ORDER BY ps.purchase_date DESC
    `).all(id, customer.phone ?? '') as { barcode: string; purchase_date: string; product_name: string; product_id: string; vendor_name: string; vendor_id: string }[];
    res.json(rows.map((r) => ({
      productName: r.product_name,
      productId: r.product_id,
      vendorName: r.vendor_name,
      vendorId: r.vendor_id,
      barcode: r.barcode,
      purchaseDate: r.purchase_date,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/customers/:id/vendor', (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.body;
    const stmt = db.prepare('UPDATE customers SET vendor_id = ? WHERE id = ?');
    const result = stmt.run(vendorId || null, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, vendorId: row.vendor_id ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
