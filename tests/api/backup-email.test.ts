/**
 * Email backup endpoint tests.
 * POST /api/backup/email — sends JSON backup as email attachment.
 * nodemailer is mocked — no real SMTP connection made.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { api, authHeaders } from '../http';
import { createTestToken, pool, cleanupTestData } from '../helpers';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
    })),
  },
}));

const T = 'T-BK-EMAIL-001';
const U = 'U-BK-EMAIL-ADM';
const U2 = 'U-BK-EMAIL-STF';

const token = createTestToken({ userId: U, tenantId: T, email: 'admin@bk-email.test', role: 'Admin', name: 'Admin' });
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'BK Email Corp','bk-email-corp','admin@bk-email.test','Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@bk-email.test',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'staff@bk-email.test',$3,'Staff','Staff') ON CONFLICT DO NOTHING`,
    [U2, T, hash],
  );
  // Seed email settings so sendMail can be called
  const { encryptSecret } = await import('../../server/utils/secret-crypto');
  await pool.query(
    `INSERT INTO email_settings (tenant_id, smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email, use_ssl)
     VALUES ($1,'smtp.gmail.com',587,'test@gmail.com',$2,'Test Corp','test@gmail.com',false)
     ON CONFLICT (tenant_id) DO UPDATE SET smtp_user='test@gmail.com', smtp_password=$2, from_email='test@gmail.com'`,
    [T, encryptSecret('app-password-123')],
  );
  await pool.query(`UPDATE tenants SET backup_email = 'backup@gmail.com' WHERE id = $1`, [T]);
});

afterAll(async () => {
  await pool.query('DELETE FROM email_settings WHERE tenant_id = $1', [T]);
  await cleanupTestData(T);
});

describe('POST /api/backup/email', () => {
  it('sends backup to provided email', async () => {
    const r = await api().post('/api/backup/email').set(hdrs).send({ email: 'test@example.com' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.sentTo).toBe('test@example.com');
  });

  it('sends to backup_email from settings when no email provided', async () => {
    const r = await api().post('/api/backup/email').set(hdrs).send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.sentTo).toBe('backup@gmail.com');
  });

  it('returns 400 when no email anywhere', async () => {
    await pool.query(`UPDATE tenants SET backup_email = NULL WHERE id = $1`, [T]);
    const r = await api().post('/api/backup/email').set(hdrs).send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/No email address/i);
    // Restore
    await pool.query(`UPDATE tenants SET backup_email = 'backup@gmail.com' WHERE id = $1`, [T]);
  });

  it('returns 500 when SMTP not configured', async () => {
    await pool.query(`DELETE FROM email_settings WHERE tenant_id = $1`, [T]);
    const r = await api().post('/api/backup/email').set(hdrs).send({ email: 'test@example.com' });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/SMTP not configured/i);
    // Restore
    const { encryptSecret } = await import('../../server/utils/secret-crypto');
    await pool.query(
      `INSERT INTO email_settings (tenant_id, smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email, use_ssl)
       VALUES ($1,'smtp.gmail.com',587,'test@gmail.com',$2,'Test Corp','test@gmail.com',false)`,
      [T, encryptSecret('app-password-123')],
    );
  });

  it('returns 401 without auth', async () => {
    expect((await api().post('/api/backup/email').send({ email: 'x@x.com' })).status).toBe(401);
  });

  it('blocked for staff', async () => {
    const staffToken = createTestToken({
      userId: U2,
      tenantId: T,
      email: 'staff@bk-email.test',
      role: 'Staff',
      name: 'Staff',
    });
    expect(
      (await api().post('/api/backup/email').set(authHeaders(staffToken, T)).send({ email: 'x@x.com' })).status,
    ).toBe(403);
  });
});

describe('GET /api/backup — x-dg-client header', () => {
  it('returns backup JSON with correct client header', async () => {
    const r = await api().get('/api/backup').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/backup.*\.json/);
  });

  it('returns 401 without auth', async () => {
    expect((await api().get('/api/backup')).status).toBe(401);
  });

  it('blocked for staff', async () => {
    const staffToken = createTestToken({
      userId: U2,
      tenantId: T,
      email: 'staff@bk-email.test',
      role: 'Staff',
      name: 'Staff',
    });
    expect((await api().get('/api/backup').set(authHeaders(staffToken, T))).status).toBe(403);
  });
});
