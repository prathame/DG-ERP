import { Router } from 'express';
import { pool } from '../pg-db';
import bcrypt from 'bcrypt';
import { uid } from '../utils/helpers';
import { superAdminMiddleware, generateSuperAdminToken, AuthRequest } from '../middleware/auth';
import { provisionTenant, deleteTenant, getTenantStats } from '../utils/tenant';
import { logAudit } from '../utils/helpers';

const router = Router();

// ============ PUBLIC TENANT LOOKUP (no auth) ============
router.get('/api/tenant/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = (await pool.query(
      'SELECT id, company_name, slug, status FROM tenants WHERE slug = $1',
      [slug.toLowerCase()]
    )).rows[0] as { id: string; company_name: string; slug: string; status: string } | undefined;
    if (!tenant || (tenant.status !== 'active' && tenant.status !== 'trial')) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const billSettings = (await pool.query(
      'SELECT logo_base64, primary_color, tagline FROM bill_settings WHERE tenant_id = $1',
      [tenant.id]
    )).rows[0] as { logo_base64: string | null; primary_color: string | null; tagline: string | null } | undefined;
    res.json({
      tenantId: tenant.id,
      companyName: tenant.company_name,
      slug: tenant.slug,
      logoBase64: billSettings?.logo_base64 ?? null,
      primaryColor: billSettings?.primary_color ?? '#F27D26',
      tagline: billSettings?.tagline ?? null,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ SUPER ADMIN LOGIN ============
router.post('/api/super-admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await pool.query('SELECT * FROM super_admins WHERE email = $1', [email]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateSuperAdminToken({ userId: admin.id, email: admin.email, name: admin.name, role: 'super_admin' });
    res.json({ token, user: { id: admin.id, email: admin.email, name: admin.name, role: 'super_admin' } });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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

    const recentTenants = (await pool.query('SELECT id, company_name, status, plan_id, created_at, last_active_at FROM tenants ORDER BY created_at DESC LIMIT 5')).rows;

    const tenantsByPlan = (await pool.query(`
      SELECT p.name as plan_name, COUNT(t.id) as count
      FROM plans p LEFT JOIN tenants t ON t.plan_id = p.id
      GROUP BY p.id, p.name ORDER BY count DESC
    `)).rows;

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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    if (typeof status === 'string' && status) { sql += ` AND t.status = $${idx}`; params.push(status); idx++; }
    if (typeof search === 'string' && search) { sql += ` AND (t.company_name ILIKE $${idx} OR t.admin_email ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ' ORDER BY t.created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((t: Record<string, unknown>) => ({
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
      createdAt: t.created_at,
      lastActiveAt: t.last_active_at,
    })));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ CREATE TENANT ============
router.post('/api/super-admin/tenants', superAdminMiddleware, async (req, res) => {
  try {
    const { companyName, adminEmail, adminName, adminPassword, password, phone, address, gstNumber, planId, plan, subscriptionStart, subscriptionEnd } = req.body;
    if (!companyName || !adminEmail || !adminName) return res.status(400).json({ error: 'Company name, admin email, and admin name are required' });
    const existing = (await pool.query('SELECT id FROM tenants WHERE admin_email = $1', [adminEmail])).rows[0];
    if (existing) return res.status(400).json({ error: 'A tenant with this email already exists' });
    const selectedPlan = planId || plan || 'BASIC';
    const isTrial = selectedPlan === 'TRIAL';
    const trialEnd = isTrial ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : undefined;
    const result = await provisionTenant({
      companyName, adminEmail, adminName, adminPassword: adminPassword || password || undefined, phone, address, gstNumber,
      planId: selectedPlan, status: isTrial ? 'trial' : 'active', trialEndsAt: trialEnd,
    });
    if (subscriptionEnd) {
      await pool.query('UPDATE tenants SET subscription_ends_at = $1 WHERE id = $2', [subscriptionEnd, result.tenantId]);
    }
    const defaultTabConfig = {
      dashboard: { label: 'Dashboard', visible: true }, inventory: { label: 'Inventory', visible: true },
      distribution: { label: 'Distribution', visible: true }, sales: { label: 'Sales Entry', visible: true },
      verification: { label: 'Verify Product', visible: true }, warranty: { label: 'Warranty', visible: true },
      replacements: { label: 'Replacements', visible: true }, rewards: { label: 'Rewards', visible: true },
      finance: { label: 'Finance', visible: true }, chatbot: { label: 'Chatbot', visible: true },
      settings: { label: 'Settings', visible: true },
    };
    await pool.query('UPDATE tenants SET tab_config = $1 WHERE id = $2', [JSON.stringify(req.body.tabConfig || defaultTabConfig), result.tenantId]);
    await logAudit(pool, result.tenantId, 'CREATE', 'tenant', result.tenantId, `Tenant "${companyName}" created on ${selectedPlan} plan`, (req as AuthRequest).user?.userId, 'Super Admin');
    res.status(201).json({ ...result, adminEmail, password: result.credentials.password, companyName });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ GET TENANT DETAIL ============
router.get('/api/super-admin/tenants/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (await pool.query('SELECT t.*, p.name as plan_name FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE t.id = $1', [id])).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const stats = await getTenantStats(id);
    const users = (await pool.query('SELECT id, email, name, role, vendor_id, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at', [id])).rows;
    res.json({
      tenant: {
        id: tenant.id, companyName: tenant.company_name, slug: tenant.slug, adminEmail: tenant.admin_email,
        adminName: tenant.admin_name, phone: tenant.phone, address: tenant.address, gstNumber: tenant.gst_number,
        planId: tenant.plan_id, planName: tenant.plan_name, status: tenant.status,
        barcodeSystemEnabled: tenant.barcode_system_enabled !== false, multiLanguageEnabled: tenant.multi_language_enabled !== false, vendorPortalEnabled: tenant.vendor_portal_enabled !== false, inventoryTrackingEnabled: tenant.inventory_tracking_enabled !== false, quotationsEnabled: tenant.quotations_enabled !== false, accountsEnabled: tenant.accounts_enabled !== false, purchasesEnabled: tenant.purchases_enabled !== false, chatbotEnabled: tenant.chatbot_enabled !== false,
        trialEndsAt: tenant.trial_ends_at, subscriptionEndsAt: tenant.subscription_ends_at, createdAt: tenant.created_at, lastActiveAt: tenant.last_active_at,
        tabConfig: tenant.tab_config ?? null,
      },
      stats,
      users: users.map((u: Record<string, unknown>) => ({ id: u.id, email: u.email, name: u.name, role: u.role, vendorId: u.vendor_id, createdAt: u.created_at })),
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    if (requestBody.status !== undefined) { updates.push(`status = $${idx}`); params.push(requestBody.status); idx++; }
    if (requestBody.planId !== undefined) { updates.push(`plan_id = $${idx}`); params.push(requestBody.planId); idx++; }
    if (requestBody.companyName !== undefined) { updates.push(`company_name = $${idx}`); params.push(requestBody.companyName); idx++; }
    if (requestBody.phone !== undefined) { updates.push(`phone = $${idx}`); params.push(requestBody.phone); idx++; }
    if (requestBody.address !== undefined) { updates.push(`address = $${idx}`); params.push(requestBody.address); idx++; }
    if (requestBody.subscriptionEndsAt !== undefined) { updates.push(`subscription_ends_at = $${idx}`); params.push(requestBody.subscriptionEndsAt || null); idx++; }
    if (requestBody.gstNumber !== undefined) { updates.push(`gst_number = $${idx}`); params.push(requestBody.gstNumber); idx++; }
    if (requestBody.tabConfig !== undefined) { updates.push(`tab_config = $${idx}`); params.push(JSON.stringify(requestBody.tabConfig)); idx++; }
    if (requestBody.barcodeSystemEnabled !== undefined) { updates.push(`barcode_system_enabled = $${idx}`); params.push(!!requestBody.barcodeSystemEnabled); idx++; }
    if (requestBody.multiLanguageEnabled !== undefined) { updates.push(`multi_language_enabled = $${idx}`); params.push(!!requestBody.multiLanguageEnabled); idx++; }
    if (requestBody.vendorPortalEnabled !== undefined) { updates.push(`vendor_portal_enabled = $${idx}`); params.push(!!requestBody.vendorPortalEnabled); idx++; }
    if (requestBody.inventoryTrackingEnabled !== undefined) { updates.push(`inventory_tracking_enabled = $${idx}`); params.push(!!requestBody.inventoryTrackingEnabled); idx++; }
    if (requestBody.quotationsEnabled !== undefined) { updates.push(`quotations_enabled = $${idx}`); params.push(!!requestBody.quotationsEnabled); idx++; }
    if (requestBody.accountsEnabled !== undefined) { updates.push(`accounts_enabled = $${idx}`); params.push(!!requestBody.accountsEnabled); idx++; }
    if (requestBody.purchasesEnabled !== undefined) { updates.push(`purchases_enabled = $${idx}`); params.push(!!requestBody.purchasesEnabled); idx++; }
    if (requestBody.chatbotEnabled !== undefined) { updates.push(`chatbot_enabled = $${idx}`); params.push(!!requestBody.chatbotEnabled); idx++; }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    params.push(id);
    const result = await pool.query(`UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Tenant not found' });
    const tenant = (await pool.query('SELECT * FROM tenants WHERE id = $1', [id])).rows[0] as Record<string, unknown>;
    await logAudit(pool, id, 'UPDATE', 'tenant', id, `Tenant updated: ${updates.join(', ')}`, (req as AuthRequest).user?.userId, 'Super Admin');
    res.json({ id: tenant.id, companyName: tenant.company_name, status: tenant.status, planId: tenant.plan_id, barcodeSystemEnabled: tenant.barcode_system_enabled !== false, multiLanguageEnabled: tenant.multi_language_enabled !== false, vendorPortalEnabled: tenant.vendor_portal_enabled !== false, inventoryTrackingEnabled: tenant.inventory_tracking_enabled !== false, quotationsEnabled: tenant.quotations_enabled !== false, accountsEnabled: tenant.accounts_enabled !== false, purchasesEnabled: tenant.purchases_enabled !== false, chatbotEnabled: tenant.chatbot_enabled !== false, tabConfig: tenant.tab_config ?? null });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ DELETE TENANT ============
router.delete('/api/super-admin/tenants/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (await pool.query('SELECT id FROM tenants WHERE id = $1', [id])).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    await logAudit(pool, null as unknown as string, 'DELETE', 'tenant', id, `Tenant deleted`, (req as AuthRequest).user?.userId, 'Super Admin');
    await deleteTenant(id);
    res.json({ ok: true, message: 'Tenant and all data deleted' });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ RESET TOKEN (generate for admin to share) ============
router.post('/api/super-admin/tenants/:id/reset-token', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = (await pool.query('SELECT id, email, name FROM users WHERE email = $1 AND tenant_id = $2', [email, id])).rows[0] as { id: string; email: string; name: string } | undefined;
    if (!user) return res.status(404).json({ error: 'User not found in this tenant' });

    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    await pool.query(
      'INSERT INTO password_reset_tokens (id, email, tenant_id, token, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [uid('PRT'), email, id, token, expiresAt]
    );

    const tenant = (await pool.query('SELECT slug FROM tenants WHERE id = $1', [id])).rows[0] as { slug: string } | undefined;
    const resetLink = `${req.protocol}://${req.get('host')}/${tenant?.slug ?? ''}/reset-password?token=${token}`;

    await logAudit(pool, id, 'SUPER_ADMIN_RESET_TOKEN', 'user', user.id, `Super Admin generated reset token for ${email}`, (req as AuthRequest).user?.userId, 'Super Admin');

    res.json({ ok: true, token, resetLink, expiresAt, userName: user.name, email: user.email });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ IMPERSONATE (get tenant admin token) ============
router.post('/api/super-admin/tenants/:id/impersonate', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (await pool.query('SELECT * FROM tenants WHERE id = $1', [id])).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const admin = (await pool.query("SELECT * FROM users WHERE tenant_id = $1 AND role IN ('Super Admin', 'Admin') ORDER BY created_at LIMIT 1", [id])).rows[0];
    if (!admin) return res.status(404).json({ error: 'No admin user found for this tenant' });

    const { generateToken } = await import('../middleware/auth');
    const token = generateToken({ userId: admin.id, email: admin.email, name: admin.name, role: admin.role, tenantId: id });
    await logAudit(pool, id, 'IMPERSONATE', 'tenant', id, `Super admin impersonated ${admin.email}`, (req as AuthRequest).user?.userId, 'Super Admin');
    res.json({ token, tenantId: id, companyName: tenant.company_name, user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PLANS ============
router.get('/api/super-admin/plans', superAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT *, (SELECT COUNT(*) FROM tenants WHERE plan_id = plans.id) as tenant_count FROM plans ORDER BY price_monthly');
    res.json(rows.map((p: Record<string, unknown>) => ({
      id: p.id, name: p.name, maxProducts: p.max_products, maxVendors: p.max_vendors, maxUsers: p.max_users, maxBarcodes: p.max_barcodes,
      features: p.features, priceMonthly: p.price_monthly, priceYearly: p.price_yearly, isActive: p.is_active, tenantCount: p.tenant_count,
    })));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/super-admin/plans', superAdminMiddleware, async (req, res) => {
  try {
    const { id, name, maxProducts, maxVendors, maxUsers, maxBarcodes, features, priceMonthly, priceYearly } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'Plan ID and name required' });
    await pool.query(
      'INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, name, maxProducts ?? -1, maxVendors ?? -1, maxUsers ?? -1, maxBarcodes ?? -1, JSON.stringify(features || {}), priceMonthly ?? 0, priceYearly ?? 0]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/super-admin/plans/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, maxProducts, maxVendors, maxUsers, maxBarcodes, features, priceMonthly, priceYearly, isActive } = req.body;
    await pool.query(
      `UPDATE plans SET name = COALESCE($1, name), max_products = COALESCE($2, max_products), max_vendors = COALESCE($3, max_vendors),
       max_users = COALESCE($4, max_users), max_barcodes = COALESCE($5, max_barcodes), features = COALESCE($6, features),
       price_monthly = COALESCE($7, price_monthly), price_yearly = COALESCE($8, price_yearly), is_active = COALESCE($9, is_active) WHERE id = $10`,
      [name, maxProducts, maxVendors, maxUsers, maxBarcodes, features ? JSON.stringify(features) : null, priceMonthly, priceYearly, isActive, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/super-admin/plans/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenants = (await pool.query('SELECT COUNT(*) as c FROM tenants WHERE plan_id = $1', [id])).rows[0];
    if (tenants.c > 0) return res.status(400).json({ error: `Cannot delete plan — ${tenants.c} tenant(s) are using it` });
    await pool.query('DELETE FROM plans WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ SELF-SERVICE REGISTRATION ============
router.post('/api/tenant/register', superAdminMiddleware, async (req, res) => {
  try {
    const { companyName, adminName, adminEmail, adminPassword, phone } = req.body;
    if (!companyName || !adminName || !adminEmail || !adminPassword) return res.status(400).json({ error: 'All fields required' });
    if (adminPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (phone && !/^\+?\d[\d\s-]{6,14}$/.test(phone.trim())) return res.status(400).json({ error: 'Invalid phone number' });
    const existing = (await pool.query('SELECT id FROM tenants WHERE admin_email = $1', [adminEmail])).rows[0];
    if (existing) return res.status(400).json({ error: 'An account with this email already exists' });
    const trialEnds = new Date(); trialEnds.setDate(trialEnds.getDate() + 14);
    const result = await provisionTenant({
      companyName, adminEmail, adminName, adminPassword, phone,
      planId: 'TRIAL', status: 'trial', trialEndsAt: trialEnds.toISOString(),
    });

    const { generateToken } = await import('../middleware/auth');
    const token = generateToken({ userId: `U-${result.tenantId}`, email: adminEmail, name: adminName, role: 'Super Admin', tenantId: result.tenantId });

    res.status(201).json({ token, tenantId: result.tenantId, tenantSlug: result.slug, companyName, user: { email: adminEmail, name: adminName, role: 'Super Admin', companyName } });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ TENANT BILLING ============
router.get('/api/super-admin/billing', superAdminMiddleware, async (req, res) => {
  try {
    const { tenantId, status, page } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = 30;
    let sql = `SELECT i.*, t.company_name as tenant_name FROM tenant_invoices i LEFT JOIN tenants t ON i.tenant_id = t.id WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;
    if (typeof tenantId === 'string' && tenantId) { sql += ` AND i.tenant_id = $${idx}`; params.push(tenantId); idx++; }
    if (typeof status === 'string' && status) { sql += ` AND i.status = $${idx}`; params.push(status); idx++; }
    const countResult = (await pool.query(`SELECT COUNT(*) as c FROM (${sql}) sub`, params)).rows[0] as { c: number };
    sql += ` ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(pageSize, (pageNum - 1) * pageSize);
    const { rows } = await pool.query(sql, params);
    res.json({
      data: rows.map((r: Record<string, unknown>) => ({
        id: r.id, tenantId: r.tenant_id, tenantName: r.tenant_name, invoiceNumber: r.invoice_number,
        periodStart: r.period_start, periodEnd: r.period_end, planName: r.plan_name,
        amount: r.amount, gstAmount: r.gst_amount, total: r.total, status: r.status,
        paidAt: r.paid_at, notes: r.notes, createdAt: r.created_at,
      })),
      total: Number(countResult.c), page: pageNum, totalPages: Math.ceil(Number(countResult.c) / pageSize),
    });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/api/super-admin/billing', superAdminMiddleware, async (req, res) => {
  try {
    const { tenantId, periodStart, periodEnd, amount, gstRate, notes } = req.body;
    if (!tenantId || !amount) return res.status(400).json({ error: 'Tenant and amount required' });
    const tenant = (await pool.query('SELECT id, company_name, plan_id FROM tenants WHERE id = $1', [tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const plan = tenant.plan_id ? (await pool.query('SELECT name FROM plans WHERE id = $1', [tenant.plan_id])).rows[0] as { name: string } | undefined : null;
    const gst = gstRate ? Math.round(Number(amount) * Number(gstRate) / 100) : 0;
    const total = Number(amount) + gst;
    const id = uid('INV');
    const invNum = `DG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    await pool.query(
      'INSERT INTO tenant_invoices (id, tenant_id, invoice_number, period_start, period_end, plan_name, amount, gst_amount, total, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, tenantId, invNum, periodStart || null, periodEnd || null, plan?.name || null, amount, gst, total, notes || null]
    );
    await logAudit(pool, tenantId, 'CREATE', 'invoice', id, `Invoice ${invNum} — ₹${total} for ${tenant.company_name}`, (req as AuthRequest).user?.userId, 'Super Admin');
    res.status(201).json({ id, invoiceNumber: invNum, total });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/api/super-admin/billing/:id/paid', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE tenant_invoices SET status = $1, paid_at = NOW() WHERE id = $2', ['paid', id]);
    await logAudit(pool, null as unknown as string, 'UPDATE', 'invoice', id, 'Invoice marked as paid', (req as AuthRequest).user?.userId, 'Super Admin');
    res.json({ ok: true });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/super-admin/billing/:id', superAdminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM tenant_invoices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
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
    if (typeof tenantId === 'string' && tenantId) { sql += ` AND a.tenant_id = $${idx}`; params.push(tenantId); idx++; }
    if (typeof action === 'string' && action) { sql += ` AND a.action = $${idx}`; params.push(action); idx++; }
    if (typeof entityType === 'string' && entityType) { sql += ` AND a.entity_type = $${idx}`; params.push(entityType); idx++; }
    if (typeof search === 'string' && search) { sql += ` AND (a.details ILIKE $${idx} OR a.user_name ILIKE $${idx} OR a.entity_id ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countResult = (await pool.query(`SELECT COUNT(*) as c FROM (${sql}) sub`, params)).rows[0] as { c: number };
    sql += ` ORDER BY a.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(pageSize, offset);
    const { rows } = await pool.query(sql, params);

    res.json({
      data: rows.map((r: Record<string, unknown>) => ({
        id: r.id, tenantId: r.tenant_id, tenantName: r.tenant_name ?? 'Platform', userId: r.user_id, userName: r.user_name,
        action: r.action, entityType: r.entity_type, entityId: r.entity_id, details: r.details, createdAt: r.created_at,
      })),
      total: Number(countResult.c),
      page: pageNum,
      totalPages: Math.ceil(Number(countResult.c) / pageSize),
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ ANALYTICS ============
router.get('/api/super-admin/analytics', superAdminMiddleware, async (req, res) => {
  try {
    const monthlyTenants = (await pool.query(`
      SELECT to_char(created_at, 'YYYY-MM') as month, COUNT(*) as count
      FROM tenants GROUP BY month ORDER BY month DESC LIMIT 12
    `)).rows;

    const revenueByTenant = (await pool.query(`
      SELECT t.company_name, COALESCE(SUM(ps.sale_price), 0) as revenue, COUNT(ps.id) as sales
      FROM tenants t LEFT JOIN product_sales ps ON ps.tenant_id = t.id
      GROUP BY t.id, t.company_name ORDER BY revenue DESC LIMIT 10
    `)).rows;

    const mostActiveToday = (await pool.query(`
      SELECT t.company_name, COUNT(ps.id) as sales_today
      FROM tenants t JOIN product_sales ps ON ps.tenant_id = t.id
      WHERE ps.purchase_date = CURRENT_DATE
      GROUP BY t.id, t.company_name ORDER BY sales_today DESC LIMIT 5
    `)).rows;

    res.json({ monthlyTenants, revenueByTenant, mostActiveToday });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
