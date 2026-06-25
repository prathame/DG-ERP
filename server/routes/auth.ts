import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../pg-db';
import { logAudit } from '../utils/helpers';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/api/auth/signup', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { email, password, name, phone, address, role, companyName } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required' });

    const existing = (await pool.query('SELECT id FROM users WHERE email = $1 AND tenant_id = $2', [email, tenantId])).rows[0];
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const id = `U${Date.now()}`;
    const passwordHash = bcrypt.hashSync(password, 10);
    await pool.query(`
      INSERT INTO users (id, email, password_hash, name, phone, address, role, company_name, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [id, email, passwordHash, name ?? '', phone ?? null, address ?? null, role ?? 'Admin', companyName ?? null, tenantId]);

    const row = (await pool.query('SELECT id, email, name, phone, address, role, company_name FROM users WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown>;
    res.status(201).json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Login searches across all tenants using JOIN
    const row = (await pool.query(`
      SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name,
             u.permissions, u.vendor_id, u.auto_whatsapp, u.default_gst_rate, u.gst_number,
             u.password_hash, u.tenant_id,
             t.id as t_tenant_id, t.company_name as tenant_company_name, t.slug as tenant_slug, t.status as tenant_status,
             t.warranty_enabled, t.replacement_enabled, t.rewards_enabled, t.finance_enabled, t.chatbot_enabled, t.bill_customization_enabled, t.multi_language_enabled
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = $1
    `, [email])).rows[0] as Record<string, unknown> | undefined;

    if (!row) return res.status(401).json({ error: 'Invalid email or password' });

    // Validate password using bcrypt
    if (!bcrypt.compareSync(password, row.password_hash as string)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Validate tenant status
    const tenantStatus = row.tenant_status as string;
    if (tenantStatus !== 'active' && tenantStatus !== 'trial') {
      return res.status(403).json({ error: 'Your account is not active. Please contact support.' });
    }

    // Generate JWT token
    const token = generateToken({
      userId: row.id as string,
      email: row.email as string,
      role: row.role as string,
      name: row.name as string,
      tenantId: row.tenant_id as string,
    });

    await logAudit(pool, row.tenant_id as string, 'LOGIN', 'user', row.id as string, `User logged in: ${row.email}`, row.id as string, row.name as string);

    res.json({
      token,
      tenantId: row.tenant_id,
      companyName: row.tenant_company_name,
      tenantSlug: row.tenant_slug,
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      address: row.address,
      role: row.role,
      permissions: row.permissions ? JSON.parse(row.permissions as string) : null,
      vendorId: row.vendor_id ?? null,
      autoWhatsapp: !!(row.auto_whatsapp),
      defaultGstRate: Number(row.default_gst_rate) || 18,
      gstNumber: row.gst_number ?? null,
      warrantyEnabled: row.warranty_enabled !== false,
      replacementEnabled: row.replacement_enabled !== false,
      rewardsEnabled: row.rewards_enabled !== false,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/settings/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const userId = req.query.userId as string || req.user?.userId;
    if (!userId || userId !== req.user?.userId) return res.status(403).json({ error: 'Access denied' });

    const row = (await pool.query('SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name, u.permissions, u.vendor_id, u.auto_whatsapp, u.default_gst_rate, u.gst_number, t.warranty_enabled, t.replacement_enabled, t.rewards_enabled, t.finance_enabled, t.chatbot_enabled, t.bill_customization_enabled, t.multi_language_enabled FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.tenant_id = $2', [userId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, permissions: row.permissions ? JSON.parse(row.permissions as string) : null, vendorId: row.vendor_id ?? null, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18, gstNumber: row.gst_number ?? null, warrantyEnabled: row.warranty_enabled !== false, replacementEnabled: row.replacement_enabled !== false, rewardsEnabled: row.rewards_enabled !== false, financeEnabled: row.finance_enabled !== false, chatbotEnabled: row.chatbot_enabled !== false, billCustomizationEnabled: row.bill_customization_enabled !== false, multiLanguageEnabled: row.multi_language_enabled !== false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/settings/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { userId, name, phone, address, companyName, autoWhatsapp, gstNumber } = req.body;
    if (!userId || userId !== req.user?.userId) return res.status(403).json({ error: 'Access denied' });

    await pool.query(`
      UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address), company_name = COALESCE($4, company_name) WHERE id = $5 AND tenant_id = $6
    `, [name, phone, address, companyName, userId, tenantId]);

    if (gstNumber !== undefined) {
      await pool.query('UPDATE users SET gst_number = $1 WHERE id = $2 AND tenant_id = $3', [gstNumber || null, userId, tenantId]);
    }
    if (autoWhatsapp !== undefined) {
      await pool.query('UPDATE users SET auto_whatsapp = $1 WHERE id = $2 AND tenant_id = $3', [autoWhatsapp ? true : false, userId, tenantId]);
    }
    const { defaultGstRate } = req.body;
    if (defaultGstRate !== undefined) {
      await pool.query('UPDATE users SET default_gst_rate = $1 WHERE id = $2 AND tenant_id = $3', [Number(defaultGstRate) || 18, userId, tenantId]);
    }

    const row = (await pool.query('SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name, u.auto_whatsapp, u.default_gst_rate, u.gst_number, t.warranty_enabled, t.replacement_enabled, t.rewards_enabled, t.finance_enabled, t.chatbot_enabled, t.bill_customization_enabled, t.multi_language_enabled FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.tenant_id = $2', [userId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18, gstNumber: row.gst_number ?? null, warrantyEnabled: row.warranty_enabled !== false, replacementEnabled: row.replacement_enabled !== false, rewardsEnabled: row.rewards_enabled !== false, financeEnabled: row.finance_enabled !== false, chatbotEnabled: row.chatbot_enabled !== false, billCustomizationEnabled: row.bill_customization_enabled !== false, multiLanguageEnabled: row.multi_language_enabled !== false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/settings/change-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || userId !== req.user?.userId) return res.status(403).json({ error: 'Access denied' });
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const user = (await pool.query('SELECT id, password_hash FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId])).rows[0] as { id: string; password_hash: string } | undefined;
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = bcrypt.hashSync(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND tenant_id = $3', [newHash, userId, tenantId]);
    await logAudit(pool, tenantId!, 'PASSWORD_CHANGE', 'user', userId, 'Password changed', userId, req.user?.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
