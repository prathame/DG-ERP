/**
 * E-Invoice & E-Way Bill tenant toggle tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-EINV-001';
const U = 'U-EINV-ADM';
const U2 = 'U-EINV-STF';

const token = createTestToken({ userId: U, tenantId: T, email: 'admin@einv.test', role: 'Admin', name: 'Admin' });
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'EInv Corp','einv-corp','admin@einv.test','Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@einv.test',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'staff@einv.test',$3,'Staff','Staff') ON CONFLICT DO NOTHING`,
    [U2, T, hash],
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM bill_settings WHERE tenant_id = $1', [T]);
  await cleanupTestData(T);
});

describe('GET /api/gst/settings', () => {
  it('returns einvoiceEnabled=false and portal mode by default', async () => {
    const r = await api().get('/api/gst/settings').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.einvoiceEnabled).toBe(false);
    expect(r.body.einvoiceMode).toBe('portal');
  });
});

describe('PUT /api/gst/settings — E-Invoice toggle', () => {
  it('enables E-Invoice with portal (manual) mode', async () => {
    const r = await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'portal' });
    expect(r.status).toBe(200);
    const get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceEnabled).toBe(true);
    expect(get.body.einvoiceMode).toBe('portal');
  });

  it('switches to api (automatic) mode', async () => {
    const r = await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'api' });
    expect(r.status).toBe(200);
    const get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceMode).toBe('api');
  });

  it('maps legacy manual/auto saves to api mode', async () => {
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'manual' });
    let get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceMode).toBe('api');
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceMode: 'auto' });
    get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceMode).toBe('api');
  });

  it('disables E-Invoice', async () => {
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: false });
    const get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceEnabled).toBe(false);
  });
});

describe('DB state — einvoice columns on tenants table', () => {
  it('stores portal mode in tenants table', async () => {
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'portal' });
    const row = (await pool.query('SELECT einvoice_enabled, einvoice_mode FROM tenants WHERE id = $1', [T]))
      .rows[0] as { einvoice_enabled: boolean; einvoice_mode: string };
    expect(row.einvoice_enabled).toBe(true);
    expect(row.einvoice_mode).toBe('portal');
  });
});
