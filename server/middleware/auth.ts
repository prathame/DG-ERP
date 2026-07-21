import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../pg-db';
import { logAuthEvent } from '../utils/http-error';
import { logger } from '../utils/logger';
import { getSuperAdminSessionId, SESSION_REPLACED_BODY } from '../utils/userSessions';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.fatal('JWT_SECRET environment variable is required');
  process.exit(1);
}

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
  vendorId?: string | null;
  permissions?: Record<string, string>;
  /** Single-device session id — must match user_sessions / super_admin_sessions */
  sessionId?: string;
  /** Present on short-lived super-admin impersonation tokens */
  impersonatedBy?: string;
  iat?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
  tenantId?: string;
}

export function generateToken(payload: object, expiresIn: string | number = '24h'): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn, algorithm: 'HS256' } as jwt.SignOptions);
}

export const generateSuperAdminToken = generateToken;

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // H1: global auth in index.ts already attached live role/vendorId — do not clobber with JWT claims
  if (req.user?.userId && req.tenantId) {
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;

    if (decoded.userId && decoded.tenantId) {
      // Await live role so demotions apply before the handler runs
      try {
        const r = await pool.query('SELECT role, vendor_id FROM users WHERE id=$1 AND tenant_id=$2', [
          decoded.userId,
          decoded.tenantId,
        ]);
        const row = r.rows[0] as { role: string; vendor_id: string | null } | undefined;
        if (row) {
          decoded.role = row.role;
          decoded.vendorId = row.vendor_id ?? undefined;
        }
      } catch (dbErr) {
        logger.warn('Live role fetch failed — keeping JWT claims', {
          userId: decoded.userId,
          tenantId: decoded.tenantId,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    }
    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    const reason =
      name === 'TokenExpiredError' ? 'expired_token' : name === 'JsonWebTokenError' ? 'invalid_token' : 'auth_failed';
    logAuthEvent('JWT authentication failed', req, { reason, errorName: name }, 'warn');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// P1 fix: synchronous password-changed check — use this on sensitive routes
export async function authMiddlewareStrict(req: AuthRequest, res: Response, next: NextFunction) {
  // Prefer live identity already attached by global auth
  if (req.user?.userId && req.tenantId) {
    if (req.user.iat) {
      const row = await pool.query(
        'SELECT password_changed_at, role, vendor_id FROM users WHERE id=$1 AND tenant_id=$2',
        [req.user.userId, req.tenantId],
      );
      const changedAt = row.rows[0]?.password_changed_at as Date | null;
      if (changedAt && req.user.iat && changedAt.getTime() / 1000 > req.user.iat) {
        return res.status(401).json({ error: 'Session expired after password change. Please log in again.' });
      }
      if (row.rows[0]) {
        req.user.role = row.rows[0].role as string;
        req.user.vendorId = (row.rows[0].vendor_id as string | null) ?? undefined;
      }
    }
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;

    if (decoded.userId && decoded.tenantId) {
      const row = await pool.query(
        'SELECT password_changed_at, role, vendor_id FROM users WHERE id=$1 AND tenant_id=$2',
        [decoded.userId, decoded.tenantId],
      );
      const changedAt = row.rows[0]?.password_changed_at as Date | null;
      if (changedAt && decoded.iat && changedAt.getTime() / 1000 > decoded.iat) {
        return res.status(401).json({ error: 'Session expired after password change. Please log in again.' });
      }
      if (row.rows[0]) {
        decoded.role = row.rows[0].role as string;
        decoded.vendorId = (row.rows[0].vendor_id as string | null) ?? undefined;
      }
    }

    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    const reason =
      name === 'TokenExpiredError' ? 'expired_token' : name === 'JsonWebTokenError' ? 'invalid_token' : 'auth_failed';
    logAuthEvent('JWT strict authentication failed', req, { reason, errorName: name }, 'warn');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// P0 fix: role-based access control middleware
// Usage: router.delete('/api/products/all', authMiddleware, requireRole(['Admin']), handler)
export function requireRole(allowed: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      logAuthEvent(
        'Permission denied',
        req,
        {
          reason: 'role_not_allowed',
          requiredRoles: allowed,
          role: role ?? 'unknown',
          path: req.path,
        },
        'warn',
      );
      return res.status(403).json({
        error: `Access denied. Required role: ${allowed.join(' or ')}. Your role: ${role ?? 'unknown'}.`,
      });
    }
    next();
  };
}

// Convenience: Admin-only middleware (most common case)
export const requireAdmin = requireRole(['Admin', 'Super Admin']);

// Vendor read-only — Vendors can only GET, not mutate
export function blockVendors(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role === 'Vendor') {
    return res.status(403).json({ error: 'Vendors cannot perform this action.' });
  }
  next();
}

/** JWT vendor id when role is Vendor; otherwise null (no forced scope). */
export function vendorScopeId(req: AuthRequest): string | null {
  if (req.user?.role !== 'Vendor') return null;
  return req.user.vendorId ?? null;
}

/** Error if current user is a Vendor with no linked vendor profile; else null. */
export function assertVendorLinked(req: AuthRequest): string | null {
  if (req.user?.role !== 'Vendor') return null;
  if (!req.user.vendorId) return 'Vendor account is not linked to a vendor profile.';
  return null;
}

/** Reject if Vendor JWT tries to access another vendor's resource (or is unlinked). */
export function assertVendorAccess(req: AuthRequest, vendorId: string): string | null {
  if (req.user?.role !== 'Vendor') return null;
  if (!req.user.vendorId) return 'Vendor account is not linked to a vendor profile.';
  if (req.user.vendorId !== vendorId) return 'Access denied for this vendor.';
  return null;
}

export async function superAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Global auth may already have attached a verified SA user
  if (
    req.user?.userId &&
    (req.user.role === 'super_admin' || req.user.role === 'owner' || req.user.role === 'support')
  ) {
    if (!(req.user as JwtPayload).impersonatedBy) {
      const active = await getSuperAdminSessionId(req.user.userId);
      if (req.user.sessionId ? req.user.sessionId !== active : !!active) {
        return res.status(401).json(SESSION_REPLACED_BODY);
      }
    }
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as {
      userId: string;
      email: string;
      name: string;
      role: string;
      sessionId?: string;
    };
    if (decoded.role !== 'super_admin' && decoded.role !== 'owner' && decoded.role !== 'support') {
      logAuthEvent('Permission denied', req, { reason: 'super_admin_required', role: decoded.role }, 'warn');
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const active = await getSuperAdminSessionId(decoded.userId);
    if (decoded.sessionId ? decoded.sessionId !== active : !!active) {
      return res.status(401).json(SESSION_REPLACED_BODY);
    }
    req.user = decoded as JwtPayload;
    next();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    const reason =
      name === 'TokenExpiredError' ? 'expired_token' : name === 'JsonWebTokenError' ? 'invalid_token' : 'auth_failed';
    logAuthEvent('Super-admin JWT authentication failed', req, { reason, errorName: name }, 'warn');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
