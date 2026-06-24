import { Router } from 'express';
import { db } from '../db';
import { hashPassword } from '../utils/helpers';

const router = Router();

router.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, name, phone, address, role, companyName } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const id = `U${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, hashPassword(password), name ?? '', phone ?? null, address ?? null, role ?? 'Admin', companyName ?? null);
    const row = db.prepare('SELECT id, email, name, phone, address, role, company_name FROM users WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const row = db.prepare('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id, auto_whatsapp, default_gst_rate FROM users WHERE email = ? AND password_hash = ?').get(email, hashPassword(password)) as Record<string, unknown> | undefined;
    if (!row) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, permissions: row.permissions ? JSON.parse(row.permissions as string) : null, vendorId: row.vendor_id ?? null, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/settings/profile', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const row = db.prepare('SELECT id, email, name, phone, address, role, company_name, permissions, vendor_id, auto_whatsapp, default_gst_rate FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, permissions: row.permissions ? JSON.parse(row.permissions as string) : null, vendorId: row.vendor_id ?? null, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/settings/profile', (req, res) => {
  try {
    const { userId, name, phone, address, companyName, autoWhatsapp } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    db.prepare(`
      UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), address = COALESCE(?, address), company_name = COALESCE(?, company_name) WHERE id = ?
    `).run(name, phone, address, companyName, userId);
    if (autoWhatsapp !== undefined) {
      db.prepare('UPDATE users SET auto_whatsapp = ? WHERE id = ?').run(autoWhatsapp ? 1 : 0, userId);
    }
    const { defaultGstRate } = req.body;
    if (defaultGstRate !== undefined) {
      db.prepare('UPDATE users SET default_gst_rate = ? WHERE id = ?').run(Number(defaultGstRate) || 18, userId);
    }
    const row = db.prepare('SELECT id, email, name, phone, address, role, company_name, auto_whatsapp, default_gst_rate FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/settings/change-password', (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || !currentPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(userId) as { id: string; password_hash: string } | undefined;
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password_hash !== hashPassword(currentPassword)) return res.status(401).json({ error: 'Current password is incorrect' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
