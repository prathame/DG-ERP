import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-BLT';
const TENANT_B = 'T-TEST-BLT-B';
const USER = 'U-TEST-BLT';
let token = '';
let tokenB = '';
let templateId = '';

describe('HTTP: barcode label templates', () => {
  beforeAll(async () => {
    for (const t of [TENANT, TENANT_B]) {
      await cleanupTestData(t);
      await pool.query(
        `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
         VALUES ($1, 'BLT Co', $2, 'blt@test.com', 'Admin', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [t, `blt-${t.toLowerCase()}`],
      );
    }
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'blt@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-BLT-B', $1, 'blt-b@test.com', $2, 'Admin B', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TENANT_B, hash],
    );
    token = createTestToken({ userId: USER, tenantId: TENANT, email: 'blt@test.com', role: 'Admin', name: 'Admin' });
    tokenB = createTestToken({
      userId: 'U-BLT-B',
      tenantId: TENANT_B,
      email: 'blt-b@test.com',
      role: 'Admin',
      name: 'Admin B',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await cleanupTestData(TENANT_B);
  });

  const hdrs = () => authHeaders(token, TENANT);
  const hdrsB = () => authHeaders(tokenB, TENANT_B);

  it('creates a label template', async () => {
    const res = await api()
      .post('/api/barcode-label-templates')
      .set(hdrs())
      .send({ name: 'My 38x25 Label', widthMm: 38, heightMm: 25, status: 'active' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(Number(res.body.widthMm)).toBe(38);
    templateId = res.body.id;
  });

  it('lists tenant templates', async () => {
    const res = await api().get('/api/barcode-label-templates').set(hdrs());
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).some(t => t.id === templateId)).toBe(true);
  });

  it('sets default template', async () => {
    const res = await api().put(`/api/barcode-label-templates/${templateId}/default`).set(hdrs());
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
  });

  it('blocks cross-tenant access', async () => {
    const res = await api().get(`/api/barcode-label-templates/${templateId}`).set(hdrsB());
    expect(res.status).toBe(404);
  });

  it('duplicates template', async () => {
    const res = await api().post(`/api/barcode-label-templates/${templateId}/duplicate`).set(hdrs());
    expect(res.status).toBe(201);
    expect(String(res.body.name)).toContain('copy');
  });
});
