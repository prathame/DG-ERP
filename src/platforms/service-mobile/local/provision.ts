import bcrypt from 'bcryptjs';
import { localQuery } from './db';
import { SERVICE_TAB_PRESET } from './schema';
import type { ServiceMobileLicense } from '../licenseStore';

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export async function provisionLocalTenant(
  license: ServiceMobileLicense,
  adminPassword: string,
): Promise<{ tenantId: string; slug: string; adminEmail: string }> {
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('Admin password must be at least 8 characters');
  }

  const existingUsers = await localQuery(`SELECT id FROM users LIMIT 2`);
  if (existingUsers.rows.length > 1) {
    throw new Error('Service Mobile allows only one user');
  }

  const companyName = license.companyName;
  const slug = slugify(companyName) || 'service';
  const adminEmail = license.adminEmail || `admin@${slug}.local`;
  const tabConfig = license.tabConfig && Object.keys(license.tabConfig).length ? license.tabConfig : SERVICE_TAB_PRESET;

  const existing = await localQuery<{ id: string; slug: string }>(`SELECT id, slug FROM tenants WHERE slug = $1`, [
    slug,
  ]);

  let tenantId: string;
  if (existing.rows[0]) {
    tenantId = existing.rows[0].id;
    const hash = await bcrypt.hash(adminPassword, 12);
    await localQuery(`UPDATE users SET password_hash=$1 WHERE tenant_id=$2 AND role=$3`, [hash, tenantId, 'Admin']);
    await localQuery(`UPDATE tenants SET business_type='service', tab_config=$1 WHERE id=$2`, [
      JSON.stringify(tabConfig),
      tenantId,
    ]);
  } else {
    tenantId = uid('T');
    const userId = uid('U');
    const hash = await bcrypt.hash(adminPassword, 12);
    await localQuery(
      `INSERT INTO tenants (id, company_name, slug, plan_id, status, business_type, tab_config, admin_email)
       VALUES ($1,$2,$3,'LOCAL','active','service',$4,$5)`,
      [tenantId, companyName, slug, JSON.stringify(tabConfig), adminEmail],
    );
    await localQuery(
      `INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_active)
       VALUES ($1,$2,$3,'Admin',$4,'Admin',true)`,
      [userId, tenantId, adminEmail, hash],
    );
    await localQuery(`INSERT INTO bill_settings (id, tenant_id, settings) VALUES ($1,$2,'{}') ON CONFLICT DO NOTHING`, [
      uid('BS'),
      tenantId,
    ]);
  }

  await localQuery(
    `INSERT INTO sm_meta (key, value) VALUES ('provisioned','1'), ('slug',$1), ('tenant_id',$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [slug, tenantId],
  );

  return { tenantId, slug, adminEmail };
}

export async function isLocalProvisioned(): Promise<boolean> {
  const { rows } = await localQuery(`SELECT value FROM sm_meta WHERE key = 'provisioned'`);
  return rows[0]?.value === '1';
}

export async function getLocalSlug(): Promise<string | null> {
  const { rows } = await localQuery<{ value: string }>(`SELECT value FROM sm_meta WHERE key = 'slug'`);
  return rows[0]?.value ?? null;
}
