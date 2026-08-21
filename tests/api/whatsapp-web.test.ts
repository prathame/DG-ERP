/**
 * WhatsApp Web session API tests.
 *
 * Tests the HTTP layer only — Baileys socket is never instantiated.
 * The session manager is mocked so tests run without real WhatsApp connections.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

// ── mock the session service so no real Baileys socket is opened ──────────────
vi.mock('../../server/services/whatsappWebSession', () => ({
  getSessionStatus: vi.fn(() => ({ status: 'disconnected', qrDataUrl: null, phoneNumber: null })),
  connectSession: vi.fn().mockResolvedValue(undefined),
  disconnectSession: vi.fn().mockResolvedValue(undefined),
  sendPdfViaWeb: vi.fn().mockResolvedValue(undefined),
  sendImageViaWeb: vi.fn().mockResolvedValue(undefined),
  sendTextViaWeb: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn(() => false),
  initWhatsAppSessionPool: vi.fn(),
  reconnectAllSavedSessions: vi.fn().mockResolvedValue(undefined),
}));

const T = 'T-WA-WEB-001';
const U = 'U-WA-WEB-ADM';
const U2 = 'U-WA-WEB-STF';
const token = createTestToken({ userId: U, tenantId: T, email: 'admin@wa-web.test', role: 'Admin', name: 'WA Admin' });
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'WA Web Corp','wa-web-corp','admin@wa-web.test','WA Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@wa-web.test',$3,'WA Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'staff@wa-web.test',$3,'WA Staff','Staff') ON CONFLICT DO NOTHING`,
    [U2, T, hash],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('GET /api/whatsapp-web/status', () => {
  it('returns disconnected status for new tenant', async () => {
    const r = await api().get('/api/whatsapp-web/status').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('disconnected');
    expect(r.body.qrDataUrl).toBeNull();
    expect(r.body.phoneNumber).toBeNull();
  });

  it('returns 401 without auth', async () => {
    const r = await api().get('/api/whatsapp-web/status');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/whatsapp-web/connect', () => {
  it('returns ok and starts connection', async () => {
    const r = await api().post('/api/whatsapp-web/connect').set(hdrs).send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const r = await api().post('/api/whatsapp-web/connect').send({});
    expect(r.status).toBe(401);
  });
});

describe('DELETE /api/whatsapp-web/disconnect', () => {
  it('returns ok', async () => {
    const r = await api().delete('/api/whatsapp-web/disconnect').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const r = await api().delete('/api/whatsapp-web/disconnect');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/whatsapp-web/send-pdf', () => {
  it('returns 400 when fields missing', async () => {
    const r = await api().post('/api/whatsapp-web/send-pdf').set(hdrs).send({ phone: '9876543210' });
    expect(r.status).toBe(400);
  });

  it('returns 400 when pdfBase64 missing', async () => {
    const r = await api()
      .post('/api/whatsapp-web/send-pdf')
      .set(hdrs)
      .send({ phone: '9876543210', filename: 'inv.pdf' });
    expect(r.status).toBe(400);
  });

  it('sends PDF when all fields present', async () => {
    const pdfBase64 = Buffer.from('%PDF-1.4 fake').toString('base64');
    const r = await api().post('/api/whatsapp-web/send-pdf').set(hdrs).send({
      phone: '9876543210',
      filename: 'invoice.pdf',
      caption: 'Invoice #123',
      pdfBase64,
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const r = await api().post('/api/whatsapp-web/send-pdf').send({ phone: '9', filename: 'f.pdf', pdfBase64: 'x' });
    expect(r.status).toBe(401);
  });
});

describe('POST /api/whatsapp-web/send-text', () => {
  it('returns 400 when fields missing', async () => {
    const r = await api().post('/api/whatsapp-web/send-text').set(hdrs).send({ phone: '9876543210' });
    expect(r.status).toBe(400);
  });

  it('sends text when fields present', async () => {
    const r = await api().post('/api/whatsapp-web/send-text').set(hdrs).send({
      phone: '9876543210',
      message: 'Hello from Dhandho',
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('WhatsApp Web — non-admin access blocked', () => {
  const staffToken = createTestToken({
    userId: U2,
    tenantId: T,
    email: 'staff@wa-web.test',
    role: 'Staff',
    name: 'WA Staff',
  });
  const staffHdrs = authHeaders(staffToken, T);

  it('GET /status blocked for non-admin', async () => {
    const r = await api().get('/api/whatsapp-web/status').set(staffHdrs);
    expect(r.status).toBe(403);
  });

  it('POST /connect blocked for non-admin', async () => {
    const r = await api().post('/api/whatsapp-web/connect').set(staffHdrs).send({});
    expect(r.status).toBe(403);
  });
});
