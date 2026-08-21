/**
 * Email settings + send API tests.
 * SMTP send is mocked — nodemailer transport not created in tests.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

// Mock nodemailer so no real SMTP connection is made
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    })),
  },
}));

const T = 'T-EMAIL-001';
const U = 'U-EMAIL-ADM';
const U2 = 'U-EMAIL-STF';

const token = createTestToken({ userId: U, tenantId: T, email: 'admin@email-test.co', role: 'Admin', name: 'Admin' });
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Email Test Corp','email-test-corp','admin@email-test.co','Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@email-test.co',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'staff@email-test.co',$3,'Staff','Staff') ON CONFLICT DO NOTHING`,
    [U2, T, hash],
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM email_settings WHERE tenant_id = $1', [T]);
  await pool.query('DELETE FROM email_log WHERE tenant_id = $1', [T]);
  await cleanupTestData(T);
});

describe('GET /api/email/settings', () => {
  it('returns defaults for new tenant', async () => {
    const r = await api().get('/api/email/settings').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('smtpHost');
    expect(r.body).toHaveProperty('smtpPort');
    expect(r.body).toHaveProperty('invoiceSubject');
    expect(r.body).toHaveProperty('invoiceTemplate');
    expect(r.body.hasPassword).toBe(false);
  });

  it('returns 401 without auth', async () => {
    expect((await api().get('/api/email/settings')).status).toBe(401);
  });
});

describe('PUT /api/email/settings', () => {
  it('saves SMTP settings', async () => {
    const r = await api().put('/api/email/settings').set(hdrs).send({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: 'test@gmail.com',
      smtpPassword: 'app-password-123',
      fromName: 'Test Corp',
      fromEmail: 'test@gmail.com',
      useSsl: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.smtpHost).toBe('smtp.gmail.com');
    expect(r.body.smtpUser).toBe('test@gmail.com');
    expect(r.body.fromName).toBe('Test Corp');
    expect(r.body.fromEmail).toBe('test@gmail.com');
    expect(r.body.hasPassword).toBe(true);
  });

  it('saves custom invoice template', async () => {
    const tpl = 'Dear {customerName}, your invoice {invoiceNumber} is ready.';
    const r = await api().put('/api/email/settings').set(hdrs).send({
      smtpHost: 'smtp.gmail.com',
      invoiceTemplate: tpl,
    });
    expect(r.status).toBe(200);
    expect(r.body.invoiceTemplate).toBe(tpl);
  });

  it('does not overwrite password when blank password sent', async () => {
    const r = await api().put('/api/email/settings').set(hdrs).send({
      smtpHost: 'smtp.gmail.com',
      fromEmail: 'test@gmail.com',
    });
    expect(r.status).toBe(200);
    expect(r.body.hasPassword).toBe(true); // password preserved
  });

  it('returns 401 without auth', async () => {
    expect((await api().put('/api/email/settings').send({})).status).toBe(401);
  });

  it('blocked for staff', async () => {
    const staffToken = createTestToken({
      userId: U2,
      tenantId: T,
      email: 'staff@email-test.co',
      role: 'Staff',
      name: 'Staff',
    });
    expect((await api().put('/api/email/settings').set(authHeaders(staffToken, T)).send({})).status).toBe(403);
  });
});

describe('POST /api/email/send-invoice', () => {
  it('returns 400 when fields missing', async () => {
    const r = await api().post('/api/email/send-invoice').set(hdrs).send({ toEmail: 'x@x.com' });
    expect(r.status).toBe(400);
  });

  it('returns 400 when from email not configured', async () => {
    // First reset settings with no fromEmail
    await pool.query('DELETE FROM email_settings WHERE tenant_id = $1', [T]);
    const pdfBase64 = Buffer.from('%PDF fake').toString('base64');
    const r = await api().post('/api/email/send-invoice').set(hdrs).send({
      toEmail: 'customer@example.com',
      pdfBase64,
      filename: 'invoice.pdf',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Sender email/i);
  });

  it('sends when configured', async () => {
    // Set up proper email settings
    await api().put('/api/email/settings').set(hdrs).send({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: 'test@gmail.com',
      smtpPassword: 'app-password-123',
      fromName: 'Test Corp',
      fromEmail: 'test@gmail.com',
    });
    const pdfBase64 = Buffer.from('%PDF-1.4 fake pdf content').toString('base64');
    const r = await api().post('/api/email/send-invoice').set(hdrs).send({
      toEmail: 'customer@example.com',
      toName: 'Test Customer',
      pdfBase64,
      filename: 'INV-001.pdf',
      subject: 'Your Invoice',
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('GET /api/email/log', () => {
  it('returns log entries', async () => {
    const r = await api().get('/api/email/log').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    expect((await api().get('/api/email/log')).status).toBe(401);
  });
});
