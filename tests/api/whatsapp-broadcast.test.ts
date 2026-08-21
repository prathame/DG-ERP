/**
 * WhatsApp broadcast API tests — HTTP layer only; Baileys is mocked.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

const waMocks = vi.hoisted(() => ({
  isConnected: vi.fn(() => false),
  sendTextViaWeb: vi.fn().mockResolvedValue(undefined),
  sendImageViaWeb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/services/whatsappWebSession', () => ({
  getSessionStatus: vi.fn(() => ({ status: 'disconnected', qrDataUrl: null, phoneNumber: null })),
  connectSession: vi.fn().mockResolvedValue(undefined),
  disconnectSession: vi.fn().mockResolvedValue(undefined),
  sendPdfViaWeb: vi.fn().mockResolvedValue(undefined),
  sendTextViaWeb: (...args: unknown[]) => waMocks.sendTextViaWeb(...args),
  sendImageViaWeb: (...args: unknown[]) => waMocks.sendImageViaWeb(...args),
  isConnected: (...args: unknown[]) => waMocks.isConnected(...args),
  initWhatsAppSessionPool: vi.fn(),
  reconnectAllSavedSessions: vi.fn().mockResolvedValue(undefined),
}));

const T = 'T-WA-BCAST-001';
const U = 'U-WA-BCAST-ADM';
const U2 = 'U-WA-BCAST-STF';
const C1 = 'C-WA-BCAST-1';
const token = createTestToken({
  userId: U,
  tenantId: T,
  email: 'admin@wa-bcast.test',
  role: 'Admin',
  name: 'BC Admin',
});
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'WA Broadcast Corp','wa-bcast-corp','admin@wa-bcast.test','BC Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@wa-bcast.test',$3,'BC Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'staff@wa-bcast.test',$3,'BC Staff','Staff') ON CONFLICT DO NOTHING`,
    [U2, T, hash],
  );
  await pool.query(
    `INSERT INTO customers (id, tenant_id, name, phone)
     VALUES ($1,$2,'Ramesh Patel','9876543210') ON CONFLICT DO NOTHING`,
    [C1, T],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

beforeEach(() => {
  waMocks.isConnected.mockReset();
  waMocks.isConnected.mockReturnValue(false);
  waMocks.sendTextViaWeb.mockClear();
  waMocks.sendImageViaWeb.mockClear();
});

describe('GET /api/whatsapp/broadcast', () => {
  it('returns empty list for tenant with no broadcasts', async () => {
    const r = await api().get('/api/whatsapp/broadcast').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const r = await api().get('/api/whatsapp/broadcast');
    expect(r.status).toBe(401);
  });
});

describe('GET /api/whatsapp/broadcast/:id', () => {
  it('returns 404 for unknown broadcast', async () => {
    const r = await api().get('/api/whatsapp/broadcast/WB-missing').set(hdrs);
    expect(r.status).toBe(404);
  });
});

describe('POST /api/whatsapp/broadcast', () => {
  it('returns 400 when WhatsApp is not connected', async () => {
    const r = await api().post('/api/whatsapp/broadcast').set(hdrs).send({ message: 'Hello {customerName}' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not connected/i);
  });

  it('returns 400 when message missing', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api().post('/api/whatsapp/broadcast').set(hdrs).send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/message is required/i);
  });

  it('returns 400 when message too long', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api()
      .post('/api/whatsapp/broadcast')
      .set(hdrs)
      .send({ message: 'x'.repeat(4097) });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/too long/i);
  });

  it('returns 400 for invalid recipientType', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api().post('/api/whatsapp/broadcast').set(hdrs).send({ message: 'Hi', recipientType: 'everyone' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/recipientType/i);
  });

  it('returns 400 when no recipients have phone numbers', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api()
      .post('/api/whatsapp/broadcast')
      .set(hdrs)
      .send({ message: 'Hi', recipientType: 'selected_customers', recipientIds: ['C-NO-PHONE'] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/No recipients/i);
  });

  it('starts broadcast when connected and customers exist', async () => {
    waMocks.isConnected.mockReturnValue(true);
    const r = await api()
      .post('/api/whatsapp/broadcast')
      .set(hdrs)
      .send({ message: 'Hello {customerName}, offer ends today.' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.broadcastId).toMatch(/^WB\d+-/);
    expect(r.body.totalRecipients).toBeGreaterThan(0);

    const poll = await api().get(`/api/whatsapp/broadcast/${r.body.broadcastId}`).set(hdrs);
    expect(poll.status).toBe(200);
    expect(poll.body.id).toBe(r.body.broadcastId);
    expect(poll.body.message).toContain('Hello');
    expect(poll.body.status).toMatch(/running|completed|pending/);
  });

  it('returns 401 without auth', async () => {
    const r = await api().post('/api/whatsapp/broadcast').send({ message: 'Hi' });
    expect(r.status).toBe(401);
  });
});

describe('WhatsApp broadcast — non-admin access blocked', () => {
  const staffToken = createTestToken({
    userId: U2,
    tenantId: T,
    email: 'staff@wa-bcast.test',
    role: 'Staff',
    name: 'BC Staff',
  });
  const staffHdrs = authHeaders(staffToken, T);

  it('GET /broadcast blocked for non-admin', async () => {
    const r = await api().get('/api/whatsapp/broadcast').set(staffHdrs);
    expect(r.status).toBe(403);
  });

  it('POST /broadcast blocked for non-admin', async () => {
    const r = await api().post('/api/whatsapp/broadcast').set(staffHdrs).send({ message: 'Hi' });
    expect(r.status).toBe(403);
  });
});
