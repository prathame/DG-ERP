import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { api, authHeaders } from '../http';
import { pool, createTestToken, cleanupTestData } from '../helpers';

const MFG_TENANT = 'T-TEST-REM-MFG';
const SVC_TENANT = 'T-TEST-REM-SVC';
const MFG_EMAIL = 'rem-mfg@test.com';
const SVC_EMAIL = 'rem-svc@test.com';

describe('HTTP Payment Reminder Settings', () => {
  beforeAll(async () => {
    await cleanupTestData(MFG_TENANT);
    await cleanupTestData(SVC_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Rem Mfg', 'rem-mfg', $2, 'Admin', 'active', 'manufacturer')
       ON CONFLICT (id) DO UPDATE SET business_type = 'manufacturer'`,
      [MFG_TENANT, MFG_EMAIL],
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Rem Svc', 'rem-svc', $2, 'Admin', 'active', 'service')
       ON CONFLICT (id) DO UPDATE SET business_type = 'service'`,
      [SVC_TENANT, SVC_EMAIL],
    );
    const hash = await bcrypt.hash('TestPass123!', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-REM-MFG', $1, $2, $3, 'Mfg Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [MFG_TENANT, MFG_EMAIL, hash],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-REM-SVC', $1, $2, $3, 'Svc Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [SVC_TENANT, SVC_EMAIL, hash],
    );
  });

  afterAll(async () => {
    await cleanupTestData(MFG_TENANT);
    await cleanupTestData(SVC_TENANT);
  });

  it('GET/PUT /api/settings/reminders for manufacturer', async () => {
    const token = createTestToken({
      userId: 'U-REM-MFG',
      tenantId: MFG_TENANT,
      email: MFG_EMAIL,
      role: 'Admin',
      name: 'Mfg Admin',
    });
    const get1 = await api().get('/api/settings/reminders').set(authHeaders(token, MFG_TENANT));
    expect(get1.status).toBe(200);
    expect(get1.body.enabled).toBe(true);
    expect(get1.body.cadenceDays).toBe(15);
    expect(Number(get1.body.minDueAmount)).toBe(1000);

    const put = await api()
      .put('/api/settings/reminders')
      .set(authHeaders(token, MFG_TENANT))
      .send({ enabled: true, cadenceDays: 7, minDueAmount: 2500 });
    expect(put.status).toBe(200);
    expect(put.body.cadenceDays).toBe(7);
    expect(Number(put.body.minDueAmount)).toBe(2500);

    const get2 = await api().get('/api/settings/reminders').set(authHeaders(token, MFG_TENANT));
    expect(get2.body.cadenceDays).toBe(7);
    expect(Number(get2.body.minDueAmount)).toBe(2500);
  });

  it('rejects reminder settings for service business type', async () => {
    const token = createTestToken({
      userId: 'U-REM-SVC',
      tenantId: SVC_TENANT,
      email: SVC_EMAIL,
      role: 'Admin',
      name: 'Svc Admin',
    });
    const get = await api().get('/api/settings/reminders').set(authHeaders(token, SVC_TENANT));
    expect(get.status).toBe(403);
    const put = await api()
      .put('/api/settings/reminders')
      .set(authHeaders(token, SVC_TENANT))
      .send({ enabled: true, cadenceDays: 7, minDueAmount: 0 });
    expect(put.status).toBe(403);
  });

  it('POST reminder-sent upserts last_reminder_date', async () => {
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, phone)
       VALUES ('V-REM-1', $1, 'Rem Vendor', '9876543210')
       ON CONFLICT DO NOTHING`,
      [MFG_TENANT],
    );
    const token = createTestToken({
      userId: 'U-REM-MFG',
      tenantId: MFG_TENANT,
      email: MFG_EMAIL,
      role: 'Admin',
      name: 'Mfg Admin',
    });
    const res = await api().post('/api/vendor-finance/V-REM-1/reminder-sent').set(authHeaders(token, MFG_TENANT));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = (
      await pool.query(
        `SELECT last_reminder_date::text as d FROM vendor_reminder_settings
         WHERE vendor_id = 'V-REM-1' AND tenant_id = $1`,
        [MFG_TENANT],
      )
    ).rows[0];
    expect(row?.d).toBeTruthy();
  });
});
