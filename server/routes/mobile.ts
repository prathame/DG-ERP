/**
 * Cloud mobile app (Capacitor):
 *  - Public redeem-invite + heartbeat (like on-prem activate/heartbeat)
 *  - Authenticated device register
 *  - Super Admin: issue invite, force sync, list devices, set version policy
 */
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool } from '../pg-db';
import { superAdminMiddleware, AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';

const mobileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

function optionalJwt(req: { headers: { authorization?: string } }): { tenantId?: string; userId?: string } {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !process.env.JWT_SECRET) return {};
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }) as {
      tenantId?: string;
      userId?: string;
    };
  } catch (err) {
    logger.debug('optionalJwt: invalid token ignored', {
      errorName: err instanceof Error ? err.name : 'Error',
    });
    return {};
  }
}

const router = Router();

/** 48-bit invite: DG-M-XXXX-XXXX-XXXX */
function genInviteCode(): string {
  const part = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `DG-M-${part.slice(0, 4)}-${part.slice(4, 8)}-${part.slice(8)}`;
}

function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

const VERSION_RE = /^\d+(\.\d+){0,3}$/;

function normalizeVersion(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (s.length > 32 || !VERSION_RE.test(s)) {
    throw Object.assign(new Error('Invalid version — use digits and dots only (e.g. 2.2.0)'), { status: 400 });
  }
  return s;
}

function assertDeviceId(deviceId: unknown): string {
  if (!deviceId || typeof deviceId !== 'string') {
    throw Object.assign(new Error('deviceId required'), { status: 400 });
  }
  const id = deviceId.trim();
  if (id.length < 4 || id.length > 128) {
    throw Object.assign(new Error('deviceId must be 4–128 characters'), { status: 400 });
  }
  return id;
}

async function issueInvite(tenantId: string, daysValid = 30) {
  let code = '';
  let unique = false;
  for (let i = 0; i < 8; i++) {
    code = genInviteCode();
    const clash = (await pool.query('SELECT id FROM tenants WHERE mobile_invite_code = $1', [code])).rows[0];
    if (!clash) {
      unique = true;
      break;
    }
  }
  if (!unique || !code) {
    throw new Error('Could not allocate a unique mobile invite code');
  }
  const expires = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString();
  await pool.query(`UPDATE tenants SET mobile_invite_code = $1, mobile_invite_expires_at = $2 WHERE id = $3`, [
    code,
    expires,
    tenantId,
  ]);
  return { code, expiresAt: expires };
}

// ── Public: redeem Super Admin invite → company branding / slug ──────────────
router.post('/api/mobile/redeem-invite', mobileLimiter, async (req, res) => {
  try {
    const raw = String(req.body?.code || '')
      .trim()
      .toUpperCase();
    if (!raw) return res.status(400).json({ error: 'Invite code required' });
    const row = (
      await pool.query(
        `SELECT t.id, t.slug, t.company_name, t.status, t.mobile_invite_expires_at,
              b.logo_base64, b.primary_color, b.tagline
       FROM tenants t
       LEFT JOIN bill_settings b ON b.tenant_id = t.id
       WHERE t.mobile_invite_code = $1`,
        [raw],
      )
    ).rows[0] as
      | {
          id: string;
          slug: string;
          company_name: string;
          status: string;
          mobile_invite_expires_at: string | null;
          logo_base64: string | null;
          primary_color: string | null;
          tagline: string | null;
        }
      | undefined;

    if (!row) return res.status(404).json({ error: 'Invalid invite code' });
    if (row.status === 'suspended') return res.status(403).json({ error: 'This company is suspended' });
    if (row.mobile_invite_expires_at && new Date(row.mobile_invite_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite code expired — ask Super Admin for a new one' });
    }

    res.json({
      slug: row.slug,
      companyName: row.company_name,
      logoBase64: row.logo_base64,
      primaryColor: row.primary_color || '#F27D26',
      tagline: row.tagline,
    });
  } catch (e) {
    return handleApiError(req, res, e, 'mobile redeem-invite:');
  }
});

// ── Heartbeat: force-sync + version policy. Device upsert requires JWT. ───────
router.post('/api/mobile/heartbeat', mobileLimiter, async (req, res) => {
  try {
    const { platform, appVersion, slug } = req.body || {};
    let deviceId: string;
    try {
      deviceId = assertDeviceId(req.body?.deviceId);
    } catch (err) {
      const e = err as Error & { status?: number };
      return res.status(e.status || 400).json({ error: e.message });
    }

    const jwtUser = optionalJwt(req);
    const authedTenantId = jwtUser.tenantId || '';
    // Never trust client-supplied tenantId. Unauthenticated: slug only for sync flags (no settings / no device upsert).
    let tid = authedTenantId;
    if (!tid && typeof slug === 'string' && slug) {
      tid =
        (
          (await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug.toLowerCase()])).rows[0] as
            { id: string } | undefined
        )?.id || '';
    }

    if (!tid) {
      return res.json({
        ok: true,
        forceSyncAt: null,
        updateAvailable: false,
        forceUpdate: false,
        latestVersion: null,
        minVersion: null,
      });
    }

    const t = (
      await pool.query(
        `SELECT mobile_force_sync_at, mobile_min_version, mobile_latest_version, status
       FROM tenants WHERE id = $1`,
        [tid],
      )
    ).rows[0] as Record<string, unknown> | undefined;

    if (!t) return res.status(404).json({ error: 'Tenant not found' });

    const isAuthed = !!(authedTenantId && authedTenantId === tid);

    // Register / refresh device only when authenticated for that tenant
    if (isAuthed) {
      const id = `MD${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO mobile_devices (id, tenant_id, user_id, device_id, platform, app_version, last_seen)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (tenant_id, device_id) DO UPDATE SET
           user_id = COALESCE(EXCLUDED.user_id, mobile_devices.user_id),
           platform = EXCLUDED.platform,
           app_version = EXCLUDED.app_version,
           last_seen = NOW()`,
        [
          id,
          tid,
          jwtUser.userId || null,
          deviceId,
          String(platform || 'unknown').slice(0, 32),
          String(appVersion || '').slice(0, 32),
        ],
      );
    }

    const minV = (t.mobile_min_version as string) || '';
    const latestV = (t.mobile_latest_version as string) || '';
    const ver = String(appVersion || '');
    const forceUpdate = !!(minV && ver && cmpVersion(ver, minV) < 0);
    const updateAvailable = !!(latestV && ver && cmpVersion(ver, latestV) < 0);

    res.json({
      ok: true,
      ...(isAuthed ? { tenantStatus: t.status } : {}),
      forceSyncAt: t.mobile_force_sync_at ? new Date(t.mobile_force_sync_at as string).toISOString() : null,
      updateAvailable,
      forceUpdate,
      latestVersion: latestV || null,
      minVersion: minV || null,
    });
  } catch (e) {
    return handleApiError(req, res, e, 'mobile heartbeat:');
  }
});

// ── Auth: explicit device register after login ────────────────────────────────
router.post('/api/mobile/register-device', mobileLimiter, async (req, res) => {
  try {
    const auth = req as AuthRequest;
    const tenantId = auth.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const { platform, appVersion } = req.body || {};
    let deviceId: string;
    try {
      deviceId = assertDeviceId(req.body?.deviceId);
    } catch (err) {
      const e = err as Error & { status?: number };
      return res.status(e.status || 400).json({ error: e.message });
    }
    const id = `MD${crypto.randomBytes(8).toString('hex')}`;
    await pool.query(
      `INSERT INTO mobile_devices (id, tenant_id, user_id, device_id, platform, app_version, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (tenant_id, device_id) DO UPDATE SET
         user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
         app_version = EXCLUDED.app_version, last_seen = NOW()`,
      [
        id,
        tenantId,
        auth.user?.userId || null,
        deviceId,
        String(platform || 'unknown').slice(0, 32),
        String(appVersion || '').slice(0, 32),
      ],
    );
    res.json({ ok: true });
  } catch (e) {
    return handleApiError(req, res, e, 'mobile register-device:');
  }
});

// ── Super Admin: issue / rotate mobile invite ─────────────────────────────────
router.post('/api/super-admin/tenants/:id/mobile-invite', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = (
      await pool.query('SELECT id, slug, company_name, phone, admin_email FROM tenants WHERE id = $1', [id])
    ).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const days = Math.min(365, Math.max(1, Number(req.body?.daysValid) || 30));
    const { code, expiresAt } = await issueInvite(id, days);
    await logAudit(
      pool,
      id,
      'UPDATE',
      'mobile_invite',
      id,
      `Mobile invite issued ${code}`,
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );
    const origin = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;
    res.json({
      code,
      expiresAt,
      slug: tenant.slug,
      companyName: tenant.company_name,
      adminEmail: tenant.admin_email,
      phone: tenant.phone,
      deepLink: `${origin}/${tenant.slug}`,
      shareText: [
        `Welcome to ${tenant.company_name} on Dhandho Mobile!`,
        ``,
        `1. Download the app: ${origin}/download`,
        `2. Enter invite code: ${code}`,
        `   (or company code: ${tenant.slug})`,
        `3. Login with the credentials shared by your admin`,
        ``,
        `Web login: ${origin}/${tenant.slug}`,
      ].join('\n'),
    });
  } catch (e) {
    return handleApiError(req, res, e, 'mobile-invite:');
  }
});

router.get('/api/super-admin/tenants/:id/mobile-invite', superAdminMiddleware, async (req, res) => {
  try {
    const row = (
      await pool.query(
        `SELECT slug, company_name, mobile_invite_code, mobile_invite_expires_at,
              mobile_force_sync_at, mobile_min_version, mobile_latest_version
       FROM tenants WHERE id = $1`,
        [req.params.id],
      )
    ).rows[0];
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json({
      slug: row.slug,
      companyName: row.company_name,
      code: row.mobile_invite_code,
      expiresAt: row.mobile_invite_expires_at,
      forceSyncAt: row.mobile_force_sync_at,
      minVersion: row.mobile_min_version,
      latestVersion: row.mobile_latest_version,
    });
  } catch (e) {
    return handleApiError(req, res, e, 'get mobile-invite:');
  }
});

router.post('/api/super-admin/tenants/:id/mobile-force-sync', superAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      `UPDATE tenants SET mobile_force_sync_at = NOW() WHERE id = $1 RETURNING mobile_force_sync_at`,
      [id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    await logAudit(
      pool,
      id,
      'UPDATE',
      'mobile_force_sync',
      id,
      'Force sync pushed to mobile devices',
      (req as AuthRequest).user?.userId,
      'Super Admin',
    );
    res.json({ ok: true, forceSyncAt: r.rows[0].mobile_force_sync_at });
  } catch (e) {
    return handleApiError(req, res, e, 'mobile-force-sync:');
  }
});

router.put('/api/super-admin/tenants/:id/mobile-version', superAdminMiddleware, async (req, res) => {
  try {
    let minVersion: string | null;
    let latestVersion: string | null;
    try {
      minVersion = normalizeVersion(req.body?.minVersion);
      latestVersion = normalizeVersion(req.body?.latestVersion);
    } catch (err) {
      const e = err as Error & { status?: number };
      return res.status(e.status || 400).json({ error: e.message });
    }
    const r = await pool.query(
      `UPDATE tenants SET mobile_min_version = $1, mobile_latest_version = $2 WHERE id = $3 RETURNING id`,
      [minVersion, latestVersion, req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ ok: true, minVersion, latestVersion });
  } catch (e) {
    return handleApiError(req, res, e, 'mobile-version:');
  }
});

router.get('/api/super-admin/tenants/:id/mobile-devices', superAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.device_id, d.platform, d.app_version, d.last_seen, d.created_at,
              u.name as user_name, u.email as user_email
       FROM mobile_devices d
       LEFT JOIN users u ON u.id = d.user_id AND u.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1
       ORDER BY d.last_seen DESC NULLS LAST
       LIMIT 100`,
      [req.params.id],
    );
    res.json({
      devices: rows.map(r => ({
        id: r.id,
        deviceId: r.device_id,
        platform: r.platform,
        appVersion: r.app_version,
        lastSeen: r.last_seen,
        createdAt: r.created_at,
        userName: r.user_name,
        userEmail: r.user_email,
        isOnline: r.last_seen && Date.now() - new Date(r.last_seen).getTime() < 20 * 60 * 1000,
      })),
    });
  } catch (e) {
    return handleApiError(req, res, e, 'mobile-devices:');
  }
});

export { issueInvite };
export default router;
