/**
 * Service Mobile (offline phone app) — cloud license / hard-sync / backup APIs.
 * Parallel to on-prem desktop, but business_type is always `service` and max_users is always 1.
 * Cloud never accepts ERP business mutations from the phone.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { superAdminMiddleware } from '../middleware/auth';

const router = Router();

const smLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const SERVICE_TAB_PRESET: Record<string, { label: string; visible: boolean }> = {
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
};

function generateLicenseKey(): string {
  // Match on-prem entropy: 3×4 random bytes (~96-bit) after DG-SM- prefix
  const seg = () => crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DG-SM-${seg()}-${seg()}-${seg()}`;
}

function mapLicense(r: Record<string, unknown>, now = Date.now()) {
  return {
    id: r.id,
    licenseKey: r.license_key,
    companyName: r.company_name,
    businessType: 'service',
    adminEmail: r.admin_email,
    maxUsers: 1,
    validUntil: r.valid_until,
    status: r.status,
    machineId: r.machine_id,
    machineOs: r.machine_os,
    appVersion: r.app_version,
    lastSeen: r.last_seen,
    settings: typeof r.settings === 'string' ? JSON.parse(r.settings as string) : r.settings || {},
    settingsPushedAt: r.settings_pushed_at,
    settingsAppliedAt: r.settings_applied_at,
    isOnline: r.last_seen ? now - new Date(r.last_seen as string).getTime() < 70 * 60 * 1000 : false,
    createdAt: r.created_at,
    latestBackupAt: r.latest_backup_at ?? null,
  };
}

// ── Public device endpoints ───────────────────────────────────────────────────

router.post('/api/service-mobile/activate', smLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId, osInfo, appVersion } = req.body as {
      licenseKey?: string;
      machineId?: string;
      osInfo?: string;
      appVersion?: string;
    };
    if (!licenseKey || !machineId) {
      return res.status(400).json({ error: 'licenseKey and machineId required' });
    }
    if (!/^[a-f0-9]{32}$/.test(machineId)) {
      return res.status(400).json({ error: 'Invalid machineId format' });
    }

    const lic = (await pool.query('SELECT * FROM service_mobile_licenses WHERE license_key = $1', [licenseKey]))
      .rows[0] as Record<string, unknown> | undefined;

    if (!lic) return res.status(404).json({ error: 'Invalid license key' });
    if (lic.status !== 'active') return res.status(403).json({ error: `License ${lic.status}` });
    if (lic.valid_until && new Date(lic.valid_until as string) < new Date()) {
      return res.status(403).json({ error: 'License expired' });
    }
    if (lic.machine_id && lic.machine_id !== machineId) {
      return res
        .status(403)
        .json({ error: 'License already activated on another device. Contact support to transfer.' });
    }

    await pool.query(
      `UPDATE service_mobile_licenses
       SET machine_id=$1, machine_os=$2, app_version=$3, last_seen=NOW()
       WHERE license_key=$4`,
      [machineId, osInfo || null, appVersion || null, licenseKey],
    );

    const settings =
      typeof lic.settings === 'string'
        ? JSON.parse(lic.settings as string)
        : (lic.settings as Record<string, unknown>) || {};

    res.json({
      valid: true,
      licenseKey,
      companyName: lic.company_name,
      businessType: 'service',
      maxUsers: 1,
      validUntil: lic.valid_until,
      adminEmail: lic.admin_email || null,
      settings,
      tabConfig: (settings.tabConfig as typeof SERVICE_TAB_PRESET) || SERVICE_TAB_PRESET,
      // We do not store Offline Mobile ERP data — staff keep their own backup files
      hasBackup: false,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/service-mobile/heartbeat', smLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId, version } = req.body as {
      licenseKey?: string;
      machineId?: string;
      version?: string;
    };
    if (!licenseKey) return res.status(400).json({ error: 'licenseKey required' });

    const lic = (await pool.query('SELECT * FROM service_mobile_licenses WHERE license_key = $1', [licenseKey]))
      .rows[0] as Record<string, unknown> | undefined;

    if (!lic) return res.json({ licenseValid: false, message: 'Unknown license' });

    const isValid = lic.status === 'active' && (!lic.valid_until || new Date(lic.valid_until as string) >= new Date());
    const isMachineMatch = !lic.machine_id || lic.machine_id === machineId;

    if (isValid && isMachineMatch) {
      await pool.query(`UPDATE service_mobile_licenses SET last_seen=NOW(), app_version=$1 WHERE license_key=$2`, [
        version || null,
        licenseKey,
      ]);
    }

    const cfgRows = (
      await pool.query(
        "SELECT key, value FROM platform_config WHERE key IN ('latest_service_mobile_version','min_service_mobile_version')",
      )
    ).rows as { key: string; value: string }[];
    const cfgMap: Record<string, string> = {};
    for (const r of cfgRows) cfgMap[r.key] = r.value;
    const latestVersion = cfgMap['latest_service_mobile_version'] || null;
    const forceMinVersion = cfgMap['min_service_mobile_version'] || null;
    const updateAvailable = Boolean(latestVersion && version && latestVersion !== version);
    const forceUpdate = Boolean(forceMinVersion && version && version < forceMinVersion);

    const daysLeft = lic.valid_until
      ? Math.ceil((new Date(lic.valid_until as string).getTime() - Date.now()) / 86400000)
      : null;

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
           FROM service_mobile_notifications
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
      updateAvailable,
      latestVersion: latestVersion || null,
      forceUpdate,
      settings: lic.settings || {},
      pendingNotifications,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/service-mobile/deactivate', smLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId } = req.body as { licenseKey?: string; machineId?: string };
    const lic = (
      await pool.query('SELECT * FROM service_mobile_licenses WHERE license_key = $1 AND machine_id = $2', [
        licenseKey,
        machineId,
      ])
    ).rows[0];
    if (!lic) return res.status(404).json({ error: 'License not found for this device' });
    await pool.query('UPDATE service_mobile_licenses SET machine_id=NULL WHERE license_key=$1', [licenseKey]);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err, 'Service mobile deactivate failed');
  }
});

router.post('/api/service-mobile/mark-applied', smLimiter, async (req, res) => {
  const body = req.body as { licenseKey?: string; machineId?: string };
  const licenseKey = body?.licenseKey;
  if (!licenseKey) return res.status(400).json({ error: 'licenseKey required' });
  try {
    const lic = (
      await pool.query(`SELECT id, status, machine_id FROM service_mobile_licenses WHERE license_key = $1`, [
        licenseKey,
      ])
    ).rows[0] as { id: string; status: string; machine_id: string | null } | undefined;
    if (!lic || lic.status !== 'active') {
      return res.status(404).json({ error: 'Invalid or inactive license' });
    }
    // Require a bound device — no fail-open while unbound
    if (!lic.machine_id || !body.machineId || body.machineId !== lic.machine_id) {
      return res.status(403).json({ error: 'Device mismatch' });
    }
    const updated = await pool.query(
      `UPDATE service_mobile_licenses
       SET settings_applied_at = NOW(),
           settings = COALESCE(settings, '{}'::jsonb) - 'forceSyncAt'
       WHERE license_key = $1 AND status = 'active'
       RETURNING id`,
      [licenseKey],
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Invalid or inactive license' });
    res.json({ ok: true });
  } catch (err) {
    logger.exception('service-mobile mark-applied failed', err, {
      licenseKeyPrefix: String(licenseKey).slice(0, 10),
    });
    return handleApiError(req, res, err);
  }
});

router.post('/api/service-mobile/mark-notifications-delivered', smLimiter, async (req, res) => {
  try {
    const { licenseKey, machineId, notificationIds } = req.body as {
      licenseKey?: string;
      machineId?: string;
      notificationIds?: string[];
    };
    if (!licenseKey || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: 'licenseKey and notificationIds required' });
    }
    const lic = (
      await pool.query(`SELECT id, status, machine_id FROM service_mobile_licenses WHERE license_key = $1`, [
        licenseKey,
      ])
    ).rows[0] as { id: string; status: string; machine_id: string | null } | undefined;
    if (!lic || lic.status !== 'active') {
      return res.status(404).json({ error: 'Invalid or inactive license' });
    }
    if (!lic.machine_id || !machineId || machineId !== lic.machine_id) {
      return res.status(403).json({ error: 'Device mismatch' });
    }
    const ids = notificationIds.map(String).slice(0, 50);
    await pool.query(
      `UPDATE service_mobile_notifications
       SET delivered_at = NOW()
       WHERE license_id = $1 AND id = ANY($2::text[]) AND delivered_at IS NULL`,
      [lic.id, ids],
    );
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Cloud ERP backups disabled — staff keep files on-device / their own Gmail. */
router.post('/api/service-mobile/backup', smLimiter, (_req, res) => {
  res.status(410).json({
    error:
      'Offline Mobile backups are not stored on our servers. Export a backup file on the phone (Settings) and keep it yourself.',
  });
});

router.post('/api/service-mobile/backup/latest', smLimiter, (_req, res) => {
  res.status(410).json({
    error: 'No cloud backups. Restore from your Offline Mobile backup file on the phone.',
  });
});

// ── Super Admin ───────────────────────────────────────────────────────────────

router.get('/api/super-admin/service-mobile', superAdminMiddleware, async (req, res) => {
  try {
    const rows = (await pool.query(`SELECT l.* FROM service_mobile_licenses l ORDER BY l.created_at DESC`))
      .rows as Record<string, unknown>[];
    const now = Date.now();
    res.json(rows.map(r => mapLicense(r, now)));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/super-admin/service-mobile', superAdminMiddleware, async (req, res) => {
  try {
    const { companyName, adminEmail, validUntil, settings } = req.body as {
      companyName?: string;
      adminEmail?: string;
      validUntil?: string | null;
      settings?: Record<string, unknown>;
    };
    if (!companyName?.trim()) return res.status(400).json({ error: 'companyName required' });

    const id = uid('SML');
    const licenseKey = generateLicenseKey();
    const mergedSettings = {
      tabConfig: SERVICE_TAB_PRESET,
      ...(settings || {}),
    };
    // Always service + 1 user
    await pool.query(
      `INSERT INTO service_mobile_licenses
         (id, license_key, company_name, business_type, admin_email, max_users, valid_until, settings, created_by)
       VALUES ($1,$2,$3,'service',$4,1,$5,$6,$7)`,
      [
        id,
        licenseKey,
        companyName.trim(),
        adminEmail || null,
        validUntil || null,
        JSON.stringify(mergedSettings),
        (req as { user?: { userId?: string } }).user?.userId || 'SA',
      ],
    );
    res.status(201).json({
      id,
      licenseKey,
      companyName: companyName.trim(),
      businessType: 'service',
      maxUsers: 1,
      validUntil: validUntil || null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/super-admin/service-mobile/:id/notify', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      message,
      type = 'info',
    } = req.body as {
      title?: string;
      message?: string;
      type?: string;
    };
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const notifType = ['info', 'warning', 'success'].includes(type) ? type : 'info';
    const lic = (await pool.query('SELECT id, company_name FROM service_mobile_licenses WHERE id = $1', [id]))
      .rows[0] as { id: string; company_name: string } | undefined;
    if (!lic) return res.status(404).json({ error: 'License not found' });

    const notifId = uid('SMN');
    const safeTitle = String(title).slice(0, 200);
    await pool.query(
      `INSERT INTO service_mobile_notifications (id, license_id, title, body, type, source, expires_at)
       VALUES ($1,$2,$3,$4,$5,'super_admin', NOW() + INTERVAL '30 days')`,
      [notifId, id, safeTitle, String(message).slice(0, 2000), notifType],
    );
    await pool.query(
      `INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, details, user_id, user_name, created_at)
       VALUES (NULL,'SYSTEM_NOTIFICATION','service_mobile_notification',$1,$2,$3,'Super Admin',NOW())`,
      [
        notifId,
        `Service mobile notify ${lic.company_name}: ${safeTitle} (${notifType})`,
        (req as { user?: { userId?: string } }).user?.userId || null,
      ],
    );
    res.json({ ok: true, id: notifId });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/super-admin/service-mobile/:id/unbind', superAdminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE service_mobile_licenses SET machine_id=NULL, machine_os=NULL
       WHERE id=$1 RETURNING id, company_name`,
      [req.params.id],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'License not found' });
    logger.info('SA unbound service mobile device', { licenseId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/super-admin/service-mobile/:id/force-sync', superAdminMiddleware, async (req, res) => {
  try {
    const forceSyncAt = new Date().toISOString();
    const result = await pool.query(
      `UPDATE service_mobile_licenses
       SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb,
           settings_pushed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify({ forceSyncAt }), req.params.id],
    );
    const r = result.rows[0] as Record<string, unknown> | undefined;
    if (!r) return res.status(404).json({ error: 'License not found' });
    res.json({ ok: true, license: mapLicense(r), forceSyncAt });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/super-admin/service-mobile/:id', superAdminMiddleware, async (req, res) => {
  try {
    const { status, validUntil, settings, clearMachine } = req.body as {
      status?: string;
      validUntil?: string | null;
      settings?: Record<string, unknown>;
      clearMachine?: boolean;
    };
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (status !== undefined) {
      updates.push(`status=$${idx++}`);
      params.push(status);
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
      updates.push(`machine_os=NULL`);
    }
    // Never allow changing business_type or max_users away from service / 1
    updates.push(`business_type='service'`);
    updates.push(`max_users=1`);
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE service_mobile_licenses SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
      params,
    );
    const r = result.rows[0] as Record<string, unknown> | undefined;
    if (!r) return res.status(404).json({ error: 'License not found' });
    res.json({ ok: true, license: mapLicense(r) });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/super-admin/service-mobile/:id', superAdminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM service_mobile_licenses WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'License not found' });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
export { SERVICE_TAB_PRESET };
