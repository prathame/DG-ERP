/**
 * Cloud Cap seats — device slots for Online Cap / Electron cloud.
 * Company-wide Netflix session lock applies only when business_type=service.
 * Other types: multi-user (claim device + access mode; no company freeze).
 * Separate from offline Service Mobile (DG-SM / service-mobile.ts).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth';
import { normalizePermissions } from '../middleware/permissions';
import { normalizeMobileFeatures } from '../../shared/mobileFeatures';

const router = Router();

const IDLE_MS = 5 * 60 * 1000;
const MODES = new Set(['mobile', 'desktop', 'both']);

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Any cloud tenant (seats are no longer service-only). */
async function assertCloudTenant(tenantId: string): Promise<Record<string, unknown> | null> {
  const row = (await pool.query(`SELECT * FROM tenants WHERE id = $1`, [tenantId])).rows[0] as
    Record<string, unknown> | undefined;
  return row || null;
}

function usesCompanySessionLock(tenant: Record<string, unknown>): boolean {
  return (tenant.business_type as string) === 'service';
}

async function syncSlots(tenantId: string, userId: string, mobileCount: number, desktopCount: number): Promise<void> {
  for (const [kind, want] of [
    ['mobile', Math.max(0, Math.min(20, mobileCount))] as const,
    ['desktop', Math.max(0, Math.min(20, desktopCount))] as const,
  ]) {
    const { rows } = await pool.query(
      `SELECT id, machine_id FROM service_cloud_device_slots
       WHERE tenant_id=$1 AND user_id=$2 AND device_kind=$3
       ORDER BY CASE WHEN machine_id IS NULL THEN 1 ELSE 0 END, created_at`,
      [tenantId, userId, kind],
    );
    const have = rows.length;
    if (have < want) {
      for (let i = 0; i < want - have; i++) {
        await pool.query(
          `INSERT INTO service_cloud_device_slots (id, tenant_id, user_id, device_kind)
           VALUES ($1,$2,$3,$4)`,
          [uid('SCS'), tenantId, userId, kind],
        );
      }
    } else if (have > want) {
      const unbound = rows.filter(r => !r.machine_id);
      const toRemove = have - want;
      const kill = unbound.slice(0, toRemove);
      if (kill.length < toRemove) {
        throw new Error(`Cannot reduce ${kind} slots below bound devices — unbind devices first`);
      }
      for (const r of kill) {
        await pool.query(`DELETE FROM service_cloud_device_slots WHERE id=$1`, [r.id]);
      }
    }
  }
}

function mapSlot(r: Record<string, unknown>) {
  return {
    id: r.id,
    userId: r.user_id,
    deviceKind: r.device_kind,
    machineId: r.machine_id,
    label: r.label,
    boundAt: r.bound_at,
    lastSeen: r.last_seen,
  };
}

async function getSeatsPayload(tenantId: string) {
  const tenant = await assertCloudTenant(tenantId);
  if (!tenant) return null;
  const businessType = (tenant.business_type as string) || 'manufacturer';
  const users = (
    await pool.query(`SELECT id, email, name, role, created_at FROM users WHERE tenant_id=$1 ORDER BY created_at`, [
      tenantId,
    ])
  ).rows as Record<string, unknown>[];
  const slots = (
    await pool.query(`SELECT * FROM service_cloud_device_slots WHERE tenant_id=$1 ORDER BY created_at`, [tenantId])
  ).rows as Record<string, unknown>[];
  const session = usesCompanySessionLock(tenant)
    ? ((await pool.query(`SELECT * FROM service_cloud_sessions WHERE tenant_id=$1 AND expires_at > NOW()`, [tenantId]))
        .rows[0] as Record<string, unknown> | undefined)
    : undefined;

  return {
    clientAccessMode: (tenant.client_access_mode as string) || null,
    businessType,
    companySessionLock: usesCompanySessionLock(tenant),
    mobileFeatures: normalizeMobileFeatures(tenant.mobile_features, businessType),
    activeSession: session
      ? {
          userId: session.user_id,
          userName: session.user_name,
          machineId: session.machine_id,
          client: session.client,
          heartbeatAt: session.heartbeat_at,
          expiresAt: session.expires_at,
        }
      : null,
    users: users.map(u => {
      const uslots = slots.filter(s => s.user_id === u.id);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.created_at,
        mobileSlots: uslots.filter(s => s.device_kind === 'mobile').length,
        desktopSlots: uslots.filter(s => s.device_kind === 'desktop').length,
        devices: uslots.map(mapSlot),
      };
    }),
  };
}

// ── Super Admin ───────────────────────────────────────────────────────────────

router.get('/api/super-admin/tenants/:id/service-cloud', superAdminMiddleware, async (req, res) => {
  try {
    const payload = await getSeatsPayload(req.params.id);
    if (!payload) return res.status(404).json({ error: 'Tenant not found' });
    res.json(payload);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/super-admin/tenants/:id/service-cloud/access-mode', superAdminMiddleware, async (req, res) => {
  try {
    const tenant = await assertCloudTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const mode = String(req.body?.clientAccessMode || '');
    if (!MODES.has(mode)) {
      return res.status(400).json({ error: 'clientAccessMode must be mobile, desktop, or both' });
    }
    await pool.query(`UPDATE tenants SET client_access_mode=$1 WHERE id=$2`, [mode, req.params.id]);
    logger.info('SA set cloud access mode', { tenantId: req.params.id, mode });
    res.json({ ok: true, clientAccessMode: mode });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/super-admin/tenants/:id/service-cloud/mobile-features', superAdminMiddleware, async (req, res) => {
  try {
    const tenant = await assertCloudTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const businessType = (tenant.business_type as string) || 'manufacturer';
    const features = normalizeMobileFeatures(req.body?.mobileFeatures ?? req.body, businessType);
    await pool.query(`UPDATE tenants SET mobile_features=$1::jsonb WHERE id=$2`, [
      JSON.stringify(features),
      req.params.id,
    ]);
    logger.info('SA set mobile features', { tenantId: req.params.id, features });
    res.json({ ok: true, mobileFeatures: features });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Create a seat user with mobile/desktop slot counts */
router.post('/api/super-admin/tenants/:id/service-cloud/users', superAdminMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const tenant = await assertCloudTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const {
      name,
      email,
      password,
      mobileSlots = 0,
      desktopSlots = 0,
      role = 'Admin',
    } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      mobileSlots?: number;
      desktopSlots?: number;
      role?: string;
    };
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const existing = (
      await pool.query(`SELECT id FROM users WHERE tenant_id=$1 AND LOWER(email)=LOWER($2)`, [tenantId, email])
    ).rows[0];
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const id = uid('U');
    const hash = bcrypt.hashSync(password, 12);
    const perms = normalizePermissions(null, role || 'Admin');
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, permissions, company_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, tenantId, email, hash, name, role || 'Admin', JSON.stringify(perms), tenant.company_name],
    );
    await syncSlots(tenantId, id, Number(mobileSlots) || 0, Number(desktopSlots) || 0);
    const payload = await getSeatsPayload(tenantId);
    res.status(201).json({ ok: true, userId: id, ...payload });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Update slot counts (and optional password/name) for a user */
router.put('/api/super-admin/tenants/:id/service-cloud/users/:userId', superAdminMiddleware, async (req, res) => {
  try {
    const { id: tenantId, userId } = req.params;
    const tenant = await assertCloudTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const user = (await pool.query(`SELECT id FROM users WHERE id=$1 AND tenant_id=$2`, [userId, tenantId])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, password, mobileSlots, desktopSlots } = req.body as {
      name?: string;
      password?: string;
      mobileSlots?: number;
      desktopSlots?: number;
    };
    if (name !== undefined) {
      await pool.query(`UPDATE users SET name=$1 WHERE id=$2 AND tenant_id=$3`, [name, userId, tenantId]);
    }
    if (password !== undefined) {
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2 AND tenant_id=$3`, [
        bcrypt.hashSync(password, 12),
        userId,
        tenantId,
      ]);
    }
    if (mobileSlots !== undefined || desktopSlots !== undefined) {
      const counts = (
        await pool.query(
          `SELECT
               COUNT(*) FILTER (WHERE device_kind='mobile')::int AS m,
               COUNT(*) FILTER (WHERE device_kind='desktop')::int AS d
             FROM service_cloud_device_slots WHERE tenant_id=$1 AND user_id=$2`,
          [tenantId, userId],
        )
      ).rows[0] as { m: number; d: number };
      await syncSlots(
        tenantId,
        userId,
        mobileSlots !== undefined ? Number(mobileSlots) : counts.m,
        desktopSlots !== undefined ? Number(desktopSlots) : counts.d,
      );
    }
    res.json({ ok: true, ...(await getSeatsPayload(tenantId)) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Cannot reduce')) return res.status(400).json({ error: msg });
    return handleApiError(req, res, err);
  }
});

router.post(
  '/api/super-admin/tenants/:id/service-cloud/slots/:slotId/unbind',
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id: tenantId, slotId } = req.params;
      if (!(await assertCloudTenant(tenantId))) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      const updated = await pool.query(
        `UPDATE service_cloud_device_slots
         SET machine_id=NULL, bound_at=NULL, last_seen=NULL, label=NULL
         WHERE id=$1 AND tenant_id=$2
         RETURNING id`,
        [slotId, tenantId],
      );
      if (!updated.rows[0]) return res.status(404).json({ error: 'Slot not found' });
      // Drop any session whose machine is no longer bound
      await pool.query(
        `DELETE FROM service_cloud_sessions s
         WHERE s.tenant_id=$1
           AND NOT EXISTS (
             SELECT 1 FROM service_cloud_device_slots sl
             WHERE sl.tenant_id=s.tenant_id
               AND sl.machine_id IS NOT NULL
               AND sl.machine_id=s.machine_id
           )`,
        [tenantId],
      );
      res.json({ ok: true, ...(await getSeatsPayload(tenantId)) });
    } catch (err) {
      return handleApiError(req, res, err);
    }
  },
);

// ── Device claim + session (authenticated tenant users) ───────────────────────

function clientKind(req: {
  headers: Record<string, unknown>;
  body?: { client?: string };
}): 'mobile' | 'desktop' | 'web' {
  const h = String(req.headers['x-dg-client'] || '');
  if (h === 'electron-cloud' || req.body?.client === 'desktop') return 'desktop';
  if (h === 'capacitor-cloud' || req.body?.client === 'mobile') return 'mobile';
  if (req.body?.client === 'web') return 'web';
  return 'web';
}

function modeAllows(mode: string | null, client: string): boolean {
  if (!mode) return false;
  if (mode === 'both') return client === 'mobile' || client === 'desktop';
  return mode === client;
}

router.post('/api/service-cloud/claim-device', authMiddleware, publicLimiter, async (req, res) => {
  try {
    const user = (req as { user?: { userId?: string; tenantId?: string; name?: string } }).user;
    if (!user?.userId || !user.tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const tenant = await assertCloudTenant(user.tenantId);
    if (!tenant) return res.status(403).json({ error: 'Tenant not found' });

    const { machineId, label } = req.body as { machineId?: string; label?: string };
    if (!machineId || !/^[a-f0-9]{32}$/i.test(machineId)) {
      return res.status(400).json({ error: 'Valid machineId required (32 hex)' });
    }
    const client = clientKind(req);
    if (client === 'web') {
      return res.status(403).json({ error: 'Browser clients are not enrolled in device seats' });
    }
    const mode = (tenant.client_access_mode as string) || null;
    if (!modeAllows(mode, client)) {
      return res.status(403).json({
        error: `This tenant does not allow ${client} access (mode=${mode || 'unset'})`,
      });
    }

    // Already bound to this user?
    const existing = (
      await pool.query(
        `SELECT * FROM service_cloud_device_slots
         WHERE tenant_id=$1 AND machine_id=$2`,
        [user.tenantId, machineId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (existing) {
      if (existing.user_id !== user.userId) {
        return res.status(403).json({ error: 'Device bound to another user' });
      }
      await pool.query(`UPDATE service_cloud_device_slots SET last_seen=NOW() WHERE id=$1`, [existing.id]);
      return res.json({ ok: true, slotId: existing.id, deviceKind: existing.device_kind, alreadyBound: true });
    }

    const kind = client === 'desktop' ? 'desktop' : 'mobile';
    const free = (
      await pool.query(
        `SELECT id FROM service_cloud_device_slots
         WHERE tenant_id=$1 AND user_id=$2 AND device_kind=$3 AND machine_id IS NULL
         ORDER BY created_at LIMIT 1`,
        [user.tenantId, user.userId, kind],
      )
    ).rows[0] as { id: string } | undefined;
    if (!free) {
      return res.status(403).json({
        error: `No free ${kind} device slots for this user. Contact Super Admin.`,
      });
    }
    // Conditional update prevents two concurrent claims from binding the same free slot
    const claimed = await pool.query(
      `UPDATE service_cloud_device_slots
       SET machine_id=$1, bound_at=NOW(), last_seen=NOW(), label=$2
       WHERE id=$3 AND tenant_id=$4 AND user_id=$5 AND machine_id IS NULL
       RETURNING id`,
      [machineId, label ? String(label).slice(0, 120) : null, free.id, user.tenantId, user.userId],
    );
    if (!claimed.rows[0]) {
      return res.status(409).json({
        error: 'Device slot was claimed by another request. Retry or free a slot.',
      });
    }
    res.json({ ok: true, slotId: free.id, deviceKind: kind, alreadyBound: false });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/service-cloud/session/acquire', authMiddleware, publicLimiter, async (req, res) => {
  try {
    const user = (req as { user?: { userId?: string; tenantId?: string; name?: string } }).user;
    if (!user?.userId || !user.tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const tenant = await assertCloudTenant(user.tenantId);
    if (!tenant) return res.status(403).json({ error: 'Tenant not found' });

    const { machineId } = req.body as { machineId?: string };
    if (!machineId) return res.status(400).json({ error: 'machineId required' });
    const client = clientKind(req);
    if (client === 'web') {
      return res.status(403).json({ error: 'Use the mobile or desktop app for this tenant' });
    }
    const mode = (tenant.client_access_mode as string) || null;
    if (!modeAllows(mode, client)) {
      return res.status(403).json({ error: `Access mode does not allow ${client}` });
    }

    const slot = (
      await pool.query(
        `SELECT id FROM service_cloud_device_slots
         WHERE tenant_id=$1 AND user_id=$2 AND machine_id=$3`,
        [user.tenantId, user.userId, machineId],
      )
    ).rows[0];
    if (!slot) return res.status(403).json({ error: 'Device not claimed — call claim-device first' });

    await pool.query(`UPDATE service_cloud_device_slots SET last_seen=NOW() WHERE id=$1`, [slot.id]);

    // Non-service: multi-user ERP — no company-wide session freeze
    if (!usesCompanySessionLock(tenant)) {
      return res.json({ ok: true, busy: false, companySessionLock: false, expiresAt: null });
    }

    // Service: expire stale, then claim company lock atomically (same machine renews).
    await pool.query(`DELETE FROM service_cloud_sessions WHERE tenant_id=$1 AND expires_at <= NOW()`, [user.tenantId]);

    const expires = new Date(Date.now() + IDLE_MS);
    const claimed = await pool.query(
      `INSERT INTO service_cloud_sessions (tenant_id, user_id, machine_id, client, user_name, heartbeat_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6)
       ON CONFLICT (tenant_id) DO UPDATE SET
         user_id=EXCLUDED.user_id,
         machine_id=EXCLUDED.machine_id,
         client=EXCLUDED.client,
         user_name=EXCLUDED.user_name,
         heartbeat_at=NOW(),
         expires_at=EXCLUDED.expires_at
       WHERE service_cloud_sessions.machine_id = EXCLUDED.machine_id
       RETURNING tenant_id, expires_at`,
      [user.tenantId, user.userId, machineId, client, user.name || 'User', expires.toISOString()],
    );

    if (!claimed.rows[0]) {
      const current = (await pool.query(`SELECT * FROM service_cloud_sessions WHERE tenant_id=$1`, [user.tenantId]))
        .rows[0] as Record<string, unknown> | undefined;
      return res.status(409).json({
        ok: false,
        busy: true,
        companySessionLock: true,
        holder: current
          ? {
              userId: current.user_id,
              userName: current.user_name,
              client: current.client,
              expiresAt: current.expires_at,
            }
          : null,
      });
    }

    res.json({
      ok: true,
      busy: false,
      companySessionLock: true,
      expiresAt: claimed.rows[0].expires_at,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/service-cloud/session/heartbeat', authMiddleware, publicLimiter, async (req, res) => {
  try {
    const user = (req as { user?: { userId?: string; tenantId?: string } }).user;
    if (!user?.userId || !user.tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const { machineId } = req.body as { machineId?: string };
    if (!machineId) return res.status(400).json({ error: 'machineId required' });

    const tenant = await assertCloudTenant(user.tenantId);
    if (!tenant) return res.status(403).json({ error: 'Tenant not found' });

    // Non-service: no company session to heartbeat
    if (!usesCompanySessionLock(tenant)) {
      const slot = (
        await pool.query(
          `SELECT id FROM service_cloud_device_slots
           WHERE tenant_id=$1 AND user_id=$2 AND machine_id=$3`,
          [user.tenantId, user.userId, machineId],
        )
      ).rows[0];
      if (!slot) return res.status(403).json({ error: 'Device not claimed' });
      await pool.query(`UPDATE service_cloud_device_slots SET last_seen=NOW() WHERE id=$1`, [slot.id]);
      return res.json({ ok: true, busy: false, companySessionLock: false, expiresAt: null });
    }

    await pool.query(`DELETE FROM service_cloud_sessions WHERE tenant_id=$1 AND expires_at <= NOW()`, [user.tenantId]);
    const current = (await pool.query(`SELECT * FROM service_cloud_sessions WHERE tenant_id=$1`, [user.tenantId]))
      .rows[0] as Record<string, unknown> | undefined;

    if (!current) {
      return res.status(409).json({ ok: false, busy: false, needAcquire: true, companySessionLock: true });
    }
    if (current.machine_id !== machineId || current.user_id !== user.userId) {
      return res.status(409).json({
        ok: false,
        busy: true,
        companySessionLock: true,
        holder: {
          userId: current.user_id,
          userName: current.user_name,
          client: current.client,
          expiresAt: current.expires_at,
        },
      });
    }
    const expires = new Date(Date.now() + IDLE_MS);
    await pool.query(
      `UPDATE service_cloud_sessions SET heartbeat_at=NOW(), expires_at=$1
       WHERE tenant_id=$2 AND user_id=$3 AND machine_id=$4`,
      [expires.toISOString(), user.tenantId, user.userId, machineId],
    );
    res.json({ ok: true, busy: false, companySessionLock: true, expiresAt: expires.toISOString() });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/service-cloud/session/release', authMiddleware, publicLimiter, async (req, res) => {
  try {
    const user = (req as { user?: { userId?: string; tenantId?: string } }).user;
    if (!user?.userId || !user.tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const { machineId } = req.body as { machineId?: string };
    if (!machineId) return res.status(400).json({ error: 'machineId required' });
    // Only the holder can release — no takeover via foreign release
    const deleted = await pool.query(
      `DELETE FROM service_cloud_sessions
       WHERE tenant_id=$1 AND user_id=$2 AND machine_id=$3
       RETURNING tenant_id`,
      [user.tenantId, user.userId, machineId],
    );
    if (!deleted.rows[0]) {
      return res.status(403).json({ error: 'Not the active session holder' });
    }
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/service-cloud/session/status', authMiddleware, publicLimiter, async (req, res) => {
  try {
    const user = (req as { user?: { tenantId?: string } }).user;
    if (!user?.tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const tenant = await assertCloudTenant(user.tenantId);
    if (!tenant) return res.json({ applicable: false });
    const companyLock = usesCompanySessionLock(tenant);
    let current: Record<string, unknown> | undefined;
    if (companyLock) {
      await pool.query(`DELETE FROM service_cloud_sessions WHERE expires_at <= NOW()`);
      current = (await pool.query(`SELECT * FROM service_cloud_sessions WHERE tenant_id=$1`, [user.tenantId]))
        .rows[0] as Record<string, unknown> | undefined;
    }
    res.json({
      applicable: true,
      clientAccessMode: tenant.client_access_mode || null,
      companySessionLock: companyLock,
      businessType: (tenant.business_type as string) || 'manufacturer',
      busy: Boolean(current),
      holder: current
        ? {
            userId: current.user_id,
            userName: current.user_name,
            client: current.client,
            machineId: current.machine_id,
            expiresAt: current.expires_at,
          }
        : null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
