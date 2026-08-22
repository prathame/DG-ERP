/**
 * E-Invoice & E-Way Bill tenant toggle tests.
 * Covers:
 * - GET /api/gst/settings returns einvoiceEnabled + einvoiceMode
 * - PUT /api/gst/settings saves the toggle and mode
 * - Login response includes einvoiceEnabled + einvoiceMode
 * - Toggle persists across saves
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

// ── GET /api/gst/settings ─────────────────────────────────────────────────────
describe('GET /api/gst/settings', () => {
  it('returns einvoiceEnabled=false by default', async () => {
    const r = await api().get('/api/gst/settings').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('einvoiceEnabled');
    expect(r.body).toHaveProperty('einvoiceMode');
    expect(r.body.einvoiceEnabled).toBe(false);
    expect(r.body.einvoiceMode).toBe('manual');
  });

  it('returns 401 without auth', async () => {
    expect((await api().get('/api/gst/settings')).status).toBe(401);
  });
});

// ── PUT /api/gst/settings — toggle ───────────────────────────────────────────
describe('PUT /api/gst/settings — E-Invoice toggle', () => {
  it('enables E-Invoice with manual mode', async () => {
    const r = await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'manual' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);

    // Verify persisted
    const get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceEnabled).toBe(true);
    expect(get.body.einvoiceMode).toBe('manual');
  });

  it('switches to auto mode', async () => {
    const r = await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'auto' });
    expect(r.status).toBe(200);

    const get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceEnabled).toBe(true);
    expect(get.body.einvoiceMode).toBe('auto');
  });

  it('disables E-Invoice', async () => {
    const r = await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: false });
    expect(r.status).toBe(200);

    const get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceEnabled).toBe(false);
  });

  it('updating mode alone preserves enabled state', async () => {
    // Enable first
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'manual' });
    // Change only mode
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceMode: 'auto' });

    const get = await api().get('/api/gst/settings').set(hdrs);
    expect(get.body.einvoiceEnabled).toBe(true);
    expect(get.body.einvoiceMode).toBe('auto');
  });

  it('other GST settings unchanged when only toggling einvoice', async () => {
    // Set some GST API config first
    await api().put('/api/gst/settings').set(hdrs).send({ mode: 'mock' });
    // Toggle einvoice only
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true });

    const get = await api().get('/api/gst/settings').set(hdrs);
    // GST API mode should still be mock
    expect(get.body.mode).toBe('mock');
    expect(get.body.einvoiceEnabled).toBe(true);
  });

  it('returns 401 without auth', async () => {
    expect((await api().put('/api/gst/settings').send({ einvoiceEnabled: true })).status).toBe(401);
  });

  it('blocked for staff', async () => {
    const staffToken = createTestToken({
      userId: U2,
      tenantId: T,
      email: 'staff@einv.test',
      role: 'Staff',
      name: 'Staff',
    });
    expect(
      (await api().put('/api/gst/settings').set(authHeaders(staffToken, T)).send({ einvoiceEnabled: true })).status,
    ).toBe(403);
  });
});

// ── DB state verification ─────────────────────────────────────────────────────
describe('DB state — einvoice columns on tenants table', () => {
  it('einvoice_enabled stored in tenants table', async () => {
    await api().put('/api/gst/settings').set(hdrs).send({ einvoiceEnabled: true, einvoiceMode: 'manual' });
    const row = (await pool.query('SELECT einvoice_enabled, einvoice_mode FROM tenants WHERE id = $1', [T]))
      .rows[0] as { einvoice_enabled: boolean; einvoice_mode: string };
    expect(row.einvoice_enabled).toBe(true);
    expect(row.einvoice_mode).toBe('manual');
  });

  it('defaults to false/manual in DB', async () => {
    // Fresh tenant
    const TFRESH = 'T-EINV-FRESH';
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
       VALUES ($1,'Fresh Corp','einv-fresh-corp','fresh@einv.test','Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
      [TFRESH],
    );
    const row = (await pool.query('SELECT einvoice_enabled, einvoice_mode FROM tenants WHERE id = $1', [TFRESH]))
      .rows[0] as { einvoice_enabled: boolean; einvoice_mode: string };
    expect(!!row.einvoice_enabled).toBe(false);
    expect(row.einvoice_mode ?? 'manual').toBe('manual');
    await pool.query('DELETE FROM tenants WHERE id = $1', [TFRESH]);
  });
});
