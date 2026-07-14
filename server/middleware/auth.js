import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
}
export function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });
}
export function generateSuperAdminToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });
}
export function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token)
        return res.status(401).json({ error: 'Authentication required' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.user = decoded;
        req.tenantId = decoded.tenantId;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}
export function superAdminMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token)
        return res.status(401).json({ error: 'Authentication required' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.role !== 'super_admin' && decoded.role !== 'owner' && decoded.role !== 'support') {
            return res.status(403).json({ error: 'Super admin access required' });
        }
        req.user = decoded;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}
