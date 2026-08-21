/**
 * WhatsApp Broadcast + Message Template API tests.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

const waMocks = {
  isConnected: vi.fn((_t?: string) => false),
  sendTextViaWeb: vi.fn().mockResolvedValue(undefined),
  sendImageViaWeb: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../server/services/whatsappWebSession', () => ({
  getSessionStatus: vi.fn(() => ({ status: 'disconnected', qrDataUrl: null, phoneNumber: null })),
  connectSession: vi.fn().mockResolvedValue(undefined),
  disconnectSession: vi.fn().mockResolvedValue(undefined),
  sendPdfViaWeb: vi.fn().mockResolvedValue(undefined),
  sendTextViaWeb: vi.fn().mockResolvedValue(undefined),
  sendImageViaWeb: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn((t: string) => waMocks.isConnected(t)),
  initWhatsAppSessionPool: vi.fn(),
  reconnectAllSavedSessions: vi.fn().mockResolvedValue(undefined),
}));

const T = 'T-WA-BCAST-001';
const U = 'U-WA-BCAST-ADM';
const U2 = 'U-WA-BCAST-STF';

const token = createTestToken({
  userId: U,
  tenantId: T,
  email: 'admin@wa-bcast.test',
  role: 'Admin',
  name: 'Broadcast Admin',
});
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Broadcast Corp','wa-bcast-corp','admin@wa-bcast.test','Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@wa-bcast.test',$3,'Broadcast Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'staff@wa-bcast.test',$3,'Staff','Staff') ON CONFLICT DO NOTHING`,
    [U2, T, hash],
  );
  await pool.query(
    `INSERT INTO customers (id, tenant_id, name, phone) VALUES ('C-BCAST-1',$1,'Test Customer','9876543210') ON CONFLICT DO NOTHING`,
    [T],
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM whatsapp_broadcasts WHERE tenant_id = $1', [T]);
  await cleanupTestData(T);
});

describe('GET /api/whatsapp/broadcast', () => {
  it('returns list', async () => {
    const r = await api().get('/api/whatsapp/broadcast').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    expect((await api().get('/api/whatsapp/broadcast')).status).toBe(401);
  });
});

describe('POST /api/whatsapp/broadcast — validation', () => {
  it('returns 400 when WhatsApp not connected', async () => {
    waMocks.isConnected.mockReturnValue(false);
    const r = await api()
      .post('/api/whatsapp/broadcast')
      .set(hdrs)
      .send({ message: 'Hi', recipientType: 'all_customers' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not connected/i);
  });

  it('returns 400 when message missing', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api().post('/api/whatsapp/broadcast').set(hdrs).send({ recipientType: 'all_customers' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/message/i);
  });

  it('returns 400 for invalid recipientType', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api().post('/api/whatsapp/broadcast').set(hdrs).send({ message: 'Hi!', recipientType: 'invalid' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/recipientType/i);
  });

  it('returns 400 when message too long', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api()
      .post('/api/whatsapp/broadcast')
      .set(hdrs)
      .send({ message: 'x'.repeat(4097), recipientType: 'all_customers' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/too long/i);
  });

  it('returns 401 without auth', async () => {
    expect((await api().post('/api/whatsapp/broadcast').send({ message: 'Hi' })).status).toBe(401);
  });
});

describe('POST /api/whatsapp/broadcast — success', () => {
  it('starts broadcast and returns broadcastId', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api().post('/api/whatsapp/broadcast').set(hdrs).send({
      message: 'Hi {customerName}, check our offer!',
      recipientType: 'all_customers',
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.broadcastId).toBeDefined();
    expect(r.body.totalRecipients).toBeGreaterThanOrEqual(1);
  });

  it('GET /:id returns broadcast status', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const startR = await api()
      .post('/api/whatsapp/broadcast')
      .set(hdrs)
      .send({ message: 'Offer!', recipientType: 'all_customers' });
    const id = startR.body.broadcastId;
    await new Promise(r => setTimeout(r, 100));
    const r = await api().get(`/api/whatsapp/broadcast/${id}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(id);
    expect(['running', 'completed']).toContain(r.body.status);
  });

  it('GET /:id returns 404 for unknown id', async () => {
    expect((await api().get('/api/whatsapp/broadcast/nonexistent-xyz').set(hdrs)).status).toBe(404);
  });
});

describe('WhatsApp invoice message template', () => {
  it('GET /api/settings/bill returns whatsappInvoiceTemplate', async () => {
    const r = await api().get('/api/settings/bill').set(hdrs);
    expect(r.status).toBe(200);
    expect('whatsappInvoiceTemplate' in r.body).toBe(true);
  });

  it('PUT /api/settings/bill saves template', async () => {
    const tpl = 'Hi {customerName}, invoice {invoiceNumber} ₹{amount}. Thanks!';
    const r = await api()
      .put('/api/settings/bill')
      .set(hdrs)
      .send({ primaryColor: '#F27D26', whatsappInvoiceTemplate: tpl });
    expect(r.status).toBe(200);
    expect(r.body.whatsappInvoiceTemplate).toBe(tpl);
  });

  it('PUT clears template when empty string passed', async () => {
    const r = await api()
      .put('/api/settings/bill')
      .set(hdrs)
      .send({ primaryColor: '#F27D26', whatsappInvoiceTemplate: '' });
    expect(r.status).toBe(200);
    expect(r.body.whatsappInvoiceTemplate).toBeNull();
  });
});

describe('Non-admin blocked', () => {
  const staffToken = createTestToken({
    userId: U2,
    tenantId: T,
    email: 'staff@wa-bcast.test',
    role: 'Staff',
    name: 'Staff',
  });
  const staffHdrs = authHeaders(staffToken, T);

  it('GET /broadcast blocked for staff', async () => {
    expect((await api().get('/api/whatsapp/broadcast').set(staffHdrs)).status).toBe(403);
  });

  it('POST /broadcast blocked for staff', async () => {
    expect((await api().post('/api/whatsapp/broadcast').set(staffHdrs).send({ message: 'Hi' })).status).toBe(403);
  });
});
