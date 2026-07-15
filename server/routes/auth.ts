import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Signup removed — provisionTenant creates Admin on provisioning; all user
// creation goes through POST /api/admin/users (admin) or /api/super-admin/tenants.
router.post('/api/auth/signup', (_req, res) => res.status(410).json({ error: 'Signup disabled. Contact your admin.' }));

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Login searches across all tenants using JOIN
    // H3 fix: scope login to the tenant's slug when provided, preventing cross-tenant
    // email collision (two tenants sharing an email address get deterministic routing).
    const { slug } = req.body;
    const loginParams: string[] = [email.trim()];
    const slugClause = (typeof slug === 'string' && slug)
      ? (loginParams.push(slug.toLowerCase()), `AND t.slug = $${loginParams.length}`)
      : '';

    const row = (await pool.query(`
      SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name,
             u.permissions, u.vendor_id, u.auto_whatsapp, u.default_gst_rate, COALESCE(u.gst_number, t.gst_number) as gst_number,
             u.password_hash, u.tenant_id,
             t.id as t_tenant_id, t.company_name as tenant_company_name, t.slug as tenant_slug, t.status as tenant_status,
             t.vendor_portal_enabled, t.barcode_system_enabled, t.multi_language_enabled, t.inventory_tracking_enabled,
             t.trial_ends_at, t.subscription_ends_at, t.tab_config, t.business_type,
             t.plan_id
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE LOWER(u.email) = LOWER($1) ${slugClause} LIMIT 1
    `, loginParams)).rows[0] as Record<string, unknown> | undefined;

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
      return res.status(403).json({ error: 'Your trial has expired. Please contact Dhandho to subscribe.' });
    }
    if (tenantStatus === 'active' && subEnds && subEnds < now) {
      return res.status(403).json({ error: 'Your subscription has expired. Please contact Dhandho to renew.' });
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
      vendorId: (row.vendor_id as string | null) ?? null,  // needed for server-side vendor scoping
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
      permissions: (() => {
        const raw = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
        if (Array.isArray(raw)) {
          const ALL = ['dashboard','sales','distribution','inventory','purchases','quotations','orders','finance','accounts','settings'];
          return Object.fromEntries(ALL.map(m => [m, raw.includes(m) ? 'full' : 'hidden']));
        }
        return null;
      })(),
      vendorId: row.vendor_id ?? null,
      autoWhatsapp: !!(row.auto_whatsapp),
      defaultGstRate: Number(row.default_gst_rate) || 18,
      gstNumber: row.gst_number ?? null,
      vendorPortalEnabled: row.vendor_portal_enabled !== false,
      barcodeSystemEnabled: row.barcode_system_enabled !== false,
      multiLanguageEnabled: row.multi_language_enabled !== false,
      inventoryTrackingEnabled: row.inventory_tracking_enabled !== false,
      planName: await (async () => {
        const pid = row.plan_id as string | null;
        if (!pid) return row.tenant_status === 'trial' ? 'Free Trial' : 'Standard';
        const planRow = (await pool.query('SELECT name FROM plans WHERE id = $1', [pid])).rows[0] as { name: string } | undefined;
        if (planRow) return planRow.name;
        if (pid === 'TRIAL' || (row.tenant_status as string) === 'trial') return 'Free Trial';
        return pid.charAt(0).toUpperCase() + pid.slice(1).toLowerCase();
      })(),
      businessType: (row.business_type as string) || 'manufacturer',
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/settings/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const row = (await pool.query('SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name, u.permissions, u.vendor_id, u.auto_whatsapp, u.default_gst_rate, COALESCE(u.gst_number, t.gst_number) as gst_number, t.vendor_portal_enabled, t.barcode_system_enabled, t.multi_language_enabled, t.inventory_tracking_enabled, t.tab_config, t.business_type FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.tenant_id = $2', [userId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });

    const rawPerms = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
    const normalizedPerms = (() => {
      if (rawPerms && typeof rawPerms === 'object' && !Array.isArray(rawPerms)) return rawPerms;
      if (Array.isArray(rawPerms)) {
        const ALL = ['dashboard','sales','distribution','inventory','purchases','quotations','orders','finance','accounts','settings'];
        return Object.fromEntries(ALL.map(m => [m, rawPerms.includes(m) ? 'full' : 'hidden']));
      }
      return null;
    })();
    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, permissions: normalizedPerms, vendorId: row.vendor_id ?? null, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18, gstNumber: row.gst_number ?? null, businessType: (row.business_type as string) || 'manufacturer', vendorPortalEnabled: row.vendor_portal_enabled !== false, barcodeSystemEnabled: row.barcode_system_enabled !== false, multiLanguageEnabled: row.multi_language_enabled !== false, inventoryTrackingEnabled: row.inventory_tracking_enabled !== false, tabConfig: typeof row.tab_config === 'string' ? JSON.parse(row.tab_config) : (row.tab_config ?? null) });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
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

    const row = (await pool.query('SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name, u.auto_whatsapp, u.default_gst_rate, COALESCE(u.gst_number, t.gst_number) as gst_number, t.vendor_portal_enabled, t.barcode_system_enabled, t.multi_language_enabled FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.tenant_id = $2', [userId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({ id: row.id, email: row.email, name: row.name, phone: row.phone, address: row.address, role: row.role, companyName: row.company_name, autoWhatsapp: !!(row.auto_whatsapp), defaultGstRate: Number(row.default_gst_rate) || 18, gstNumber: row.gst_number ?? null, vendorPortalEnabled: row.vendor_portal_enabled !== false, barcodeSystemEnabled: row.barcode_system_enabled !== false, multiLanguageEnabled: row.multi_language_enabled !== false });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
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
    await pool.query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2 AND tenant_id = $3', [newHash, userId, tenantId]);
    await logAudit(pool, tenantId!, 'PASSWORD_CHANGE', 'user', userId, 'Password changed — all sessions invalidated', userId, req.user?.name);
    res.json({ ok: true, message: 'Password changed. Please log in again.' });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot password — generate reset token (no email sent, returns token for admin to share)
router.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { slug: resetSlug } = req.body;
    const resetParams: string[] = [email];
    const resetSlugClause = (typeof resetSlug === 'string' && resetSlug)
      ? (resetParams.push(resetSlug.toLowerCase()), `AND t.slug = $${resetParams.length}`)
      : '';
    const user = (await pool.query(
      `SELECT u.id, u.email, u.tenant_id FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE LOWER(u.email) = LOWER($1) ${resetSlugClause} LIMIT 1`,
      resetParams
    )).rows[0] as { id: string; email: string; tenant_id: string } | undefined;
    // Always return success to prevent email enumeration
    if (!user) return res.json({ ok: true, message: 'If this email exists, a reset link has been generated' });

    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    await pool.query(
      'INSERT INTO password_reset_tokens (id, email, tenant_id, token, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [uid('PRT'), email, user.tenant_id, token, expiresAt]
    );

    await logAudit(pool, user.tenant_id, 'PASSWORD_RESET_REQUEST', 'user', user.id, `Password reset requested for ${email}`, user.id, email);

    // Token stored — retrievable by authenticated admin via GET /api/admin/reset-tokens
    // or super-admin via GET /api/super-admin/reset-tokens.
    // Never returned here: keeps anti-enumeration intact and prevents token
    // leaking to anyone who guesses a valid email address.
    res.json({ ok: true, message: 'Reset token generated. Contact your admin or support to retrieve it.' });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
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
    await pool.query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE LOWER(email) = LOWER($2) AND tenant_id = $3', [newHash, resetToken.email, resetToken.tenant_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
    await pool.query("DELETE FROM password_reset_tokens WHERE used = true OR expires_at < NOW()");

    await logAudit(pool, resetToken.tenant_id, 'PASSWORD_RESET', 'user', null as unknown as string, `Password reset for ${resetToken.email}`, undefined, resetToken.email);

    res.json({ ok: true, message: 'Password has been reset successfully' });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
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
    await pool.query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2 AND tenant_id = $3', [newHash, userId, tenantId]);

    await logAudit(pool, tenantId, 'ADMIN_PASSWORD_RESET', 'user', userId, `Admin reset password for ${user.email}`, req.user?.userId, req.user?.name);

    res.json({ ok: true, message: `Password reset for ${user.email}` });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
