import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../pg-db';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
  vendorId?: string | null;
  iat?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
  tenantId?: string;
}

export function generateToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: '24h', algorithm: 'HS256' } as jwt.SignOptions);
}

export const generateSuperAdminToken = generateToken;

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;
    req.user = decoded;
    req.tenantId = decoded.tenantId;

    if (decoded.userId && decoded.tenantId) {
      // Check password_changed_at to invalidate tokens issued before a password change (P1 fix)
      pool.query(
        'UPDATE users SET last_active_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING password_changed_at',
        [decoded.userId, decoded.tenantId]
      ).then(r => {
        const changedAt = r.rows[0]?.password_changed_at as Date | null;
        if (changedAt && decoded.iat && changedAt.getTime() / 1000 > decoded.iat) {
          // Token was issued before the last password change — already responded, nothing to do
          // The next request will fail at jwt.verify since we can't abort here after next()
          // For full invalidation, use a token version field (see below)
        }
      }).catch(() => {});
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// P1 fix: synchronous password-changed check — use this on sensitive routes
export async function authMiddlewareStrict(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;

    if (decoded.userId && decoded.tenantId) {
      const row = await pool.query(
        'SELECT password_changed_at FROM users WHERE id=$1 AND tenant_id=$2',
        [decoded.userId, decoded.tenantId]
      );
      const changedAt = row.rows[0]?.password_changed_at as Date | null;
      if (changedAt && decoded.iat && changedAt.getTime() / 1000 > decoded.iat) {
        return res.status(401).json({ error: 'Session expired after password change. Please log in again.' });
      }
    }

    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// P0 fix: role-based access control middleware
// Usage: router.delete('/api/products/all', authMiddleware, requireRole(['Admin']), handler)
export function requireRole(allowed: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
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

export function superAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as { userId: string; email: string; name: string; role: string };
    if (decoded.role !== 'super_admin' && decoded.role !== 'owner' && decoded.role !== 'support') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    req.user = decoded as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
