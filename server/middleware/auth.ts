import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dg-erp-default-secret';

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

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' } as jwt.SignOptions);
}

export function generateSuperAdminToken(payload: { userId: string; email: string; name: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' } as jwt.SignOptions);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function superAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; name: string; role: string };
    if (decoded.role !== 'super_admin' && decoded.role !== 'owner' && decoded.role !== 'support') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    req.user = decoded as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
