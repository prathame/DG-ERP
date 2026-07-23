/**
 * WhatsApp Business — SA tenant save (masked tokens) + send eligibility.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, createSuperAdminToken, createTestToken, cleanupTestData } from '../helpers';
import { api } from '../http';

const TENANT = 'T-WA-BIZ01';
const USER_A = 'U-WA-A';
const USER_B = 'U-WA-B';

describe('HTTP: WhatsApp Business API', () => {
  const saToken = () => createSuperAdminToken();
  const tokenA = () =>
    createTestToken({
      userId: USER_A,
      tenantId: TENANT,
      email: 'a@wa.test',
      role: 'Admin',
      name: 'Alice',
    });
  const tokenB = () =>
    createTestToken({
      userId: USER_B,
      tenantId: TENANT,
      email: 'b@wa.test',
      role: 'Admin',
      name: 'Bob',
    });

  beforeAll(async () => {
    await cleanupTestData(TENANT);
    const hash = bcrypt.hashSync('password12', 4);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, status, business_type, admin_email, admin_name)
       VALUES ($1, 'WA Biz Co', 'wa-biz', 'active', 'service', 'a@wa.test', 'Alice')
       ON CONFLICT (id) DO UPDATE SET status='active'`,
      [TENANT],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'a@wa.test',$3,'Alice','Admin')
       ON CONFLICT (id, tenant_id) DO NOTHING`,
      [USER_A, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'b@wa.test',$3,'Bob','Admin')
       ON CONFLICT (id, tenant_id) DO NOTHING`,
      [USER_B, TENANT, hash],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('SA saves WhatsApp Business settings without echoing raw token', async () => {
    const put = await api()
      .put(`/api/super-admin/tenants/${TENANT}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({
        whatsappBusinessEnabled: true,
        whatsappSendMode: 'company_selected',
        whatsappPhoneNumberId: '1234567890',
        whatsappAccessToken: 'secret-token-never-echo',
        whatsappDisplayPhone: '+919876543210',
      });
    expect(put.status).toBe(200);
    expect(put.body.whatsappBusinessEnabled).toBe(true);
    expect(put.body.whatsappSendMode).toBe('company_selected');
    expect(put.body.whatsappPhoneNumberId).toBe('1234567890');
    expect(put.body.whatsappAccessTokenConfigured).toBe(true);
    expect(put.body.whatsappAccessToken).toBe('••••••••');
    expect(JSON.stringify(put.body)).not.toContain('secret-token-never-echo');

    const get = await api()
      .get(`/api/super-admin/tenants/${TENANT}`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(get.status).toBe(200);
    expect(get.body.tenant.whatsappBusinessEnabled).toBe(true);
    expect(get.body.tenant.whatsappAccessToken).toBe('••••••••');
    expect(JSON.stringify(get.body)).not.toContain('secret-token-never-echo');
  });

  it('SA allowlists user for company_selected; send rejects non-allowlisted', async () => {
    // Self-contained: company mode + allowlist Alice only
    const setup = await api()
      .put(`/api/super-admin/tenants/${TENANT}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({
        whatsappBusinessEnabled: true,
        whatsappSendMode: 'company_selected',
        whatsappPhoneNumberId: '1234567890',
        whatsappAccessToken: 'secret-token-for-eligibility',
      });
    expect(setup.status).toBe(200);

    const allow = await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/users/${USER_A}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ whatsappApiAllowed: true });
    expect(allow.status).toBe(200);
    const alice = (allow.body.users as { id: string; whatsappApiAllowed: boolean }[]).find(u => u.id === USER_A);
    expect(alice?.whatsappApiAllowed).toBe(true);

    await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/users/${USER_B}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ whatsappApiAllowed: false });

    const denied = await api()
      .post('/api/whatsapp/send')
      .set({ Authorization: `Bearer ${tokenB()}` })
      .send({ to: '9876543210', message: 'hello' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('WHATSAPP_API_UNAVAILABLE');

    // Allowlisted user is past eligibility — Meta may fail with fake token (not 403)
    const eligible = await api()
      .post('/api/whatsapp/send')
      .set({ Authorization: `Bearer ${tokenA()}` })
      .send({ to: '9876543210', message: 'hello from api' });
    expect(eligible.status).not.toBe(403);
    expect(eligible.body.code).not.toBe('WHATSAPP_API_UNAVAILABLE');
  });

  it('rejects invalid send mode on SA save', async () => {
    const bad = await api()
      .put(`/api/super-admin/tenants/${TENANT}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ whatsappSendMode: 'everyone' });
    expect(bad.status).toBe(400);
  });
});
