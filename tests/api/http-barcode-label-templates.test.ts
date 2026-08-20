import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-BLT';
const TENANT_B = 'T-TEST-BLT-B';
const USER = 'U-TEST-BLT';
const VENDOR_USER = 'U-TEST-BLT-V';
let token = '';
let tokenB = '';
let vendorToken = '';
let templateId = '';
let duplicateId = '';

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
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'vendor@test.com', $3, 'Vendor User', 'Vendor')
       ON CONFLICT DO NOTHING`,
      [VENDOR_USER, TENANT, hash],
    );
    token = createTestToken({ userId: USER, tenantId: TENANT, email: 'blt@test.com', role: 'Admin', name: 'Admin' });
    tokenB = createTestToken({
      userId: 'U-BLT-B',
      tenantId: TENANT_B,
      email: 'blt-b@test.com',
      role: 'Admin',
      name: 'Admin B',
    });
    vendorToken = createTestToken({
      userId: VENDOR_USER,
      tenantId: TENANT,
      email: 'vendor@test.com',
      role: 'Vendor',
      name: 'Vendor User',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await cleanupTestData(TENANT_B);
  });

  const hdrs = () => authHeaders(token, TENANT);
  const hdrsB = () => authHeaders(tokenB, TENANT_B);
  const vendorHdrs = () => authHeaders(vendorToken, TENANT);

  it('requires authentication', async () => {
    const res = await api().get('/api/barcode-label-templates');
    expect(res.status).toBe(401);
  });

  it('rejects create without name', async () => {
    const res = await api().post('/api/barcode-label-templates').set(hdrs()).send({ widthMm: 38, heightMm: 25 });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/name/i);
  });

  it('rejects invalid dimensions', async () => {
    const res = await api()
      .post('/api/barcode-label-templates')
      .set(hdrs())
      .send({ name: 'Bad size', widthMm: 0, heightMm: 25 });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/Width/i);
  });

  it('creates a label template', async () => {
    const res = await api()
      .post('/api/barcode-label-templates')
      .set(hdrs())
      .send({ name: 'My 38x25 Label', widthMm: 38, heightMm: 25, status: 'active' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(Number(res.body.widthMm)).toBe(38);
    expect(Array.isArray(res.body.elements)).toBe(true);
    expect(res.body.elements.length).toBeGreaterThan(0);
    templateId = res.body.id;
  });

  it('gets template by id', async () => {
    const res = await api().get(`/api/barcode-label-templates/${templateId}`).set(hdrs());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(templateId);
    expect(res.body.name).toBe('My 38x25 Label');
  });

  it('lists tenant templates', async () => {
    const res = await api().get('/api/barcode-label-templates').set(hdrs());
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).some(t => t.id === templateId)).toBe(true);
  });

  it('updates template and increments version', async () => {
    const res = await api()
      .put(`/api/barcode-label-templates/${templateId}`)
      .set(hdrs())
      .send({ name: 'My 38x25 Label v2', widthMm: 50, heightMm: 25 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('My 38x25 Label v2');
    expect(Number(res.body.widthMm)).toBe(50);
    expect(Number(res.body.version)).toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid custom barcode on update', async () => {
    const res = await api()
      .put(`/api/barcode-label-templates/${templateId}`)
      .set(hdrs())
      .send({
        elements: [
          {
            id: 'bad-barcode',
            type: 'barcode',
            xMm: 1,
            yMm: 1,
            widthMm: 30,
            heightMm: 10,
            rotation: 0,
            zIndex: 0,
            visible: true,
            properties: { barcodeType: 'EAN13', barcodeValueSource: 'custom', customBarcodeValue: '123' },
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/13 digits/i);
  });

  it('sets default template', async () => {
    const res = await api().put(`/api/barcode-label-templates/${templateId}/default`).set(hdrs());
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.status).toBe('active');
  });

  it('gets default template', async () => {
    const res = await api().get('/api/barcode-label-templates/default').set(hdrs());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(templateId);
    expect(res.body.isDefault).toBe(true);
  });

  it('blocks cross-tenant read', async () => {
    const res = await api().get(`/api/barcode-label-templates/${templateId}`).set(hdrsB());
    expect(res.status).toBe(404);
  });

  it('blocks cross-tenant update', async () => {
    const res = await api().put(`/api/barcode-label-templates/${templateId}`).set(hdrsB()).send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it('blocks vendor mutations', async () => {
    const res = await api()
      .post('/api/barcode-label-templates')
      .set(vendorHdrs())
      .send({ name: 'Vendor template', widthMm: 38, heightMm: 25 });
    expect(res.status).toBe(403);
  });

  it('duplicates template', async () => {
    const res = await api().post(`/api/barcode-label-templates/${templateId}/duplicate`).set(hdrs());
    expect(res.status).toBe(201);
    expect(String(res.body.name)).toContain('copy');
    expect(res.body.isDefault).toBe(false);
    duplicateId = res.body.id;
  });

  it('archives template', async () => {
    const res = await api().delete(`/api/barcode-label-templates/${duplicateId}`).set(hdrs());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('excludes archived templates from default list', async () => {
    const res = await api().get('/api/barcode-label-templates').set(hdrs());
    expect(res.status).toBe(200);
    expect((res.body as { id: string; status: string }[]).some(t => t.id === duplicateId)).toBe(false);
  });

  it('includes archived templates when requested', async () => {
    const res = await api().get('/api/barcode-label-templates?includeArchived=true').set(hdrs());
    expect(res.status).toBe(200);
    expect(
      (res.body as { id: string; status: string }[]).some(t => t.id === duplicateId && t.status === 'archived'),
    ).toBe(true);
  });
});
