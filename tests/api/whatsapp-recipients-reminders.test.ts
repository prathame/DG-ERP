/**
 * Tests for:
 * - GET /api/whatsapp/broadcast/:id/recipients
 * - GET /api/whatsapp/reminders
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

vi.mock('../../server/services/whatsappWebSession', () => ({
  getSessionStatus: vi.fn(() => ({ status: 'disconnected', qrDataUrl: null, phoneNumber: null })),
  connectSession: vi.fn().mockResolvedValue(undefined),
  disconnectSession: vi.fn().mockResolvedValue(undefined),
  sendPdfViaWeb: vi.fn().mockResolvedValue(undefined),
  sendTextViaWeb: vi.fn().mockResolvedValue(undefined),
  sendImageViaWeb: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn(() => false),
  initWhatsAppSessionPool: vi.fn(),
  reconnectAllSavedSessions: vi.fn().mockResolvedValue(undefined),
}));

const T = 'T-WA-REC-001';
const U = 'U-WA-REC-ADM';
const U2 = 'U-WA-REC-STF';

const token = createTestToken({ userId: U, tenantId: T, email: 'admin@wa-rec.test', role: 'Admin', name: 'Admin' });
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'WA Rec Corp','wa-rec-corp','admin@wa-rec.test','Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@wa-rec.test',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'staff@wa-rec.test',$3,'Staff','Staff') ON CONFLICT DO NOTHING`,
    [U2, T, hash],
  );
  // Seed a broadcast + recipients
  await pool.query(
    `INSERT INTO whatsapp_broadcasts (id, tenant_id, message, recipient_type, status, total_recipients, sent_count, failed_count)
     VALUES ('WB-TEST-001',$1,'Test broadcast','all_customers','completed',2,2,0) ON CONFLICT DO NOTHING`,
    [T],
  );
  await pool.query(
    `INSERT INTO whatsapp_broadcast_recipients (id, broadcast_id, tenant_id, name, phone, status, sent_at)
     VALUES ('WBR-001','WB-TEST-001',$1,'Ramesh Shah','9876543210','sent',NOW()),
            ('WBR-002','WB-TEST-001',$1,'Suresh Patel','9123456789','failed',NULL) ON CONFLICT DO NOTHING`,
    [T],
  );
  // Seed a reminder log entry
  await pool.query(
    `INSERT INTO whatsapp_reminder_log (id, tenant_id, vendor_name, phone, balance, status)
     VALUES ('WRL-001',$1,'Test Vendor','9876543210',5000,'sent') ON CONFLICT DO NOTHING`,
    [T],
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM whatsapp_broadcast_recipients WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM whatsapp_broadcasts WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM whatsapp_reminder_log WHERE tenant_id = $1', [T]);
  await cleanupTestData(T);
});

// ── Broadcast recipients ──────────────────────────────────────────────────────
describe('GET /api/whatsapp/broadcast/:id/recipients', () => {
  it('returns recipients for a broadcast', async () => {
    const r = await api().get('/api/whatsapp/broadcast/WB-TEST-001/recipients').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBe(2);
    const sent = r.body.find((x: { status: string }) => x.status === 'sent');
    const failed = r.body.find((x: { status: string }) => x.status === 'failed');
    expect(sent?.name).toBe('Ramesh Shah');
    expect(failed?.name).toBe('Suresh Patel');
  });

  it('returns empty array for unknown broadcast', async () => {
    const r = await api().get('/api/whatsapp/broadcast/nonexistent-xyz/recipients').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    expect((await api().get('/api/whatsapp/broadcast/WB-TEST-001/recipients')).status).toBe(401);
  });

  it('blocked for staff', async () => {
    const staffToken = createTestToken({
      userId: U2,
      tenantId: T,
      email: 'staff@wa-rec.test',
      role: 'Staff',
      name: 'Staff',
    });
    expect(
      (await api().get('/api/whatsapp/broadcast/WB-TEST-001/recipients').set(authHeaders(staffToken, T))).status,
    ).toBe(403);
  });
});

// ── Reminder log ──────────────────────────────────────────────────────────────
describe('GET /api/whatsapp/reminders', () => {
  it('returns reminder log entries', async () => {
    const r = await api().get('/api/whatsapp/reminders').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
    const entry = r.body[0];
    expect(entry).toHaveProperty('vendor_name');
    expect(entry).toHaveProperty('phone');
    expect(entry).toHaveProperty('status');
    expect(entry).toHaveProperty('sent_at');
  });

  it('returns 401 without auth', async () => {
    expect((await api().get('/api/whatsapp/reminders')).status).toBe(401);
  });

  it('blocked for staff', async () => {
    const staffToken = createTestToken({
      userId: U2,
      tenantId: T,
      email: 'staff@wa-rec.test',
      role: 'Staff',
      name: 'Staff',
    });
    expect((await api().get('/api/whatsapp/reminders').set(authHeaders(staffToken, T))).status).toBe(403);
  });
});
