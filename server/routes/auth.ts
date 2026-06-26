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
             t.warranty_enabled, t.replacement_enabled, t.rewards_enabled, t.finance_enabled, t.chatbot_enabled, t.bill_customization_enabled, t.multi_language_enabled, t.vendor_portal_enabled, t.barcode_system_enabled,
             t.trial_ends_at, t.subscription_ends_at, t.tab_config
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

    // Check subscription/trial expiry
    const now = new Date();
    const trialEnds = row.trial_ends_at ? new Date(row.trial_ends_at as string) : null;
    const subEnds = row.subscription_ends_at ? new Date(row.subscription_ends_at as string) : null;
    if (tenantStatus === 'trial' && trialEnds && trialEnds < now) {
      return res.status(403).json({ error: 'Your trial has expired. Please contact DG ERP to subscribe.' });
    }
    if (tenantStatus === 'active' && subEnds && subEnds < now) {
      return res.status(403).json({ error: 'Your subscription has expired. Please contact DG ERP to renew.' });
    }

    // Block vendor login if vendor portal disabled
    if (row.role === 'Vendor' && row.vendor_portal_enabled === false) {
      return res.status(403).json({ error: 'Vendor portal is not enabled for this company. Contact your administrator.' });
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
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions ?? null),
      vendorId: row.vendor_id ?? null,
      autoWhatsapp: !!(row.auto_whatsapp),
      defaultGstRate: Number(row.default_gst_rate) || 18,
      gstNumber: row.gst_number ?? null,
      warrantyEnabled: row.warranty_enabled !== false,
      replacementEnabled: row.replacement_enabled !== false,
      rewardsEnabled: row.rewards_enabled !== false,
      financeEnabled: row.finance_enabled !== false,
      chatbotEnabled: row.chatbot_enabled !== false,
      billCustomizationEnabled: row.bill_customization_enabled !== false,
      multiLanguageEnabled: row.multi_language_enabled !== false,
      vendorPortalEnabled: row.vendor_portal_enabled !== false,
      barcodeSystemEnabled: row.barcode_system_enabled !== false,
      subscriptionEndsAt: row.subscription_ends_at ?? null,
      trialEndsAt: row.trial_ends_at ?? null,
      tabConfig: (() => {
        const tc = typeof row.tab_config === 'string' ? JSON.parse(row.tab_config) : row.tab_config;
        if (tc) return tc;
        return {
          dashboard:    { label: 'Dashboard',      visible: true },
          inventory:    { label: 'Inventory',      visible: true },
          distribution: { label: 'Distribution',   visible: true },
          sales:        { label: 'Sales Entry',    visible: true },
          verification: { label: 'Verify Product', visible: true },
          warranty:     { label: 'Warranty',        visible: true },
          replacements: { label: 'Replacements',   visible: true },
          rewards:      { label: 'Rewards',         visible: true },
          finance:      { label: 'Finance',         visible: true },
          chatbot:      { label: 'Chatbot',         visible: true },
          settings:     { label: 'Settings',        visible: true },
        };
      })(),
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

    const row = (await pool.query('SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name, u.permissions, u.vendor_id, u.auto_whatsapp, u.default_gst_rate, u.gst_number, t.warranty_enabled, t.replacement_enabled, t.rewards_enabled, t.finance_enabled, t.chatbot_enabled, t.bill_customization_enabled, t.multi_language_enabled, t.vendor_portal_enabled, t.barcode_system_enabled, t.tab_config FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.tenant_id = $2', [userId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions ?? null), vendorId: row.vendor_id ?? null, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18, gstNumber: row.gst_number ?? null, warrantyEnabled: row.warranty_enabled !== false, replacementEnabled: row.replacement_enabled !== false, rewardsEnabled: row.rewards_enabled !== false, financeEnabled: row.finance_enabled !== false, chatbotEnabled: row.chatbot_enabled !== false, billCustomizationEnabled: row.bill_customization_enabled !== false, multiLanguageEnabled: row.multi_language_enabled !== false, tabConfig: typeof row.tab_config === 'string' ? JSON.parse(row.tab_config) : (row.tab_config ?? null) });
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

    const row = (await pool.query('SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name, u.auto_whatsapp, u.default_gst_rate, u.gst_number, t.warranty_enabled, t.replacement_enabled, t.rewards_enabled, t.finance_enabled, t.chatbot_enabled, t.bill_customization_enabled, t.multi_language_enabled, t.vendor_portal_enabled, t.barcode_system_enabled FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.tenant_id = $2', [userId, tenantId])).rows[0] as Record<string, unknown> | undefined;
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

// Forgot password — generate reset token (no email sent, returns token for admin to share)
router.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = (await pool.query('SELECT u.id, u.email, u.tenant_id FROM users u WHERE u.email = $1', [email])).rows[0] as { id: string; email: string; tenant_id: string } | undefined;
    // Always return success to prevent email enumeration
    if (!user) return res.json({ ok: true, message: 'If this email exists, a reset link has been generated' });

    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await pool.query(
      'INSERT INTO password_reset_tokens (id, email, tenant_id, token, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [`PRT${Date.now()}`, email, user.tenant_id, token, expiresAt]
    );

    await logAudit(pool, user.tenant_id, 'PASSWORD_RESET_REQUEST', 'user', user.id, `Password reset requested for ${email}`, user.id, email);

    res.json({ ok: true, message: 'If this email exists, a reset link has been generated', token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Reset password using token
router.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const resetToken = (await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()',
      [token]
    )).rows[0] as { id: string; email: string; tenant_id: string } | undefined;

    if (!resetToken) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const newHash = bcrypt.hashSync(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2 AND tenant_id = $3', [newHash, resetToken.email, resetToken.tenant_id]);
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE token = $1', [token]);

    await logAudit(pool, resetToken.tenant_id, 'PASSWORD_RESET', 'user', null as unknown as string, `Password reset for ${resetToken.email}`, undefined, resetToken.email);

    res.json({ ok: true, message: 'Password has been reset successfully' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Admin reset any user's password
router.put('/api/admin/reset-user-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const adminRole = req.user?.role;
    if (!adminRole || !['Admin', 'Super Admin'].includes(adminRole)) return res.status(403).json({ error: 'Admin access required' });

    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: 'userId and newPassword required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const user = (await pool.query('SELECT id, email, name FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId])).rows[0] as { id: string; email: string; name: string } | undefined;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newHash = bcrypt.hashSync(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND tenant_id = $3', [newHash, userId, tenantId]);

    await logAudit(pool, tenantId, 'ADMIN_PASSWORD_RESET', 'user', userId, `Admin reset password for ${user.email}`, req.user?.userId, req.user?.name);

    res.json({ ok: true, message: `Password reset for ${user.email}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
