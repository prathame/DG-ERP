/**
 * Bill settings — WhatsApp invoice template field.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

const T = 'T-BILL-WA-TPL';
const U = 'U-BILL-WA-ADM';
const token = createTestToken({
  userId: U,
  tenantId: T,
  email: 'admin@bill-wa.test',
  role: 'Admin',
  name: 'Bill WA Admin',
});
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  const hash = bcrypt.hashSync('Test1234!', 4);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Bill WA Corp','bill-wa-corp','admin@bill-wa.test','Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@bill-wa.test',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('GET/PUT /api/settings/bill — whatsappInvoiceTemplate', () => {
  it('returns null template by default', async () => {
    const r = await api().get('/api/settings/bill').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.whatsappInvoiceTemplate).toBeNull();
  });

  it('saves and reads WhatsApp invoice template', async () => {
    const template = 'Dear {customerName}, invoice {invoiceNo} for ₹{amount} is attached.';
    const put = await api().put('/api/settings/bill').set(hdrs).send({ whatsappInvoiceTemplate: template });
    expect(put.status).toBe(200);
    expect(put.body.whatsappInvoiceTemplate).toBe(template);

    const get = await api().get('/api/settings/bill').set(hdrs);
    expect(get.status).toBe(200);
    expect(get.body.whatsappInvoiceTemplate).toBe(template);
  });

  it('clears template when set to empty string', async () => {
    const put = await api().put('/api/settings/bill').set(hdrs).send({ whatsappInvoiceTemplate: '' });
    expect(put.status).toBe(200);
    expect(put.body.whatsappInvoiceTemplate).toBeNull();
  });
});
