import { Router } from 'express';
import { db } from '../db';
import { hashPassword } from '../utils/helpers';

const router = Router();

router.get('/api/vendors', (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM vendors ORDER BY name';
    const params: string[] = [];
    if (typeof search === 'string' && search) {
      sql = 'SELECT * FROM vendors WHERE name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY name';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const stmt = db.prepare(sql);
    const rows = params.length ? stmt.all(...params) : stmt.all();
    const list = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      name: r.name,
      contactPerson: r.contact_person,
      phone: r.phone,
      email: r.email,
      address: r.address,
      totalSales: r.total_sales ?? 0,
      totalRewardPoints: r.total_reward_points ?? 0,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/vendors', (req, res) => {
  try {
    const { name, contactPerson, phone, email, address } = req.body;
    const id = `V${Date.now()}`;
    const stmt = db.prepare('INSERT INTO vendors (id, name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(id, name ?? '', contactPerson, phone, email, address);
    const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Record<string, unknown>;
    let credentials: { email: string; password: string } | null = null;
    if (email && typeof email === 'string' && email.includes('@')) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (!existing) {
        const defaultPassword = `${(name ?? 'vendor').replace(/\s+/g, '').toLowerCase()}@123`;
        const userId = `U${Date.now()}`;
        const perms = JSON.stringify(['dashboard', 'sales', 'distribution', 'warranty', 'replacements', 'rewards', 'masters', 'settings']);
        db.prepare(`
          INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name, permissions, vendor_id)
          VALUES (?, ?, ?, ?, ?, ?, 'Vendor', ?, ?, ?)
        `).run(userId, email, hashPassword(defaultPassword), contactPerson || name || '', phone || null, address || null, name || null, perms, id);
        credentials = { email, password: defaultPassword };
      }
    }
    res.status(201).json({
      id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, totalSales: 0, totalRewardPoints: 0,
      credentials,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/vendors/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, contactPerson, phone, email, address } = req.body;
    const stmt = db.prepare('UPDATE vendors SET name=COALESCE(?,name), contact_person=COALESCE(?,contact_person), phone=COALESCE(?,phone), email=COALESCE(?,email), address=COALESCE(?,address) WHERE id=?');
    const result = stmt.run(name, contactPerson, phone, email, address, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Vendor not found' });
    const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ id: row.id, name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, totalSales: row.total_sales ?? 0, totalRewardPoints: row.total_reward_points ?? 0 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/vendors/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM vendors WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
