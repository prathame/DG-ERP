import { Router } from 'express';
import rateLimit from 'express-rate-limit';

// M5 fix: rate limit public on-prem endpoints (no JWT)
const onpremLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { superAdminMiddleware } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

// ── License key generator ─────────────────────────────────────────────────────
function generateLicenseKey(): string {
  // M5 fix: 4 bytes/segment = 32 bits × 3 segments = 96-bit key space (was 48-bit)
  const seg = () => crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DG-${seg()}-${seg()}-${seg()}`;
}

// ── Public endpoints (validated by license key, no JWT) ───────────────────────

// Activate license on first install
router.post('/api/onprem/activate', onpremLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId, osInfo, appVersion } = req.body;
    if (!licenseKey || !machineId) return res.status(400).json({ error: 'licenseKey and machineId required' });
    if (!/^[a-f0-9]{32}$/.test(machineId)) return res.status(400).json({ error: 'Invalid machineId format' });

    const lic = (await pool.query('SELECT * FROM onprem_licenses WHERE license_key = $1', [licenseKey])).rows[0] as
      Record<string, unknown> | undefined;

    if (!lic) return res.status(404).json({ error: 'Invalid license key' });
    if (lic.status !== 'active') return res.status(403).json({ error: `License ${lic.status}` });
    if (lic.valid_until && new Date(lic.valid_until as string) < new Date()) {
      return res.status(403).json({ error: 'License expired' });
    }
    // Machine binding — first activation locks to this machine
    if (lic.machine_id && lic.machine_id !== machineId) {
      return res
        .status(403)
        .json({ error: 'License already activated on another machine. Contact support to transfer.' });
    }

    await pool.query(
      `UPDATE onprem_licenses SET machine_id=$1, machine_os=$2, app_version=$3, last_seen=NOW() WHERE license_key=$4`,
      [machineId, osInfo || null, appVersion || null, licenseKey],
    );

    res.json({
      valid: true,
      licenseKey, // echo so clients never drop the key after activate
      companyName: lic.company_name,
      businessType: lic.business_type || 'manufacturer',
      maxUsers: Number(lic.max_users) || 5,
      validUntil: lic.valid_until,
      adminEmail: lic.admin_email || null,
      settings: lic.settings || {},
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Heartbeat — called every 60 min by on-prem app when online
router.post('/api/onprem/heartbeat', onpremLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId, version, activeUsers, diskMB, businessType, slug } = req.body;
    if (!licenseKey) return res.status(400).json({ error: 'licenseKey required' });

    const lic = (await pool.query('SELECT * FROM onprem_licenses WHERE license_key = $1', [licenseKey])).rows[0] as
      Record<string, unknown> | undefined;

    if (!lic) return res.json({ licenseValid: false, message: 'Unknown license' });

    const isValid = lic.status === 'active' && (!lic.valid_until || new Date(lic.valid_until as string) >= new Date());
    const isMachineMatch = !lic.machine_id || lic.machine_id === machineId;

    if (isValid && isMachineMatch) {
      await pool.query(
        `UPDATE onprem_licenses SET last_seen=NOW(), app_version=$1, active_users=$2, disk_mb=$3${businessType ? ', business_type=$5' : ''} WHERE license_key=$4`,
        businessType
          ? [version || null, activeUsers || 0, diskMB || 0, licenseKey, businessType]
          : [version || null, activeUsers || 0, diskMB || 0, licenseKey],
      );

      // ponytail: cloud is authoritative for tabConfig — never overwrite from app heartbeat
    }

    // Check version config from DB (fallback to env)
    const cfgRows = (
      await pool.query(
        "SELECT key, value FROM platform_config WHERE key IN ('latest_onprem_version','min_onprem_version')",
      )
    ).rows as { key: string; value: string }[];
    const cfgMap: Record<string, string> = {};
    for (const r of cfgRows) cfgMap[r.key] = r.value;
    const latestVersion = cfgMap['latest_onprem_version'] || process.env.LATEST_ONPREM_VERSION || null;
    const forceMinVersion = cfgMap['min_onprem_version'] || process.env.MIN_ONPREM_VERSION || null;
    const updateAvailable = latestVersion && version && latestVersion !== version;
    const forceUpdate = forceMinVersion && version && version < forceMinVersion;

    const daysLeft = lic.valid_until
      ? Math.ceil((new Date(lic.valid_until as string).getTime() - Date.now()) / 86400000)
      : null;

    // Pending SA Bell messages for this license (delivered on next apply)
    let pendingNotifications: {
      id: string;
      title: string;
      body: string;
      type: string;
      source: string;
      createdAt: string;
      expiresAt: string | null;
    }[] = [];
    if (isValid && isMachineMatch) {
      const pending = (
        await pool.query(
          `SELECT id, title, body, type, source, created_at, expires_at
           FROM onprem_notifications
           WHERE license_id = $1
             AND delivered_at IS NULL
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY created_at ASC
           LIMIT 20`,
          [lic.id],
        )
      ).rows as Record<string, unknown>[];
      pendingNotifications = pending.map(r => ({
        id: String(r.id),
        title: String(r.title),
        body: String(r.body),
        type: String(r.type || 'info'),
        source: String(r.source || 'super_admin'),
        createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : new Date().toISOString(),
        expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
      }));
    }

    res.json({
      licenseValid: isValid && isMachineMatch,
      licenseStatus: lic.status,
      daysUntilExpiry: daysLeft,
      validUntil: lic.valid_until || null,
      updateAvailable: Boolean(updateAvailable),
      latestVersion: latestVersion || null,
      forceUpdate: Boolean(forceUpdate),
      settings: lic.settings || {},
      pendingNotifications,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Deactivate (transfer license to new machine)
router.post('/api/onprem/deactivate', onpremLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId } = req.body;
    const lic = (
      await pool.query('SELECT * FROM onprem_licenses WHERE license_key = $1 AND machine_id = $2', [
        licenseKey,
        machineId,
      ])
    ).rows[0];
    if (!lic) return res.status(404).json({ error: 'License not found for this machine' });
    await pool.query('UPDATE onprem_licenses SET machine_id=NULL WHERE license_key=$1', [licenseKey]);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err, 'On-prem deactivate failed');
  }
});

// ── Mark settings as applied (called by Electron after local apply succeeds) ──
router.post('/api/onprem/mark-applied', onpremLimiter, async (req, res) => {
  const body = req.body as { licenseKey?: string; machineId?: string };
  const licenseKey = body?.licenseKey;
  if (!licenseKey) return res.status(400).json({ error: 'licenseKey required' });
  try {
    const lic = (
      await pool.query(`SELECT id, status, machine_id FROM onprem_licenses WHERE license_key = $1`, [licenseKey])
    ).rows[0] as { id: string; status: string; machine_id: string | null } | undefined;
    if (!lic || lic.status !== 'active') {
      return res.status(404).json({ error: 'Invalid or inactive license' });
    }
    if (body.machineId && lic.machine_id && body.machineId !== lic.machine_id) {
      return res.status(403).json({ error: 'Machine mismatch' });
    }
    // Clear forceSyncAt so the device does not re-apply/reload on every heartbeat
    const updated = await pool.query(
      `UPDATE onprem_licenses
       SET settings_applied_at = NOW(),
           settings = COALESCE(settings, '{}'::jsonb) - 'forceSyncAt'
       WHERE license_key = $1 AND status = 'active'
       RETURNING id`,
      [licenseKey],
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Invalid or inactive license' });
    res.json({ ok: true });
  } catch (err) {
    logger.exception('mark-applied failed', err, { licenseKeyPrefix: String(licenseKey).slice(0, 8) });
    // Fallback: still stamp applied even if jsonb strip fails (active licenses only)
    try {
      const fb = await pool.query(
        `UPDATE onprem_licenses SET settings_applied_at=NOW() WHERE license_key=$1 AND status='active' RETURNING id`,
        [licenseKey],
      );
      if (!fb.rows[0]) return res.status(404).json({ error: 'Invalid or inactive license' });
      return res.status(500).json({ ok: false, error: 'Partial apply failure' });
    } catch (fbErr) {
      logger.exception('mark-applied fallback failed', fbErr, { licenseKeyPrefix: String(licenseKey).slice(0, 8) });
    }
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// ── Tab config endpoint — read local tenant tab_config for heartbeat sync ─────
router.get('/api/onprem/tab-config', async (req, res) => {
  try {
    // Use socket peer address — ignore X-Forwarded-For (trust proxy bypass)
    const ip = req.socket.remoteAddress || '';
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip))
      return res.status(403).json({ error: 'Localhost only' });
    const licenseKey = req.headers['x-license-key'] as string;
    if (!licenseKey) return res.status(400).json({ error: 'Missing license key' });
    const row = (
      await pool.query(
        `SELECT t.tab_config FROM tenants t
       JOIN onprem_licenses l ON l.company_name = t.company_name
       WHERE l.license_key = $1 LIMIT 1`,
        [licenseKey],
      )
    ).rows[0] as { tab_config: unknown } | undefined;
    res.json(row?.tab_config || null);
  } catch (err) {
    logger.warn('onprem tab-config lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.json(null);
  }
});

// ── Apply SA notifications from cloud into local Bell feed ───────────────────
router.post('/api/onprem/apply-notifications', async (req, res) => {
  try {
    const ip = req.socket.remoteAddress || '';
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip))
      return res.status(403).json({ error: 'Localhost only' });
    const { licenseKey, notifications } = req.body as {
      licenseKey?: string;
      notifications?: {
        id: string;
        title: string;
        body: string;
        type?: string;
        source?: string;
        createdAt?: string;
        expiresAt?: string | null;
      }[];
    };
    if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.length < 8) {
      return res.status(400).json({ error: 'licenseKey required' });
    }
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return res.json({ ok: true, applied: 0, ids: [] as string[] });
    }

    const tenant = (await pool.query("SELECT id FROM tenants WHERE slug != 'OWNER' LIMIT 1")).rows[0] as
      { id: string } | undefined;
    if (!tenant) return res.json({ ok: true, skipped: true, applied: 0, ids: [] as string[] });

    const appliedIds: string[] = [];
    for (const n of notifications.slice(0, 20)) {
      if (!n?.id || !n?.title || !n?.body) continue;
      const notifType = ['info', 'warning', 'success'].includes(String(n.type)) ? String(n.type) : 'info';
      const result = await pool.query(
        `INSERT INTO tenant_notifications (id, tenant_id, title, body, type, source, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()),$8)
         ON CONFLICT (id, tenant_id) DO NOTHING
         RETURNING id`,
        [
          String(n.id).slice(0, 64),
          tenant.id,
          String(n.title).slice(0, 200),
          String(n.body).slice(0, 2000),
          notifType,
          String(n.source || 'super_admin').slice(0, 64),
          n.createdAt || null,
          n.expiresAt || null,
        ],
      );
      if (result.rows[0]) appliedIds.push(String(n.id));
      else appliedIds.push(String(n.id)); // already present — still ack as delivered
    }
    logger.info('On-prem notifications applied locally', {
      tenantId: tenant.id,
      applied: appliedIds.length,
    });
    res.json({ ok: true, applied: appliedIds.length, ids: appliedIds });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Cloud: mark on-prem notifications delivered after local apply succeeds. */
router.post('/api/onprem/mark-notifications-delivered', onpremLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId, ids } = req.body as {
      licenseKey?: string;
      machineId?: string;
      ids?: string[];
    };
    if (!licenseKey) return res.status(400).json({ error: 'licenseKey required' });
    if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: true, marked: 0 });

    const lic = (
      await pool.query(`SELECT id, status, machine_id FROM onprem_licenses WHERE license_key = $1`, [licenseKey])
    ).rows[0] as { id: string; status: string; machine_id: string | null } | undefined;
    if (!lic || lic.status !== 'active') {
      return res.status(404).json({ error: 'Invalid or inactive license' });
    }
    if (machineId && lic.machine_id && machineId !== lic.machine_id) {
      return res.status(403).json({ error: 'Machine mismatch' });
    }

    const safeIds = ids.map(String).slice(0, 50);
    const result = await pool.query(
      `UPDATE onprem_notifications SET delivered_at = NOW()
       WHERE license_id = $1 AND id = ANY($2::text[]) AND delivered_at IS NULL`,
      [lic.id, safeIds],
    );
    logger.info('On-prem notifications marked delivered', {
      licenseId: lic.id,
      marked: result.rowCount ?? 0,
    });
    res.json({ ok: true, marked: result.rowCount ?? 0 });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Apply settings pushed from cloud (tab config, feature toggles) ────────────
router.post('/api/onprem/apply-settings', async (req, res) => {
  try {
    // Use socket peer address — ignore X-Forwarded-For (trust proxy bypass)
    const ip = req.socket.remoteAddress || '';
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip))
      return res.status(403).json({ error: 'Localhost only' });
    const { licenseKey, settings } = req.body as { licenseKey: string; settings: Record<string, unknown> };

    // Localhost-only endpoint. On-prem local DB usually has no onprem_licenses row
    // (licenses live on cloud) — require licenseKey string, not a local license table hit.
    if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.length < 8) {
      return res.status(400).json({ error: 'licenseKey required' });
    }

    // Find the local tenant and apply settings
    const tenant = (await pool.query("SELECT id, tab_config FROM tenants WHERE slug != 'OWNER' LIMIT 1")).rows[0] as
      { id: string; tab_config: unknown } | undefined;
    if (!tenant) return res.json({ ok: true, skipped: true });

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (settings.tabConfig && typeof settings.tabConfig === 'object') {
      // Deep-merge so a partial push (e.g. only rewards OFF) does not wipe other tabs
      const existing = (
        typeof tenant.tab_config === 'string' ? JSON.parse(tenant.tab_config) : tenant.tab_config || {}
      ) as Record<string, unknown>;
      const incoming = settings.tabConfig as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...existing };
      for (const [key, val] of Object.entries(incoming)) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          merged[key] = { ...((existing[key] as object) || {}), ...(val as object) };
        } else {
          merged[key] = val;
        }
      }
      updates.push(`tab_config=$${idx++}`);
      params.push(JSON.stringify(merged));
    }
    if (settings.businessType) {
      updates.push(`business_type=$${idx++}`);
      params.push(settings.businessType);
    }
    const featureMap: Record<string, string> = {
      barcodeSystemEnabled: 'barcode_system_enabled',
      multiLanguageEnabled: 'multi_language_enabled',
      inventoryTrackingEnabled: 'inventory_tracking_enabled',
      vendorPortalEnabled: 'vendor_portal_enabled',
      quotationsEnabled: 'quotations_enabled',
      accountsEnabled: 'accounts_enabled',
      purchasesEnabled: 'purchases_enabled',
      chatbotEnabled: 'chatbot_enabled',
    };
    for (const [key, col] of Object.entries(featureMap)) {
      if (settings[key] !== undefined) {
        updates.push(`${col}=$${idx++}`);
        params.push(Boolean(settings[key]));
      }
    }

    if (updates.length) {
      params.push(tenant.id);
      await pool.query(`UPDATE tenants SET ${updates.join(',')} WHERE id=$${idx}`, params);
      // settings_applied_at is marked by Electron via /api/onprem/mark-applied after local apply
    }
    res.json({ ok: true, applied: updates.length });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── On-prem local provision (called by Electron after wizard, localhost only) ──
router.post('/api/onprem/provision', async (req, res) => {
  try {
    // Only allow from localhost — use socket peer (ignore X-Forwarded-For)
    const ip = req.socket.remoteAddress || '';
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip)) {
      return res.status(403).json({ error: 'Localhost only' });
    }
    if (process.env.DEPLOYMENT_MODE !== 'onprem') {
      return res.status(403).json({ error: 'On-prem only' });
    }

    const { companyName, businessType, adminEmail, adminPassword, licenseKey, maxUsers } = req.body;
    if (!companyName || !adminPassword) return res.status(400).json({ error: 'Missing required fields' });
    if (adminPassword.length < 8)
      return res.status(400).json({ error: 'Admin password must be at least 8 characters' });

    const { provisionTenant } = await import('../utils/tenant');

    // Ensure a LOCAL plan exists for on-prem (no FK violation)
    await pool.query(`
      INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly, is_active)
      VALUES ('LOCAL', 'On-Prem License', -1, -1, -1, -1, '{}', 0, 0, true)
      ON CONFLICT (id) DO NOTHING
    `);

    // If tenant with this slug already exists (retry after partial failure), reuse it
    const baseSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const existing = (await pool.query('SELECT id, slug FROM tenants WHERE slug = $1', [baseSlug])).rows[0] as
      { id: string; slug: string } | undefined;

    let tenantId: string, slug: string;
    if (existing) {
      tenantId = existing.id;
      slug = existing.slug;
      // Update admin password if tenant already exists
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash(adminPassword, 12);
      await pool.query('UPDATE users SET password_hash=$1 WHERE tenant_id=$2 AND role=$3', [hash, tenantId, 'Admin']);
    } else {
      const result = await provisionTenant({
        companyName,
        adminEmail: adminEmail || `admin@local`,
        adminName: 'Admin',
        adminPassword,
        planId: 'LOCAL',
        status: 'active',
      });
      tenantId = result.tenantId;
      slug = result.slug;
    }

    // Apply business-type tab config (same presets as super admin cloud onboarding)
    const TAB_CONFIGS: Record<string, Record<string, { label: string; visible: boolean }>> = {
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
    const tabConfig = TAB_CONFIGS[businessType || 'manufacturer'] || TAB_CONFIGS.manufacturer;

    // Set business type + tab config
    await pool.query('UPDATE tenants SET business_type=$1, tab_config=$2 WHERE id=$3', [
      businessType || 'manufacturer',
      JSON.stringify(tabConfig),
      tenantId,
    ]);

    res.json({ ok: true, tenantId, slug });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Super admin endpoints (JWT protected) ─────────────────────────────────────

// List all licenses
router.get('/api/super-admin/onprem', superAdminMiddleware, async (req, res) => {
  try {
    const rows = (
      await pool.query(
        `SELECT *, (valid_until IS NULL OR valid_until >= CURRENT_DATE) AS is_valid_date FROM onprem_licenses ORDER BY created_at DESC`,
      )
    ).rows;
    const now = Date.now();
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        licenseKey: r.license_key,
        companyName: r.company_name,
        businessType: r.business_type,
        adminEmail: r.admin_email,
        maxUsers: r.max_users,
        validUntil: r.valid_until,
        status: r.status,
        machineId: r.machine_id,
        machineOs: r.machine_os,
        appVersion: r.app_version,
        lastSeen: r.last_seen,
        activeUsers: r.active_users,
        diskMB: r.disk_mb,
        settings: r.settings,
        settingsPushedAt: r.settings_pushed_at,
        settingsAppliedAt: r.settings_applied_at,
        isOnline: r.last_seen && now - new Date(r.last_seen as string).getTime() < 70 * 60 * 1000,
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Issue new license
router.post('/api/super-admin/onprem', superAdminMiddleware, async (req, res) => {
  try {
    const { companyName, businessType, adminEmail, maxUsers, validUntil, settings } = req.body;
    if (!companyName) return res.status(400).json({ error: 'companyName required' });
    const id = uid('OPL');
    const licenseKey = generateLicenseKey();
    await pool.query(
      `INSERT INTO onprem_licenses (id, license_key, company_name, business_type, admin_email, max_users, valid_until, settings, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        licenseKey,
        companyName,
        businessType || 'manufacturer',
        adminEmail || null,
        maxUsers || 5,
        validUntil || null,
        JSON.stringify(settings || {}),
        'SA1',
      ],
    );
    res.status(201).json({ id, licenseKey, companyName, businessType, validUntil });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Queue an in-app Bell message for an on-prem license (delivered on heartbeat / hard sync). */
router.post('/api/super-admin/onprem/:id/notify', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type = 'info' } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const notifType = ['info', 'warning', 'success'].includes(type) ? type : 'info';
    const lic = (await pool.query('SELECT id, company_name FROM onprem_licenses WHERE id = $1', [id])).rows[0] as
      { id: string; company_name: string } | undefined;
    if (!lic) return res.status(404).json({ error: 'License not found' });

    const notifId = uid('OPN');
    const safeTitle = String(title).slice(0, 200);
    await pool.query(
      `INSERT INTO onprem_notifications (id, license_id, title, body, type, source, expires_at)
       VALUES ($1,$2,$3,$4,$5,'super_admin', NOW() + INTERVAL '30 days')`,
      [notifId, id, safeTitle, String(message).slice(0, 2000), notifType],
    );
    // Platform-level audit (no cloud tenant_id for on-prem licenses)
    await pool.query(
      `INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, details, user_id, user_name, created_at)
       VALUES (NULL,'SYSTEM_NOTIFICATION','onprem_notification',$1,$2,$3,'Super Admin',NOW())`,
      [
        notifId,
        `On-prem notify ${lic.company_name}: ${safeTitle} (${notifType})`,
        (req as { user?: { userId?: string } }).user?.userId || null,
      ],
    );
    logger.info('SA on-prem notification queued', {
      licenseId: id,
      notifId,
      type: notifType,
      company: lic.company_name,
    });
    res.json({ ok: true, id: notifId });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Update license (suspend, revoke, transfer, push settings)
router.put('/api/super-admin/onprem/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { status, maxUsers, validUntil, settings, clearMachine } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (status !== undefined) {
      updates.push(`status=$${idx++}`);
      params.push(status);
    }
    if (maxUsers !== undefined) {
      updates.push(`max_users=$${idx++}`);
      params.push(maxUsers);
    }
    if (validUntil !== undefined) {
      updates.push(`valid_until=$${idx++}`);
      params.push(validUntil);
    }
    if (settings !== undefined) {
      updates.push(`settings=$${idx++}`);
      params.push(JSON.stringify(settings));
      updates.push(`settings_pushed_at=NOW()`);
    }
    if (clearMachine) {
      updates.push(`machine_id=NULL`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE onprem_licenses SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
      params,
    );
    const r = result.rows[0] as Record<string, unknown>;
    if (!r) return res.status(404).json({ error: 'License not found' });
    // Same camelCase shape as GET list — portal relies on settingsPushedAt after save
    res.json({
      ok: true,
      license: {
        id: r.id,
        licenseKey: r.license_key,
        companyName: r.company_name,
        businessType: r.business_type,
        adminEmail: r.admin_email,
        maxUsers: r.max_users,
        validUntil: r.valid_until,
        status: r.status,
        machineId: r.machine_id,
        machineOs: r.machine_os,
        appVersion: r.app_version,
        lastSeen: r.last_seen,
        activeUsers: r.active_users,
        diskMB: r.disk_mb,
        settings: typeof r.settings === 'string' ? JSON.parse(r.settings as string) : r.settings,
        settingsPushedAt: r.settings_pushed_at,
        settingsAppliedAt: r.settings_applied_at,
        createdAt: r.created_at,
      },
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Delete license
router.delete('/api/super-admin/onprem/:id', superAdminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM onprem_licenses WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'License not found' });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
