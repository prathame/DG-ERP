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
    // Track last active — fire-and-forget, never blocks the request
    if (decoded.userId && decoded.tenantId) {
      pool.query('UPDATE users SET last_active_at=NOW() WHERE id=$1 AND tenant_id=$2', [decoded.userId, decoded.tenantId]).catch(() => {});
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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
