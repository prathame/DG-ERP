import { Router } from 'express';
import { logger } from '../utils/logger';
import { pool } from '../pg-db';
import bcrypt from 'bcrypt';
import { uid } from '../utils/helpers';
import { handleApiError, logAuthEvent } from '../utils/http-error';
import { superAdminMiddleware, generateSuperAdminToken, AuthRequest } from '../middleware/auth';
import { provisionTenant, deleteTenant, getTenantStats } from '../utils/tenant';
import { logAudit } from '../utils/helpers';

const router = Router();

// ============ PUBLIC TENANT LOOKUP (no auth) ============
router.get('/api/tenant/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = (
      await pool.query('SELECT id, company_name, slug, status, business_type FROM tenants WHERE slug = $1', [
        slug.toLowerCase(),
      ])
    ).rows[0] as
      | {
          id: string;
          company_name: string;
          slug: string;
          status: string;
          business_type: string;
        }
      | undefined;
    if (!tenant || (tenant.status !== 'active' && tenant.status !== 'trial')) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const billSettings = (
      await pool.query('SELECT logo_base64, primary_color, tagline FROM bill_settings WHERE tenant_id = $1', [
        tenant.id,
      ])
    ).rows[0] as { logo_base64: string | null; primary_color: string | null; tagline: string | null } | undefined;
    const businessType = tenant.business_type || 'manufacturer';
    res.json({
      tenantId: tenant.id,
      companyName: tenant.company_name,
      slug: tenant.slug,
      businessType,
      requiresSeat: businessType === 'service',
      logoBase64: billSettings?.logo_base64 ?? null,
      primaryColor: billSettings?.primary_color ?? '#F27D26',
      tagline: billSettings?.tagline ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ SUPER ADMIN LOGIN ============
router.post('/api/super-admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await pool.query(
      'SELECT id, email, name, password_hash, role FROM super_admins WHERE email = $1',
      [email],
    );
    const admin = rows[0] as
      { id: string; email: string; name: string; password_hash: string; role: string } | undefined;
    if (!admin) {
      logAuthEvent('Super-admin login failed', req, { reason: 'unknown_user' }, 'warn');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      logAuthEvent('Super-admin login failed', req, { reason: 'bad_password', userId: admin.id }, 'warn');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateSuperAdminToken({
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      role: 'super_admin',
    });
    logger.info('Super-admin login success', { userId: admin.id, role: admin.role });
    res.json({ token, user: { id: admin.id, email: admin.email, name: admin.name, role: 'super_admin' } });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ DASHBOARD ============
router.get('/api/super-admin/dashboard', superAdminMiddleware, async (req, res) => {
  try {
    const tenants = (await pool.query('SELECT COUNT(*) as c FROM tenants')).rows[0];
    const active = (await pool.query("SELECT COUNT(*) as c FROM tenants WHERE status = 'active'")).rows[0];
    const trial = (await pool.query("SELECT COUNT(*) as c FROM tenants WHERE status = 'trial'")).rows[0];
    const suspended = (await pool.query("SELECT COUNT(*) as c FROM tenants WHERE status = 'suspended'")).rows[0];
    const totalUsers = (await pool.query('SELECT COUNT(*) as c FROM users')).rows[0];
    const totalProducts = (await pool.query('SELECT COUNT(*) as c FROM products')).rows[0];
    const totalVendors = (await pool.query("SELECT COUNT(*) as c FROM vendors WHERE id != 'OWNER'")).rows[0];
    const totalSales = (await pool.query('SELECT COUNT(*) as c FROM product_sales')).rows[0];
    const totalRevenue = (await pool.query('SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales')).rows[0];

    const recentTenants = (
      await pool.query(
        'SELECT id, company_name, status, plan_id, created_at, last_active_at FROM tenants ORDER BY created_at DESC LIMIT 5',
      )
    ).rows;

    const tenantsByPlan = (
      await pool.query(`
      SELECT p.name as plan_name, COUNT(t.id) as count
      FROM plans p LEFT JOIN tenants t ON t.plan_id = p.id
      GROUP BY p.id, p.name ORDER BY count DESC
    `)
    ).rows;

    res.json({
      totals: {
        tenants: tenants.c,
        active: active.c,
        trial: trial.c,
        suspended: suspended.c,
        users: totalUsers.c,
        products: totalProducts.c,
        vendors: totalVendors.c,
        sales: totalSales.c,
        revenue: totalRevenue.t,
      },
      recentTenants,
      tenantsByPlan,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ TENANT LIST ============
router.get('/api/super-admin/tenants', superAdminMiddleware, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT t.*, p.name as plan_name, p.price_monthly,
      (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
      (SELECT COUNT(*) FROM products WHERE tenant_id = t.id) as product_count,
      (SELECT COUNT(*) FROM vendors WHERE tenant_id = t.id AND id != 'OWNER') as vendor_count,
      (SELECT COUNT(*) FROM product_sales WHERE tenant_id = t.id) as sale_count,
      (SELECT COALESCE(SUM(sale_price), 0) FROM product_sales WHERE tenant_id = t.id) as revenue
      FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;
    if (typeof status === 'string' && status) {
      sql += ` AND t.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (typeof search === 'string' && search) {
      sql += ` AND (t.company_name ILIKE $${idx} OR t.admin_email ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    sql += ' ORDER BY t.created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json(
      rows.map((t: Record<string, unknown>) => ({
        id: t.id,
        companyName: t.company_name,
        slug: t.slug,
        adminEmail: t.admin_email,
        adminName: t.admin_name,
        phone: t.phone,
        status: t.status,
        planName: t.plan_name,
        planId: t.plan_id,
        priceMonthly: t.price_monthly,
        userCount: t.user_count,
        productCount: t.product_count,
        vendorCount: t.vendor_count,
        saleCount: t.sale_count,
        revenue: t.revenue,
        businessType: (t.business_type as string) || 'manufacturer',
        createdAt: t.created_at,
        lastActiveAt: t.last_active_at,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ CREATE TENANT ============
router.post('/api/super-admin/tenants', superAdminMiddleware, async (req, res) => {
  try {
    const {
      companyName,
      adminEmail,
      adminName,
      adminPassword,
      password,
      phone,
      address,
      gstNumber,
      planId,
      plan,
      subscriptionStart,
      subscriptionEnd,
    } = req.body;
    if (!companyName || !adminEmail || !adminName)
      return res.status(400).json({ error: 'Company name, admin email, and admin name are required' });
    const existing = (await pool.query('SELECT id FROM tenants WHERE admin_email = $1', [adminEmail])).rows[0];
    if (existing) return res.status(400).json({ error: 'A tenant with this email already exists' });
    const selectedPlan = planId || plan || 'BASIC';
    const isTrial = selectedPlan === 'TRIAL';
    const trialEnd = isTrial ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : undefined;
    const result = await provisionTenant({
      companyName,
      adminEmail,
      adminName,
      adminPassword: adminPassword || password || undefined,
      phone,
      address,
      gstNumber,
      planId: selectedPlan,
      status: isTrial ? 'trial' : 'active',
      trialEndsAt: trialEnd,
    });
    if (subscriptionEnd) {
      await pool.query('UPDATE tenants SET subscription_ends_at = $1 WHERE id = $2', [
        subscriptionEnd,
        result.tenantId,
      ]);
    }
    const bType = ['manufacturer', 'dealer', 'retail', 'service', 'custom'].includes(req.body.businessType)
      ? (req.body.businessType as string)
      : 'manufacturer';

    // Business-type presets — source of truth on backend, not dependent on frontend sending correct tabConfig
    const PRESETS: Record<string, Record<string, { label: string; visible: boolean }>> = {
      manufacturer: {
        analytics: { label: 'Analytics', visible: true },
        masters: { label: 'Masters', visible: true },
        inventory: { label: 'Inventory', visible: true },
        distribution: { label: 'Dispatch', visible: true },
        sales: { label: 'Warranty Registration', visible: true },
        purchases: { label: 'Purchases', visible: true },
        verification: { label: 'Search / Verify', visible: true },
        quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true },
        finance: { label: 'Vendor Payments', visible: true },
        accounts: { label: 'Accounts', visible: true },
        warranty: { label: 'Warranty', visible: true },
        replacements: { label: 'Replacements', visible: true },
        rewards: { label: 'Rewards', visible: true },
        chatbot: { label: 'Chatbot', visible: true },
        settings: { label: 'Settings', visible: true },
      },
      dealer: {
        analytics: { label: 'Analytics', visible: true },
        masters: { label: 'Masters', visible: true },
        inventory: { label: 'Inventory', visible: true },
        distribution: { label: 'Sales', visible: true },
        sales: { label: 'Sales Entry', visible: false },
        purchases: { label: 'Purchases', visible: true },
        verification: { label: 'Search / Verify', visible: true },
        quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true },
        finance: { label: 'Dealer Payments', visible: true },
        accounts: { label: 'Accounts', visible: true },
        warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false },
        rewards: { label: 'Rewards', visible: false },
        chatbot: { label: 'Chatbot', visible: true },
        settings: { label: 'Settings', visible: true },
      },
      retail: {
        analytics: { label: 'Analytics', visible: true },
        masters: { label: 'Masters', visible: true },
        inventory: { label: 'Stock', visible: true },
        distribution: { label: 'Purchase', visible: true },
        sales: { label: 'Sales Entry', visible: false },
        purchases: { label: 'Purchases', visible: true },
        verification: { label: 'Search / Verify', visible: true },
        quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true },
        finance: { label: 'Supplier Payments', visible: true },
        accounts: { label: 'Accounts', visible: true },
        warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false },
        rewards: { label: 'Rewards', visible: false },
        chatbot: { label: 'Chatbot', visible: true },
        settings: { label: 'Settings', visible: true },
      },
      service: {
        analytics: { label: 'Analytics', visible: true },
        masters: { label: 'Masters', visible: true },
        inventory: { label: 'Inventory', visible: false },
        distribution: { label: 'Distribution', visible: false },
        sales: { label: 'Sales Entry', visible: false },
        purchases: { label: 'Expenses', visible: true },
        verification: { label: 'Search / Verify', visible: false },
        quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true },
        finance: { label: 'Invoice Finance', visible: true },
        accounts: { label: 'Accounts', visible: true },
        warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false },
        rewards: { label: 'Rewards', visible: false },
        chatbot: { label: 'Chatbot', visible: true },
        settings: { label: 'Settings', visible: true },
      },
    };
    // Custom: all tabs visible — super admin configures manually via Tab Customization
    const customPreset = {
      analytics: { label: 'Analytics', visible: true },
      masters: { label: 'Masters', visible: true },
      inventory: { label: 'Inventory', visible: true },
      distribution: { label: 'Distribution', visible: true },
      sales: { label: 'Sales Entry', visible: true },
      purchases: { label: 'Purchases', visible: true },
      verification: { label: 'Search / Verify', visible: true },
      quotations: { label: 'Quotes & Orders', visible: true },
      invoices: { label: 'Invoices', visible: true },
      finance: { label: 'Finance', visible: true },
      accounts: { label: 'Accounts', visible: true },
      warranty: { label: 'Warranty', visible: true },
      replacements: { label: 'Replacements', visible: true },
      rewards: { label: 'Rewards', visible: true },
      chatbot: { label: 'Chatbot', visible: true },
      settings: { label: 'Settings', visible: true },
    };
    const tabConfig = bType === 'custom' ? customPreset : PRESETS[bType] || PRESETS.manufacturer;
    await pool.query('UPDATE tenants SET tab_config = $1, business_type = $2 WHERE id = $3', [
      JSON.stringify(tabConfig),
      bType,
      result.tenantId,
    ]);
    // Auto-issue mobile invite (non-fatal — tenant create must still succeed)
    let mobileInviteCode: string | undefined;
    let mobileInviteExpiresAt: string | undefined;
    let mobileSeatKey: string | undefined;
    try {
      const { issueInvite, issueSeat } = await import('./mobile');
      const mobileInvite = await issueInvite(result.tenantId, 30);
      mobileInviteCode = mobileInvite.code;
      mobileInviteExpiresAt = mobileInvite.expiresAt;
      if (bType === 'service') {
        const seat = await issueSeat(result.tenantId, {
          createdBy: (req as AuthRequest).user?.userId,
        });
        mobileSeatKey = seat.seatKey;
      }
    } catch (inviteErr) {
      logger.warn('Mobile invite/seat after tenant create failed', {
        error: inviteErr instanceof Error ? inviteErr.message : String(inviteErr),
        stack: inviteErr instanceof Error ? inviteErr.stack : undefined,
      });
    }
    await logAudit(
      pool,
      result.tenantId,
      'CREATE',
      'tenant',
      result.tenantId,
      `Tenant created on ${selectedPlan} plan`,
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({
      ...result,
      adminEmail,
      companyName,
      tempPassword: result.credentials.password,
      mobileInviteCode,
      mobileInviteExpiresAt,
      mobileSeatKey,
      businessType: bType,
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'DUPLICATE_SLUG') return res.status(400).json({ error: e.message });
    return handleApiError(req, res, err, 'Tenant create failed');
  }
});

// ============ GET TENANT DETAIL ============
router.get('/api/super-admin/tenants/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (
      await pool.query(
        'SELECT t.*, p.name as plan_name FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE t.id = $1',
        [id],
      )
    ).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const stats = await getTenantStats(id);
    const users = (
      await pool.query(
        'SELECT id, email, name, role, vendor_id, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at',
        [id],
      )
    ).rows;
    res.json({
      tenant: {
        id: tenant.id,
        companyName: tenant.company_name,
        slug: tenant.slug,
        adminEmail: tenant.admin_email,
        adminName: tenant.admin_name,
        phone: tenant.phone,
        address: tenant.address,
        gstNumber: tenant.gst_number,
        planId: tenant.plan_id,
        planName: tenant.plan_name,
        status: tenant.status,
        barcodeSystemEnabled: tenant.barcode_system_enabled !== false,
        multiLanguageEnabled: tenant.multi_language_enabled !== false,
        vendorPortalEnabled: tenant.vendor_portal_enabled !== false,
        inventoryTrackingEnabled: tenant.inventory_tracking_enabled !== false,
        quotationsEnabled: tenant.quotations_enabled !== false,
        accountsEnabled: tenant.accounts_enabled !== false,
        purchasesEnabled: tenant.purchases_enabled !== false,
        chatbotEnabled: tenant.chatbot_enabled !== false,
        trialEndsAt: tenant.trial_ends_at,
        subscriptionEndsAt: tenant.subscription_ends_at,
        createdAt: tenant.created_at,
        lastActiveAt: tenant.last_active_at,
        tabConfig: tenant.tab_config ?? null,
        businessType: tenant.business_type || 'manufacturer',
      },
      stats,
      users: users.map((u: Record<string, unknown>) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        vendorId: u.vendor_id,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ UPDATE TENANT ============
router.put('/api/super-admin/tenants/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const requestBody = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (requestBody.status !== undefined) {
      updates.push(`status = $${idx}`);
      params.push(requestBody.status);
      idx++;
    }
    if (requestBody.planId !== undefined) {
      updates.push(`plan_id = $${idx}`);
      params.push(requestBody.planId);
      idx++;
    }
    if (requestBody.companyName !== undefined) {
      updates.push(`company_name = $${idx}`);
      params.push(requestBody.companyName);
      idx++;
    }
    if (requestBody.phone !== undefined) {
      updates.push(`phone = $${idx}`);
      params.push(requestBody.phone);
      idx++;
    }
    if (requestBody.address !== undefined) {
      updates.push(`address = $${idx}`);
      params.push(requestBody.address);
      idx++;
    }
    if (requestBody.subscriptionEndsAt !== undefined) {
      updates.push(`subscription_ends_at = $${idx}`);
      params.push(requestBody.subscriptionEndsAt || null);
      idx++;
    }
    if (requestBody.gstNumber !== undefined) {
      updates.push(`gst_number = $${idx}`);
      params.push(requestBody.gstNumber);
      idx++;
    }
    if (requestBody.tabConfig !== undefined) {
      updates.push(`tab_config = $${idx}`);
      params.push(JSON.stringify(requestBody.tabConfig));
      idx++;
    }
    if (requestBody.barcodeSystemEnabled !== undefined) {
      updates.push(`barcode_system_enabled = $${idx}`);
      params.push(!!requestBody.barcodeSystemEnabled);
      idx++;
    }
    if (requestBody.multiLanguageEnabled !== undefined) {
      updates.push(`multi_language_enabled = $${idx}`);
      params.push(!!requestBody.multiLanguageEnabled);
      idx++;
    }
    if (requestBody.vendorPortalEnabled !== undefined) {
      updates.push(`vendor_portal_enabled = $${idx}`);
      params.push(!!requestBody.vendorPortalEnabled);
      idx++;
    }
    if (requestBody.inventoryTrackingEnabled !== undefined) {
      updates.push(`inventory_tracking_enabled = $${idx}`);
      params.push(!!requestBody.inventoryTrackingEnabled);
      idx++;
    }
    if (requestBody.quotationsEnabled !== undefined) {
      updates.push(`quotations_enabled = $${idx}`);
      params.push(!!requestBody.quotationsEnabled);
      idx++;
    }
    if (requestBody.accountsEnabled !== undefined) {
      updates.push(`accounts_enabled = $${idx}`);
      params.push(!!requestBody.accountsEnabled);
      idx++;
    }
    if (requestBody.purchasesEnabled !== undefined) {
      updates.push(`purchases_enabled = $${idx}`);
      params.push(!!requestBody.purchasesEnabled);
      idx++;
    }
    if (requestBody.chatbotEnabled !== undefined) {
      updates.push(`chatbot_enabled = $${idx}`);
      params.push(!!requestBody.chatbotEnabled);
      idx++;
    }
    if (
      requestBody.businessType !== undefined &&
      ['manufacturer', 'dealer', 'retail', 'service'].includes(requestBody.businessType)
    ) {
      updates.push(`business_type = $${idx}`);
      params.push(requestBody.businessType);
      idx++;
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    params.push(id);
    const result = await pool.query(`UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Tenant not found' });
    const tenant = (await pool.query('SELECT * FROM tenants WHERE id = $1', [id])).rows[0] as Record<string, unknown>;
    await logAudit(
      pool,
      id,
      'UPDATE',
      'tenant',
      id,
      `Tenant updated: ${updates.join(', ')}`,
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );
    res.json({
      id: tenant.id,
      companyName: tenant.company_name,
      status: tenant.status,
      planId: tenant.plan_id,
      businessType: tenant.business_type || 'manufacturer',
      barcodeSystemEnabled: tenant.barcode_system_enabled !== false,
      multiLanguageEnabled: tenant.multi_language_enabled !== false,
      vendorPortalEnabled: tenant.vendor_portal_enabled !== false,
      inventoryTrackingEnabled: tenant.inventory_tracking_enabled !== false,
      quotationsEnabled: tenant.quotations_enabled !== false,
      accountsEnabled: tenant.accounts_enabled !== false,
      purchasesEnabled: tenant.purchases_enabled !== false,
      chatbotEnabled: tenant.chatbot_enabled !== false,
      tabConfig: tenant.tab_config ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ DELETE TENANT ============
router.delete('/api/super-admin/tenants/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (await pool.query('SELECT id FROM tenants WHERE id = $1', [id])).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    await logAudit(
      pool,
      null as unknown as string,
      'DELETE',
      'tenant',
      id,
      `Tenant deleted`,
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );
    await deleteTenant(id);
    res.json({ ok: true, message: 'Tenant and all data deleted' });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ RESET TOKEN (generate for admin to share) ============
router.post('/api/super-admin/tenants/:id/reset-token', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = (
      await pool.query('SELECT id, email, name FROM users WHERE email = $1 AND tenant_id = $2', [email, id])
    ).rows[0] as { id: string; email: string; name: string } | undefined;
    if (!user) return res.status(404).json({ error: 'User not found in this tenant' });

    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    await pool.query(
      'INSERT INTO password_reset_tokens (id, email, tenant_id, token, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [uid('PRT'), email, id, token, expiresAt],
    );

    const tenant = (await pool.query('SELECT slug FROM tenants WHERE id = $1', [id])).rows[0] as
      { slug: string } | undefined;
    const resetLink = `${req.protocol}://${req.get('host')}/${tenant?.slug ?? ''}/reset-password?token=${token}`;

    await logAudit(
      pool,
      id,
      'SUPER_ADMIN_RESET_TOKEN',
      'user',
      user.id,
      `Super Admin generated reset token for ${email}`,
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );

    res.json({ ok: true, token, resetLink, expiresAt, userName: user.name, email: user.email });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ IMPERSONATE (get tenant admin token) ============
router.post('/api/super-admin/tenants/:id/impersonate', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (await pool.query('SELECT id, company_name, slug FROM tenants WHERE id = $1', [id])).rows[0] as
      { id: string; company_name: string; slug: string } | undefined;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const admin = (
      await pool.query(
        "SELECT id, email, name, role FROM users WHERE tenant_id = $1 AND role IN ('Super Admin', 'Admin') ORDER BY created_at LIMIT 1",
        [id],
      )
    ).rows[0] as { id: string; email: string; name: string; role: string } | undefined;
    if (!admin) return res.status(404).json({ error: 'No admin user found for this tenant' });

    const saId = (req as AuthRequest).user?.userId;
    const { generateToken } = await import('../middleware/auth');
    // Short-lived + audit claim — reduces blast radius if URL leaks
    const token = generateToken(
      {
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        tenantId: id,
        impersonatedBy: saId,
      },
      '15m',
    );
    await logAudit(
      pool,
      id,
      'IMPERSONATE',
      'tenant',
      id,
      `Super admin ${saId ?? 'unknown'} impersonated tenant admin ${admin.email}`,
      saId,
      'Super Admin',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      token,
      expiresIn: 900,
      tenantId: id,
      slug: tenant.slug,
      companyName: tenant.company_name,
      user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, companyName: tenant.company_name },
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ PLANS ============
router.get('/api/super-admin/plans', superAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT *, (SELECT COUNT(*) FROM tenants WHERE plan_id = plans.id) as tenant_count FROM plans ORDER BY price_monthly',
    );
    res.json(
      rows.map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        maxProducts: p.max_products,
        maxVendors: p.max_vendors,
        maxUsers: p.max_users,
        maxBarcodes: p.max_barcodes,
        features: p.features,
        priceMonthly: p.price_monthly,
        priceYearly: p.price_yearly,
        isActive: p.is_active,
        tenantCount: p.tenant_count,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/super-admin/plans', superAdminMiddleware, async (req, res) => {
  try {
    const { id, name, maxProducts, maxVendors, maxUsers, maxBarcodes, features, priceMonthly, priceYearly } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'Plan ID and name required' });
    await pool.query(
      'INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        name,
        maxProducts ?? -1,
        maxVendors ?? -1,
        maxUsers ?? -1,
        maxBarcodes ?? -1,
        JSON.stringify(features || {}),
        priceMonthly ?? 0,
        priceYearly ?? 0,
      ],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/super-admin/plans/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, maxProducts, maxVendors, maxUsers, maxBarcodes, features, priceMonthly, priceYearly, isActive } =
      req.body;
    await pool.query(
      `UPDATE plans SET name = COALESCE($1, name), max_products = COALESCE($2, max_products), max_vendors = COALESCE($3, max_vendors),
       max_users = COALESCE($4, max_users), max_barcodes = COALESCE($5, max_barcodes), features = COALESCE($6, features),
       price_monthly = COALESCE($7, price_monthly), price_yearly = COALESCE($8, price_yearly), is_active = COALESCE($9, is_active) WHERE id = $10`,
      [
        name,
        maxProducts,
        maxVendors,
        maxUsers,
        maxBarcodes,
        features ? JSON.stringify(features) : null,
        priceMonthly,
        priceYearly,
        isActive,
        id,
      ],
    );
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/super-admin/plans/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenants = (await pool.query('SELECT COUNT(*) as c FROM tenants WHERE plan_id = $1', [id])).rows[0];
    if (tenants.c > 0)
      return res.status(400).json({ error: `Cannot delete plan — ${tenants.c} tenant(s) are using it` });
    await pool.query('DELETE FROM plans WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// P1 fix: self-service registration removed — it was behind superAdminMiddleware (contradicting its purpose)
// and generated an invalid user ID. Tenants are provisioned exclusively via /api/super-admin/tenants.

// ============ TENANT BILLING ============
router.get('/api/super-admin/billing', superAdminMiddleware, async (req, res) => {
  try {
    const { tenantId, status, page } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = 30;
    let sql = `SELECT i.*, t.company_name as tenant_name FROM tenant_invoices i LEFT JOIN tenants t ON i.tenant_id = t.id WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;
    if (typeof tenantId === 'string' && tenantId) {
      sql += ` AND i.tenant_id = $${idx}`;
      params.push(tenantId);
      idx++;
    }
    if (typeof status === 'string' && status) {
      sql += ` AND i.status = $${idx}`;
      params.push(status);
      idx++;
    }
    const countResult = (await pool.query(`SELECT COUNT(*) as c FROM (${sql}) sub`, params)).rows[0] as { c: number };
    sql += ` ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(pageSize, (pageNum - 1) * pageSize);
    const { rows } = await pool.query(sql, params);
    res.json({
      data: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        invoiceNumber: r.invoice_number,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        planName: r.plan_name,
        amount: r.amount,
        gstAmount: r.gst_amount,
        total: r.total,
        status: r.status,
        paidAt: r.paid_at,
        notes: r.notes,
        createdAt: r.created_at,
      })),
      total: Number(countResult.c),
      page: pageNum,
      totalPages: Math.ceil(Number(countResult.c) / pageSize),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/super-admin/billing', superAdminMiddleware, async (req, res) => {
  try {
    const { tenantId, periodStart, periodEnd, amount, gstRate, notes } = req.body;
    if (!tenantId || !amount) return res.status(400).json({ error: 'Tenant and amount required' });
    const tenant = (await pool.query('SELECT id, company_name, plan_id FROM tenants WHERE id = $1', [tenantId]))
      .rows[0] as Record<string, unknown> | undefined;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const plan = tenant.plan_id
      ? ((await pool.query('SELECT name FROM plans WHERE id = $1', [tenant.plan_id])).rows[0] as
          { name: string } | undefined)
      : null;
    const gst = gstRate ? Math.round((Number(amount) * Number(gstRate)) / 100) : 0;
    const total = Number(amount) + gst;
    const id = uid('INV');
    const invNum = `DG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    await pool.query(
      'INSERT INTO tenant_invoices (id, tenant_id, invoice_number, period_start, period_end, plan_name, amount, gst_amount, total, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        id,
        tenantId,
        invNum,
        periodStart || null,
        periodEnd || null,
        plan?.name || null,
        amount,
        gst,
        total,
        notes || null,
      ],
    );
    await logAudit(
      pool,
      tenantId,
      'CREATE',
      'invoice',
      id,
      `Invoice ${invNum} — ₹${total} for ${tenant.company_name}`,
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );
    res.status(201).json({ id, invoiceNumber: invNum, total });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/super-admin/billing/:id/paid', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE tenant_invoices SET status = $1, paid_at = NOW() WHERE id = $2', ['paid', id]);
    await logAudit(
      pool,
      null as unknown as string,
      'UPDATE',
      'invoice',
      id,
      'Invoice marked as paid',
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/super-admin/billing/:id', superAdminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM tenant_invoices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ AUDIT LOG (cross-tenant) ============
router.get('/api/super-admin/audit-log', superAdminMiddleware, async (req, res) => {
  try {
    const { tenantId, action, entityType, search, page, limit: lim } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(lim) || 50));
    const offset = (pageNum - 1) * pageSize;

    let sql = `SELECT a.*, t.company_name as tenant_name FROM audit_log a LEFT JOIN tenants t ON a.tenant_id = t.id WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;
    if (typeof tenantId === 'string' && tenantId) {
      sql += ` AND a.tenant_id = $${idx}`;
      params.push(tenantId);
      idx++;
    }
    if (typeof action === 'string' && action) {
      sql += ` AND a.action = $${idx}`;
      params.push(action);
      idx++;
    }
    if (typeof entityType === 'string' && entityType) {
      sql += ` AND a.entity_type = $${idx}`;
      params.push(entityType);
      idx++;
    }
    if (typeof search === 'string' && search) {
      sql += ` AND (a.details ILIKE $${idx} OR a.user_name ILIKE $${idx} OR a.entity_id ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const countResult = (await pool.query(`SELECT COUNT(*) as c FROM (${sql}) sub`, params)).rows[0] as { c: number };
    sql += ` ORDER BY a.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(pageSize, offset);
    const { rows } = await pool.query(sql, params);

    res.json({
      data: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        tenantId: r.tenant_id,
        tenantName: r.tenant_name ?? 'Platform',
        userId: r.user_id,
        userName: r.user_name,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: r.details,
        createdAt: r.created_at,
      })),
      total: Number(countResult.c),
      page: pageNum,
      totalPages: Math.ceil(Number(countResult.c) / pageSize),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ ANALYTICS ============
router.get('/api/super-admin/analytics', superAdminMiddleware, async (req, res) => {
  try {
    const monthlyTenants = (
      await pool.query(`
      SELECT to_char(created_at, 'YYYY-MM') as month, COUNT(*) as count
      FROM tenants GROUP BY month ORDER BY month DESC LIMIT 12
    `)
    ).rows;

    const revenueByTenant = (
      await pool.query(`
      SELECT t.company_name, COALESCE(SUM(ps.sale_price), 0) as revenue, COUNT(ps.id) as sales
      FROM tenants t LEFT JOIN product_sales ps ON ps.tenant_id = t.id
      GROUP BY t.id, t.company_name ORDER BY revenue DESC LIMIT 10
    `)
    ).rows;

    const mostActiveToday = (
      await pool.query(`
      SELECT t.company_name, COUNT(ps.id) as sales_today
      FROM tenants t JOIN product_sales ps ON ps.tenant_id = t.id
      WHERE ps.purchase_date = CURRENT_DATE
      GROUP BY t.id, t.company_name ORDER BY sales_today DESC LIMIT 5
    `)
    ).rows;

    res.json({ monthlyTenants, revenueByTenant, mostActiveToday });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Version management ────────────────────────────────────────────────────────
router.get('/api/super-admin/version-config', superAdminMiddleware, async (req, res) => {
  try {
    const rows = (await pool.query('SELECT key, value FROM platform_config')).rows as { key: string; value: string }[];
    const cfg: Record<string, string> = {};
    for (const r of rows) cfg[r.key] = r.value;
    // Also get version distribution across all on-prem installs
    const versions = (
      await pool.query(
        "SELECT COALESCE(app_version,'Unknown') as version, COUNT(*) as count, MAX(last_seen) as latest_seen FROM onprem_licenses WHERE status='active' GROUP BY app_version ORDER BY count DESC",
      )
    ).rows;
    res.json({
      latestOnpremVersion: cfg['latest_onprem_version'] || null,
      minOnpremVersion: cfg['min_onprem_version'] || null,
      cloudVersion: process.env.npm_package_version || process.env.CLOUD_VERSION || '2.1.0',
      onpremVersions: versions,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/super-admin/version-config', superAdminMiddleware, async (req, res) => {
  try {
    const { latestOnpremVersion, minOnpremVersion } = req.body;
    if (latestOnpremVersion !== undefined) {
      await pool.query(
        'INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
        ['latest_onprem_version', latestOnpremVersion || null],
      );
    }
    if (minOnpremVersion !== undefined) {
      await pool.query(
        'INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
        ['min_onprem_version', minOnpremVersion || null],
      );
    }
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Cloud-specific analytics ──────────────────────────────────────────────────
router.get('/api/super-admin/cloud-analytics', superAdminMiddleware, async (req, res) => {
  try {
    const [planDist, tenantGrowth, featureAdoption, topTenants, statusBreakdown, recentLogins] = await Promise.all([
      // Plan distribution
      pool.query(
        `SELECT p.name, COUNT(t.id) as count FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id GROUP BY p.name ORDER BY count DESC`,
      ),
      // Tenant growth — new tenants per month (last 12 months)
      pool.query(
        `SELECT to_char(created_at,'YYYY-MM') as month, COUNT(*) as count FROM tenants WHERE created_at > NOW()-INTERVAL '12 months' GROUP BY month ORDER BY month`,
      ),
      // Feature adoption — how many tenants have each feature enabled
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE barcode_system_enabled = true) as barcode,
        COUNT(*) FILTER (WHERE multi_language_enabled = true) as multilang,
        COUNT(*) FILTER (WHERE vendor_portal_enabled = true) as vendor_portal,
        COUNT(*) FILTER (WHERE inventory_tracking_enabled = true) as inventory,
        COUNT(*) FILTER (WHERE quotations_enabled = true) as quotations,
        COUNT(*) FILTER (WHERE accounts_enabled = true) as accounts,
        COUNT(*) FILTER (WHERE purchases_enabled = true) as purchases,
        COUNT(*) FILTER (WHERE chatbot_enabled = true) as chatbot,
        COUNT(*) as total
        FROM tenants WHERE status != 'deleted'`),
      // Top 5 tenants by revenue
      pool.query(`SELECT t.company_name, t.plan_id, t.status, t.business_type,
        COALESCE((SELECT SUM(sale_price) FROM product_sales WHERE tenant_id=t.id),0) as revenue,
        COALESCE((SELECT COUNT(*) FROM users WHERE tenant_id=t.id),0) as users,
        t.created_at
        FROM tenants t ORDER BY revenue DESC LIMIT 10`),
      // Status breakdown
      pool.query(`SELECT status, COUNT(*) as count FROM tenants GROUP BY status ORDER BY count DESC`),
      // Active tenants (logged in last 7 days)
      pool.query(
        `SELECT COUNT(DISTINCT tenant_id) as count FROM audit_log WHERE action='LOGIN' AND created_at > NOW()-INTERVAL '7 days'`,
      ),
    ]);

    // MRR calculation (plan price * active tenant count per plan)
    const plans = (
      await pool.query(
        `SELECT p.id, p.name, p.price_monthly, COUNT(t.id) as active_count FROM plans p LEFT JOIN tenants t ON t.plan_id=p.id AND t.status='active' GROUP BY p.id,p.name,p.price_monthly`,
      )
    ).rows as Record<string, unknown>[];
    const mrr = plans.reduce((s, p) => s + Number(p.price_monthly) * Number(p.active_count), 0);

    // Churn: suspended in last 30 days
    const churn =
      Number(
        (
          await pool.query(
            `SELECT COUNT(*) as c FROM audit_log WHERE action='UPDATE' AND details LIKE '%suspended%' AND created_at > NOW()-INTERVAL '30 days'`,
          )
        ).rows[0].c,
      ) || 0;

    res.json({
      mrr,
      churn30d: churn,
      planDistribution: planDist.rows,
      tenantGrowth: tenantGrowth.rows,
      featureAdoption: featureAdoption.rows[0],
      topTenants: topTenants.rows,
      statusBreakdown: statusBreakdown.rows,
      activeThisWeek: Number(recentLogins.rows[0]?.count) || 0,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── On-Prem-specific analytics ────────────────────────────────────────────────
router.get('/api/super-admin/onprem-analytics', superAdminMiddleware, async (req, res) => {
  try {
    const [versions, businessTypes, expiryTimeline, statusBreakdown, licenses] = await Promise.all([
      // Version distribution
      pool.query(
        `SELECT COALESCE(app_version,'Unknown') as version, COUNT(*) as count FROM onprem_licenses GROUP BY app_version ORDER BY count DESC`,
      ),
      // Business type distribution
      pool.query(
        `SELECT COALESCE(business_type,'manufacturer') as type, COUNT(*) as count FROM onprem_licenses GROUP BY business_type ORDER BY count DESC`,
      ),
      // Expiry timeline: expiring in 0-30, 31-90, 91-365, never
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE valid_until IS NULL) as lifetime,
        COUNT(*) FILTER (WHERE valid_until >= CURRENT_DATE AND valid_until <= CURRENT_DATE + 30) as expiring_30d,
        COUNT(*) FILTER (WHERE valid_until > CURRENT_DATE + 30 AND valid_until <= CURRENT_DATE + 90) as expiring_90d,
        COUNT(*) FILTER (WHERE valid_until > CURRENT_DATE + 90) as expiring_later,
        COUNT(*) FILTER (WHERE valid_until < CURRENT_DATE) as expired
        FROM onprem_licenses WHERE status='active'`),
      // Status breakdown
      pool.query(`SELECT status, COUNT(*) as count FROM onprem_licenses GROUP BY status`),
      // All licenses for online/offline calc
      pool.query(`SELECT status, last_seen, valid_until, business_type, app_version FROM onprem_licenses`),
    ]);

    const now = Date.now();
    const lics = licenses.rows as Record<string, unknown>[];
    const online = lics.filter(
      l => l.last_seen && now - new Date(l.last_seen as string).getTime() < 70 * 60 * 1000,
    ).length;
    const expiringSoon = lics.filter(
      l =>
        l.valid_until &&
        new Date(l.valid_until as string) <= new Date(Date.now() + 30 * 86400000) &&
        new Date(l.valid_until as string) >= new Date(),
    ).length;

    res.json({
      total: lics.length,
      online,
      offline: lics.length - online,
      expiringSoon,
      versionDistribution: versions.rows,
      businessTypeDistribution: businessTypes.rows,
      expiryTimeline: expiryTimeline.rows[0],
      statusBreakdown: statusBreakdown.rows,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Real-time active users (active in last 15 min)
router.get('/api/super-admin/tenants/:id/active-users', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const rows = (
      await pool.query(
        `SELECT id, name, email, role, last_active_at
       FROM users WHERE tenant_id=$1 AND last_active_at > NOW() - INTERVAL '15 minutes'
       ORDER BY last_active_at DESC`,
        [id],
      )
    ).rows;
    res.json({ activeCount: rows.length, users: rows });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Upgrade / change plan
router.post('/api/super-admin/tenants/:id/upgrade-plan', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { planId, subscriptionEnd } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = (await pool.query('SELECT id, name FROM plans WHERE id=$1', [planId])).rows[0] as
      { id: string; name: string } | undefined;
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    await pool.query('UPDATE tenants SET plan_id=$1, status=$2, subscription_ends_at=$3 WHERE id=$4', [
      planId,
      'active',
      subscriptionEnd || null,
      id,
    ]);
    res.json({ ok: true, plan: plan.name });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Tenant activity — login history, usage stats, storage ────────────────────
router.get('/api/super-admin/tenants/:id/activity', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [logins, counts, revenue, storage] = await Promise.all([
      // Last 10 login events
      pool.query(
        `SELECT user_name, details, created_at FROM audit_log WHERE tenant_id=$1 AND action='LOGIN' ORDER BY created_at DESC LIMIT 10`,
        [id],
      ),
      // Entity counts
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM products WHERE tenant_id=$1) as products,
          (SELECT COUNT(*) FROM vendors WHERE tenant_id=$1 AND id!='OWNER') as vendors,
          (SELECT COUNT(*) FROM customers WHERE tenant_id=$1) as customers,
          (SELECT COUNT(*) FROM product_sales WHERE tenant_id=$1) as sales,
          (SELECT COUNT(*) FROM product_distribution WHERE tenant_id=$1) as distributions,
          (SELECT COUNT(*) FROM users WHERE tenant_id=$1) as users,
          (SELECT COUNT(*) FROM expenses WHERE tenant_id=$1) as expenses`,
        [id],
      ),
      // Revenue last 6 months
      pool.query(
        `SELECT to_char(purchase_date,'YYYY-MM') as month, COALESCE(SUM(sale_price),0) as revenue
         FROM product_sales WHERE tenant_id=$1 AND purchase_date >= NOW() - INTERVAL '6 months'
         GROUP BY month ORDER BY month`,
        [id],
      ),
      // Storage estimate (row counts as proxy)
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM product_inventory WHERE tenant_id=$1) +
          (SELECT COUNT(*) FROM product_distribution WHERE tenant_id=$1) +
          (SELECT COUNT(*) FROM product_sales WHERE tenant_id=$1) +
          (SELECT COUNT(*) FROM audit_log WHERE tenant_id=$1) as total_rows`,
        [id],
      ),
    ]);
    const c = counts.rows[0] as Record<string, string>;
    const s = storage.rows[0] as { total_rows: string };
    res.json({
      loginHistory: logins.rows,
      counts: {
        products: Number(c.products),
        vendors: Number(c.vendors),
        customers: Number(c.customers),
        sales: Number(c.sales),
        distributions: Number(c.distributions),
        users: Number(c.users),
        expenses: Number(c.expenses),
      },
      revenueHistory: revenue.rows.map((r: Record<string, unknown>) => ({
        month: r.month,
        revenue: Number(r.revenue) || 0,
      })),
      estimatedStorageRows: Number(s.total_rows) || 0,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Tenant data export (super admin version)
router.get('/api/super-admin/tenants/:id/export', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (await pool.query('SELECT company_name FROM tenants WHERE id=$1', [id])).rows[0] as {
      company_name: string;
    };
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const tables = [
      'products',
      'vendors',
      'customers',
      'suppliers',
      'banks',
      'product_purchases',
      'product_distribution',
      'vendor_payments',
      'supplier_payments',
      'product_sales',
      'standalone_invoices',
      'invoice_payments',
      'expenses',
      'staff_members',
      'staff_payments',
      'warranties',
      'quotations',
      'orders',
      'rewards',
      'bill_settings',
    ];

    const backup: Record<string, unknown[]> = {};
    await Promise.all(
      tables.map(async t => {
        try {
          const { rows } = await pool.query(`SELECT * FROM ${t} WHERE tenant_id=$1`, [id]);
          // Never ship GST API secrets in exports (encrypted or legacy plaintext)
          if (t === 'bill_settings') {
            backup[t] = rows.map(r => {
              const row = { ...(r as Record<string, unknown>) };
              if (row.gst_api_password) row.gst_api_password = '[REDACTED]';
              if (row.gst_api_client_secret) row.gst_api_client_secret = '[REDACTED]';
              return row;
            });
          } else {
            backup[t] = rows;
          }
        } catch {
          backup[t] = [];
        }
      }),
    );

    backup._meta = [
      {
        exportedAt: new Date().toISOString(),
        companyName: tenant.company_name,
        tenantId: id,
        exportedBy: 'super_admin',
      },
    ];
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${tenant.company_name.replace(/[^a-z0-9]/gi, '_')}_backup_${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Push in-app notification to tenant (appears in tenant Bell feed)
router.post('/api/super-admin/tenants/:id/notify', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type = 'info' } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const notifType = ['info', 'warning', 'success'].includes(type) ? type : 'info';
    const tenant = (await pool.query('SELECT id FROM tenants WHERE id = $1', [id])).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const notifId = uid('TN');
    const safeTitle = String(title).slice(0, 200);
    await pool.query(
      `INSERT INTO tenant_notifications (id, tenant_id, title, body, type, source, expires_at)
       VALUES ($1,$2,$3,$4,$5,'super_admin', NOW() + INTERVAL '30 days')`,
      [notifId, id, safeTitle, String(message).slice(0, 2000), notifType],
    );
    const saId = (req as AuthRequest).user?.userId;
    await logAudit(
      pool,
      id,
      'SYSTEM_NOTIFICATION',
      'notification',
      notifId,
      `SA notify: ${safeTitle} (${notifType})`,
      saId,
      'Super Admin',
    );
    logger.info('SA tenant notification sent', { tenantId: id, notifId, type: notifType, userId: saId });
    res.json({ ok: true, id: notifId });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Broadcast the same message to all active tenants (control panel). */
router.post('/api/super-admin/notifications/broadcast', superAdminMiddleware, async (req, res) => {
  try {
    const { title, message, type = 'info' } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const notifType = ['info', 'warning', 'success'].includes(type) ? type : 'info';
    const tenants = (await pool.query(`SELECT id FROM tenants WHERE COALESCE(status, 'active') IN ('active', 'trial')`))
      .rows as { id: string }[];
    const saId = (req as AuthRequest).user?.userId;
    const safeTitle = String(title).slice(0, 200);
    const safeBody = String(message).slice(0, 2000);
    let sent = 0;
    for (const t of tenants) {
      const notifId = uid('TN');
      // Re-check tenant still exists (parallel tests / concurrent deletes can race the SELECT above).
      const inserted = await pool.query(
        `INSERT INTO tenant_notifications (id, tenant_id, title, body, type, source, expires_at)
         SELECT $1, t.id, $2, $3, $4, 'super_admin', NOW() + INTERVAL '30 days'
         FROM tenants t
         WHERE t.id = $5 AND COALESCE(t.status, 'active') IN ('active', 'trial')
         RETURNING id`,
        [notifId, safeTitle, safeBody, notifType, t.id],
      );
      if (!inserted.rowCount) continue;
      await logAudit(
        pool,
        t.id,
        'SYSTEM_NOTIFICATION',
        'notification',
        notifId,
        `SA broadcast: ${safeTitle} (${notifType})`,
        saId,
        'Super Admin',
      );
      sent++;
    }
    // Also queue for active on-prem licenses (delivered on next heartbeat / hard sync)
    const licenses = (await pool.query(`SELECT id FROM onprem_licenses WHERE status = 'active'`)).rows as {
      id: string;
    }[];
    let onpremSent = 0;
    for (const lic of licenses) {
      const notifId = uid('OPN');
      const inserted = await pool.query(
        `INSERT INTO onprem_notifications (id, license_id, title, body, type, source, expires_at)
         SELECT $1, l.id, $2, $3, $4, 'super_admin', NOW() + INTERVAL '30 days'
         FROM onprem_licenses l
         WHERE l.id = $5 AND l.status = 'active'
         RETURNING id`,
        [notifId, safeTitle, safeBody, notifType, lic.id],
      );
      if (!inserted.rowCount) continue;
      onpremSent++;
    }
    if (onpremSent > 0) {
      await pool.query(
        `INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, details, user_id, user_name, created_at)
         VALUES (NULL,'SYSTEM_NOTIFICATION','onprem_notification',NULL,$1,$2,'Super Admin',NOW())`,
        [`SA broadcast on-prem: ${safeTitle} (${notifType}) → ${onpremSent} license(s)`, saId || null],
      );
    }
    logger.info('SA notification broadcast', {
      sent,
      onpremSent,
      type: notifType,
      title: safeTitle,
      userId: saId,
    });
    res.json({ ok: true, sent, onpremSent });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Super-admin: list active reset tokens (support tool) ─────────────────────
router.get('/api/super-admin/reset-tokens', superAdminMiddleware, async (req, res) => {
  try {
    // Never return full reset tokens — preview only (full token only at create time)
    const rows = await pool.query(`
      SELECT prt.id, prt.email, prt.tenant_id,
             LEFT(prt.token, 8) || '…' AS token_preview,
             prt.expires_at, t.company_name
      FROM password_reset_tokens prt
      JOIN tenants t ON t.id = prt.tenant_id
      WHERE prt.used = false AND prt.expires_at > NOW()
      ORDER BY prt.expires_at DESC
    `);
    res.setHeader('Cache-Control', 'no-store');
    res.json(rows.rows);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Super-admin: directly reset any user's password ───────────────────────────
router.post('/api/super-admin/users/:userId/reset-password', superAdminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const user = (await pool.query('SELECT id, email, tenant_id FROM users WHERE id = $1', [userId])).rows[0] as
      { id: string; email: string; tenant_id: string } | undefined;
    if (!user) return res.status(404).json({ error: 'User not found' });
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [hash, userId, user.tenant_id],
    );
    res.json({ ok: true, message: `Password reset for ${user.email}` });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
