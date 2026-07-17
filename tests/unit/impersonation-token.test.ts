import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

describe('impersonation token TTL', () => {
  beforeAll(() => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-for-unit';
  });

  it('signs short-lived tokens with impersonatedBy claim', async () => {
    // Dynamic import after env is set (auth module reads JWT_SECRET at load)
    const { generateToken } = await import('../../server/middleware/auth');
    const token = generateToken(
      {
        userId: 'U1',
        email: 'a@b.com',
        name: 'Admin',
        role: 'Admin',
        tenantId: 'T1',
        impersonatedBy: 'SA1',
      },
      '15m',
    );
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    expect(decoded.impersonatedBy).toBe('SA1');
    expect(decoded.exp! - decoded.iat!).toBeLessThanOrEqual(15 * 60);
    expect(decoded.exp! - decoded.iat!).toBeGreaterThan(14 * 60);
  });
});
