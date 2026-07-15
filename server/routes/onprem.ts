import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { superAdminMiddleware } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

// ── License key generator ─────────────────────────────────────────────────────
function generateLicenseKey(): string {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `DG-${seg()}-${seg()}-${seg()}`;
}

// ── Public endpoints (validated by license key, no JWT) ───────────────────────

// Activate license on first install
router.post('/api/onprem/activate', async (req, res) => {
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
router.post('/api/onprem/heartbeat', async (req, res) => {
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

    // Check for latest version from env/config
    const latestVersion = process.env.LATEST_ONPREM_VERSION || null;
    const forceMinVersion = process.env.MIN_ONPREM_VERSION || null;
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
router.post('/api/onprem/deactivate', async (req, res) => {
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

    const result = await provisionTenant({
      companyName, adminEmail: adminEmail || `admin@local`,
      adminName: 'Admin', adminPassword,
      planId: 'LOCAL', status: 'active',
    });

    // Set business type on the tenant
    await pool.query(
      'UPDATE tenants SET business_type=$1 WHERE id=$2',
      [businessType || 'manufacturer', result.tenantId]
    );

    res.json({ ok: true, tenantId: result.tenantId, slug: result.slug });
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
