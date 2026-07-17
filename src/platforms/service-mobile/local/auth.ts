import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { localQuery } from './db';

const encoder = new TextEncoder();

async function jwtSecret(): Promise<Uint8Array> {
  const { rows } = await localQuery<{ value: string }>(`SELECT value FROM sm_meta WHERE key = 'jwt_secret'`);
  if (rows[0]?.value) return encoder.encode(rows[0].value);
  const secret = crypto.randomUUID() + crypto.randomUUID();
  await localQuery(`INSERT INTO sm_meta (key, value) VALUES ('jwt_secret', $1) ON CONFLICT (key) DO NOTHING`, [secret]);
  return encoder.encode(secret);
}

export type LocalJwtPayload = {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  businessType: string;
};

export async function localLogin(
  email: string,
  password: string,
): Promise<{ token: string; user: LocalJwtPayload; companyName: string; tabConfig: unknown } | null> {
  const { rows } = await localQuery<{
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: string;
    password_hash: string;
    company_name: string;
    business_type: string;
    tab_config: unknown;
  }>(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.password_hash,
            t.company_name, t.business_type, t.tab_config
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE lower(u.email) = lower($1) AND u.is_active = true
     LIMIT 1`,
    [email],
  );
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  // Enforce single user
  const count = await localQuery(`SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1`, [user.tenant_id]);
  if (Number((count.rows[0] as { c: number }).c) > 1) {
    throw new Error('Service Mobile allows only one user on this device');
  }

  const payload: LocalJwtPayload = {
    userId: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    name: user.name,
    role: user.role,
    businessType: user.business_type || 'service',
  };
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(await jwtSecret());

  return {
    token,
    user: payload,
    companyName: user.company_name,
    tabConfig: user.tab_config,
  };
}

export async function verifyLocalToken(token: string): Promise<LocalJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await jwtSecret());
    if (!payload.userId || !payload.tenantId) return null;
    return {
      userId: String(payload.userId),
      tenantId: String(payload.tenantId),
      email: String(payload.email || ''),
      name: String(payload.name || ''),
      role: String(payload.role || 'Admin'),
      businessType: String(payload.businessType || 'service'),
    };
  } catch {
    return null;
  }
}
