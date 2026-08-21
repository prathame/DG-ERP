/**
 * WhatsApp auto-send granular settings tests.
 * Covers wa_auto_settings JSONB field saved/returned via profile API.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

const T = 'T-WA-AUTO-001';
const U = 'U-WA-AUTO-ADM';

const token = createTestToken({ userId: U, tenantId: T, email: 'admin@wa-auto.test', role: 'Admin', name: 'Admin' });
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'WA Auto Corp','wa-auto-corp','admin@wa-auto.test','Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@wa-auto.test',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('wa_auto_settings — profile GET returns field', () => {
  it('profile includes waAutoSettings', async () => {
    const r = await api().get(`/api/settings/profile?userId=${U}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('waAutoSettings');
    expect(typeof r.body.waAutoSettings).toBe('object');
    expect(r.body.waAutoSettings).toHaveProperty('sale');
    expect(r.body.waAutoSettings).toHaveProperty('salary');
    expect(r.body.waAutoSettings).toHaveProperty('payment');
  });
});

describe('wa_auto_settings — profile PUT saves granular toggles', () => {
  it('saves sale=true, salary=false, payment=false', async () => {
    const r = await api()
      .put('/api/settings/profile')
      .set(hdrs)
      .send({ userId: U, waAutoSettings: { sale: true, salary: false, payment: false } });
    expect(r.status).toBe(200);
    expect(r.body.waAutoSettings?.sale).toBe(true);
    expect(r.body.waAutoSettings?.salary).toBe(false);
    expect(r.body.waAutoSettings?.payment).toBe(false);
  });

  it('saves all three enabled', async () => {
    const r = await api()
      .put('/api/settings/profile')
      .set(hdrs)
      .send({ userId: U, waAutoSettings: { sale: true, salary: true, payment: true } });
    expect(r.status).toBe(200);
    expect(r.body.waAutoSettings?.sale).toBe(true);
    expect(r.body.waAutoSettings?.salary).toBe(true);
    expect(r.body.waAutoSettings?.payment).toBe(true);
  });

  it('saves all three disabled', async () => {
    const r = await api()
      .put('/api/settings/profile')
      .set(hdrs)
      .send({ userId: U, waAutoSettings: { sale: false, salary: false, payment: false } });
    expect(r.status).toBe(200);
    expect(r.body.waAutoSettings?.sale).toBe(false);
    expect(r.body.waAutoSettings?.salary).toBe(false);
    expect(r.body.waAutoSettings?.payment).toBe(false);
  });

  it('persists to DB — next GET reflects saved value', async () => {
    await api()
      .put('/api/settings/profile')
      .set(hdrs)
      .send({ userId: U, waAutoSettings: { sale: true, salary: true, payment: false } });
    const r = await api().get(`/api/settings/profile?userId=${U}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.waAutoSettings?.sale).toBe(true);
    expect(r.body.waAutoSettings?.salary).toBe(true);
    expect(r.body.waAutoSettings?.payment).toBe(false);
  });

  it('legacy autoWhatsapp still works alongside waAutoSettings', async () => {
    const r = await api()
      .put('/api/settings/profile')
      .set(hdrs)
      .send({ userId: U, autoWhatsapp: true, waAutoSettings: { sale: true, salary: false, payment: false } });
    expect(r.status).toBe(200);
    expect(r.body.autoWhatsapp).toBe(true);
    expect(r.body.waAutoSettings?.sale).toBe(true);
  });
});
