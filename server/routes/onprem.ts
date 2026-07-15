import { Router } from 'express';
import rateLimit from 'express-rate-limit';

// M5 fix: rate limit public on-prem endpoints (no JWT)
const onpremLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Too many requests' }, standardHeaders: true, legacyHeaders: false });
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
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

    const lic = (await pool.query(
      'SELECT * FROM onprem_licenses WHERE license_key = $1', [licenseKey]
    )).rows[0] as Record<string, unknown> | undefined;

    if (!lic) return res.status(404).json({ error: 'Invalid license key' });
    if (lic.status !== 'active') return res.status(403).json({ error: `License ${lic.status}` });
    if (lic.valid_until && new Date(lic.valid_until as string) < new Date()) {
      return res.status(403).json({ error: 'License expired' });
    }
    // Machine binding — first activation locks to this machine
    if (lic.machine_id && lic.machine_id !== machineId) {
      return res.status(403).json({ error: 'License already activated on another machine. Contact support to transfer.' });
    }

    await pool.query(
      `UPDATE onprem_licenses SET machine_id=$1, machine_os=$2, app_version=$3, last_seen=NOW() WHERE license_key=$4`,
      [machineId, osInfo || null, appVersion || null, licenseKey]
    );

    res.json({
      valid: true,
      companyName: lic.company_name,
      businessType: lic.business_type || 'manufacturer',
      maxUsers: Number(lic.max_users) || 5,
      validUntil: lic.valid_until,
      adminEmail: lic.admin_email || null,
      settings: lic.settings || {},
    });
  } catch (err) {
    console.error('💥 /api/onprem/activate failed:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Heartbeat — called every 60 min by on-prem app when online
router.post('/api/onprem/heartbeat', onpremLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId, version, activeUsers, diskMB } = req.body;
    if (!licenseKey) return res.status(400).json({ error: 'licenseKey required' });

    const lic = (await pool.query(
      'SELECT * FROM onprem_licenses WHERE license_key = $1', [licenseKey]
    )).rows[0] as Record<string, unknown> | undefined;

    if (!lic) return res.json({ licenseValid: false, message: 'Unknown license' });

    const isValid = lic.status === 'active' &&
      (!lic.valid_until || new Date(lic.valid_until as string) >= new Date());
    const isMachineMatch = !lic.machine_id || lic.machine_id === machineId;

    if (isValid && isMachineMatch) {
      await pool.query(
        `UPDATE onprem_licenses SET last_seen=NOW(), app_version=$1, active_users=$2, disk_mb=$3 WHERE license_key=$4`,
        [version || null, activeUsers || 0, diskMB || 0, licenseKey]
      );
    }

    // Check version config from DB (fallback to env)
    const cfgRows = (await pool.query("SELECT key, value FROM platform_config WHERE key IN ('latest_onprem_version','min_onprem_version')")).rows as { key: string; value: string }[];
    const cfgMap: Record<string, string> = {};
    for (const r of cfgRows) cfgMap[r.key] = r.value;
    const latestVersion = cfgMap['latest_onprem_version'] || process.env.LATEST_ONPREM_VERSION || null;
    const forceMinVersion = cfgMap['min_onprem_version'] || process.env.MIN_ONPREM_VERSION || null;
    const updateAvailable = latestVersion && version && latestVersion !== version;
    const forceUpdate = forceMinVersion && version && version < forceMinVersion;

    const daysLeft = lic.valid_until
      ? Math.ceil((new Date(lic.valid_until as string).getTime() - Date.now()) / 86400000)
      : null;

    res.json({
      licenseValid: isValid && isMachineMatch,
      licenseStatus: lic.status,
      daysUntilExpiry: daysLeft,
      updateAvailable: Boolean(updateAvailable),
      latestVersion: latestVersion || null,
      forceUpdate: Boolean(forceUpdate),
      settings: lic.settings || {},
    });
  } catch (err) {
    console.error('💥 /api/onprem/heartbeat failed:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate (transfer license to new machine)
router.post('/api/onprem/deactivate', onpremLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId } = req.body;
    const lic = (await pool.query(
      'SELECT * FROM onprem_licenses WHERE license_key = $1 AND machine_id = $2',
      [licenseKey, machineId]
    )).rows[0];
    if (!lic) return res.status(404).json({ error: 'License not found for this machine' });
    await pool.query('UPDATE onprem_licenses SET machine_id=NULL WHERE license_key=$1', [licenseKey]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Apply settings pushed from cloud (tab config, feature toggles) ────────────
router.post('/api/onprem/apply-settings', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip)) return res.status(403).json({ error: 'Localhost only' });
    const { licenseKey, settings } = req.body as { licenseKey: string; settings: Record<string, unknown> };

    // P2 fix: validate the license key before applying any settings
    if (!licenseKey) return res.status(400).json({ error: 'licenseKey required' });
    const lic = (await pool.query(
      "SELECT id FROM onprem_licenses WHERE license_key = $1 AND status = 'active'", [licenseKey]
    )).rows[0];
    if (!lic) return res.status(403).json({ error: 'Invalid or inactive license key' });

    // Find the local tenant and apply settings
    const tenant = (await pool.query("SELECT id FROM tenants WHERE slug != 'OWNER' LIMIT 1")).rows[0] as { id: string } | undefined;
    if (!tenant) return res.json({ ok: true, skipped: true });

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (settings.tabConfig) {
      updates.push(`tab_config=$${idx++}`);
      params.push(JSON.stringify(settings.tabConfig));
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
    }
    res.json({ ok: true, applied: updates.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── On-prem local provision (called by Electron after wizard, localhost only) ──
router.post('/api/onprem/provision', async (req, res) => {
  try {
    // Only allow from localhost — this endpoint must never be exposed publicly
    const ip = req.ip || req.socket.remoteAddress || '';
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip)) {
      return res.status(403).json({ error: 'Localhost only' });
    }
    if (process.env.DEPLOYMENT_MODE !== 'onprem') {
      return res.status(403).json({ error: 'On-prem only' });
    }

    const { companyName, businessType, adminEmail, adminPassword, licenseKey, maxUsers } = req.body;
    if (!companyName || !adminPassword) return res.status(400).json({ error: 'Missing required fields' });

    const { provisionTenant } = await import('../utils/tenant');

    // Ensure a LOCAL plan exists for on-prem (no FK violation)
    await pool.query(`
      INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly, is_active)
      VALUES ('LOCAL', 'On-Prem License', -1, -1, -1, -1, '{}', 0, 0, true)
      ON CONFLICT (id) DO NOTHING
    `);

    // If tenant with this slug already exists (retry after partial failure), reuse it
    const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = (await pool.query('SELECT id, slug FROM tenants WHERE slug = $1', [baseSlug])).rows[0] as { id: string; slug: string } | undefined;

    let tenantId: string, slug: string;
    if (existing) {
      tenantId = existing.id; slug = existing.slug;
      // Update admin password if tenant already exists
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash(adminPassword, 12);
      await pool.query('UPDATE users SET password_hash=$1 WHERE tenant_id=$2 AND role=$3', [hash, tenantId, 'Admin']);
    } else {
      const result = await provisionTenant({
        companyName, adminEmail: adminEmail || `admin@local`,
        adminName: 'Admin', adminPassword,
        planId: 'LOCAL', status: 'active',
      });
      tenantId = result.tenantId; slug = result.slug;
    }

    // Apply business-type tab config (same presets as super admin cloud onboarding)
    const TAB_CONFIGS: Record<string, Record<string, { label: string; visible: boolean }>> = {
      manufacturer: {
        analytics: { label: 'Analytics', visible: true }, masters: { label: 'Masters', visible: true },
        inventory: { label: 'Inventory', visible: true }, distribution: { label: 'Dispatch', visible: true },
        sales: { label: 'Warranty Registration', visible: true }, purchases: { label: 'Purchases', visible: true },
        verification: { label: 'Search / Verify', visible: true }, quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true }, finance: { label: 'Vendor Payments', visible: true },
        accounts: { label: 'Accounts', visible: true }, warranty: { label: 'Warranty', visible: true },
        replacements: { label: 'Replacements', visible: true }, rewards: { label: 'Rewards', visible: true },
        chatbot: { label: 'Chatbot', visible: true }, settings: { label: 'Settings', visible: true },
      },
      dealer: {
        analytics: { label: 'Analytics', visible: true }, masters: { label: 'Masters', visible: true },
        inventory: { label: 'Inventory', visible: true }, distribution: { label: 'Sales', visible: true },
        sales: { label: 'Sales Entry', visible: false }, purchases: { label: 'Purchases', visible: true },
        verification: { label: 'Search / Verify', visible: true }, quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true }, finance: { label: 'Dealer Payments', visible: true },
        accounts: { label: 'Accounts', visible: true }, warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false }, rewards: { label: 'Rewards', visible: false },
        chatbot: { label: 'Chatbot', visible: true }, settings: { label: 'Settings', visible: true },
      },
      retail: {
        analytics: { label: 'Analytics', visible: true }, masters: { label: 'Masters', visible: true },
        inventory: { label: 'Stock', visible: true }, distribution: { label: 'Purchase', visible: true },
        sales: { label: 'Sales Entry', visible: false }, purchases: { label: 'Purchases', visible: true },
        verification: { label: 'Search / Verify', visible: true }, quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true }, finance: { label: 'Supplier Payments', visible: true },
        accounts: { label: 'Accounts', visible: true }, warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false }, rewards: { label: 'Rewards', visible: false },
        chatbot: { label: 'Chatbot', visible: true }, settings: { label: 'Settings', visible: true },
      },
      service: {
        analytics: { label: 'Analytics', visible: true }, masters: { label: 'Masters', visible: true },
        inventory: { label: 'Inventory', visible: false }, distribution: { label: 'Distribution', visible: false },
        sales: { label: 'Sales Entry', visible: false }, purchases: { label: 'Expenses', visible: true },
        verification: { label: 'Search / Verify', visible: false }, quotations: { label: 'Quotes & Orders', visible: true },
        invoices: { label: 'Invoices', visible: true }, finance: { label: 'Invoice Finance', visible: true },
        accounts: { label: 'Accounts', visible: true }, warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false }, rewards: { label: 'Rewards', visible: false },
        chatbot: { label: 'Chatbot', visible: true }, settings: { label: 'Settings', visible: true },
      },
    };
    const tabConfig = TAB_CONFIGS[businessType || 'manufacturer'] || TAB_CONFIGS.manufacturer;

    // Set business type + tab config
    await pool.query(
      'UPDATE tenants SET business_type=$1, tab_config=$2 WHERE id=$3',
      [businessType || 'manufacturer', JSON.stringify(tabConfig), tenantId]
    );

    res.json({ ok: true, tenantId, slug });
  } catch (err) {
    console.error('💥 /api/onprem/provision failed:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Super admin endpoints (JWT protected) ─────────────────────────────────────

// List all licenses
router.get('/api/super-admin/onprem', superAdminMiddleware, async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT *, (valid_until IS NULL OR valid_until >= CURRENT_DATE) AS is_valid_date FROM onprem_licenses ORDER BY created_at DESC`
    )).rows;
    const now = Date.now();
    res.json(rows.map((r: Record<string, unknown>) => ({
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
      isOnline: r.last_seen && (now - new Date(r.last_seen as string).getTime()) < 70 * 60 * 1000, // online if seen < 70 min ago
      createdAt: r.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
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
      [id, licenseKey, companyName, businessType || 'manufacturer', adminEmail || null,
       maxUsers || 5, validUntil || null, JSON.stringify(settings || {}), 'SA1']
    );
    res.status(201).json({ id, licenseKey, companyName, businessType, validUntil });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update license (suspend, revoke, transfer, push settings)
router.put('/api/super-admin/onprem/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { status, maxUsers, validUntil, settings, clearMachine } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (status !== undefined) { updates.push(`status=$${idx++}`); params.push(status); }
    if (maxUsers !== undefined) { updates.push(`max_users=$${idx++}`); params.push(maxUsers); }
    if (validUntil !== undefined) { updates.push(`valid_until=$${idx++}`); params.push(validUntil); }
    if (settings !== undefined) { updates.push(`settings=$${idx++}`); params.push(JSON.stringify(settings)); }
    if (clearMachine) { updates.push(`machine_id=NULL`); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE onprem_licenses SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`, params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'License not found' });
    res.json({ ok: true, license: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete license
router.delete('/api/super-admin/onprem/:id', superAdminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM onprem_licenses WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'License not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
