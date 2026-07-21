import crypto from 'crypto';
import { pool } from '../pg-db';
import { invalidateAuthCache } from './authCache';

export type SessionPlatform = 'desktop' | 'mobile' | 'web' | 'unknown';

export function newSessionId(): string {
  return crypto.randomUUID();
}

function normalizePlatform(raw: unknown): SessionPlatform {
  if (raw === 'desktop' || raw === 'mobile' || raw === 'web') return raw;
  return 'unknown';
}

/** Replace the user's sole active session (kicks every other device). */
export async function replaceUserSession(opts: {
  userId: string;
  tenantId: string;
  deviceId?: string | null;
  platform?: unknown;
  userAgent?: string | null;
}): Promise<string> {
  const sessionId = newSessionId();
  const platform = normalizePlatform(opts.platform);
  const deviceId = typeof opts.deviceId === 'string' && opts.deviceId.trim() ? opts.deviceId.trim().slice(0, 64) : null;
  const userAgent = typeof opts.userAgent === 'string' && opts.userAgent ? opts.userAgent.slice(0, 240) : null;

  await pool.query(
    `INSERT INTO user_sessions (user_id, tenant_id, session_id, device_id, platform, user_agent, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (user_id, tenant_id) DO UPDATE SET
       session_id = EXCLUDED.session_id,
       device_id = EXCLUDED.device_id,
       platform = EXCLUDED.platform,
       user_agent = EXCLUDED.user_agent,
       created_at = NOW(),
       last_seen_at = NOW()`,
    [opts.userId, opts.tenantId, sessionId, deviceId, platform, userAgent],
  );
  invalidateAuthCache(opts.userId, opts.tenantId);
  return sessionId;
}

export async function clearUserSession(userId: string, tenantId: string, sessionId?: string): Promise<void> {
  if (sessionId) {
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2 AND session_id = $3`, [
      userId,
      tenantId,
      sessionId,
    ]);
  } else {
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [userId, tenantId]);
  }
  invalidateAuthCache(userId, tenantId);
}

export async function touchUserSession(userId: string, tenantId: string, sessionId: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE user_sessions SET last_seen_at = NOW()
     WHERE user_id = $1 AND tenant_id = $2 AND session_id = $3`,
    [userId, tenantId, sessionId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Super-admin single-device session (no tenant). */
export async function replaceSuperAdminSession(opts: {
  userId: string;
  deviceId?: string | null;
  platform?: unknown;
  userAgent?: string | null;
}): Promise<string> {
  const sessionId = newSessionId();
  const platform = normalizePlatform(opts.platform);
  const deviceId = typeof opts.deviceId === 'string' && opts.deviceId.trim() ? opts.deviceId.trim().slice(0, 64) : null;
  const userAgent = typeof opts.userAgent === 'string' && opts.userAgent ? opts.userAgent.slice(0, 240) : null;

  await pool.query(
    `INSERT INTO super_admin_sessions (user_id, session_id, device_id, platform, user_agent, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       session_id = EXCLUDED.session_id,
       device_id = EXCLUDED.device_id,
       platform = EXCLUDED.platform,
       user_agent = EXCLUDED.user_agent,
       created_at = NOW(),
       last_seen_at = NOW()`,
    [opts.userId, sessionId, deviceId, platform, userAgent],
  );
  return sessionId;
}

export async function clearSuperAdminSession(userId: string, sessionId?: string): Promise<void> {
  if (sessionId) {
    await pool.query(`DELETE FROM super_admin_sessions WHERE user_id = $1 AND session_id = $2`, [userId, sessionId]);
  } else {
    await pool.query(`DELETE FROM super_admin_sessions WHERE user_id = $1`, [userId]);
  }
}

export async function getSuperAdminSessionId(userId: string): Promise<string | null> {
  const r = await pool.query(`SELECT session_id FROM super_admin_sessions WHERE user_id = $1`, [userId]);
  return (r.rows[0]?.session_id as string | undefined) ?? null;
}

export const SESSION_REPLACED_ERROR = 'Your account was signed in on another device. Please log in again.';

export const SESSION_REPLACED_BODY = {
  error: SESSION_REPLACED_ERROR,
  code: 'SESSION_REPLACED' as const,
};
